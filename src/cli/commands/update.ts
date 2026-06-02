import { Command } from 'commander';
import { join } from 'path';
import { createDatabase, closeDatabase } from '../../core/database.js';
import { UpdateService } from '../../services/update-service.js';
import { AGENT_DIR, DB_NAME } from '../../shared/constants.js';

export function registerUpdateCommand(program: Command) {
  program
    .command('update')
    .description('Incremental update based on git changes')
    .option('--project-root <path>', 'Project root directory')
    .option('--since <commit>', 'Update since a specific commit')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const dbPath = join(root, AGENT_DIR, DB_NAME);
      const db = createDatabase(dbPath);

      try {
        const service = new UpdateService(db, root);
        const changedFiles = options.since
          ? service.detectChangedFilesSince(options.since)
          : service.detectChangedFiles();

        if (changedFiles.length === 0) {
          console.log('No changes detected.');
          return;
        }

        console.log(`Detected ${changedFiles.length} changed files:`);
        for (const file of changedFiles) {
          console.log(`  - ${file}`);
        }

        const result = await service.incrementalUpdate(changedFiles);
        console.log(`\nUpdated: ${result.updated}, Deleted: ${result.deleted}`);
      } finally {
        closeDatabase(db);
      }
    });
}
