import type * as Parser from 'web-tree-sitter';
import { generateId } from '../shared/utils.js';
import type { SymbolType } from './types.js';

/**
 * A symbol extracted from a source file's AST.
 */
export interface ExtractedSymbol {
  id: string;
  name: string;
  type: SymbolType;
  filePath: string;
  startLine: number;
  endLine: number;
  scope: string | null;
  visibility: 'public' | 'private' | 'protected' | null;
}

/**
 * Extract named symbols from a parsed tree-sitter AST.
 *
 * Walks the tree recursively and collects:
 * - Functions (named function declarations and arrow functions)
 * - Classes with their methods
 * - Interfaces
 * - Import statements
 * - Export statements (re-exports of the above)
 *
 * @param tree - The parsed tree-sitter syntax tree.
 * @param filePath - The file path for symbol metadata.
 * @returns An array of extracted symbols.
 */
export function extractSymbols(
  tree: Parser.Tree,
  filePath: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const scopeStack: string[] = [];

  function walk(node: Parser.Node): void {
    switch (node.type) {
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          symbols.push(makeSymbol(nameNode.text, 'function', node, filePath, scopeStack));
        }
        break;
      }

      case 'arrow_function': {
        // Arrow functions are named by their variable declarator parent
        const parent = node.parent;
        if (parent?.type === 'variable_declarator') {
          const nameNode = parent.childForFieldName('name');
          if (nameNode) {
            symbols.push(makeSymbol(nameNode.text, 'function', parent, filePath, scopeStack));
          }
        }
        return; // Don't walk into arrow function body
      }

      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const className = nameNode.text;
          symbols.push(makeSymbol(className, 'class', node, filePath, scopeStack));

          // Enter class scope to extract methods
          scopeStack.push(className);
          const body = node.childForFieldName('body');
          if (body) {
            for (const child of body.children) {
              if (child.type === 'method_definition') {
                extractMethod(child, filePath, className, symbols);
              }
            }
          }
          scopeStack.pop();
        }
        return; // Already handled children
      }

      case 'interface_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          symbols.push(makeSymbol(nameNode.text, 'interface', node, filePath, scopeStack));
        }
        return; // Don't need to walk into interface body for symbols
      }

      case 'import_statement': {
        extractImport(node, filePath, symbols);
        return;
      }

      case 'export_statement': {
        // Export statements wrap other declarations.
        // Record the export symbol, then recurse into the child to get the actual declaration.
        const decl = node.children.find((c: Parser.Node) =>
          c.isNamed && c.type !== 'export' && c.type !== 'string',
        );
        if (decl) {
          // Extract the exported name for the export symbol
          const exportName = getExportedName(decl);
          if (exportName) {
            symbols.push(makeSymbol(exportName, 'export', node, filePath, scopeStack));
          }
          // Recurse into the actual declaration to extract the function/class/interface
          walk(decl);
        }
        return;
      }
    }

    // Recurse into children for unhandled node types
    for (const child of node.children) {
      if (child.isNamed) {
        walk(child);
      }
    }
  }

  walk(tree.rootNode);
  return symbols;
}

/**
 * Extract a method symbol from a method_definition node.
 */
