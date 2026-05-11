// src/hooks/lib/auto-policy.ts
//
// Deterministic execution-policy classifier for curdx-flow.
//
// The classifier converts a user goal plus cheap repo signals into a stable
// execution plan. It is intentionally rule-based: skills and hooks can call
// this utility before invoking expensive model work, then persist the result
// in `.curdx-state.json::autoPolicy`.

import { fileURLToPath } from "node:url";
import { basename } from "node:path";

export type AutoPolicyMode = "auto" | "fast" | "deep";
export type AutoPolicySize = "XS" | "S" | "M" | "L" | "XL";
export type AutoPolicyRisk = "low" | "medium" | "high" | "critical";
export type TaskGranularity = "none" | "coarse" | "standard" | "fine";
export type ReviewCadence = "minimal" | "final" | "periodic" | "strict";
export type VerificationLevel = "targeted" | "standard" | "strict";
export type SubagentPolicy = "none" | "on-demand" | "per-slice";
export type StopHookPolicy = "disabled" | "short-continuation" | "full-loop";
export type ExecutionMode =
  | "direct"
  | "spec-lite"
  | "standard"
  | "deep-spec"
  | "epic-triage";

export interface AutoPolicyInput {
  goal?: string;
  flags?: string;
  changedFiles?: string[];
  estimatedFiles?: number;
  taskCount?: number;
}

export interface TaskTargetRange {
  min: number;
  max: number;
}

export interface AutoPolicy {
  version: 1;
  mode: AutoPolicyMode;
  size: AutoPolicySize;
  risk: AutoPolicyRisk;
  executionMode: ExecutionMode;
  taskGranularity: TaskGranularity;
  taskTargetRange: TaskTargetRange;
  reviewCadence: ReviewCadence;
  verificationLevel: VerificationLevel;
  subagentPolicy: SubagentPolicy;
  stopHookPolicy: StopHookPolicy;
  maxGlobalIterations: number;
  maxTaskIterations: number;
  shouldSplitSpec: boolean;
  reasons: string[];
}

interface FlagOverrides {
  mode: AutoPolicyMode;
  tasksSize?: TaskGranularity | "auto";
  review?: ReviewCadence | "standard";
}

const LOW_RISK_RE =
  /\b(readme|docs?|documentation|typo|copy|wording|comment|comments|changelog|license|format text|rename label|css copy|style text)\b/i;

const HIGH_RISK_RE =
  /\b(auth|authentication|authorization|permission|permissions|security|secret|secrets|token|password|oauth|payment|billing|invoice|migration|database|schema|release|publish|tag|manifest|plugin\.json|claude-plugin|hooks?\.json|hook|subagent|agent|sandbox|delete|remove|destructive|data loss|concurrency|race|cache|cost|pricing)\b/i;

const CRITICAL_RISK_RE =
  /\b(payment|billing|security|secret|secrets|password|token|oauth|authorization|permission|migration|data loss|release|publish|tag|hooks?\.json|plugin\.json|claude-plugin)\b/i;

const XL_RE =
  /\b(epic|multi-spec|multiple specs|multiple subsystems|cross-system|whole app|entire app|rewrite|rebuild|platform|framework migration|全量|重写|多个子系统|史诗)\b/i;

const ADD_OR_FIX_RE =
  /\b(add|build|create|implement|support|fix|debug|repair|resolve|refactor|change|modify|update)\b/i;

function normalizeWords(input: string | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function parseFlags(flags: string | undefined): FlagOverrides {
  const text = ` ${flags ?? ""} `;
  const modeMatch = text.match(/\s--mode\s+(auto|fast|deep)(?=\s|$)/);
  const tasksMatch = text.match(
    /\s--tasks-size\s+(auto|coarse|standard|fine)(?=\s|$)/,
  );
  const reviewMatch = text.match(
    /\s--review\s+(minimal|standard|strict)(?=\s|$)/,
  );
  return {
    mode: (modeMatch?.[1] as AutoPolicyMode | undefined) ?? "auto",
    tasksSize: tasksMatch?.[1] as FlagOverrides["tasksSize"],
    review: reviewMatch?.[1] as FlagOverrides["review"],
  };
}

function countDistinctDirs(files: string[]): number {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 1) {
      dirs.add(".");
    } else {
      dirs.add(parts.slice(0, Math.min(2, parts.length - 1)).join("/"));
    }
  }
  return dirs.size;
}

