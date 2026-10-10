import { FileScanner, type ScanResult } from '../core/scanner.js';

export class ScanService {
  private rootDir: string;
  private extraIgnoredDirs?: string[];

  constructor(rootDir: string, extraIgnoredDirs?: string[]) {
    this.rootDir = rootDir;
    this.extraIgnoredDirs = extraIgnoredDirs;
  }

  scan(): ScanResult {
    const scanner = new FileScanner(this.rootDir, this.extraIgnoredDirs);
    return scanner.scan();
  }
}
