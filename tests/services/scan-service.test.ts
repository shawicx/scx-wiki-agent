import { describe, it, expect } from 'vitest';
import { ScanService } from '../../src/services/scan-service.js';
import { join } from 'path';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');

describe('ScanService', () => {
  it('should return a complete scan result', () => {
    const service = new ScanService(fixturesDir);
    const result = service.scan();

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.techStack).toContain('express');
    expect(result.projectType).toBe('backend');
    expect(result.hasTypeScript).toBe(true);
  });
});
