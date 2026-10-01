import { isTestPath, isMcpPlaceholder } from '../../shared/utils.js';
import type {
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
  EnvironmentContext,
  TestingContext,
  ConventionsContext,
  ConstraintsContext,
  DecisionsContext,
} from '../types.js';
import { commandDescription, parseCommanderOptions } from './cli.js';
import {
  type ContextDeps,
  ENTRY_FILE_NAMES,
  buildDepUsage,
  getDepNames,
  isAppEntryPoint,
  isProductionGraphFile,
  labelToSymbolType,
  prepareIntentModules,
  safeGetSnippet,
} from './shared.js';

export function buildGlossaryContext(deps: ContextDeps): GlossaryContext {
  const q = deps.client.queryGraph(
    `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`,
  );

  const seen = new Set<string>();
  const symbols = q.rows
    .filter(row => isProductionGraphFile(deps, (row[5] as string) ?? ''))
    .map(row => ({
      name: row[0] as string,
      type: labelToSymbolType(row[1] as string),
      filePath: row[5] as string,
      startLine: row[6] as number | undefined,
      docstring: (row[2] as string | null) ?? null,
      signature: (row[3] as string | null) ?? null,
      complexity: row[4] as number | undefined,
    }))
    .filter(s => {
      if (isMcpPlaceholder(s.name)) return false;
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    })
    .slice(0, 30);

  return { symbols };
}

export function buildOnboardingContext(deps: ContextDeps): OnboardingContext {
  const entryFiles = deps.scanResult.productionFiles
    .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
    .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

  // 复用 ConfigDetector 提取的 scripts 和 packageManager
  const env = deps.detector.detectEnvironment();
  const packageManager = env.packageManager;
  const nodeVersion = env.nodeVersion;

  const arch = deps.client.getArchitecture();
  // CLI 命令名启发式（register*/*Command）只对 cli/agent 类型项目成立：
  // frontend 项目的 Vue composable（如 openCreateQuickCommandGroup 含 "Command"）
  // 会被误认为 CLI 命令，产成假命令表与无法核验的小写命令名
  const isCliProject = deps.scanResult.projectType === 'cli' || deps.scanResult.projectType === 'agent';
  const cliCommands = (isCliProject ? arch.entry_points : [])
    .filter(e => isAppEntryPoint(deps, e.file))
    .filter(e => e.name.startsWith('register') || e.name.includes('Command'))
    .filter(e => !isTestPath(e.file))
    .slice(0, 10)
    .map(e => {
      const snippet = safeGetSnippet(deps, e.name);
      // 派生命令名登记入断言校验 universe：工具自己派生的标识符不能反手标「待确认」
      const derived = e.name.replace(/^register/, '').replace(/Command$/, '').toLowerCase() || e.name;
      deps.fallbackSymbolNames.add(derived);
      return {
        name: derived,
        description: commandDescription(deps, e.name).description || `CLI command in ${e.file}`,
        options: snippet ? parseCommanderOptions(snippet.source ?? '') : [],
      };
    });

  // 首次运行最小示例
  const buildCmd = env.scripts.build ?? `${packageManager} run build`;
  const runCmd = cliCommands[0]?.name
    ?? env.scripts.dev ?? env.scripts.start ?? buildCmd;
  const firstRunExample = cliCommands[0]?.name
    ? `${packageManager} install\n${buildCmd}\nnode dist/bin.js ${runCmd}`
    : `${packageManager} install\n${runCmd}`;

  return {
    projectType: deps.scanResult.projectType,
    techStack: deps.scanResult.techStack,
    entryFiles,
    sourceDirs: deps.scanResult.sourceDirs,
    hasTypeScript: deps.scanResult.hasTypeScript,
    packageManager,
    nodeVersion,
    cliCommands,
    scripts: env.scripts,
    envVars: env.envVars,
    depUsage: buildDepUsage(deps),
    sourceDirFiles: deps.scanResult.sourceDirs.map(dir => ({
      dir,
      files: deps.scanResult.productionFiles
        .map(f => f.relativePath)
        .filter(p => p.startsWith(`${dir}/`))
        .slice(0, 8),
    })),
    firstRunExample,
  };
}

