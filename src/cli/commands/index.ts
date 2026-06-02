import { Command } from 'commander';
import { join } from 'path';
import { createDatabase, closeDatabase } from '../../core/database.js';
import { IndexService } from '../../services/index-service.js';
import { AGENT_DIR, DB_NAME } from '../../shared/constants.js';

export function registerIndexCommand(program: Command) {
  program
    .command('index')
    .description('Build local index (AST, symbols, chunks)')
    .option('--project-root <path>', 'Project root directory')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const dbPath = join(root, AGENT_DIR, DB_NAME);
      const db = createDatabase(dbPath);

      try {
        const service = new IndexService(db);
        await service.init();
        await service.indexProject(root);

        const docCount = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as any).c;
        const chunkCount = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c;
        const symCount = (db.prepare('SELECT COUNT(*) as c FROM symbols').get() as any).c;

        const relCount = (db.prepare('SELECT COUNT(*) as c FROM relations').get() as any).c;
        const modCount = (db.prepare('SELECT COUNT(*) as c FROM modules').get() as any).c;

        console.log(`\nIndexing complete.`);
        console.log(`  Documents: ${docCount}`);
        console.log(`  Chunks: ${chunkCount}`);
        console.log(`  Symbols: ${symCount}`);
        console.log(`  Relations: ${relCount}`);
        console.log(`  Modules: ${modCount}`);
      } finally {
        closeDatabase(db);
      }
    });
}
