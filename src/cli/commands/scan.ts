import { Command } from 'commander';
import { ScanService } from '../../services/scan-service.js';

export function registerScanCommand(program: Command) {
  program
    .command('scan')
    .description('Scan project structure and identify tech stack')
    .option('--project-root <path>', 'Project root directory')
    .option('-v, --verbose', 'Show detailed output')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const service = new ScanService(root);
      const result = service.scan();

      console.log(`\nProject: ${result.rootDir}`);
      console.log(`Type: ${result.projectType}`);
      console.log(`TypeScript: ${result.hasTypeScript ? 'Yes' : 'No'}`);
      console.log(`\nTech Stack:`);
      for (const dep of result.techStack.slice(0, 20)) {
        console.log(`  - ${dep}`);
      }
      if (result.techStack.length > 20) {
        console.log(`  ... and ${result.techStack.length - 20} more`);
      }

      console.log(`\nSource Directories:`);
      for (const dir of result.sourceDirs) {
        console.log(`  - ${dir}/`);
      }

      console.log(`\nFiles Scanned: ${result.files.length}`);
      const byLang = result.files.reduce<Record<string, number>>((acc, f) => {
        acc[f.language] = (acc[f.language] ?? 0) + 1;
        return acc;
      }, {});
      for (const [lang, count] of Object.entries(byLang)) {
        console.log(`  ${lang}: ${count}`);
      }
    });
}
