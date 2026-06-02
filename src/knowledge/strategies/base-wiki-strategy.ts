import type { DatabaseConnection } from '../../core/database.js';
import type { ScanResult } from '../../core/scanner.js';

export interface WikiPage {
  filename: string;
  content: string;
}

export abstract class BaseWikiStrategy {
  protected db: DatabaseConnection;
  protected scanResult: ScanResult;

  constructor(db: DatabaseConnection, scanResult: ScanResult) {
    this.db = db;
    this.scanResult = scanResult;
  }

  abstract generatePages(): WikiPage[];
}
