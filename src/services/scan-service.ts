import { FileScanner, type ScanResult } from '../core/scanner.js';

export class ScanService {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  scan(): ScanResult {
    const scanner = new FileScanner(this.rootDir);
    return scanner.scan();
  }
}
