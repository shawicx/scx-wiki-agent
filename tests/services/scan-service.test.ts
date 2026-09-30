import { describe, it, expect } from 'vitest';
import { ScanService } from '../../src/services/scan-service.js';
import { join } from 'path';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');

describe('ScanService', () => {
  it('should return a complete scan result', () => {
    const service = new ScanService(fixturesDir);
    const result = service.scan();

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.techStack).toEqual([]);
    expect(result.projectType).toBe('unknown');
    expect(result.hasTypeScript).toBe(true);
    expect(result.files.every(f => f.scope === 'production' || f.scope === 'test')).toBe(true);
    expect(result.productionFiles.length + result.testFiles.length).toBe(result.files.length);
    expect(result.fileCounts.total).toBe(result.files.length);
  });
});
