/** 意图证据层聚合出口（类型 / provider / 统计）。 */

export type {
  IntentEvidenceKind,
  IntentEvidence,
  GitCommitRef,
  FileGitInfo,
  ModuleGitInfo,
  FileChurnInfo,
  GitRunner,
} from './shared.js';
export { countIntentEvidence, dedupeByAnchor } from './shared.js';
export type { IntentProviderOptions } from './provider.js';
export { IntentEvidenceProvider } from './provider.js';