function extractMethod(
  node: Parser.Node,
  filePath: string,
  classScope: string,
  symbols: ExtractedSymbol[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;

  const visibility = detectVisibility(node);
  symbols.push({
    id: generateId(),
    name: nameNode.text,
    type: 'method',
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    scope: classScope,
    visibility,
  });
}

/**
 * Extract import symbols from an import_statement node.
 */
function extractImport(
  node: Parser.Node,
  filePath: string,
  symbols: ExtractedSymbol[],
): void {
  // Extract the import source path
  const sourceNode = node.children.find((c: Parser.Node) => c.type === 'string');
  const source = sourceNode?.text ?? '';

  // Try to find imported names
  const importClause = node.children.find((c: Parser.Node) => c.type === 'import_clause');
  if (importClause) {
    const names = extractImportNames(importClause);
    for (const name of names) {
      symbols.push({
        id: generateId(),
        name,
        type: 'import',
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        scope: null,
        visibility: null,
      });
    }
  } else {
    // Side-effect import or unnamed
    symbols.push({
      id: generateId(),
      name: source,
      type: 'import',
      filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      scope: null,
      visibility: null,
    });
  }
}

/**
 * Extract names from an import_clause node.
 * Handles: named imports { A, B }, default imports X, namespace imports * as X.
 */
function extractImportNames(clause: Parser.Node): string[] {
  const names: string[] = [];

  for (const child of clause.children) {
    switch (child.type) {
      case 'identifier': {
        // Default import: import X from '...'
        names.push(child.text);
        break;
      }
      case 'named_imports': {
        // import { A, B } from '...'
        for (const spec of child.children) {
          if (spec.type === 'import_specifier') {
            const nameNode = spec.childForFieldName('name');
            if (nameNode) {
              names.push(nameNode.text);
            }
          }
        }
        break;
      }
      case 'namespace_import': {
        // import * as X from '...'
        const alias = child.childForFieldName('alias');
        if (alias) {
          names.push(alias.text);
        }
        break;
      }
    }
  }

  return names;
}

/**
 * Detect visibility of a method from its AST node.
 */
function detectVisibility(
  node: Parser.Node,
): 'public' | 'private' | 'protected' | null {
  for (const child of node.children) {
    if (child.type === 'accessibility_modifier') {
      const text = child.text;
      if (text === 'public' || text === 'private' || text === 'protected') {
        return text;
      }
    }
  }
  return null;
}

/**
 * Get the exported name from a declaration node inside an export_statement.
 */
function getExportedName(decl: Parser.Node): string | null {
  const nameField = decl.childForFieldName('name');
  if (nameField) {
    return nameField.text;
  }
  return null;
}

/**
 * Create a symbol object.
 */
function makeSymbol(
  name: string,
  type: SymbolType,
  node: Parser.Node,
  filePath: string,
  scopeStack: string[],
): ExtractedSymbol {
  return {
    id: generateId(),
    name,
    type,
    filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    scope: scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null,
    visibility: null,
  };
}

// ---------------------------------------------------------------------------
// Call expression extraction
// ---------------------------------------------------------------------------

export type CallType = 'direct' | 'method' | 'constructor' | 'chained';

export interface ExtractedCall {
  callerScope: string | null;
  calleeName: string;
  calleeFullName: string;
  filePath: string;
  callLine: number;
  callType: CallType;
}

/**
 * Extract call expressions from a parsed tree-sitter AST.
 *
 * Walks the tree tracking scope (which function/method we are inside) and
 * records every call_expression, new_expression, and chained call found.
 *
 * @param tree - The parsed tree-sitter syntax tree.
 * @param filePath - The file path for call metadata.
 * @param symbols - The symbols already extracted from this file (used for scope resolution).
 * @returns An array of extracted calls.
 */
export function extractCalls(
  tree: Parser.Tree,
  filePath: string,
  symbols: ExtractedSymbol[],
): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  const scopeStack: string[] = [];

  // Build a sorted list of symbol start lines for scope lookup
  const sortedSymbols = [...symbols]
    .filter(s => s.type === 'function' || s.type === 'method')
    .sort((a, b) => a.startLine - b.startLine);

  function currentScope(): string | null {
    return scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
  }

  function pushScope(name: string): void {
    scopeStack.push(name);
  }

  function popScope(): void {
    scopeStack.pop();
  }

  function walk(node: Parser.Node): void {
    switch (node.type) {
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          pushScope(nameNode.text);
          walkChildren(node);
          popScope();
        }
        return;
      }

      case 'arrow_function': {
        const parent = node.parent;
        if (parent?.type === 'variable_declarator') {
          const nameNode = parent.childForFieldName('name');
          if (nameNode) {
            pushScope(nameNode.text);
            walkChildren(node);
            popScope();
            return;
          }
        }
        // Anonymous arrow function callback — use enclosing scope
        // Still walk children to extract calls inside
        walkChildren(node);
        return;
      }

      case 'method_definition': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          // Include class scope prefix: ClassName.methodName
          const classScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
          pushScope(classScope ? `${classScope}.${nameNode.text}` : nameNode.text);
          walkChildren(node);
          popScope();
        }
        return;
      }

      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          pushScope(nameNode.text);
          walkChildren(node);
          popScope();
        }
        return;
      }

      case 'new_expression': {
        const ctorNode = node.childForFieldName('constructor');
        // In tree-sitter TS, new Foo() may or may not have a constructor child
        // The callee is the first named identifier-like child
        const callee = ctorNode ?? node.children.find(c => c.isNamed && c.type !== 'arguments');
        if (callee) {
          calls.push({
            callerScope: currentScope(),
            calleeName: callee.text.replace(/\(.*\)$/, ''),
            calleeFullName: callee.text.replace(/\(.*\)$/, ''),
            filePath,
            callLine: node.startPosition.row + 1,
            callType: 'constructor',
          });
        }
        walkChildren(node);
        return;
      }

      case 'call_expression': {
        extractCallExpression(node, calls, filePath, currentScope());
        // Walk into arguments to find callback arrow functions / function expressions
        for (const child of node.children) {
          const funcChild = node.childForFieldName('function');
          if (child === funcChild && funcChild?.type === 'call_expression') {
            walk(child);
          } else if (child.type === 'arguments') {
            // Walk arguments children to find callbacks (arrow_function, function_expression)
            for (const arg of child.children) {
              if (arg.isNamed) {
                walk(arg);
              }
            }
          } else if (child.isNamed && child.type !== 'arguments') {
            walk(child);
          }
        }
        return;
      }
    }

    walkChildren(node);
  }

  function extractCallExpression(
    node: Parser.Node,
    calls: ExtractedCall[],
    filePath: string,
    scope: string | null,
  ): void {
    const funcNode = node.childForFieldName('function');
    if (!funcNode) return;

    const callLine = node.startPosition.row + 1;

    if (funcNode.type === 'identifier') {
      calls.push({
        callerScope: scope,
        calleeName: funcNode.text,
        calleeFullName: funcNode.text,
        filePath,
        callLine,
        callType: 'direct',
      });
    } else if (funcNode.type === 'member_expression') {
      const object = funcNode.childForFieldName('object');
      const property = funcNode.childForFieldName('property');
      const calleeFullName = funcNode.text;

      // For method calls like `this.method()` or `obj.method()`, use the property name
      const calleeName = property?.text ?? calleeFullName;

      // Determine if this is a chained call (object is itself a call_expression)
      const isChained = object?.type === 'call_expression';

      calls.push({
        callerScope: scope,
        calleeName,
        calleeFullName,
        filePath,
        callLine,
        callType: isChained ? 'chained' : 'method',
      });
    } else if (funcNode.type === 'call_expression') {
      // Chained call: the callee is itself a call (e.g., `getA().getB()`)
      // The function part is a member_expression whose object is a call_expression
      // Extract the outer call, inner call will be handled by walking children
      if (funcNode.childForFieldName('function')?.type === 'member_expression') {
        const memberExpr = funcNode.childForFieldName('function')!;
        const property = memberExpr.childForFieldName('property');
        calls.push({
          callerScope: scope,
          calleeName: property?.text ?? memberExpr.text,
          calleeFullName: memberExpr.text,
          filePath,
          callLine,
          callType: 'chained',
        });
      }
    }
  }

  function walkChildren(node: Parser.Node): void {
    for (const child of node.children) {
      if (child.isNamed) {
        walk(child);
      }
    }
  }

  walk(tree.rootNode);
  return calls;
}
