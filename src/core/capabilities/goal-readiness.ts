import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { CommandProbeResult } from './types.ts';

export const GOAL_CONDITION_LIMIT = 4000;
export const NATIVE_GOAL_REQUIRED_VERSION = '2.1.139';

export type NativeGoalReadinessState =
  | 'available'
  | 'blocked'
  | 'update-needed'
  | 'unavailable'
  | 'unknown';

export type NativeGoalRecommendedDriver = 'native-goal' | 'manual-resume';

export type NativeGoalConditionLengthStatus =
  | 'within-limit'
  | 'compressed'
  | 'over-limit'
  | 'not-generated';

export interface NativeGoalConditionLength {
  limit: number;
  actual: number | null;
  original: number | null;
  status: NativeGoalConditionLengthStatus;
}

export interface NativeGoalSettingsSource {
  source: string;
  managed?: boolean;
  exists?: boolean;
  settings?: unknown;
  error?: string;
}

export interface NativeGoalSettingsBlocker {
  id: 'disableAllHooks' | 'allowManagedHooksOnly';
  source: string;
  managed: boolean;
  reason: string;
}

export interface NativeGoalReadiness extends Record<string, unknown> {
  state: NativeGoalReadinessState;
  supported: boolean | 'unknown';
  requiredVersion: string;
  detectedVersion: string | null;
  reason: string;
  hooksRequired: true;
  blockers: NativeGoalSettingsBlocker[];
  fallbackAction: string | null;
  recommendedDriver: NativeGoalRecommendedDriver;
  conditionLength: NativeGoalConditionLength;
  settingsSources: string[];
  warnings: string[];
}

export interface BuildNativeGoalReadinessInput {
  claudeProbe?: CommandProbeResult;
  settingsSources?: readonly NativeGoalSettingsSource[];
  conditionLength?: NativeGoalConditionLength;
  requiredVersion?: string;
}

export interface ReadNativeGoalSettingsInput {
  cwd: string;
  env?: Record<string, string | undefined>;
  home?: string;
}

function notGeneratedLength(): NativeGoalConditionLength {
  return {
    limit: GOAL_CONDITION_LIMIT,
    actual: null,
    original: null,
    status: 'not-generated',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseClaudeCodeVersion(output: string): string | null {
  const match = output.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number(part));
  const right = b.split('.').map((part) => Number(part));
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function hasBooleanSetting(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasBooleanSetting(item, key));
  }
  if (!isRecord(value)) return false;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && entryValue === true) return true;
    if (typeof entryValue === 'object' && entryValue !== null && hasBooleanSetting(entryValue, key)) {
      return true;
    }
  }
  return false;
}

function collectBlockers(sources: readonly NativeGoalSettingsSource[]): NativeGoalSettingsBlocker[] {
  const blockers: NativeGoalSettingsBlocker[] = [];
  for (const source of sources) {
    if (source.error || source.settings === undefined) continue;
    const managed = source.managed === true;
    if (hasBooleanSetting(source.settings, 'disableAllHooks')) {
      blockers.push({
        id: 'disableAllHooks',
        source: source.source,
        managed,
        reason: 'disableAllHooks disables Claude Code hooks, which makes native /goal unavailable.',
      });
    }
    if (managed && hasBooleanSetting(source.settings, 'allowManagedHooksOnly')) {
      blockers.push({
        id: 'allowManagedHooksOnly',
        source: source.source,
        managed,
        reason: 'Managed allowManagedHooksOnly prevents unmanaged plugin hooks, which blocks native /goal execution.',
      });
    }
  }
  return blockers;
}

function fallbackAction(state: NativeGoalReadinessState, requiredVersion: string): string | null {
  switch (state) {
    case 'available':
      return null;
    case 'update-needed':
      return `Update Claude Code to ${requiredVersion} or newer, then rerun curdx-flow doctor; until then use /curdx-flow:implement --manual and resume explicitly.`;
    case 'blocked':
      return 'Use /curdx-flow:implement --manual for a resumable single-turn flow, or remove the hook-blocking Claude Code setting and rerun doctor.';
    case 'unavailable':
      return 'Install or fix the claude CLI, then rerun doctor; until then use manual/resumable curdx-flow commands only.';
    case 'unknown':
      return 'Use /curdx-flow:implement --manual until native /goal support can be confirmed.';
  }
}

