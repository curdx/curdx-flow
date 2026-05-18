import type {
  ClaudePluginTopology,
  ProjectRootTopology,
  RuntimePackageManager,
  RuntimeTopology,
} from './types.ts';

export type VerificationCommandPurpose =
  | 'install'
  | 'dev'
  | 'start'
  | 'build'
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'e2e'
  | 'api'
  | 'contract'
  | 'health'
  | 'plugin-validation'
  | 'migration'
  | 'release';

export type VerificationCommandSource = 'script' | 'inferred' | 'plugin' | 'framework';
export type VerificationCommandRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type VerificationCommandMode = 'report-only' | 'fix' | 'verification' | 'release';

export interface VerificationCommandCandidate extends Record<string, unknown> {
  id: string;
  root: string;
  purpose: VerificationCommandPurpose;
  source: VerificationCommandSource;
  executable: string;
  argv: string[];
  command?: string;
  scriptName?: string;
  confidence: number;
  riskLevel: VerificationCommandRiskLevel;
  mutatesWorkspace: boolean;
  startsService: boolean;
  allowedInReportOnly: boolean;
  evidencePurpose: string;
  reason: string;
  degraded: boolean;
  selected: boolean;
  selectionReason?: string;
  notSelectedReason?: string;
}

export interface VerificationCommandSelection extends Record<string, unknown> {
  root: string;
  purpose: VerificationCommandPurpose;
  selectedId: string | null;
  alternatives: string[];
  reason: string;
}

export interface VerificationCommandBlocker extends Record<string, unknown> {
  root: string;
  purpose: VerificationCommandPurpose;
  severity: 'blocked' | 'needs-human-input';
  summary: string;
}

export interface VerificationCommandPlan extends Record<string, unknown> {
  schemaVersion: 1;
  generatedAt: string;
  mode: VerificationCommandMode;
  commands: VerificationCommandCandidate[];
  selections: VerificationCommandSelection[];
  blockers: VerificationCommandBlocker[];
  summary: {
    total: number;
    selected: number;
    inferred: number;
    blocked: number;
    reportOnlyDisallowed: number;
  };
}

export interface DetectVerificationCommandsInput {
  topology: RuntimeTopology;
  generatedAt?: Date | string;
  mode?: VerificationCommandMode;
}

export function detectVerificationCommands(input: DetectVerificationCommandsInput): VerificationCommandPlan {
  const mode = input.mode ?? 'verification';
  const commands: VerificationCommandCandidate[] = [];
  const blockers: VerificationCommandBlocker[] = [];

  for (const root of input.topology.roots) {
    commands.push(...detectRootCommands(root, mode, blockers));
  }

  commands.push(...detectPluginValidationCommands(input.topology.pluginRoots, mode));
  const selections = selectCommands(commands);

  return {
    schemaVersion: 1,
    generatedAt: normalizeDate(input.generatedAt),
    mode,
    commands,
    selections,
    blockers,
    summary: {
      total: commands.length,
      selected: commands.filter((candidate) => candidate.selected).length,
      inferred: commands.filter((candidate) => candidate.source === 'inferred').length,
      blocked: blockers.length,
      reportOnlyDisallowed: commands.filter((candidate) => !candidate.allowedInReportOnly).length,
    },
  };
}

function detectRootCommands(
  root: ProjectRootTopology,
  mode: VerificationCommandMode,
  blockers: VerificationCommandBlocker[],
): VerificationCommandCandidate[] {
  const commands: VerificationCommandCandidate[] = [];
  const packageManager = root.packageManager;
  const scriptEntries = Object.entries(root.scripts);

  if (isNodePackageManager(packageManager)) {
    commands.push(packageManagerInstallCandidate(root, packageManager, mode));
  }

  for (const [scriptName, command] of scriptEntries) {
    const purpose = classifyScriptPurpose(scriptName, command);
    if (!purpose) continue;
    commands.push(scriptCandidate(root, packageManager, purpose, scriptName, command, mode));
  }

  if (isNodePackageManager(packageManager) && !commands.some((candidate) => candidate.root === root.path && candidate.purpose === 'test')) {
    commands.push(inferredNodeTestCandidate(root, packageManager, mode));
    blockers.push({
      root: root.path,
      purpose: 'test',
      severity: 'needs-human-input',
      summary: `No explicit test script was found for ${root.path}. An inferred package-manager test command was added with degraded confidence.`,
    });
  }

  commands.push(...detectNonNodeCommands(root, mode));
  return commands;
}