export function buildTroubleshootingContext(deps: ContextDeps): TroubleshootingContext {
  const arch = deps.client.getArchitecture();
  prepareIntentModules(deps, arch.packages.map(p => p.name));

  // 运行态与常量数据补强：排障页最常缺的就是"实际命令、env、边界常量"
  const env = deps.detector.detectEnvironment();
  const constants = deps.detector.detectConstraints().constants;
  const entryFiles = deps.scanResult.productionFiles
    .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
    .map(f => f.relativePath);

  // 意图证据：源码 why-marker（TODO/FIXME 是真实风险信号）+ git 高频变更热点
  const intent = deps.intentProvider
    ? [...deps.intentProvider.whyMarkers(8), ...deps.intentProvider.churnEvidence(5)]
    : undefined;

  return {
    projectType: deps.scanResult.projectType,
    techStack: deps.scanResult.techStack,
    modules: arch.packages.map(p => ({ name: p.name })),
    scripts: env.scripts,
    packageManager: env.packageManager,
    nodeVersion: env.nodeVersion,
    envVars: env.envVars,
    constants,
    entryFiles,
    depUsage: buildDepUsage(deps),
    ...(intent && intent.length > 0 ? { intent } : {}),
  };
}

/**
 * environment.md 数据源：运行态信息（来自 ConfigDetector）。
 * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。
 */
export function buildEnvironmentContext(deps: ContextDeps): EnvironmentContext {
  return deps.detector.detectEnvironment();
}

/**
 * testing.md 数据源：测试框架/目录/夹具（来自 ConfigDetector）+ 运行命令。
 */
export function buildTestingContext(deps: ContextDeps): TestingContext {
  const info = deps.detector.detectTesting();
  const env = deps.detector.detectEnvironment();
  return {
    ...info,
    runCommand: env.scripts.test ?? '',
  };
}

/**
 * conventions.md 数据源：规约信息（来自 ConfigDetector）。
 * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。
 */
export function buildConventionsContext(deps: ContextDeps): ConventionsContext {
  return deps.detector.detectConventions();
}

/**
 * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。
 *
 * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），
 * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。
 */
export function buildConstraintsContext(deps: ContextDeps): ConstraintsContext {
  const constants = deps.detector.detectConstraints().constants;

  const q = deps.client.queryGraph(
    `MATCH (n) WHERE n.complexity > 3 AND n.is_test = false
         AND n.label IN ['Method', 'Function']
       RETURN n.name AS name, n.file_path AS file, n.complexity AS cx, n.loop_depth AS ld
       ORDER BY n.complexity DESC LIMIT 20`,
  );
  const hotFunctions = q.rows
    .map(row => ({
      name: row[0] as string,
      filePath: (row[1] as string) ?? '',
      complexity: row[2] as number,
      loopDepth: (row[3] as number) ?? 0,
    }))
    .filter(fn => isProductionGraphFile(deps, fn.filePath));

  // 常量注释证据：每个限制「防什么失控场景」的直接叙述源（源码同行/上邻注释）
  const constFiles = [...new Set(constants.map(c => c.filePath))].slice(0, 12);
  const intent = deps.intentProvider ? deps.intentProvider.constComments(constFiles) : undefined;

  return {
    constants,
    hotFunctions,
    ...(intent && intent.length > 0 ? { intent } : {}),
  };
}

/**
 * decisions.md 数据源：设计决策与演进（git 提交 + 文档小节证据锚定）。
 * 只承载真实证据，无任何证据时返回 null（WikiService 剔除页面并给出原因），
 * 规避旧版「自动推导条目伪装成决策记录」的失败模式。
 */
export function buildDecisionsContext(deps: ContextDeps): DecisionsContext | null {
  if (!deps.intentProvider) return null;
  const arch = deps.client.getArchitecture();
  const pkgNames = arch.packages.map(p => p.name);
  prepareIntentModules(deps, pkgNames);

  const gitTimeline = deps.intentProvider.gitTimeline();
  const docDecisions = deps.intentProvider.docEvidence();
  const hotFileChurn = deps.intentProvider.hotFileChurn(10);
  if (gitTimeline.length === 0 && docDecisions.length === 0 && hotFileChurn.length === 0) {
    return null;
  }
  const depCommits = deps.intentProvider.depCommitEvidence([...getDepNames(deps)].slice(0, 20));

  return {
    gitTimeline,
    docDecisions,
    hotFileChurn,
    ...(depCommits.length > 0 ? { depCommits } : {}),
  };
}