function bumpRisk(a: AutoPolicyRisk, b: AutoPolicyRisk): AutoPolicyRisk {
  const order: AutoPolicyRisk[] = ["low", "medium", "high", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function classifyRisk(goal: string, files: string[], fileCount: number): {
  risk: AutoPolicyRisk;
  reasons: string[];
} {
  let risk: AutoPolicyRisk = "medium";
  const reasons: string[] = [];

  if (LOW_RISK_RE.test(goal)) {
    risk = "low";
    reasons.push("low-risk wording/docs signal");
  }
  if (!ADD_OR_FIX_RE.test(goal) && fileCount <= 2) {
    risk = bumpRisk(risk, "low");
    reasons.push("small unclear change; keep validation targeted");
  }
  if (HIGH_RISK_RE.test(goal) || files.some((f) => HIGH_RISK_RE.test(f))) {
    risk = bumpRisk(risk, "high");
    reasons.push("high-risk domain or publish-critical file");
  }
  if (CRITICAL_RISK_RE.test(goal) || files.some((f) => CRITICAL_RISK_RE.test(f))) {
    risk = bumpRisk(risk, "critical");
    reasons.push("critical security/data/release/plugin surface");
  }
  if (fileCount >= 9) {
    risk = bumpRisk(risk, "high");
    reasons.push("large file surface");
  }
  if (countDistinctDirs(files) >= 4) {
    risk = bumpRisk(risk, "high");
    reasons.push("cross-directory blast radius");
  }

  return { risk, reasons };
}

function classifySize(args: {
  goal: string;
  risk: AutoPolicyRisk;
  fileCount: number;
  dirCount: number;
  taskCount?: number;
  mode: AutoPolicyMode;
}): { size: AutoPolicySize; reasons: string[] } {
  const reasons: string[] = [];
  let size: AutoPolicySize;

  if (
    XL_RE.test(args.goal) ||
    args.fileCount >= 16 ||
    args.dirCount >= 6 ||
    (typeof args.taskCount === "number" && args.taskCount > 12)
  ) {
    size = "XL";
    reasons.push("epic or oversized task/file surface");
  } else if (args.risk === "critical" || args.fileCount >= 9) {
    size = "L";
    reasons.push("critical/high blast radius requires deep spec");
  } else if (args.risk === "high" || args.fileCount >= 4) {
    size = "M";
    reasons.push("moderate implementation surface");
  } else if (args.risk === "low" && args.fileCount <= 1) {
    size = "XS";
    reasons.push("single low-risk change");
  } else if (args.fileCount <= 3) {
    size = "S";
    reasons.push("small bounded change");
  } else {
    size = "M";
    reasons.push("default standard slice");
  }

  if (args.mode === "deep" && size !== "XL") {
    size = size === "XS" || size === "S" ? "M" : "L";
    reasons.push("explicit deep mode");
  }
  if (args.mode === "fast" && size === "L" && args.risk !== "critical") {
    size = "M";
    reasons.push("explicit fast mode without critical risk");
  }

  return { size, reasons };
}

function policyForSize(size: AutoPolicySize): Omit<
  AutoPolicy,
  "version" | "mode" | "size" | "risk" | "shouldSplitSpec" | "reasons"
> {
  switch (size) {
    case "XS":
      return {
        executionMode: "direct",
        taskGranularity: "none",
        taskTargetRange: { min: 0, max: 1 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        stopHookPolicy: "disabled",
        maxGlobalIterations: 5,
        maxTaskIterations: 2,
      };
    case "S":
      return {
        executionMode: "spec-lite",
        taskGranularity: "coarse",
        taskTargetRange: { min: 1, max: 3 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        stopHookPolicy: "disabled",
        maxGlobalIterations: 8,
        maxTaskIterations: 3,
      };
    case "M":
      return {
        executionMode: "standard",
        taskGranularity: "standard",
        taskTargetRange: { min: 3, max: 7 },
        reviewCadence: "final",
        verificationLevel: "standard",
        subagentPolicy: "on-demand",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 18,
        maxTaskIterations: 4,
      };
    case "L":
      return {
        executionMode: "deep-spec",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 12 },
        reviewCadence: "periodic",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 30,
        maxTaskIterations: 5,
      };
    case "XL":
      return {
        executionMode: "epic-triage",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 10 },
        reviewCadence: "strict",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        stopHookPolicy: "short-continuation",
        maxGlobalIterations: 30,
        maxTaskIterations: 5,
      };
  }
}

function applyOverrides(
  policy: AutoPolicy,
  overrides: FlagOverrides,
): AutoPolicy {
  const next: AutoPolicy = { ...policy };
  if (overrides.tasksSize !== undefined && overrides.tasksSize !== "auto") {
    next.taskGranularity = overrides.tasksSize;
    next.reasons = [...next.reasons, `explicit tasks-size=${overrides.tasksSize}`];
  }
  if (overrides.review === "minimal") {
    next.reviewCadence = "minimal";
    next.reasons = [...next.reasons, "explicit review=minimal"];
  } else if (overrides.review === "strict") {
    next.reviewCadence = "strict";
    next.verificationLevel = "strict";
    next.reasons = [...next.reasons, "explicit review=strict"];
  }
  return next;
}

export function classifyAutoPolicy(input: AutoPolicyInput): AutoPolicy {
  const goal = normalizeWords(input.goal);
  const flags = parseFlags(input.flags);
  const changedFiles = input.changedFiles ?? [];
  const estimatedFiles =
    typeof input.estimatedFiles === "number" && Number.isFinite(input.estimatedFiles)
      ? Math.max(0, Math.floor(input.estimatedFiles))
      : changedFiles.length;
  const fileCount = Math.max(estimatedFiles, changedFiles.length);
  const dirCount = countDistinctDirs(changedFiles);

  const riskResult = classifyRisk(goal, changedFiles, fileCount);
  const sizeResult = classifySize({
    goal,
    risk: riskResult.risk,
    fileCount,
    dirCount,
    taskCount: input.taskCount,
    mode: flags.mode,
  });
  const base = policyForSize(sizeResult.size);
  const taskCount = input.taskCount;
  const shouldSplitSpec =
    sizeResult.size === "XL" ||
    (typeof taskCount === "number" && taskCount > base.taskTargetRange.max);

  return applyOverrides(
    {
      version: 1,
      mode: flags.mode,
      size: sizeResult.size,
      risk: riskResult.risk,
      shouldSplitSpec,
      reasons: [...riskResult.reasons, ...sizeResult.reasons],
      ...base,
    },
    flags,
  );
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function main(): void {
  const argv = process.argv.slice(2);
  const goal = readArg("--goal", argv) ?? "";
  const flags = readArg("--flags", argv) ?? "";
  const files = parseList(readArg("--files", argv));
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  const policy = classifyAutoPolicy({
    goal,
    flags,
    changedFiles: files,
    estimatedFiles: estimatedRaw === undefined ? undefined : Number(estimatedRaw),
    taskCount: taskRaw === undefined ? undefined : Number(taskRaw),
  });
  process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("auto-policy.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