function detectPluginValidationCommands(
  pluginRoots: ClaudePluginTopology[],
  mode: VerificationCommandMode,
): VerificationCommandCandidate[] {
  return pluginRoots.map((pluginRoot) => {
    const risk = riskForPurpose('plugin-validation', '');
    return {
      id: `root:${pluginRoot.path}:plugin-validation:claude-plugin-validate`,
      root: pluginRoot.path,
      purpose: 'plugin-validation',
      source: 'plugin',
      executable: pluginRoot.validationCommand.executable,
      argv: [...pluginRoot.validationCommand.argv],
      confidence: 0.94,
      riskLevel: risk.riskLevel,
      mutatesWorkspace: risk.mutatesWorkspace,
      startsService: risk.startsService,
      allowedInReportOnly: isAllowedInReportOnly(risk, mode),
      evidencePurpose: 'command:plugin-validation',
      reason: 'Claude Code plugin root exposes a plugin validation command.',
      degraded: false,
      selected: false,
    };
  });
}

function detectNonNodeCommands(
  root: ProjectRootTopology,
  mode: VerificationCommandMode,
): VerificationCommandCandidate[] {
  const sources = rootFactSources(root);
  const commands: VerificationCommandCandidate[] = [];

  if (sources.has('pyproject.toml') || sources.has('requirements.txt')) {
    commands.push(inferredCandidate({
      root,
      mode,
      purpose: 'test',
      executable: 'python',
      argv: ['-m', 'pytest'],
      confidence: 0.58,
      reason: 'Python project metadata was found without an explicit project test script.',
    }));
  }

  if (sources.has('go.mod')) {
    commands.push(inferredCandidate({
      root,
      mode,
      purpose: 'test',
      executable: 'go',
      argv: ['test', './...'],
      confidence: 0.68,
      reason: 'Go module metadata was found.',
    }));
  }

  if (sources.has('Cargo.toml')) {
    commands.push(inferredCandidate({
      root,
      mode,
      purpose: 'test',
      executable: 'cargo',
      argv: ['test'],
      confidence: 0.68,
      reason: 'Rust Cargo metadata was found.',
    }));
  }

  return commands;
}

function scriptCandidate(
  root: ProjectRootTopology,
  packageManager: RuntimePackageManager,
  purpose: VerificationCommandPurpose,
  scriptName: string,
  command: string,
  mode: VerificationCommandMode,
): VerificationCommandCandidate {
  const risk = riskForPurpose(purpose, command);
  return {
    id: `root:${root.path}:${purpose}:${scriptName}`,
    root: root.path,
    purpose,
    source: 'script',
    executable: executableForPackageManager(packageManager),
    argv: argvForScript(packageManager, scriptName),
    command,
    scriptName,
    confidence: confidenceForScript(purpose, scriptName),
    riskLevel: risk.riskLevel,
    mutatesWorkspace: risk.mutatesWorkspace,
    startsService: risk.startsService,
    allowedInReportOnly: isAllowedInReportOnly(risk, mode),
    evidencePurpose: `command:${purpose}`,
    reason: `Explicit script '${scriptName}' was found in root ${root.path}.`,
    degraded: false,
    selected: false,
  };
}

function packageManagerInstallCandidate(
  root: ProjectRootTopology,
  packageManager: RuntimePackageManager,
  mode: VerificationCommandMode,
): VerificationCommandCandidate {
  const risk = riskForPurpose('install', 'install dependencies');
  return {
    id: `root:${root.path}:install:package-manager`,
    root: root.path,
    purpose: 'install',
    source: 'inferred',
    executable: executableForPackageManager(packageManager),
    argv: ['install'],
    confidence: 0.72,
    riskLevel: risk.riskLevel,
    mutatesWorkspace: risk.mutatesWorkspace,
    startsService: risk.startsService,
    allowedInReportOnly: isAllowedInReportOnly(risk, mode),
    evidencePurpose: 'command:install',
    reason: `${packageManager} lockfile or package metadata indicates dependency install command availability.`,
    degraded: true,
    selected: false,
  };
}

