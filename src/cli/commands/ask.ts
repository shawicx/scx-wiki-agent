import { Command } from 'commander';
import { join } from 'path';
import { createDatabase, closeDatabase } from '../../core/database.js';
import { RelationGraph } from '../../core/graph/relation-graph.js';
import { QAService } from '../../services/qa-service.js';
import { AGENT_DIR, DB_NAME } from '../../shared/constants.js';

export function registerAskCommand(program: Command) {
  program
    .command('ask <question>')
    .description('Ask a question about the project')
    .option('--project-root <path>', 'Project root directory')
    .option('--stream', 'Enable streaming output')
    .action(async (question: string, options: { projectRoot?: string; stream?: boolean }) => {
      const root = options.projectRoot ?? process.cwd();
      const dbPath = join(root, AGENT_DIR, DB_NAME);

      const db = createDatabase(dbPath);
      const graph = RelationGraph.fromDatabase(db);
      const qa = new QAService(db, graph);

      try {
        if (options.stream && process.env.OPENAI_API_KEY) {
          const gen = qa.askStream(question, root);
          let result;
          while (true) {
            const next = await gen.next();
            if (next.done) {
              result = next.value;
              break;
            }
            process.stdout.write(next.value);
          }
          console.log('\n\n--- References ---');
          for (const ref of (result as any).references) {
            console.log(`  ${ref.filePath}:${ref.startLine}-${ref.endLine}`);
          }
        } else {
          const answer = await qa.ask(question, root);
          console.log(answer.answer);
          console.log('\n--- References ---');
          for (const ref of answer.references) {
            console.log(`  ${ref.filePath}:${ref.startLine}-${ref.endLine}`);
          }
        }
      } finally {
        closeDatabase(db);
      }
    });
}
