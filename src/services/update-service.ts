import type { DatabaseConnection } from '../core/database.js';
import { execSync } from 'child_process';

export class UpdateService {
  private db: DatabaseConnection;
  private rootDir: string;

  constructor(db: DatabaseConnection, rootDir: string) {
    this.db = db;
    this.rootDir = rootDir;
  }

  detectChangedFiles(ref: string = 'HEAD'): string[] {
    try {
      const output = execSync('git diff --name-only HEAD', {
        cwd: this.rootDir,
        encoding: 'utf-8',
      }).trim();
      if (!output) {
        const staged = execSync('git diff --name-only --cached HEAD', {
          cwd: this.rootDir,
          encoding: 'utf-8',
        }).trim();
        return staged ? staged.split('\n').filter(Boolean) : [];
      }
      return output.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  detectChangedFilesSince(commitish: string): string[] {
    try {
      const output = execSync(`git diff --name-only ${commitish} HEAD`, {
        cwd: this.rootDir,
        encoding: 'utf-8',
      }).trim();
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async incrementalUpdate(changedFiles: string[]): Promise<{ updated: number; deleted: number }> {
    let updated = 0;
    let deleted = 0;

    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE file_path = ?');
    const deleteSymbols = this.db.prepare('DELETE FROM symbols WHERE file_path = ?');
    const deleteRelations = this.db.prepare('DELETE FROM relations WHERE file_path = ?');

    for (const filePath of changedFiles) {
      deleteChunks.run(filePath);
      deleteSymbols.run(filePath);
      deleteRelations.run(filePath);
      deleted++;
    }

    return { updated, deleted };
  }
}
