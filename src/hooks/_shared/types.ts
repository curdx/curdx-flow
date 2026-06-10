// PreToolUse permission decisions never use the top-level `decision` field —
// Claude Code's schema rejects values other than "approve"|"block" there.
// Deny goes through `hookSpecificOutput`; allow emits nothing.
export type HookDecision = "block";

// Permissive by design: Claude Code's hook envelope evolves, unknown fields
// are ignored, and hooks never throw on malformed input.
export interface HookStdin {
  cwd?: string;
  transcript_path?: string;
  stop_hook_active?: boolean;
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_use_id?: string;
  // The freshness edit-stamp reads `file_path` to stamp only real
  // workspace-source edits, not doc/spec/state writes.
  tool_input?: { file_path?: string };
}

export interface ContextBlockOutput {
  active: boolean;
  specName?: string;
  specPath?: string;
  phase?: string;
  taskIndex?: number;
  totalTasks?: number;
  awaitingApproval?: boolean;
  goal?: string;
  contextCapsule?: string;
}

// The allow path is intentionally absent: per Claude Code's PreToolUse
// schema, allow = empty stdout (no JSON).
export interface DenyDecisionOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
}

export interface BlockDecisionOutput {
  decision: "block";
  reason: string;
  systemMessage: string;
}

export type HookOutput =
  | ContextBlockOutput
  | DenyDecisionOutput
  | BlockDecisionOutput;

export type VerificationPhase =
  | "research"
  | "requirements"
  | "design"
  | "tasks"
  | "execution";

// "advisory" surfaces findings without blocking: under QuickMode the
// code-quality reviewer degrades to advisory while spec-compliance stays a
// hard gate.
export interface ReviewVerdict {
  verdict: "pass" | "fail" | "advisory";
  findings: string[];
  reviewerId: string;
  timestamp: string;
}

export interface VerificationBlock {
  command: string;
  exitCode: number;
  timestamp: string;
  srcMtime: number;
  // Optional only for backwards compatibility with older states; the gate
  // enforces the task-index match when present so evidence for task N
  // cannot complete task N+1.
  taskIndex?: number;
  description?: string;
  failedReason?: string;
  reviews?: {
    specCompliance?: ReviewVerdict;
    codeQuality?: ReviewVerdict;
  };
}

/**
 * Per-spec runtime state, persisted at `<basePath>/.curdx-state.json`.
 * All fields optional — readers must tolerate older states and use strict
 * `state.completed === true` equality, never truthiness. The persistent
 * schema lives in `plugins/curdx-flow/schemas/spec.schema.json`.
 */
export interface CurdxState {
  version?: 1 | 2;
  // identity
  runId?: string;
  goalId?: string;
  source?: "spec" | "plan" | "direct";
  name?: string;
  basePath?: string;
  phase?: string;
  // ephemeral / loop control
  taskIndex?: number;
  totalTasks?: number;
  taskIteration?: number;
  maxTaskIterations?: number;
  globalIteration?: number;
  maxGlobalIterations?: number;
  awaitingApproval?: boolean;
  recoveryMode?: boolean;
  nativeSyncEnabled?: boolean;
  executionDriver?: "goal" | "manual";
  // mode
  quickMode?: boolean;
  granularity?: "auto" | "fine" | "standard" | "coarse";
  autoPolicy?: {
    version?: 1 | 2;
    mode?: "auto" | "fast" | "deep";
    risk?: "low" | "medium" | "high" | "critical";
    executionMode?: "direct" | "spec-lite" | "standard" | "deep-spec" | "epic-triage";
    executionDriver?: "goal" | "manual";
    taskGranularity?: "none" | "coarse" | "standard" | "fine";
    taskTargetRange?: { min?: number; max?: number };
    reviewCadence?: "minimal" | "final" | "periodic" | "strict";
    verificationLevel?: "targeted" | "standard" | "strict";
    subagentPolicy?: "none" | "on-demand" | "per-slice";
    maxGlobalIterations?: number;
    maxTaskIterations?: number;
    shouldSplitSpec?: boolean;
    reasons?: string[];
  };
  route?: {
    route?:
      | "direct-change"
      | "lite-spec"
      | "full-spec"
      | "epic-split"
      | "scaffold"
      | "product-inception"
      | "greenfield-spec"
      | "prototype"
      | "import-spec"
      | "resume-current"
      | "blocked-ask-user";
    reason?: string;
    shouldCreateSpec?: boolean;
    shouldCreateTasks?: boolean;
    shouldUseSubagent?: boolean;
    taskCountLimit?: number;
    intent?: Record<string, unknown>;
  };
  projectTopology?: Record<string, unknown>;
  recommendedCapabilities?: Array<{
    id?:
      | "claude-mem"
      | "context7"
      | "sequential-thinking"
      | "chrome-devtools-mcp"
      | "ui-ux-pro-max"
      | "pua"
      | "docs-query"
      | "browser-verification"
      | "tdd-cycle"
      | "security-review"
      | "stack-specific-verification"
      | "context-budget";
    name?: string;
    type?: "plugin" | "mcp" | "workflow" | "policy";
    invocation?: string;
    phase?: "before-coding" | "planning" | "implementation" | "verification" | "recovery";
    category?: "docs" | "verification" | "tdd" | "security" | "context" | "recovery";
    availability?:
      | "plugin-dependency"
      | "external-expected"
      | "core-required"
      | "known-available"
      | "check-if-installed";
    availabilityState?: "available" | "expected" | "missing" | "workflow";
    ownedBy?:
      | "claude-mem"
      | "context7"
      | "sequential-thinking"
      | "chrome-devtools-mcp"
      | "ui-ux-pro-max"
      | "pua"
      | "curdx-flow";
    provisioning?: "plugin-dependency" | "external-mcp" | "workflow";
    curdxRole?: Array<"recommend" | "gate" | "record-evidence" | "compile-brief" | "route">;
    doNotReimplement?: boolean;
    expectedByDefault?: boolean;
    missingAction?: string;
    reason?: string;
    instruction?: string;
    triggerReason?: string;
    requiredWhen?: string;
    fallbackWhenMissing?: string;
    stackIds?: string[];
  }>;
  lastMile?: {
    phase?:
      | "discovering"
      | "planning"
      | "implementing"
      | "debugging"
      | "verifying"
      | "recovering"
      | "releasing";
    problemType?:
      | "missing-context"
      | "ui-quality-risk"
      | "browser-evidence-needed"
      | "repeated-failure"
      | "release-risk"
      | "verification-gap"
      | "scope-drift"
      | "dependency-missing";
    problemTypes?: Array<
      | "missing-context"
      | "ui-quality-risk"
      | "browser-evidence-needed"
      | "repeated-failure"
      | "release-risk"
      | "verification-gap"
      | "scope-drift"
      | "dependency-missing"
    >;
    capabilityPlan?: Array<Record<string, unknown>>;
    evidenceRequired?: string[];
    evidenceSatisfied?: string[];
    failureCount?: number;
    lastDecisionAt?: string;
  };
  epicName?: string;
  // per-phase Verify command outcomes
  verificationBlocks?: Partial<Record<VerificationPhase, VerificationBlock>>;
  lastSrcEditMs?: number;
  // completion marker
  completed?: boolean;
  completedAt?: string;
}
