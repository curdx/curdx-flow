import type { AdapterResult, EvidenceBlock } from '../../contracts/index.ts';
import type { ArtifactIndexInput } from '../../evidence/index.ts';
import type {
  JourneyPlanMode,
  JourneyStep,
  JourneyStepType,
  UserJourney,
} from '../../planner/index.ts';

export type BrowserCapabilityKind =
  | 'playwright'
  | 'project-e2e'
  | 'chrome-devtools-mcp'
  | 'chrome-runtime'
  | 'claude-chrome'
  | string;

export type BrowserArtifactType = 'screenshot' | 'trace';

export type BrowserArtifactQualityStatus =
  | 'usable'
  | 'blank'
  | 'unrelated'
  | 'terminal'
  | 'missing-change-area'
  | 'unknown';

export interface BrowserArtifactQuality extends Record<string, unknown> {
  status: BrowserArtifactQualityStatus;
  supportsEvidence: boolean;
  reason: string;
}

export interface BrowserArtifactCapture extends Record<string, unknown> {
  id: string;
  type: BrowserArtifactType;
  path?: string;
  content?: string | Uint8Array;
  summary: string;
  quality?: BrowserArtifactQuality;
  privacy?: ArtifactIndexInput['privacy'];
}

export interface BrowserCommandResult extends Record<string, unknown> {
  executable: string;
  argv: string[];
  cwd?: string;
  exitCode: number | null;
  stdoutSummary?: string;
  stderrSummary?: string;
  failureSummary?: string;
  durationMs?: number;
}

export interface BrowserActionOutcome extends Record<string, unknown> {
  actionId: string;
  actionType: JourneyStepType;
  status: EvidenceBlock['status'];
  url?: string;
  pageState?: string;
  error?: string;
  failureCode?: string;
  durationMs?: number;
  artifacts?: BrowserArtifactCapture[];
}

export interface BrowserDiagnostic extends Record<string, unknown> {
  code: string;
  message: string;
  actionId?: string;
  url?: string;
}

export interface BrowserPortExecutionInput {
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  artifactBasePath: string;
}

export interface BrowserPortExecutionResult extends Record<string, unknown> {
  status: EvidenceBlock['status'];
  visitedUrl?: string;
  actions: BrowserActionOutcome[];
  artifacts?: BrowserArtifactCapture[];
  diagnostics?: BrowserDiagnostic[];
  command?: BrowserCommandResult;
  durationMs?: number;
  fallbackCapabilityIds?: string[];
}

export interface BrowserAutomationPort {
  capabilityId: string;
  capabilityKind: BrowserCapabilityKind;
  execute(input: BrowserPortExecutionInput): Promise<BrowserPortExecutionResult>;
}

export interface BrowserBlocker extends Record<string, unknown> {
  code: string;
  category: 'browser' | 'environment' | 'dependency' | 'permission' | 'externalService' | 'unknown';
  message: string;
  url: string;
  journeyId: string;
  actionId: string;
  reproduction: string;
  attemptedActions: string[];
  availableFallbacks: string[];
  nextAction: {
    owner: 'agent' | 'user' | 'external-system';
    summary: string;
  };
  owner: 'agent' | 'user' | 'external-system';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  evidenceRefs: string[];
  retryable: boolean;
}

export interface ExecuteBrowserJourneyInput {
  workspaceRoot: string;
  runId: string;
  goalId: string;
  mode: JourneyPlanMode;
  journey: UserJourney;
  port: BrowserAutomationPort;
  generatedAt?: Date | string;
}

export interface BrowserAdapterResult extends AdapterResult {
  status: EvidenceBlock['status'];
  capabilityId: string;
  inputs: {
    runId: string;
    goalId: string;
    mode: JourneyPlanMode;
    journeyId: string;
    entryUrl: string;
  };
  evidence: EvidenceBlock[];
  blockers: BrowserBlocker[];
  artifacts: ArtifactIndexInput[];
  diagnostics: BrowserDiagnostic[];
  actionResults: BrowserActionOutcome[];
  command?: BrowserCommandResult;
}

export interface PlannedBrowserAction extends JourneyStep {
  id: string;
}
