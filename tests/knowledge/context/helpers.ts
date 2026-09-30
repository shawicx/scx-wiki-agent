import { join } from 'path';
import type { ScanResult } from '../../../src/core/scanner.js';
import { isTestPath } from '../../../src/shared/utils.js';

export function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  const base = {
    rootDir: '/tmp/test-project',
    files: [],
    techStack: ['commander', 'typescript'],
    testTechStack: [],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
    ...overrides,
  };
  const files = base.files.map(f => ({
    ...f,
    scope: f.scope ?? (isTestPath(f.relativePath) ? 'test' as const : 'production' as const),
  }));
  const productionFiles = files.filter(f => f.scope === 'production');
  const testFiles = files.filter(f => f.scope === 'test');
  return {
    ...base,
    files,
    productionFiles,
    testFiles,
    fileCounts: {
      total: files.length,
      production: productionFiles.length,
      test: testFiles.length,
    },
  };
}

export function scannedFile(rootDir: string, relativePath: string) {
  return {
    absolutePath: join(rootDir, relativePath),
    relativePath,
    language: relativePath.endsWith('.rs') ? 'rust' as const : 'typescript' as const,
    extension: relativePath.endsWith('.rs') ? '.rs' : '.ts',
    size: 100,
    scope: isTestPath(relativePath) ? 'test' as const : 'production' as const,
  };
}

export function packageSymbolCypher(files: string[]) {
  const fileList = files.map(f => `"${f}"`).join(',');
  return `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
       AND (n.docstring IS NOT NULL OR n.complexity > 0) AND n.label IN ['Class', 'Function', 'Method']
       RETURN n.name AS name, n.label AS label, n.docstring AS doc, n.signature AS sig,
              n.complexity AS cx, n.file_path AS file, n.start_line AS line
       ORDER BY n.complexity DESC, n.file_path ASC, n.start_line ASC LIMIT 60`;
}

export function symbolRow(
  name: string,
  file: string,
  line: number,
  complexity: number,
  doc?: string,
): any[] {
  return [name, 'Function', doc ?? null, `(${name})`, complexity, file, line];
}
