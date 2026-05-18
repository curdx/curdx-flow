export type CapabilityTriState = boolean | 'unknown' | 'skipped';

export type CapabilityCategory =
  | 'core'
  | 'package-manager'
  | 'browser'
  | 'plugin-dependency'
  | 'external-mcp'
  | 'hook'
  | 'plugin-validation'
  | 'release';

export type CapabilityProvider =
  | 'curdx-flow'
  | 'claude-code'
  | 'node'
  | 'npm'
  | 'playwright'
  | 'chrome'
  | 'mcp'
  | 'plugin';

export type CapabilityProvisioning =
  | 'core'
  | 'local-command'
  | 'plugin-dependency'
  | 'external-mcp'
  | 'project-script'
  | 'workflow';

export type CapabilityCheckMode = 'fast' | 'deep' | 'skipped';

export type CapabilityState =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'skipped'
  | 'unknown';

export interface CommandProbeResult {
  id: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  durationMs: number;
  timedOut: boolean;
  source: 'exec' | 'fixture';
}

export interface CapabilityStatus extends Record<string, unknown> {
  schemaVersion: 1;
  id: string;
  label: string;
  category: CapabilityCategory;
  provider: CapabilityProvider;
  provisioning: CapabilityProvisioning;
  checkMode: CapabilityCheckMode;
  state: CapabilityState;
  configured: CapabilityTriState;
  installed: CapabilityTriState;
  callable: CapabilityTriState;
  authorized: CapabilityTriState;
  degraded: boolean;
  unavailable: boolean;
  reason: string;
  skippedReason?: string;
  evidenceImpact: string[];
  blocksCompletion: boolean;
  blocksRelease: boolean;
  remediation: string | null;
  durationMs: number;
}

export interface CapabilityNextAction {
  capabilityId: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CapabilityMatrix extends Record<string, unknown> {
  schemaVersion: 1;
  generatedAt: string;
  cwd: string;
  mode: 'fast' | 'deep';
  summary: {
    blockers: number;
    degraded: number;
    unavailable: number;
    skippedDeepChecks: number;
  };
  capabilities: CapabilityStatus[];
  blockers: CapabilityStatus[];
  degraded: CapabilityStatus[];
  nextActions: CapabilityNextAction[];
}

export interface CapabilityValidationIssue {
  path: string;
  message: string;
}

export type CapabilityValidationResult =
  | { ok: true; value: CapabilityMatrix }
  | { ok: false; issues: CapabilityValidationIssue[] };
