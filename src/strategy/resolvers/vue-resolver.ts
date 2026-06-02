import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';
import { basename } from 'path';

const VUE_IMPORT_PATTERN = /from\s+['"]vue['"]/;
const DEFINE_COMPONENT_PATTERN = /defineComponent/;
const TEMPLATE_PATTERN = /<template/;
const SCRIPT_SETUP_PATTERN = /<script\s+setup/;

export class VueResolver implements FrameworkResolver {
  name = 'vue';

  detect(content: string, filePath: string): boolean {
    if (filePath.endsWith('.vue')) return true;
    if (VUE_IMPORT_PATTERN.test(content)) return true;
    if (DEFINE_COMPONENT_PATTERN.test(content)) return true;
    if (TEMPLATE_PATTERN.test(content)) return true;
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // SFC with <script setup> → component node (name from filename)
    if (SCRIPT_SETUP_PATTERN.test(content)) {
      const fileName = basename(filePath, '.vue');
      const scriptMatch = content.match(/<script\s+setup[^>]*>/);
      const startLine = scriptMatch
        ? content.substring(0, scriptMatch.index!).split('\n').length
        : 1;
      const endLine = this.findTagEnd(lines, startLine, '<', '>') ?? lines.length;

      nodes.push({
        id: generateId(),
        name: fileName,
        type: 'component',
        filePath,
        startLine,
        endLine,
        metadata: { framework: 'vue', setup: true },
      });
    }

    // defineComponent with name → component node
    const defineComponentRegex = /defineComponent\s*\(\s*\{[^}]*name\s*:\s*['"](.*?)['"]/s;
    const dcMatch = defineComponentRegex.exec(content);
    if (dcMatch) {
      const componentName = dcMatch[1];
      const startLine = content.substring(0, dcMatch.index).split('\n').length;
      const endLine = this.findObjectEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name: componentName,
        type: 'component',
        filePath,
        startLine,
        endLine,
        metadata: { framework: 'vue' },
      });
    }

    // Exported useXxx functions → tool node (composable)
    const composableRegex = /export\s+function\s+(use[A-Z]\w*)\s*\(/g;
    let match;
    while ((match = composableRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'tool',
        filePath,
        startLine,
        endLine,
        metadata: { isComposable: true },
      });
    }

    // Also handle arrow function composables: export const useXxx = () => {
    const arrowComposableRegex = /export\s+const\s+(use[A-Z]\w*)\s*=\s*(?:\([^)]*\))?\s*=>/g;
    while ((match = arrowComposableRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'tool',
        filePath,
        startLine,
        endLine,
        metadata: { isComposable: true },
      });
    }

    return nodes;
  }

  extractRelations(_content: string, _filePath: string, _nodes: ProjectNode[]): Relation[] {
    return [];
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
        return i + 1;
      }
    }
    return lines.length;
  }

  private findObjectEnd(lines: string[], startLine: number): number {
    return this.findBlockEnd(lines, startLine);
  }

  private findTagEnd(lines: string[], startLine: number, _openChar: string, _closeChar: string): number | null {
    // For <script setup>, find the matching </script>
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].includes('</script>')) {
        return i + 1;
      }
    }
    return null;
  }
}