function inferredNodeTestCandidate(
  root: ProjectRootTopology,
  packageManager: RuntimePackageManager,
  mode: VerificationCommandMode,
): VerificationCommandCandidate {
  const risk = riskForPurpose('test', '');
  return {
    id: `root:${root.path}:test:inferred`,
    root: root.path,
    purpose: 'test',
    source: 'inferred',
    executable: executableForPackageManager(packageManager),
    argv: ['test'],
    confidence: 0.34,
    riskLevel: risk.riskLevel,
    mutatesWorkspace: risk.mutatesWorkspace,
    startsService: risk.startsService,
    allowedInReportOnly: isAllowedInReportOnly(risk, mode),
    evidencePurpose: 'command:test',
    reason: `No explicit test script was found for ${root.path}; inferred a package-manager test command with degraded confidence.`,
    degraded: true,
    selected: false,
  };
}

function inferredCandidate(input: {
  root: ProjectRootTopology;
  mode: VerificationCommandMode;
  purpose: VerificationCommandPurpose;
  executable: string;
  argv: string[];
  confidence: number;
  reason: string;
}): VerificationCommandCandidate {
  const risk = riskForPurpose(input.purpose, '');
  return {
    id: `root:${input.root.path}:${input.purpose}:inferred:${input.executable}`,
    root: input.root.path,
    purpose: input.purpose,
    source: 'inferred',
    executable: input.executable,
    argv: input.argv,
    confidence: input.confidence,
    riskLevel: risk.riskLevel,
    mutatesWorkspace: risk.mutatesWorkspace,
    startsService: risk.startsService,
    allowedInReportOnly: isAllowedInReportOnly(risk, input.mode),
    evidencePurpose: `command:${input.purpose}`,
    reason: input.reason,
    degraded: true,
    selected: false,
  };
}

function selectCommands(commands: VerificationCommandCandidate[]): VerificationCommandSelection[] {
  const groups = new Map<string, VerificationCommandCandidate[]>();
  for (const command of commands) {
    const key = `${command.root}:${command.purpose}`;
    groups.set(key, [...(groups.get(key) ?? []), command]);
  }

  const selections: VerificationCommandSelection[] = [];
  for (const candidates of groups.values()) {
    const sorted = [...candidates].sort(compareCandidates);
    const selected = sorted[0] ?? null;
    for (const candidate of sorted) {
      if (selected && candidate.id === selected.id) {
        candidate.selected = true;
        candidate.selectionReason = selectionReason(candidate);
      } else {
        candidate.selected = false;
        candidate.notSelectedReason = selected
          ? `Higher confidence candidate selected: ${selected.id}.`
          : 'No candidate selected.';
      }
    }
    selections.push({
      root: sorted[0]?.root ?? '',
      purpose: sorted[0]?.purpose ?? 'test',
      selectedId: selected?.id ?? null,
      alternatives: sorted.slice(1).map((candidate) => candidate.id),
      reason: selected ? selectionReason(selected) : 'No command candidate available.',
    });
  }
  return selections.sort((a, b) => `${a.root}:${a.purpose}`.localeCompare(`${b.root}:${b.purpose}`));
}

function compareCandidates(a: VerificationCommandCandidate, b: VerificationCommandCandidate): number {
  const priority = candidatePriority(b) - candidatePriority(a);
  if (priority !== 0) return priority;
  return b.confidence - a.confidence || a.id.localeCompare(b.id);
}

function candidatePriority(candidate: VerificationCommandCandidate): number {
  if (candidate.source === 'plugin') return 90;
  if (candidate.source === 'script' && isExactPurposeScript(candidate)) return 80;
  if (candidate.source === 'script') return 70;
  if (candidate.source === 'framework') return 60;
  return 20;
}

function isExactPurposeScript(candidate: VerificationCommandCandidate): boolean {
  const scriptName = candidate.scriptName;
  return scriptName === candidate.purpose || (candidate.purpose === 'plugin-validation' && typeof scriptName === 'string' && scriptName.includes('validate'));
}

function selectionReason(candidate: VerificationCommandCandidate): string {
  if (candidate.source === 'script') return `Selected explicit script for ${candidate.purpose}.`;
  if (candidate.source === 'plugin') return 'Selected Claude Code plugin validation command from plugin topology.';
  return `Selected inferred ${candidate.purpose} command with degraded confidence.`;
}

