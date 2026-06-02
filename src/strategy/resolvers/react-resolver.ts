import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const REACT_IMPORT_PATTERN = /from\s+['"]react['"]/;
const JSX_PATTERN = /return\s*\(\s*<|return\s*</;
const HOOK_CALL_PATTERN = /\b(use[A-Z]\w*)\s*\(/g;

export class ReactResolver implements FrameworkResolver {
  name = 'react';

  detect(content: string, filePath: string): boolean {
    // Match files importing from 'react'
    if (REACT_IMPORT_PATTERN.test(content)) return true;
    // .tsx files with JSX patterns
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      if (JSX_PATTERN.test(content)) return true;
    }
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // Detect exported PascalCase functions (components) and useXxx functions (hooks)
    // Pattern: export function Name
    const exportedFnRegex = /export\s+function\s+(\w+)/g;
    let match;
    while ((match = exportedFnRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine);

      if (this.isHookName(name)) {
        const hooks = this.extractHooksInScope(content, match.index);
        nodes.push({
          id: generateId(),
          name,
          type: 'tool',
          filePath,
          startLine,
          endLine,
          metadata: { isHook: true, hooks },
        });
      } else if (this.isComponentName(name)) {
        const hooks = this.extractHooksInScope(content, match.index);
        nodes.push({
          id: generateId(),
          name,
          type: 'component',
          filePath,
          startLine,
          endLine,
          metadata: { hooks },
        });
      }
    }

    // Detect arrow function exports: export const Name = () => or export const Name = (...args) =>
    const arrowFnRegex = /export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/g;
    while ((match = arrowFnRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine);

      if (this.isHookName(name)) {
        const hooks = this.extractHooksInScope(content, match.index);
        nodes.push({
          id: generateId(),
          name,
          type: 'tool',
          filePath,
          startLine,
          endLine,
          metadata: { isHook: true, hooks },
        });
      } else if (this.isComponentName(name)) {
        const hooks = this.extractHooksInScope(content, match.index);
        nodes.push({
          id: generateId(),
          name,
          type: 'component',
          filePath,
          startLine,
          endLine,
          metadata: { hooks },
        });
      }
    }

    return nodes;
  }

  extractRelations(_content: string, _filePath: string, _nodes: ProjectNode[]): Relation[] {
    return [];
  }

  private isHookName(name: string): boolean {
    return name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase();
  }

  private isComponentName(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase();
  }

  private extractHooksInScope(content: string, startIndex: number): string[] {
    const hooks: Set<string> = new Set();

    // Find the function body starting from startIndex
    // Look for the opening brace after the function signature
    const afterMatch = content.substring(startIndex);
    const braceIndex = afterMatch.indexOf('{');
    if (braceIndex === -1) return [];

    // Extract the body by matching braces
    let depth = 0;
    let bodyEnd = -1;
    for (let i = braceIndex; i < afterMatch.length; i++) {
      if (afterMatch[i] === '{') depth++;
      else if (afterMatch[i] === '}') {
        depth--;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }

    if (bodyEnd === -1) bodyEnd = afterMatch.length;
    const body = afterMatch.substring(braceIndex, bodyEnd);

    // Find all useXxx calls
    const hookRegex = /\b(use[A-Z]\w*)\s*\(/g;
    let hookMatch;
    while ((hookMatch = hookRegex.exec(body)) !== null) {
      hooks.add(hookMatch[1]);
    }

    return Array.from(hooks);
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpen = false;
    for (let i = startLine - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceCount++;
          foundOpen = true;
        } else if (ch === '}') {
          braceCount--;
        }
      }
      if (foundOpen && braceCount === 0) {
        return i + 1; // 1-based line number
      }
    }
    return lines.length;
  }
}
