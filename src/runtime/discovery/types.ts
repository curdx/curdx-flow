export type RuntimeProjectType =
  | 'frontend'
  | 'backend'
  | 'full-stack'
  | 'cli'
  | 'library'
  | 'monorepo'
  | 'claude-code-plugin'
  | 'unknown';

export type RuntimeTopologyStatus = 'ready' | 'needs-human-input' | 'blocked';

export type RuntimePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export type DiscoveryHintKind =
  | 'entry'
  | 'script'
  | 'service'
  | 'api'
  | 'data'
  | 'browser'
  | 'test'
  | 'validation'
  | 'plugin';

export interface DiscoveryHint extends Record<string, unknown> {
  kind: DiscoveryHintKind;
  source: string;
  summary: string;
  confidence: number;
  path?: string;
  scriptName?: string;
  command?: string;
}

export interface DiscoveryBlocker extends Record<string, unknown> {
  code: string;
  path: string;
  severity: 'blocked' | 'needs-human-input';
  summary: string;
}

export interface ProjectRootTopology extends Record<string, unknown> {
  path: string;
  type: RuntimeProjectType;
  status: RuntimeTopologyStatus;
  confidence: number;
  packageManager: RuntimePackageManager;
  packageJsonPath: string | null;
  name?: string;
  scripts: Record<string, string>;
  entryHints: DiscoveryHint[];
  scriptHints: DiscoveryHint[];
  serviceHints: DiscoveryHint[];
  apiHints: DiscoveryHint[];
  dataHints: DiscoveryHint[];
  browserHints: DiscoveryHint[];
  validationHints: DiscoveryHint[];
  pluginHints: DiscoveryHint[];
  blockers: DiscoveryBlocker[];
  reasons: string[];
}

export interface ClaudePluginTopology extends Record<string, unknown> {
  path: string;
  manifestPath: string;
  hooksPath: string | null;
  skillsPath: string | null;
  agentsPath: string | null;
  binPaths: string[];
  validationCommand: {
    executable: 'claude';
    argv: ['plugin', 'validate', string];
    cwd: '.';
  };
  wiring: {
    manifest: true;
    hooks: boolean;
    skills: boolean;
    agents: boolean;
    bin: boolean;
  };
}

export interface RuntimeTopology extends Record<string, unknown> {
  schemaVersion: 1;
  workspaceRoot: string;
  generatedAt: string;
  overallType: RuntimeProjectType;
  status: RuntimeTopologyStatus;
  confidence: number;
  packageManager: RuntimePackageManager;
  roots: ProjectRootTopology[];
  pluginRoots: ClaudePluginTopology[];
  blockers: DiscoveryBlocker[];
  hints: DiscoveryHint[];
}

export interface DiscoverRuntimeTopologyInput {
  workspaceRoot: string;
  generatedAt?: Date | string;
  maxDepth?: number;
}