function classifyScriptPurpose(scriptName: string, command: string): VerificationCommandPurpose | null {
  const normalizedName = scriptName.toLowerCase();
  const normalizedCommand = command.toLowerCase();
  if (/(^|:)(release|publish)$/.test(normalizedName) || /\b(npm publish|git push|git tag)\b/.test(normalizedCommand)) return 'release';
  if (normalizedName.includes('migrate') || /\bmigrat(e|ion)\b/.test(normalizedCommand)) return 'migration';
  if (normalizedName === 'install' || normalizedName === 'postinstall' || /\b(npm|pnpm|yarn|bun) install\b/.test(normalizedCommand)) return 'install';
  if (normalizedName.includes('plugin') && normalizedName.includes('valid')) return 'plugin-validation';
  if (/\bclaude\s+plugin\s+validate\b/.test(normalizedCommand)) return 'plugin-validation';
  if (normalizedName === 'dev' || normalizedName === 'serve') return 'dev';
  if (normalizedName === 'start') return 'start';
  if (normalizedName === 'build' || normalizedName.startsWith('build:')) return 'build';
  if (normalizedName === 'lint' || normalizedName.startsWith('lint:')) return 'lint';
  if (normalizedName === 'typecheck' || normalizedName === 'check:types' || normalizedName.includes('typecheck')) return 'typecheck';
  if (normalizedName.includes('e2e')) return 'e2e';
  if (normalizedName.includes('contract')) return 'contract';
  if (normalizedName.includes('api')) return 'api';
  if (normalizedName.includes('health')) return 'health';
  if (normalizedName === 'test' || normalizedName.startsWith('test:')) return 'test';
  return null;
}

function riskForPurpose(purpose: VerificationCommandPurpose, command: string): {
  riskLevel: VerificationCommandRiskLevel;
  mutatesWorkspace: boolean;
  startsService: boolean;
} {
  const normalizedCommand = command.toLowerCase();
  if (purpose === 'release' || /\b(npm publish|git push|git tag)\b/.test(normalizedCommand)) {
    return { riskLevel: 'critical', mutatesWorkspace: false, startsService: false };
  }
  if (purpose === 'install' || purpose === 'migration') {
    return { riskLevel: 'high', mutatesWorkspace: true, startsService: false };
  }
  if (/\b(generate|codegen|write|prisma generate|rm\s+-rf|rimraf|del-cli|trash)\b/.test(normalizedCommand)) {
    return { riskLevel: 'high', mutatesWorkspace: true, startsService: false };
  }
  if (purpose === 'build') {
    return { riskLevel: 'medium', mutatesWorkspace: true, startsService: false };
  }
  if (purpose === 'dev' || purpose === 'start') {
    return { riskLevel: 'medium', mutatesWorkspace: false, startsService: true };
  }
  return { riskLevel: 'low', mutatesWorkspace: false, startsService: false };
}

function isAllowedInReportOnly(
  risk: { riskLevel: VerificationCommandRiskLevel; mutatesWorkspace: boolean; startsService: boolean },
  mode: VerificationCommandMode,
): boolean {
  if (mode !== 'report-only') return true;
  return !risk.mutatesWorkspace && !risk.startsService && risk.riskLevel !== 'critical' && risk.riskLevel !== 'high';
}

function confidenceForScript(purpose: VerificationCommandPurpose, scriptName: string): number {
  if (purpose === 'plugin-validation') return 0.88;
  if (scriptName === purpose) return 0.92;
  if (purpose === 'test' && scriptName === 'test') return 0.94;
  if (purpose === 'e2e' && scriptName.includes('e2e')) return 0.9;
  return 0.78;
}

function executableForPackageManager(packageManager: RuntimePackageManager): string {
  if (packageManager === 'pnpm') return 'pnpm';
  if (packageManager === 'yarn') return 'yarn';
  if (packageManager === 'bun') return 'bun';
  return 'npm';
}

function argvForScript(packageManager: RuntimePackageManager, scriptName: string): string[] {
  if (packageManager === 'yarn') return [scriptName];
  return ['run', scriptName];
}

function isNodePackageManager(packageManager: RuntimePackageManager): packageManager is 'npm' | 'pnpm' | 'yarn' | 'bun' {
  return packageManager === 'npm' || packageManager === 'pnpm' || packageManager === 'yarn' || packageManager === 'bun';
}

function rootFactSources(root: ProjectRootTopology): Set<string> {
  return new Set([
    ...root.entryHints.map((entry) => entry.source),
    ...root.entryHints.flatMap((entry) => typeof entry.path === 'string' ? [entry.path] : []),
    ...root.pluginHints.map((entry) => entry.source),
  ]);
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