export function buildNativeGoalReadiness(
  input: BuildNativeGoalReadinessInput = {},
): NativeGoalReadiness {
  const requiredVersion = input.requiredVersion ?? NATIVE_GOAL_REQUIRED_VERSION;
  const conditionLength = input.conditionLength ?? notGeneratedLength();
  const settingsSources = input.settingsSources ?? [];
  const settingsErrors = settingsSources
    .filter((source) => source.error)
    .map((source) => `${source.source}: ${source.error}`);
  const blockers = collectBlockers(settingsSources);
  const probe = input.claudeProbe;

  let detectedVersion: string | null = null;
  let state: NativeGoalReadinessState = 'unknown';
  let supported: boolean | 'unknown' = 'unknown';
  let reason = 'Native /goal support is unknown because claude --version was not checked.';

  if (!probe) {
    state = 'unknown';
  } else if (probe.error || probe.timedOut || probe.exitCode !== 0) {
    state = 'unavailable';
    supported = false;
    reason = probe.error || probe.stderr.trim() || `claude --version exited ${probe.exitCode}`;
  } else {
    detectedVersion = parseClaudeCodeVersion(`${probe.stdout}\n${probe.stderr}`);
    if (!detectedVersion) {
      state = 'unknown';
      supported = 'unknown';
      reason = 'Native /goal support is unknown because claude --version output could not be parsed.';
    } else if (compareVersions(detectedVersion, requiredVersion) < 0) {
      state = 'update-needed';
      supported = false;
      reason = `Claude Code ${detectedVersion} is below native /goal minimum ${requiredVersion}.`;
    } else if (blockers.length > 0) {
      state = 'blocked';
      supported = false;
      reason = `Native /goal is blocked by Claude Code hook settings: ${blockers.map((blocker) => blocker.id).join(', ')}.`;
    } else if (settingsErrors.length > 0) {
      state = 'unknown';
      supported = 'unknown';
      reason = 'Native /goal support is unknown because one or more settings sources could not be read.';
    } else {
      state = 'available';
      supported = true;
      reason = `Claude Code ${detectedVersion} supports native /goal and no hook-blocking settings were detected.`;
    }
  }

  return {
    state,
    supported,
    requiredVersion,
    detectedVersion,
    reason,
    hooksRequired: true,
    blockers,
    fallbackAction: fallbackAction(state, requiredVersion),
    recommendedDriver: state === 'available' ? 'native-goal' : 'manual-resume',
    conditionLength,
    settingsSources: settingsSources.map((source) => source.source),
    warnings: settingsErrors,
  };
}

export function evaluateNativeGoalConditionLength(input: {
  condition: string;
  originalLength?: number;
  compressed?: boolean;
  limit?: number;
}): NativeGoalConditionLength {
  const limit = input.limit ?? GOAL_CONDITION_LIMIT;
  const actual = input.condition.length;
  const original = input.originalLength ?? actual;
  const status: NativeGoalConditionLengthStatus = input.compressed
    ? actual <= limit ? 'compressed' : 'over-limit'
    : actual <= limit ? 'within-limit' : 'over-limit';
  return { limit, actual, original, status };
}

export function attachNativeGoalConditionLength(
  readiness: NativeGoalReadiness,
  conditionLength: NativeGoalConditionLength,
): NativeGoalReadiness {
  const warnings = [...readiness.warnings];
  if (conditionLength.status === 'compressed') {
    warnings.push('Native /goal condition was shortened to fit the 4000 character limit.');
  }
  if (conditionLength.status === 'over-limit') {
    warnings.push('Native /goal condition still exceeds the 4000 character limit.');
  }
  return {
    ...readiness,
    conditionLength,
    warnings: [...new Set(warnings)],
  };
}

function settingSourceFromValue(value: unknown, source: string): NativeGoalSettingsSource {
  if (isRecord(value) && 'settings' in value) {
    return {
      source: typeof value.source === 'string' ? value.source : source,
      managed: value.managed === true,
      exists: value.exists === false ? false : true,
      settings: value.settings,
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
    };
  }
  return { source, exists: true, settings: value };
}

function fixtureSources(raw: string, source: string): NativeGoalSettingsSource[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => settingSourceFromValue(item, `${source}[${idx}]`));
    }
    if (isRecord(parsed) && Array.isArray(parsed.sources)) {
      return parsed.sources.map((item, idx) => settingSourceFromValue(item, `${source}.sources[${idx}]`));
    }
    return [settingSourceFromValue(parsed, source)];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{ source, exists: true, error: `invalid settings fixture: ${message}` }];
  }
}

function readJsonSettingsFile(path: string, source: string, managed = false): NativeGoalSettingsSource | null {
  if (!existsSync(path)) return null;
  try {
    return {
      source,
      managed,
      exists: true,
      settings: JSON.parse(readFileSync(path, 'utf8')) as unknown,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { source, managed, exists: true, error: message };
  }
}

export function readNativeGoalSettingsSources(
  input: ReadNativeGoalSettingsInput,
): NativeGoalSettingsSource[] {
  const env = { ...process.env, ...(input.env ?? {}) };
  const fixture = env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_JSON ?? env.CURDX_FLOW_GOAL_SETTINGS_JSON;
  if (fixture !== undefined) return fixtureSources(fixture, 'CURDX_FLOW_NATIVE_GOAL_SETTINGS_JSON');
  if (env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR) {
    return [{ source: 'CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR', exists: true, error: env.CURDX_FLOW_NATIVE_GOAL_SETTINGS_ERROR }];
  }

  const home = input.home ?? env.HOME ?? env.USERPROFILE ?? homedir();
  const candidates: Array<{ path: string; source: string; managed?: boolean }> = [
    { path: join(input.cwd, '.claude', 'settings.json'), source: 'project:.claude/settings.json' },
    { path: join(input.cwd, '.claude', 'settings.local.json'), source: 'project-local:.claude/settings.local.json' },
    { path: join(home, '.claude', 'settings.json'), source: 'user:~/.claude/settings.json' },
    { path: '/Library/Application Support/ClaudeCode/managed-settings.json', source: 'managed:macos', managed: true },
    { path: '/etc/claude-code/managed-settings.json', source: 'managed:linux', managed: true },
  ];

  const sources: NativeGoalSettingsSource[] = [];
  for (const candidate of candidates) {
    const source = readJsonSettingsFile(candidate.path, candidate.source, candidate.managed === true);
    if (source) sources.push(source);
  }
  return sources;
}
