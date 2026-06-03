import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/task-completed-verifier.ts
import { existsSync as existsSync7, readFileSync as readFileSync8 } from "node:fs";
import { basename as basename10, join as join7 } from "node:path";
import process4 from "node:process";

// src/hooks/_shared/error-logger.ts
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process2 from "node:process";
var SETTINGS_PATH = path.join(homedir(), ".claude", "settings.json");
var ERRORS_DIR = path.join(homedir(), ".claude", "curdx-flow");
var ERRORS_LOG = path.join(ERRORS_DIR, "errors.jsonl");
var MAX_LINE_BYTES = 4096;
var MSG_MAX = 500;
var STACK_MAX = 2e3;
var STR_MAX = 500;
var ROTATE_SIZE_BYTES = 10 * 1024 * 1024;
var ROTATE_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
var ROTATE_THROTTLE_N = 10;
var ROTATE_KEEP = 5;
var RENAME_RETRY_DELAYS_MS = [50, 200, 500];
var cachedEnabled = null;
function readEnabled() {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.errorLogEnabled === "boolean") {
      cachedEnabled = parsed.errorLogEnabled;
      return cachedEnabled;
    }
    cachedEnabled = true;
    return cachedEnabled;
  } catch {
    process2.stderr.write("[error-logger] settings.json missing/corrupt, defaulting errorLogEnabled=true\n");
    cachedEnabled = true;
    return cachedEnabled;
  }
}
function trunc(s, max) {
  if (typeof s !== "string") return void 0;
  return s.length <= max ? s : s.slice(0, max);
}
var KNOWN_KINDS = /* @__PURE__ */ new Set([
  "stop_block_continuation",
  "stop_block_cost_runaway",
  "stop_block_verification_failed",
  "stop_allow_early_exit",
  "task_verify_pass",
  "task_verify_fail",
  "subagent_context_injected",
  "subagent_injection_failed",
  "stop_failure_rate_limit",
  "stop_failure_other",
  "unknown"
]);
function coerceKind(raw) {
  return typeof raw === "string" && KNOWN_KINDS.has(raw) ? raw : "unknown";
}
function shouldRotate(filePath) {
  try {
    const st = statSync(filePath);
    if (st.size > ROTATE_SIZE_BYTES) return true;
    if (Date.now() - st.mtimeMs > ROTATE_AGE_MS) return true;
    return false;
  } catch {
    return false;
  }
}
function safeRename(from, to) {
  try {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const code = e.code;
      if (code === "EBUSY" || code === "EPERM") {
        for (const ms of RENAME_RETRY_DELAYS_MS) {
          const end = Date.now() + ms;
          while (Date.now() < end) {
          }
          try {
            renameSync(from, to);
            return;
          } catch {
          }
        }
      }
      try {
        copyFileSync(from, to);
        unlinkSync(from);
      } catch {
      }
    }
  } catch {
  }
}
function pruneRotatedFiles(dir) {
  try {
    const entries = readdirSync(dir);
    const rotated = [];
    for (const name of entries) {
      if (!name.startsWith("errors.") || !name.endsWith(".jsonl")) continue;
      if (name === "errors.jsonl") continue;
      const full = path.join(dir, name);
      try {
        rotated.push({ p: full, m: statSync(full).mtimeMs });
      } catch {
      }
    }
    rotated.sort((a, b) => b.m - a.m);
    for (const { p } of rotated.slice(ROTATE_KEEP)) {
      try {
        unlinkSync(p);
      } catch {
      }
    }
  } catch {
  }
}
var rotateCounter = 0;
function rotateIfNeeded(filePath) {
  try {
    rotateCounter = (rotateCounter + 1) % ROTATE_THROTTLE_N;
    if (rotateCounter !== 0) return;
    if (!shouldRotate(filePath)) return;
    const iso = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dir = path.dirname(filePath);
    const target = path.join(dir, `errors.${iso}-${process2.pid}.jsonl`);
    safeRename(filePath, target);
    pruneRotatedFiles(dir);
  } catch {
  }
}
function logHookEvent(input, err) {
  try {
    if (!readEnabled()) return;
    const stack = input.stack ?? err?.stack;
    const msg = input.msg ?? err?.message;
    const level = input.level ?? "info";
    const kind = coerceKind(input.kind);
    const record = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      hook: trunc(input.hook, STR_MAX) ?? "",
      event: trunc(input.event, STR_MAX) ?? "",
      kind
    };
    const optionalEntries = [
      ["msg", trunc(msg, MSG_MAX)],
      ["cwd", trunc(input.cwd, STR_MAX)],
      ["transcript_path", trunc(input.transcript_path, STR_MAX)],
      ["spec", trunc(input.spec, STR_MAX)],
      ["path", trunc(input.path, STR_MAX)],
      ["stack", trunc(stack, STACK_MAX)],
      ["correlationId", trunc(input.correlationId, STR_MAX)]
    ];
    for (const [k, v] of optionalEntries) {
      if (v !== void 0) record[k] = v;
    }
    if (input.payload !== void 0) {
      record.payload = input.payload;
    }
    let line = JSON.stringify(record);
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.stack;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.msg;
      line = JSON.stringify(record);
    }
    if (Buffer.byteLength(line + "\n", "utf8") > MAX_LINE_BYTES) {
      delete record.payload;
      line = JSON.stringify(record);
    }
    try {
      mkdirSync(ERRORS_DIR, { recursive: true });
    } catch {
    }
    rotateIfNeeded(ERRORS_LOG);
    appendFileSync(ERRORS_LOG, line + "\n");
  } catch {
  }
}
function logHookError(ctx, err) {
  logHookEvent({ ...ctx, level: "error", kind: ctx.kind ?? "unknown" }, err);
}

// src/hooks/_shared/stdin.ts
import process3 from "node:process";
async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process3.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process3.stderr.write(`[hook] invalid stdin JSON: ${msg}
`);
    throw e;
  }
}

// src/hooks/_shared/path-resolver.ts
import {
  existsSync,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, join, posix } from "node:path";
var DEFAULT_SPECS_DIR = "./specs";
var SETTINGS_REL_PATH = ".claude/curdx-flow.local.md";
function resolveCwd(opts) {
  return opts?.cwd ?? process.env["CURDX_CWD"] ?? process.cwd();
}
function warn(msg) {
  process.stderr.write(`[curdx-warn] ${msg}
`);
}
function isDir(p) {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
}
function sanitizeSessionId(sessionId) {
  const raw = sessionId?.trim();
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 120);
  return safe.length > 0 ? safe : null;
}
function specPathExists(cwd, specPath) {
  const fsPath = isAbsolute(specPath) ? specPath : join(cwd, specPath);
  return isDir(fsPath);
}
function sessionBindingPath(opts) {
  const cwd = resolveCwd(opts);
  const sessionId = sanitizeSessionId(opts?.sessionId);
  if (!sessionId) return null;
  return join(cwd, ".curdx", "sessions", `${sessionId}.json`);
}
function readSessionSpecBinding(opts) {
  const cwd = resolveCwd(opts);
  const path3 = sessionBindingPath(opts);
  if (!path3 || !existsSync(path3)) return null;
  try {
    const parsed = JSON.parse(readFileSync2(path3, "utf8"));
    if (parsed.version !== 1) return null;
    if (typeof parsed.sessionId !== "string" || typeof parsed.specPath !== "string") return null;
    if (!specPathExists(cwd, parsed.specPath)) return null;
    return {
      version: 1,
      sessionId: parsed.sessionId,
      specPath: parsed.specPath,
      specName: typeof parsed.specName === "string" ? parsed.specName : basename(parsed.specPath),
      lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : "",
      source: typeof parsed.source === "string" ? parsed.source : "unknown"
    };
  } catch {
    return null;
  }
}
function normalizePath(input) {
  if (!input) return ".";
  let p = input.replace(/\/+$/, "");
  if (p === "") p = ".";
  return p;
}
function findRepoRoot(start) {
  const origin = start ?? process.cwd();
  let cur = origin;
  for (let i = 0; i < 64; i++) {
    if (isDir(join(cur, ".git"))) return cur;
    if (existsSync(join(cur, SETTINGS_REL_PATH))) return cur;
    const parent = join(cur, "..");
    if (parent === cur) break;
    cur = parent;
  }
  return origin;
}
function parseSpecsDirsFromSettings(settingsPath) {
  let raw;
  try {
    raw = readFileSync2(settingsPath, "utf8");
  } catch {
    return [];
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1] ?? raw;
  const line = block.split(/\r?\n/).find((l) => /^\s*specs_dirs\s*:/.test(l));
  if (!line) return [];
  const value = line.replace(/^\s*specs_dirs\s*:\s*/, "");
  return value.replace(/[\[\]"']/g, "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
function getSpecsDirs(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    warn(`CURDX_CWD does not exist: ${cwd}`);
    return [DEFAULT_SPECS_DIR];
  }
  const settingsPath = join(cwd, SETTINGS_REL_PATH);
  const raw = existsSync(settingsPath) ? parseSpecsDirsFromSettings(settingsPath) : [];
  if (raw.length === 0) return [DEFAULT_SPECS_DIR];
  const validated = [];
  for (const entry of raw) {
    const dir = normalizePath(entry);
    const absoluteOutsideCwd = isAbsolute(dir) && !dir.startsWith(cwd);
    if (absoluteOutsideCwd) {
      if (!isDir(dir)) {
        warn(
          `Skipping invalid absolute path in specs_dirs: ${dir} (does not exist)`
        );
        continue;
      }
    } else {
      const resolved = isAbsolute(dir) ? dir : join(cwd, dir);
      if (!isDir(resolved)) {
        warn(
          `Skipping invalid path in specs_dirs: ${dir} (directory not found at ${resolved})`
        );
        continue;
      }
    }
    validated.push(dir);
  }
  if (validated.length === 0) {
    warn(`No valid paths in specs_dirs, using default: ${DEFAULT_SPECS_DIR}`);
    return [DEFAULT_SPECS_DIR];
  }
  return validated;
}
function getDefaultDir(opts) {
  const dirs = getSpecsDirs(opts);
  return normalizePath(dirs[0] ?? DEFAULT_SPECS_DIR);
}
function findSpec(name, opts) {
  if (!name) {
    return { ok: false, reason: "not-found", name: "" };
  }
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) {
    return { ok: false, reason: "not-found", name };
  }
  let cleaned = normalizePath(name);
  if (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  const matches = [];
  for (const entry of getSpecsDirs(opts)) {
    const dir = normalizePath(entry);
    const candidateFs = isAbsolute(dir) ? join(dir, cleaned) : join(cwd, dir, cleaned);
    if (isDir(candidateFs)) {
      matches.push(posix.join(dir, cleaned));
    }
  }
  if (matches.length === 0) {
    return { ok: false, reason: "not-found", name: cleaned };
  }
  if (matches.length === 1) {
    return { ok: true, path: matches[0] };
  }
  return { ok: false, reason: "ambiguous", name: cleaned, matches };
}
function resolveCurrent(opts) {
  const cwd = resolveCwd(opts);
  if (!isDir(cwd)) return null;
  const sessionBinding = readSessionSpecBinding(opts);
  if (sessionBinding) return sessionBinding.specPath;
  const defaultDir = getDefaultDir(opts);
  const markerFs = [
    join(cwd, defaultDir, ".current-spec"),
    join(cwd, ".current-spec")
  ].find((candidate) => existsSync(candidate));
  if (!markerFs) return null;
  let content;
  try {
    content = readFileSync2(markerFs, "utf8");
  } catch {
    return null;
  }
  content = content.replace(/\s+/g, "");
  if (!content) {
    warn(".current-spec file is empty");
    return null;
  }
  const normalized = normalizePath(content);
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.includes("/") || isAbsolute(normalized)) {
    return normalized;
  }
  return posix.join(defaultDir, normalized);
}

// src/hooks/lib/verify-blocks.ts
import { basename as basename3, join as join2 } from "node:path";

// src/hooks/lib/evidence-bridge.ts
import { createHash } from "node:crypto";
import { basename as basename2 } from "node:path";

// src/core/contracts/index.ts
var CONTRACTS = {
  evidence: {
    schemaId: "curdx-flow/evidence",
    schemaPath: "plugins/curdx-flow/schemas/evidence.schema.json"
  },
  stateLedger: {
    schemaId: "curdx-flow/state-ledger",
    schemaPath: "plugins/curdx-flow/schemas/state-ledger.schema.json"
  },
  session: {
    schemaId: "curdx-flow/session",
    schemaPath: "plugins/curdx-flow/schemas/session.schema.json"
  },
  adapterResult: {
    schemaId: "curdx-flow/adapter-result",
    schemaPath: "plugins/curdx-flow/schemas/adapter-result.schema.json"
  },
  completionVerdict: {
    schemaId: "curdx-flow/completion-verdict",
    schemaPath: "plugins/curdx-flow/schemas/completion-verdict.schema.json"
  },
  releaseVerdict: {
    schemaId: "curdx-flow/release-verdict",
    schemaPath: "plugins/curdx-flow/schemas/release-verdict.schema.json"
  },
  actionRiskPolicy: {
    schemaId: "curdx-flow/action-risk-policy",
    schemaPath: "plugins/curdx-flow/schemas/action-risk-policy.schema.json"
  },
  hookGate: {
    schemaId: "curdx-flow/hook-gate",
    schemaPath: "plugins/curdx-flow/schemas/hook-gate.schema.json"
  },
  artifactIndex: {
    schemaId: "curdx-flow/artifact-index",
    schemaPath: "plugins/curdx-flow/schemas/artifact-index.schema.json"
  },
  verificationReport: {
    schemaId: "curdx-flow/verification-report",
    schemaPath: "plugins/curdx-flow/schemas/verification-report.schema.json"
  },
  runtimeTopology: {
    schemaId: "curdx-flow/runtime-topology",
    schemaPath: "plugins/curdx-flow/schemas/runtime-topology.schema.json"
  }
};
var riskLevels = ["low", "medium", "high", "critical"];
var actionPolicyModes = ["report-only", "fix", "release"];
var reportOnlyWriteRoots = [".curdx/reports", ".curdx/evidence", ".curdx/artifacts", ".curdx/state"];
var actionTypes = [
  "read",
  "command",
  "verification-rerun",
  "browser-check",
  "api-check",
  "log-read",
  "report-write",
  "evidence-write",
  "artifact-write",
  "state-write",
  "source-edit",
  "generated-verification-file",
  "config-edit",
  "dependency-install",
  "database-migration",
  "destructive-migration",
  "delete-file",
  "global-config-change",
  "git-push",
  "git-tag",
  "npm-publish",
  "plugin-release",
  "production-data-access",
  "release"
];
var resultStatuses = ["passed", "failed", "blocked", "degraded", "skipped"];
var artifactTypes = ["screenshot", "trace", "log", "request", "response", "report", "state", "other"];
var privacyClassifications = ["public", "internal", "confidential", "secret", "local-only"];
var freshnessTargetFields = ["commandHash", "targetHash", "fileTargets", "environmentId", "targetSummary"];
var dirtyFileStatuses = ["modified", "staged", "untracked", "deleted", "renamed", "unknown"];
var generatedFileCategories = [
  "source-change",
  "generated-verification-file",
  "temporary-artifact",
  "report",
  "evidence",
  "user-existing-file",
  "external-tool-output"
];
var verdictStatuses = [
  "pending",
  "complete",
  "blocked",
  "partial",
  "manual-confirmation-required",
  "release-ready",
  "not-releasable",
  "failed"
];
var runtimeProjectTypes = ["frontend", "backend", "full-stack", "cli", "library", "monorepo", "claude-code-plugin", "unknown"];
var runtimeTopologyStatuses = ["ready", "needs-human-input", "blocked"];
var runtimePackageManagers = ["npm", "pnpm", "yarn", "bun", "unknown"];
var discoveryHintKinds = ["entry", "script", "service", "api", "data", "browser", "test", "validation", "plugin"];
var discoveryBlockerSeverities = ["blocked", "needs-human-input"];
var CONTRACT_RULES = {
  evidence: {
    schemaVersion: { type: "number", constValue: 1 },
    id: { type: "string", minLength: 1 },
    runId: { type: "string", minLength: 1 },
    goalId: { type: "string", minLength: 1 },
    source: { type: "string", enum: ["command", "service", "browser", "api", "data", "log", "manual", "release", "hook"] },
    capabilityId: { type: "string", minLength: 1 },
    trustLevel: { type: "string", enum: ["verified", "self-reported", "degraded", "manual-confirmed"] },
    status: { type: "string", enum: resultStatuses },
    summary: { type: "string", minLength: 1 },
    artifacts: { type: "array", itemType: "object" },
    startedAt: { type: "string", format: "date-time" },
    completedAt: { type: "string", format: "date-time" },
    freshness: { type: "object" },
    privacy: { type: "object" },
    redactions: { type: "array", itemType: "object" }
  },
  stateLedger: {
    schemaVersion: { type: "number", constValue: 1 },
    runId: { type: "string" },
    goalId: { type: "string" },
    workspaceRoot: { type: "string", minLength: 1 },
    mode: { type: "string", enum: ["report-only", "fix", "release", "verification"] },
    policy: { type: "object" },
    scope: { type: "object" },
    expectedJourney: { type: "object" },
    status: { type: "string", enum: ["created", "running", "blocked", "partial", "complete", "review", "failed"] },
    verdictStatus: { type: "string", enum: verdictStatuses },
    phase: { type: "string", minLength: 1 },
    startedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    evidenceIds: { type: "array", itemType: "string" },
    missingEvidence: { type: "array" },
    artifactIndexPath: { type: "string", minLength: 1 },
    dirtyBaseline: { type: "object" },
    generatedFiles: { type: "array", itemType: "object" },
    nextAction: { type: "object" }
  },
  session: {
    schemaVersion: { type: "number", constValue: 1 },
    sessionId: { type: "string" },
    runId: { type: "string" },
    goalId: { type: "string" },
    status: { type: "string", enum: ["active", "paused", "blocked", "completed", "abandoned"] },
    currentStep: { type: "string", minLength: 1 },
    resumeSummary: { type: "string", minLength: 1 },
    checkpoints: { type: "array", itemType: "object" },
    missingEvidence: { type: "array" },
    startedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    nextAction: { type: "object" }
  },
  adapterResult: {
    schemaVersion: { type: "number", constValue: 1 },
    ok: { type: "boolean" },
    status: { type: "string", enum: resultStatuses },
    capabilityId: { type: "string" },
    inputs: { type: "object" },
    evidence: { type: "array" },
    blockers: { type: "array" },
    artifacts: { type: "array" },
    diagnostics: { type: "array" },
    retryable: { type: "boolean" },
    confidence: { type: "number", min: 0, max: 1 },
    durationMs: { type: "number", min: 0 }
  },
  completionVerdict: {
    schemaVersion: { type: "number", constValue: 1 },
    verdict: { type: "string", enum: ["complete", "blocked", "partial", "manual-confirmation-required", "release-ready"] },
    why: { type: "string", minLength: 1 },
    evidenceRefs: { type: "array", itemType: "string" },
    missingEvidence: { type: "array" },
    nextAction: { type: "object" },
    owner: { type: "string", minLength: 1 },
    riskLevel: { type: "string", enum: riskLevels },
    confidence: { type: "number", min: 0, max: 1 },
    unverifiedScope: { type: "array", itemType: "object" }
  },
  releaseVerdict: {
    schemaVersion: { type: "number", constValue: 1 },
    runId: { type: "string", minLength: 1 },
    goalId: { type: "string", minLength: 1 },
    generatedAt: { type: "string", format: "date-time" },
    verdict: { type: "string", enum: ["release-ready", "not-releasable"] },
    version: { type: "string", minLength: 1 },
    npmTag: { type: "string", pattern: /^v\d+\.\d+\.\d+/ },
    claudePluginTag: { type: "string", pattern: /^curdx-flow--v\d+\.\d+\.\d+/ },
    checks: { type: "array", itemType: "object" },
    missingEvidence: { type: "array" },
    blockers: { type: "array" },
    nextAction: { type: "object" },
    riskLevel: { type: "string", enum: riskLevels },
    trustLevel: { type: "string", enum: ["L4", "release"] },
    freshness: { type: "object" },
    sideEffects: { type: "array", itemType: "object" },
    published: { type: "boolean", constValue: false },
    publicationState: { type: "string", enum: ["not-published"] },
    summary: { type: "object" }
  },
  actionRiskPolicy: {
    schemaVersion: { type: "number", constValue: 1 },
    policyId: { type: "string", minLength: 1 },
    mode: { type: "string", enum: ["report-only", "fix", "release"] },
    defaultRiskLevel: { type: "string", enum: riskLevels },
    rules: { type: "array", itemType: "object" },
    noFalseCompletion: { type: "boolean", constValue: true }
  },
  hookGate: {
    schemaVersion: { type: "number", constValue: 1 },
    eventName: {
      type: "string",
      enum: [
        "UserPromptSubmit",
        "UserPromptExpansion",
        "PreToolUse",
        "PostToolBatch",
        "SessionStart",
        "SubagentStart",
        "SubagentStop",
        "TaskCompleted",
        "PostCompact",
        "Stop",
        "StopFailure"
      ]
    },
    runId: { type: "string" },
    goalId: { type: "string" },
    decision: { type: "string", enum: ["allow", "block", "context", "fail-open"] },
    reason: { type: "string" },
    missingEvidence: { type: "array" },
    nextAction: { type: "object" },
    failOpen: { type: "boolean" },
    diagnostics: { type: "array" }
  },
  artifactIndex: {
    schemaVersion: { type: "number", constValue: 1 },
    id: { type: "string", minLength: 1 },
    runId: { type: "string", minLength: 1 },
    goalId: { type: "string", minLength: 1 },
    evidenceId: { type: "string", minLength: 1 },
    type: { type: "string", enum: artifactTypes },
    path: { type: "string", minLength: 1 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    privacy: { type: "object" },
    createdAt: { type: "string", format: "date-time" }
  },
  verificationReport: {
    schemaVersion: { type: "number", constValue: 1 },
    runId: { type: "string", minLength: 1 },
    goalId: { type: "string", minLength: 1 },
    status: {
      type: "string",
      enum: ["passed", "failed", "blocked", "auto-recovered", "needs-user-input", "partial", "release-ready", "not-releasable"]
    },
    verdict: { type: "object" },
    summary: { type: "string", minLength: 1 },
    evidenceRefs: { type: "array", itemType: "string" },
    artifactIndex: { type: "array", itemType: "object" },
    blockers: { type: "array" },
    missingEvidence: { type: "array" },
    generatedAt: { type: "string", format: "date-time" },
    privacy: { type: "object" },
    transcriptSummary: { type: "string", minLength: 1, maxLength: 1200 },
    evidenceSummaries: { type: "array", itemType: "object" },
    artifactSummaries: { type: "array", itemType: "object" },
    sections: { type: "object" },
    sourceChanges: { type: "object" },
    reportOnly: { type: "boolean" },
    verifier: { type: "object" }
  },
  runtimeTopology: {
    schemaVersion: { type: "number", constValue: 1 },
    workspaceRoot: { type: "string", minLength: 1 },
    generatedAt: { type: "string", format: "date-time" },
    overallType: { type: "string", enum: runtimeProjectTypes },
    status: { type: "string", enum: runtimeTopologyStatuses },
    confidence: { type: "number", min: 0, max: 1 },
    packageManager: { type: "string", enum: runtimePackageManagers },
    roots: { type: "array", itemType: "object" },
    pluginRoots: { type: "array", itemType: "object" },
    blockers: { type: "array", itemType: "object" },
    hints: { type: "array", itemType: "object" }
  }
};
function validateContract(contractName, payload) {
  const descriptor = CONTRACTS[contractName];
  const issues = [];
  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [
        {
          schemaId: descriptor.schemaId,
          path: "$",
          code: "not-object",
          message: "Contract payload must be an object.",
          severity: "blocked"
        }
      ]
    };
  }
  const rules = CONTRACT_RULES[contractName];
  for (const [field, rule] of Object.entries(rules)) {
    validateField(descriptor.schemaId, payload, field, rule, issues);
  }
  validateContractSpecificRules(contractName, descriptor.schemaId, payload, issues);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: payload };
}
function validateField(schemaId, payload, field, rule, issues) {
  if (!(field in payload)) {
    issues.push(issue(schemaId, `$.${field}`, "missing-required", `Missing required field '${field}'.`));
    return;
  }
  const value = payload[field];
  if (!matchesType(value, rule.type)) {
    issues.push(issue(schemaId, `$.${field}`, "invalid-type", `Expected '${field}' to be ${rule.type}.`));
    return;
  }
  if (field === "schemaVersion" && value !== 1) {
    issues.push(issue(schemaId, "$.schemaVersion", "unsupported-schema-version", "Only schemaVersion 1 is supported."));
    return;
  }
  if (rule.constValue !== void 0 && value !== rule.constValue) {
    issues.push(issue(schemaId, `$.${field}`, "invalid-enum", `Expected '${field}' to equal ${String(rule.constValue)}.`));
    return;
  }
  if (typeof value === "string" && rule.enum !== void 0 && !rule.enum.includes(value)) {
    issues.push(issue(schemaId, `$.${field}`, "invalid-enum", `Invalid enum value '${value}' for '${field}'.`));
    return;
  }
  if (typeof value === "string") {
    if (rule.minLength !== void 0 && value.length < rule.minLength) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-range", `'${field}' must not be empty.`));
      return;
    }
    if (rule.maxLength !== void 0 && value.length > rule.maxLength) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-range", `'${field}' must be <= ${rule.maxLength} characters.`));
      return;
    }
    if (rule.pattern !== void 0 && !rule.pattern.test(value)) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-pattern", `'${field}' does not match the required pattern.`));
      return;
    }
    if (rule.format === "date-time" && Number.isNaN(Date.parse(value))) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-format", `'${field}' must be an ISO date-time string.`));
      return;
    }
  }
  if (Array.isArray(value) && rule.itemType !== void 0) {
    const badIndex = value.findIndex((item) => !matchesType(item, rule.itemType));
    if (badIndex !== -1) {
      issues.push(issue(schemaId, `$.${field}[${badIndex}]`, "invalid-type", `Expected '${field}' items to be ${rule.itemType}.`));
      return;
    }
  }
  if (typeof value === "number") {
    if (rule.min !== void 0 && value < rule.min) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-range", `'${field}' must be >= ${rule.min}.`));
      return;
    }
    if (rule.max !== void 0 && value > rule.max) {
      issues.push(issue(schemaId, `$.${field}`, "invalid-range", `'${field}' must be <= ${rule.max}.`));
    }
  }
}
function validateContractSpecificRules(contractName, schemaId, payload, issues) {
  if (contractName === "evidence") {
    validateEvidenceFreshness(schemaId, payload.freshness, issues);
  }
  if (contractName === "stateLedger") {
    validateStateLedgerDetails(schemaId, payload, issues);
  }
  if (contractName === "artifactIndex") {
    validateArtifactPath(schemaId, payload.path, issues);
    validateArtifactPrivacy(schemaId, payload.privacy, issues);
  }
  if (contractName === "verificationReport") {
    validateVerificationReportDetails(schemaId, payload, issues);
  }
  if (contractName === "actionRiskPolicy") {
    validateActionRiskPolicyDetails(schemaId, payload, issues);
  }
  if (contractName === "releaseVerdict") {
    validateReleaseVerdictDetails(schemaId, payload, issues);
  }
  if (contractName === "runtimeTopology") {
    validateRuntimeTopologyDetails(schemaId, payload, issues);
  }
}
function validateReleaseVerdictDetails(schemaId, payload, issues) {
  const freshness = payload.freshness;
  if (!isRecord(freshness)) return;
  validateBooleanField(schemaId, "$.freshness.ok", freshness.ok, issues);
  if (!Array.isArray(freshness.reasons) || freshness.reasons.some((item) => typeof item !== "string")) {
    issues.push(issue(schemaId, "$.freshness.reasons", "invalid-type", "'freshness.reasons' must be an array of strings."));
  }
  const context = freshness.context;
  if (!isRecord(context)) {
    issues.push(issue(schemaId, "$.freshness.context", "invalid-type", "'freshness.context' must be an object."));
    return;
  }
  validateNonEmptyStringField(schemaId, "$.freshness.context.currentCommit", context.currentCommit, issues);
  validateNonEmptyStringField(schemaId, "$.freshness.context.version", context.version, issues);
  validatePatternField(schemaId, "$.freshness.context.npmTag", context.npmTag, /^v\d+\.\d+\.\d+/, issues);
  validatePatternField(schemaId, "$.freshness.context.claudePluginTag", context.claudePluginTag, /^curdx-flow--v\d+\.\d+\.\d+/, issues);
  validateDateTimeField(schemaId, "$.freshness.context.generatedAt", context.generatedAt, issues);
  if (!Array.isArray(context.evidenceRefs) || context.evidenceRefs.some((item) => typeof item !== "string")) {
    issues.push(issue(schemaId, "$.freshness.context.evidenceRefs", "invalid-type", "'freshness.context.evidenceRefs' must be an array of strings."));
  }
  const summary = payload.summary;
  if (!isRecord(summary)) return;
  validateNonEmptyStringField(schemaId, "$.summary.headline", summary.headline, issues);
  validateEnumField(schemaId, "$.summary.publicationState", summary.publicationState, ["not-published"], issues);
  validateEnumField(schemaId, "$.summary.statusLabel", summary.statusLabel, ["\u53EF\u53D1\u5E03", "\u4E0D\u53EF\u53D1\u5E03"], issues);
  validateBooleanField(schemaId, "$.summary.dryRunOnly", summary.dryRunOnly, issues);
  if (summary.dryRunOnly !== true) {
    issues.push(issue(schemaId, "$.summary.dryRunOnly", "invalid-enum", "'summary.dryRunOnly' must be true."));
  }
}
function validateRuntimeTopologyDetails(schemaId, payload, issues) {
  validateRuntimeRoots(schemaId, payload.roots, issues);
  validateRuntimePluginRoots(schemaId, payload.pluginRoots, issues);
  validateDiscoveryBlockers(schemaId, "$.blockers", payload.blockers, issues);
  validateDiscoveryHints(schemaId, "$.hints", payload.hints, issues);
}
function validateRuntimeRoots(schemaId, value, issues) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const pathPrefix = `$.roots[${index}]`;
    if (!isRecord(entry)) return;
    validateTopologyRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateEnumField(schemaId, `${pathPrefix}.type`, entry.type, runtimeProjectTypes, issues);
    validateEnumField(schemaId, `${pathPrefix}.status`, entry.status, runtimeTopologyStatuses, issues);
    validateNumberRangeField(schemaId, `${pathPrefix}.confidence`, entry.confidence, 0, 1, issues);
    validateEnumField(schemaId, `${pathPrefix}.packageManager`, entry.packageManager, runtimePackageManagers, issues);
    if (entry.packageJsonPath !== null) {
      validateTopologyRelativeField(schemaId, `${pathPrefix}.packageJsonPath`, entry.packageJsonPath, issues);
    }
    if (!isRecord(entry.scripts)) {
      issues.push(issue(schemaId, `${pathPrefix}.scripts`, "invalid-type", "'scripts' must be an object."));
    } else {
      for (const [scriptName, command] of Object.entries(entry.scripts)) {
        if (scriptName.length === 0) {
          issues.push(issue(schemaId, `${pathPrefix}.scripts`, "invalid-range", "Script names must not be empty."));
        }
        if (typeof command !== "string") {
          issues.push(issue(schemaId, `${pathPrefix}.scripts.${scriptName}`, "invalid-type", "Script command must be a string."));
        }
      }
    }
    for (const field of ["entryHints", "scriptHints", "serviceHints", "apiHints", "dataHints", "browserHints", "validationHints", "pluginHints"]) {
      validateDiscoveryHints(schemaId, `${pathPrefix}.${field}`, entry[field], issues);
    }
    validateDiscoveryBlockers(schemaId, `${pathPrefix}.blockers`, entry.blockers, issues);
    if (!Array.isArray(entry.reasons)) {
      issues.push(issue(schemaId, `${pathPrefix}.reasons`, "invalid-type", "'reasons' must be an array."));
    } else {
      entry.reasons.forEach((reason, reasonIndex) => validateRequiredStringField(schemaId, `${pathPrefix}.reasons[${reasonIndex}]`, reason, issues));
    }
  });
}
function validateRuntimePluginRoots(schemaId, value, issues) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const pathPrefix = `$.pluginRoots[${index}]`;
    if (!isRecord(entry)) return;
    validateTopologyRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateTopologyRelativeField(schemaId, `${pathPrefix}.manifestPath`, entry.manifestPath, issues);
    if (entry.hooksPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.hooksPath`, entry.hooksPath, issues);
    if (entry.skillsPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.skillsPath`, entry.skillsPath, issues);
    if (entry.agentsPath !== null) validateTopologyRelativeField(schemaId, `${pathPrefix}.agentsPath`, entry.agentsPath, issues);
    if (!Array.isArray(entry.binPaths)) {
      issues.push(issue(schemaId, `${pathPrefix}.binPaths`, "invalid-type", "'binPaths' must be an array."));
    } else {
      entry.binPaths.forEach((binPath, binIndex) => validateTopologyRelativeField(schemaId, `${pathPrefix}.binPaths[${binIndex}]`, binPath, issues));
    }
    const validationCommand = entry.validationCommand;
    if (!isRecord(validationCommand)) {
      issues.push(issue(schemaId, `${pathPrefix}.validationCommand`, "invalid-type", "'validationCommand' must be an object."));
    } else {
      if (validationCommand.executable !== "claude") {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.executable`, "invalid-enum", "Plugin validation executable must be 'claude'."));
      }
      if (!Array.isArray(validationCommand.argv)) {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.argv`, "invalid-type", "'argv' must be an array."));
      } else if (validationCommand.argv.length !== 3 || validationCommand.argv[0] !== "plugin" || validationCommand.argv[1] !== "validate" || typeof validationCommand.argv[2] !== "string") {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.argv`, "invalid-enum", "Plugin validation argv must be ['plugin', 'validate', '<plugin-root>']."));
      } else {
        validateTopologyRelativeField(schemaId, `${pathPrefix}.validationCommand.argv[2]`, validationCommand.argv[2], issues);
      }
      if (validationCommand.cwd !== ".") {
        issues.push(issue(schemaId, `${pathPrefix}.validationCommand.cwd`, "invalid-enum", "Plugin validation cwd must be '.'."));
      }
    }
    const wiring = entry.wiring;
    if (!isRecord(wiring)) {
      issues.push(issue(schemaId, `${pathPrefix}.wiring`, "invalid-type", "'wiring' must be an object."));
    } else {
      if (wiring.manifest !== true) {
        issues.push(issue(schemaId, `${pathPrefix}.wiring.manifest`, "invalid-enum", "'wiring.manifest' must be true."));
      }
      for (const field of ["hooks", "skills", "agents", "bin"]) {
        validateBooleanField(schemaId, `${pathPrefix}.wiring.${field}`, wiring[field], issues);
      }
    }
  });
}
function validateDiscoveryHints(schemaId, pathPrefix, value, issues) {
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, pathPrefix, "invalid-type", `'${pathPrefix}' must be an array.`));
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${pathPrefix}[${index}]`;
    if (!isRecord(entry)) return;
    validateEnumField(schemaId, `${entryPath}.kind`, entry.kind, discoveryHintKinds, issues);
    validateRequiredStringField(schemaId, `${entryPath}.source`, entry.source, issues);
    validateRequiredStringField(schemaId, `${entryPath}.summary`, entry.summary, issues);
    validateNumberRangeField(schemaId, `${entryPath}.confidence`, entry.confidence, 0, 1, issues);
    if ("path" in entry) validateTopologyRelativeField(schemaId, `${entryPath}.path`, entry.path, issues);
    if ("scriptName" in entry) validateRequiredStringField(schemaId, `${entryPath}.scriptName`, entry.scriptName, issues);
    if ("command" in entry) validateRequiredStringField(schemaId, `${entryPath}.command`, entry.command, issues);
  });
}
function validateDiscoveryBlockers(schemaId, pathPrefix, value, issues) {
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, pathPrefix, "invalid-type", `'${pathPrefix}' must be an array.`));
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${pathPrefix}[${index}]`;
    if (!isRecord(entry)) return;
    validateRequiredStringField(schemaId, `${entryPath}.code`, entry.code, issues);
    validateTopologyRelativeField(schemaId, `${entryPath}.path`, entry.path, issues);
    validateEnumField(schemaId, `${entryPath}.severity`, entry.severity, discoveryBlockerSeverities, issues);
    validateRequiredStringField(schemaId, `${entryPath}.summary`, entry.summary, issues);
  });
}
function validateActionRiskPolicyDetails(schemaId, payload, issues) {
  if (payload.noFalseCompletion !== true) {
    issues.push(issue(schemaId, "$.noFalseCompletion", "invalid-enum", "noFalseCompletion must remain true."));
  }
  validateOptionalWorkspaceRoots(schemaId, "$.allowedWriteRoots", payload.allowedWriteRoots, issues);
  const authorization = payload.authorization;
  if (isRecord(authorization)) {
    if ("authorized" in authorization && typeof authorization.authorized !== "boolean") {
      issues.push(issue(schemaId, "$.authorization.authorized", "invalid-type", "'$.authorization.authorized' must be boolean."));
    }
    if ("releaseStageAuthorized" in authorization && typeof authorization.releaseStageAuthorized !== "boolean") {
      issues.push(issue(schemaId, "$.authorization.releaseStageAuthorized", "invalid-type", "'$.authorization.releaseStageAuthorized' must be boolean."));
    }
    if ("authorizedAt" in authorization) {
      validateDateTimeField(schemaId, "$.authorization.authorizedAt", authorization.authorizedAt, issues);
    }
    if ("authorizedBy" in authorization) {
      validateRequiredStringField(schemaId, "$.authorization.authorizedBy", authorization.authorizedBy, issues);
    }
    if ("reason" in authorization) {
      validateRequiredStringField(schemaId, "$.authorization.reason", authorization.reason, issues);
    }
  }
  if (!Array.isArray(payload.rules)) return;
  payload.rules.forEach((entry, index) => validateActionRiskRule(schemaId, entry, index, issues));
}
function validateActionRiskRule(schemaId, value, index, issues) {
  const pathPrefix = `$.rules[${index}]`;
  if (!isRecord(value)) return;
  validateRequiredStringField(schemaId, `${pathPrefix}.id`, value.id, issues);
  if (!("actionType" in value) && !("actionPattern" in value)) {
    issues.push(issue(schemaId, pathPrefix, "missing-required", "Action risk rule must include 'actionType' or 'actionPattern'."));
  }
  if ("actionType" in value) {
    validateEnumField(schemaId, `${pathPrefix}.actionType`, value.actionType, actionTypes, issues);
  }
  if ("actionPattern" in value) {
    validateRequiredStringField(schemaId, `${pathPrefix}.actionPattern`, value.actionPattern, issues);
  }
  validateEnumField(schemaId, `${pathPrefix}.riskLevel`, value.riskLevel, riskLevels, issues);
  validateBooleanField(schemaId, `${pathPrefix}.mutatesWorkspace`, value.mutatesWorkspace, issues);
  validateBooleanField(schemaId, `${pathPrefix}.destructive`, value.destructive, issues);
  validateBooleanField(schemaId, `${pathPrefix}.requiresAuthorization`, value.requiresAuthorization, issues);
  if (!Array.isArray(value.allowedModes)) {
    issues.push(issue(schemaId, `${pathPrefix}.allowedModes`, "invalid-type", "'allowedModes' must be an array."));
  } else if (value.allowedModes.length === 0) {
    issues.push(issue(schemaId, `${pathPrefix}.allowedModes`, "invalid-range", "'allowedModes' must not be empty."));
  } else {
    value.allowedModes.forEach((mode, modeIndex) => {
      validateEnumField(schemaId, `${pathPrefix}.allowedModes[${modeIndex}]`, mode, actionPolicyModes, issues);
    });
  }
  if ("requiresReleaseStage" in value) {
    validateBooleanField(schemaId, `${pathPrefix}.requiresReleaseStage`, value.requiresReleaseStage, issues);
  }
  validateOptionalWorkspaceRoots(schemaId, `${pathPrefix}.allowedWriteRoots`, value.allowedWriteRoots, issues);
}
function validateVerificationReportDetails(schemaId, payload, issues) {
  const verdict = payload.verdict;
  if (isRecord(verdict)) {
    const verdictResult2 = validateContract("completionVerdict", verdict);
    if (!verdictResult2.ok) {
      issues.push(
        ...verdictResult2.issues.map((nestedIssue) => ({
          ...nestedIssue,
          schemaId,
          path: `$.verdict${nestedIssue.path.slice(1)}`
        }))
      );
    }
  }
  validateReportPrivacy(schemaId, payload.privacy, issues);
  validateReportEvidenceSummaries(schemaId, payload.evidenceSummaries, issues);
  validateReportArtifactSummaries(schemaId, payload.artifactSummaries, issues);
  validateReportSections(schemaId, payload.sections, issues);
  validateReportSourceChanges(schemaId, payload.sourceChanges, issues);
  validateReportVerifier(schemaId, payload.verifier, issues);
}
function validateReportPrivacy(schemaId, value, issues) {
  if (!isRecord(value)) return;
  validateEnumField(schemaId, "$.privacy.classification", value.classification, privacyClassifications, issues);
  if (typeof value.containsSensitiveData !== "boolean") {
    issues.push(issue(schemaId, "$.privacy.containsSensitiveData", "invalid-type", "Expected 'privacy.containsSensitiveData' to be boolean."));
  }
  if (typeof value.redacted !== "boolean") {
    issues.push(issue(schemaId, "$.privacy.redacted", "invalid-type", "Expected 'privacy.redacted' to be boolean."));
  }
  if (typeof value.truncated !== "boolean") {
    issues.push(issue(schemaId, "$.privacy.truncated", "invalid-type", "Expected 'privacy.truncated' to be boolean."));
  }
}
function validateReportEvidenceSummaries(schemaId, value, issues) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const pathPrefix = `$.evidenceSummaries[${index}]`;
    if (!isRecord(entry)) return;
    validateRequiredStringField(schemaId, `${pathPrefix}.id`, entry.id, issues);
    validateEnumField(schemaId, `${pathPrefix}.source`, entry.source, ["command", "service", "browser", "api", "data", "log", "manual", "release", "hook"], issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.capabilityId`, entry.capabilityId, issues);
    validateEnumField(schemaId, `${pathPrefix}.status`, entry.status, resultStatuses, issues);
    validateEnumField(schemaId, `${pathPrefix}.trustLevel`, entry.trustLevel, ["verified", "self-reported", "degraded", "manual-confirmed"], issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.summary`, entry.summary, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.freshness`, entry.freshness, issues);
    if (!Array.isArray(entry.artifactRefs)) {
      issues.push(issue(schemaId, `${pathPrefix}.artifactRefs`, "invalid-type", "Expected 'artifactRefs' to be array."));
    } else {
      const badIndex = entry.artifactRefs.findIndex((item) => typeof item !== "string");
      if (badIndex !== -1) {
        issues.push(issue(schemaId, `${pathPrefix}.artifactRefs[${badIndex}]`, "invalid-type", "Expected 'artifactRefs' items to be string."));
      }
    }
    if (!Array.isArray(entry.unverifiedScope)) {
      issues.push(issue(schemaId, `${pathPrefix}.unverifiedScope`, "invalid-type", "Expected 'unverifiedScope' to be array."));
    } else {
      const badIndex = entry.unverifiedScope.findIndex((item) => typeof item !== "string");
      if (badIndex !== -1) {
        issues.push(issue(schemaId, `${pathPrefix}.unverifiedScope[${badIndex}]`, "invalid-type", "Expected 'unverifiedScope' items to be string."));
      }
    }
  });
}
function validateReportArtifactSummaries(schemaId, value, issues) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const pathPrefix = `$.artifactSummaries[${index}]`;
    if (!isRecord(entry)) return;
    validateRequiredStringField(schemaId, `${pathPrefix}.id`, entry.id, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.evidenceId`, entry.evidenceId, issues);
    validateEnumField(schemaId, `${pathPrefix}.type`, entry.type, artifactTypes, issues);
    validateWorkspaceRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.summary`, entry.summary, issues);
    validateArtifactPrivacy(schemaId, entry.privacy, issues, `${pathPrefix}.privacy`);
  });
}
function validateReportSections(schemaId, value, issues) {
  if (!isRecord(value)) return;
  for (const field of ["blockers", "missingEvidence", "manualConfirmation", "nextActions", "degradedCapabilities", "unverifiedScope"]) {
    if (!Array.isArray(value[field])) {
      issues.push(issue(schemaId, `$.sections.${field}`, "invalid-type", `Expected 'sections.${field}' to be array.`));
    }
  }
}
function validateReportSourceChanges(schemaId, value, issues) {
  if (!isRecord(value)) return;
  if (typeof value.modifiedSource !== "boolean") {
    issues.push(issue(schemaId, "$.sourceChanges.modifiedSource", "invalid-type", "Expected 'sourceChanges.modifiedSource' to be boolean."));
  }
  validateRequiredStringField(schemaId, "$.sourceChanges.summary", value.summary, issues);
  if (!Array.isArray(value.files)) {
    issues.push(issue(schemaId, "$.sourceChanges.files", "invalid-type", "Expected 'sourceChanges.files' to be array."));
  } else {
    value.files.forEach((file, index) => validateWorkspaceRelativeField(schemaId, `$.sourceChanges.files[${index}]`, file, issues));
  }
}
function validateReportVerifier(schemaId, value, issues) {
  if (!isRecord(value)) return;
  validateRequiredStringField(schemaId, "$.verifier.command", value.command, issues);
  if (value.exitCode !== null && typeof value.exitCode !== "number") {
    issues.push(issue(schemaId, "$.verifier.exitCode", "invalid-type", "Expected 'verifier.exitCode' to be number or null."));
  }
}
function validateStateLedgerDetails(schemaId, payload, issues) {
  validateWorkspaceRelativeField(schemaId, "$.artifactIndexPath", payload.artifactIndexPath, issues);
  validateDirtyBaseline(schemaId, payload.dirtyBaseline, issues);
  validateGeneratedFiles(schemaId, payload.generatedFiles, issues);
}
function validateDirtyBaseline(schemaId, value, issues) {
  if (!isRecord(value)) return;
  validateDateTimeField(schemaId, "$.dirtyBaseline.capturedAt", value.capturedAt, issues);
  if (!Array.isArray(value.files)) return;
  value.files.forEach((entry, index) => {
    const pathPrefix = `$.dirtyBaseline.files[${index}]`;
    if (!isRecord(entry)) return;
    validateWorkspaceRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateEnumField(schemaId, `${pathPrefix}.status`, entry.status, dirtyFileStatuses, issues);
    if (entry.source !== "user-existing") {
      issues.push(issue(schemaId, `${pathPrefix}.source`, "invalid-enum", "Expected dirty baseline source to equal 'user-existing'."));
    }
  });
}
function validateGeneratedFiles(schemaId, value, issues) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    const pathPrefix = `$.generatedFiles[${index}]`;
    if (!isRecord(entry)) return;
    validateWorkspaceRelativeField(schemaId, `${pathPrefix}.path`, entry.path, issues);
    validateEnumField(schemaId, `${pathPrefix}.category`, entry.category, generatedFileCategories, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.owner`, entry.owner, issues);
    validateDateTimeField(schemaId, `${pathPrefix}.createdAt`, entry.createdAt, issues);
    validateRequiredStringField(schemaId, `${pathPrefix}.relatedRunId`, entry.relatedRunId, issues);
    if ("originalCategory" in entry) {
      validateEnumField(schemaId, `${pathPrefix}.originalCategory`, entry.originalCategory, generatedFileCategories, issues);
    }
    if ("relatedEvidenceIds" in entry) {
      const relatedEvidenceIds = entry.relatedEvidenceIds;
      if (!Array.isArray(relatedEvidenceIds)) {
        issues.push(issue(schemaId, `${pathPrefix}.relatedEvidenceIds`, "invalid-type", "Expected 'relatedEvidenceIds' to be array."));
      } else {
        const badIndex = relatedEvidenceIds.findIndex((item) => typeof item !== "string");
        if (badIndex !== -1) {
          issues.push(
            issue(
              schemaId,
              `${pathPrefix}.relatedEvidenceIds[${badIndex}]`,
              "invalid-type",
              "Expected 'relatedEvidenceIds' items to be string."
            )
          );
        }
      }
    }
    if ("userExistingChangeReason" in entry) {
      validateRequiredStringField(schemaId, `${pathPrefix}.userExistingChangeReason`, entry.userExistingChangeReason, issues);
    }
  });
}
function validateEvidenceFreshness(schemaId, freshness, issues) {
  if (!isRecord(freshness)) return;
  const validatedAt = freshness.validatedAt;
  if (typeof validatedAt !== "string") {
    issues.push(issue(schemaId, "$.freshness.validatedAt", "missing-required", "Missing required field 'freshness.validatedAt'."));
    return;
  }
  if (Number.isNaN(Date.parse(validatedAt))) {
    issues.push(issue(schemaId, "$.freshness.validatedAt", "invalid-format", "'freshness.validatedAt' must be an ISO date-time string."));
    return;
  }
  const hasTargetContext2 = freshnessTargetFields.some((field) => {
    const value = freshness[field];
    if (Array.isArray(value)) return value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
    return typeof value === "string" && value.length > 0;
  });
  if (!hasTargetContext2) {
    issues.push(
      issue(
        schemaId,
        "$.freshness",
        "invalid-range",
        "Freshness must include at least one target field: commandHash, targetHash, fileTargets, environmentId, or targetSummary."
      )
    );
  }
}
function validateArtifactPath(schemaId, value, issues) {
  validateWorkspaceRelativeField(schemaId, "$.path", value, issues);
}
function validateWorkspaceRelativeField(schemaId, path3, value, issues) {
  if (typeof value !== "string") return;
  if (!isWorkspaceRelativePath(value)) {
    issues.push(issue(schemaId, path3, "invalid-pattern", `'${path3}' must be workspace-relative and must not escape the workspace.`));
  }
}
function validateRequiredStringField(schemaId, path3, value, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a string.`));
    return;
  }
  if (value.length === 0) {
    issues.push(issue(schemaId, path3, "invalid-range", `'${path3}' must not be empty.`));
  }
}
function validateNumberRangeField(schemaId, path3, value, min, max, issues) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a number.`));
    return;
  }
  if (value < min || value > max) {
    issues.push(issue(schemaId, path3, "invalid-range", `'${path3}' must be between ${min} and ${max}.`));
  }
}
function validateTopologyRelativeField(schemaId, path3, value, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a string.`));
    return;
  }
  if (!isTopologyRelativePath(value)) {
    issues.push(issue(schemaId, path3, "invalid-pattern", `'${path3}' must be workspace-relative and must not escape the workspace.`));
  }
}
function validateDateTimeField(schemaId, path3, value, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be an ISO date-time string.`));
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    issues.push(issue(schemaId, path3, "invalid-format", `'${path3}' must be an ISO date-time string.`));
  }
}
function validateNonEmptyStringField(schemaId, path3, value, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a string.`));
    return;
  }
  if (value.length === 0) {
    issues.push(issue(schemaId, path3, "invalid-range", `'${path3}' must not be empty.`));
  }
}
function validatePatternField(schemaId, path3, value, pattern, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a string.`));
    return;
  }
  if (!pattern.test(value)) {
    issues.push(issue(schemaId, path3, "invalid-pattern", `'${path3}' does not match the required pattern.`));
  }
}
function validateBooleanField(schemaId, path3, value, issues) {
  if (typeof value !== "boolean") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a boolean.`));
  }
}
function validateEnumField(schemaId, path3, value, allowed, issues) {
  if (typeof value !== "string") {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be a string.`));
    return;
  }
  if (!allowed.includes(value)) {
    issues.push(issue(schemaId, path3, "invalid-enum", `Invalid enum value '${value}' for '${path3}'.`));
  }
}
function validateOptionalWorkspaceRoots(schemaId, path3, value, issues) {
  if (value === void 0) return;
  if (!Array.isArray(value)) {
    issues.push(issue(schemaId, path3, "invalid-type", `'${path3}' must be an array.`));
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path3}[${index}]`;
    validateWorkspaceRelativeField(schemaId, entryPath, entry, issues);
    if (typeof entry === "string" && !reportOnlyWriteRoots.includes(entry)) {
      issues.push(
        issue(
          schemaId,
          entryPath,
          "invalid-pattern",
          `'${entryPath}' must be one of the report-only artifact roots: ${reportOnlyWriteRoots.join(", ")}.`
        )
      );
    }
  });
}
function validateArtifactPrivacy(schemaId, value, issues, pathPrefix = "$.privacy") {
  if (!isRecord(value)) return;
  const classification = value.classification;
  if (typeof classification !== "string") {
    issues.push(issue(schemaId, `${pathPrefix}.classification`, "missing-required", "Missing required field 'privacy.classification'."));
  } else if (!privacyClassifications.includes(classification)) {
    issues.push(issue(schemaId, `${pathPrefix}.classification`, "invalid-enum", `Invalid privacy classification '${classification}'.`));
  }
  if (typeof value.containsSensitiveData !== "boolean") {
    issues.push(issue(schemaId, `${pathPrefix}.containsSensitiveData`, "invalid-type", "Expected 'privacy.containsSensitiveData' to be boolean."));
  }
  if (typeof value.redacted !== "boolean") {
    issues.push(issue(schemaId, `${pathPrefix}.redacted`, "invalid-type", "Expected 'privacy.redacted' to be boolean."));
  }
}
function isWorkspaceRelativePath(value) {
  if (value.length === 0) return false;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes("\0")) return false;
  const segments = value.replaceAll("\\", "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function isTopologyRelativePath(value) {
  if (value === ".") return true;
  return isWorkspaceRelativePath(value);
}
function matchesType(value, expected) {
  switch (expected) {
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return typeof value === expected;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(schemaId, path3, code, message) {
  return {
    schemaId,
    path: path3,
    code,
    message,
    severity: "blocked"
  };
}

// src/core/evidence/paths.ts
import { resolve, sep } from "node:path";
function resolveEvidencePaths(input) {
  const workspaceRoot = resolve(input.workspaceRoot);
  const safeRunId = safePathSegment(input.runId);
  const ledgerRelativePath = input.ledgerRelativePath ?? `.curdx/evidence/${safeRunId}.jsonl`;
  const artifactIndexRelativePath = input.artifactIndexRelativePath ?? ".curdx/artifacts/index.jsonl";
  return {
    workspaceRoot,
    ledgerRelativePath,
    ledgerPath: resolveWorkspacePath(workspaceRoot, ledgerRelativePath),
    artifactIndexRelativePath,
    artifactIndexPath: resolveWorkspacePath(workspaceRoot, artifactIndexRelativePath)
  };
}
function resolveWorkspacePath(workspaceRoot, relativePath) {
  if (!isWorkspaceRelativePath2(relativePath)) {
    throw new Error(`Unsafe workspace-relative path: ${relativePath}`);
  }
  const root = resolve(workspaceRoot);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe workspace-relative path: ${relativePath}`);
  }
  return target;
}
function isWorkspaceRelativePath2(value) {
  if (value.length === 0) return false;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.includes("\0")) return false;
  const segments = value.replaceAll("\\", "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}
function safePathSegment(value) {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "run";
}

// src/core/evidence/privacy.ts
var MAX_SUMMARY_LENGTH = 500;
var sensitivePatterns = [
  [/\b(Authorization|Cookie|Set-Cookie)\s*:\s*[^\n\r]+/gi, "$1: [REDACTED]"],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]"],
  [/\b(token|api[_-]?key|secret|password|session|cookie)\s*[:=]\s*["']?[^"'\s;,]+/gi, "$1=[REDACTED]"]
];
function summarizeArtifactText(value, maxLength = MAX_SUMMARY_LENGTH) {
  const compact = value.replace(/\s+/g, " ").trim();
  const redacted = redactSensitiveText(compact);
  const truncated = redacted.text.length > maxLength;
  const summary = truncated ? `${redacted.text.slice(0, Math.max(0, maxLength - 3))}...` : redacted.text;
  return {
    summary,
    redacted: redacted.redacted,
    truncated
  };
}
function redactSensitiveText(value) {
  let next = value;
  let redacted = false;
  for (const [pattern, replacement] of sensitivePatterns) {
    const replaced = next.replace(pattern, replacement);
    if (replaced !== next) {
      redacted = true;
      next = replaced;
    }
  }
  return { text: next, redacted };
}

// src/core/evidence/io.ts
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var defaultEvidenceFileIo = {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink
};
function mergeFileIo(override) {
  return {
    ...defaultEvidenceFileIo,
    ...override
  };
}
async function readJsonlFile(filePath, contractName, io) {
  let raw;
  try {
    raw = await readOptionalUtf8(filePath, io);
  } catch (err) {
    return {
      ok: false,
      status: "blocked",
      path: filePath,
      issues: [runtimeIssue(contractName, "$", "invalid-read", `Failed to read JSONL file: ${errorMessage(err)}`, filePath)]
    };
  }
  if (raw === void 0) {
    return { ok: true, entries: [], path: filePath, issues: [] };
  }
  const issues = [];
  const entries = [];
  const lines = raw.split("\n");
  lines.forEach((line, index) => {
    if (line.trim().length === 0) return;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      issues.push(runtimeIssue(contractName, `$[${index}]`, "invalid-json", errorMessage(err), filePath, index + 1));
      return;
    }
    const result = validateContract(contractName, parsed);
    if (!result.ok) {
      issues.push(...result.issues.map((issue2) => ({
        ...issue2,
        path: `$[${index}]${issue2.path.slice(1)}`,
        filePath,
        line: index + 1
      })));
      return;
    }
    entries.push(result.value);
  });
  if (issues.length > 0) {
    return { ok: false, status: "blocked", path: filePath, issues };
  }
  return { ok: true, entries, path: filePath, issues: [] };
}
async function atomicAppendJsonLine(filePath, value, io) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await io.mkdir(dirname(filePath), { recursive: true });
    const current = await readOptionalUtf8(filePath, io);
    const existing = current ?? "";
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? `${existing}
` : existing;
    const next = `${prefix}${JSON.stringify(value)}
`;
    await io.writeFile(tempPath, next, "utf8");
    await io.rename(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    await io.unlink(tempPath).catch(() => void 0);
    return {
      ok: false,
      issue: runtimeIssue("evidence", "$", "invalid-write", `Failed to append JSONL evidence: ${errorMessage(err)}`, filePath)
    };
  }
}
function runtimeIssue(contractName, path3, code, message, filePath, line) {
  return {
    schemaId: CONTRACTS[contractName].schemaId,
    path: path3,
    code,
    message,
    severity: "blocked",
    filePath,
    line
  };
}
function fromContractResult(contractName, result) {
  if (result.ok) return [];
  return result.issues.map((issue2) => ({
    ...issue2,
    schemaId: issue2.schemaId || CONTRACTS[contractName].schemaId
  }));
}
async function readOptionalUtf8(filePath, io) {
  try {
    return await io.readFile(filePath, "utf8");
  } catch (err) {
    if (isNodeErrno(err, "ENOENT")) return void 0;
    throw err;
  }
}
function isNodeErrno(value, code) {
  return typeof value === "object" && value !== null && "code" in value && value.code === code;
}
function errorMessage(value) {
  return value instanceof Error ? value.message : String(value);
}

// src/core/evidence/artifacts.ts
function normalizeArtifactIndexEntry(input, evidence, createdAt) {
  if (!isWorkspaceRelativePath2(input.path)) {
    return {
      ok: false,
      issues: [runtimeIssue("artifactIndex", "$.path", "invalid-pattern", "'path' must be workspace-relative and must not escape the workspace.")]
    };
  }
  const summary = summarizeArtifactText(input.summary);
  const privacy = {
    classification: input.privacy?.classification ?? "internal",
    containsSensitiveData: input.privacy?.containsSensitiveData ?? summary.redacted,
    ...input.privacy,
    redacted: input.privacy?.redacted === true || summary.redacted || summary.truncated
  };
  const entry = {
    ...input,
    schemaVersion: 1,
    runId: evidence.runId,
    goalId: evidence.goalId,
    evidenceId: evidence.id,
    attemptId: typeof evidence.attemptId === "string" ? evidence.attemptId : input.attemptId,
    summary: summary.summary,
    privacy,
    createdAt
  };
  const validation = validateContract("artifactIndex", entry);
  if (!validation.ok) {
    return { ok: false, issues: fromContractResult("artifactIndex", validation) };
  }
  return { ok: true, entry };
}
async function readArtifactIndex(input) {
  const io = mergeFileIo(input.io);
  const artifactIndexPath = input.artifactIndexPath ?? resolveEvidencePaths({ workspaceRoot: input.workspaceRoot, runId: "artifact-index" }).artifactIndexPath;
  return readJsonlFile(artifactIndexPath, "artifactIndex", io);
}
async function appendArtifactIndexEntries(input) {
  for (const entry of input.entries) {
    const result = await atomicAppendJsonLine(input.artifactIndexPath, entry, input.io);
    if (!result.ok) {
      return { ok: false, issues: [{ ...result.issue, schemaId: "curdx-flow/artifact-index", filePath: input.artifactIndexPath }] };
    }
  }
  return { ok: true };
}

// src/core/evidence/ledger.ts
async function appendEvidence(input) {
  const io = mergeFileIo(input.io);
  const paths = resolveEvidencePaths({
    workspaceRoot: input.workspaceRoot,
    runId: input.evidence.runId
  });
  const artifactIds = [];
  const validationIssues = validateEvidenceAndArtifacts(input.evidence, input.artifacts ?? [], nowIso(input.now));
  if (validationIssues.length > 0) {
    return {
      ok: false,
      status: "blocked",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: validationIssues
    };
  }
  const existingLedger = await readJsonlFile(paths.ledgerPath, "evidence", io);
  if (!existingLedger.ok) {
    return {
      ok: false,
      status: "blocked",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: existingLedger.issues
    };
  }
  const existingArtifactIndex = await readArtifactIndex({
    workspaceRoot: input.workspaceRoot,
    artifactIndexPath: paths.artifactIndexPath,
    io
  });
  if (!existingArtifactIndex.ok) {
    return {
      ok: false,
      status: "blocked",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: existingArtifactIndex.issues
    };
  }
  const ledgerWrite = await atomicAppendJsonLine(paths.ledgerPath, input.evidence, io);
  if (!ledgerWrite.ok) {
    return {
      ok: false,
      status: "blocked",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      issues: [ledgerWrite.issue]
    };
  }
  const artifactEntries = (input.artifacts ?? []).map((artifact2) => {
    const normalized = normalizeArtifactIndexEntry(artifact2, input.evidence, nowIso(input.now));
    if (!normalized.ok) return normalized;
    artifactIds.push(normalized.entry.id);
    return normalized;
  });
  const normalizedIssues = artifactEntries.flatMap((entry) => entry.ok ? [] : entry.issues);
  if (normalizedIssues.length > 0) {
    return {
      ok: false,
      status: "degraded",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      artifactIds,
      issues: normalizedIssues
    };
  }
  const artifactWrite = await appendArtifactIndexEntries({
    artifactIndexPath: paths.artifactIndexPath,
    entries: artifactEntries.flatMap((entry) => entry.ok ? [entry.entry] : []),
    io
  });
  if (!artifactWrite.ok) {
    return {
      ok: false,
      status: "degraded",
      ledgerPath: paths.ledgerPath,
      artifactIndexPath: paths.artifactIndexPath,
      artifactIds,
      issues: artifactWrite.issues
    };
  }
  return {
    ok: true,
    status: input.evidence.status,
    evidenceId: input.evidence.id,
    ledgerPath: paths.ledgerPath,
    artifactIndexPath: paths.artifactIndexPath,
    artifactIds,
    issues: []
  };
}
function validateEvidenceAndArtifacts(evidence, artifacts, createdAt) {
  const evidenceValidation = validateContract("evidence", evidence);
  const evidenceIssues = fromContractResult("evidence", evidenceValidation);
  const artifactIssues = artifacts.flatMap((artifact2) => {
    const normalized = normalizeArtifactIndexEntry(artifact2, evidence, createdAt);
    return normalized.ok ? [] : normalized.issues;
  });
  return [...evidenceIssues, ...artifactIssues];
}
function nowIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/core/verdict/freshness.ts
var targetFields = ["commandHash", "targetHash", "environmentId", "targetSummary"];
function evaluateEvidenceFreshness(input) {
  const freshness = input.evidence.freshness;
  if (!isRecord2(freshness)) {
    return { ok: false, reason: "missing freshness object" };
  }
  const validatedAt = freshness.validatedAt;
  if (typeof validatedAt !== "string" || Number.isNaN(Date.parse(validatedAt))) {
    return { ok: false, reason: "missing valid freshness.validatedAt" };
  }
  if (!hasTargetContext(freshness)) {
    return { ok: false, reason: "missing freshness target context" };
  }
  const expiresAt = freshness.expiresAt;
  if (typeof expiresAt === "string") {
    const expiry = Date.parse(expiresAt);
    if (Number.isNaN(expiry)) {
      return { ok: false, reason: "invalid freshness.expiresAt" };
    }
    if (expiry < nowMs(input.now)) {
      return { ok: false, reason: "evidence expired" };
    }
  }
  for (const field of targetFields) {
    const expected = input.target?.[field];
    if (typeof expected !== "string") continue;
    const actual = freshness[field];
    if (actual !== expected) {
      return { ok: false, reason: `${field} mismatch` };
    }
  }
  return { ok: true };
}
function hasTargetContext(freshness) {
  const hasScalarTarget = targetFields.some((field) => typeof freshness[field] === "string" && freshness[field].length > 0);
  if (hasScalarTarget) return true;
  const fileTargets = freshness.fileTargets;
  return Array.isArray(fileTargets) && fileTargets.length > 0 && fileTargets.every((item) => typeof item === "string" && item.length > 0);
}
function nowMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/core/verdict/evaluator.ts
function evaluateCompletionVerdict(input) {
  const requirements = input.requirements !== void 0 && input.requirements.length > 0 ? input.requirements : inferRequirements(input.taskType);
  const diagnostics = [];
  const usableEvidence = /* @__PURE__ */ new Map();
  const gaps = [];
  const unverifiedScope = [];
  const policyStatus = evaluatePolicyStatus(input);
  if (policyStatus.kind === "blocked") {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: policyStatus.why,
        evidenceRefs: policyStatus.evidenceRefs,
        missingEvidence: policyStatus.gaps,
        nextAction: policyStatus.nextAction,
        owner: policyStatus.owner,
        riskLevel: policyStatus.riskLevel,
        unverifiedScope: policyStatus.gaps
      }),
      diagnostics
    );
  }
  const blockingBlocker = (input.blockers ?? []).find((blocker) => blocker.core !== false || blocker.releaseGate === true);
  if (blockingBlocker !== void 0) {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: `Blocked by ${blockingBlocker.code}: ${blockingBlocker.message}`,
        evidenceRefs: blockingBlocker.evidenceRefs ?? [],
        missingEvidence: [blockerGap(blockingBlocker)],
        nextAction: blockingBlocker.nextAction,
        owner: blockingBlocker.owner,
        riskLevel: blockingBlocker.riskLevel,
        unverifiedScope: [blockerGap(blockingBlocker)]
      }),
      diagnostics
    );
  }
  for (const requirement of requirements) {
    const match = findUsableEvidence(input, requirement);
    if (match.ok) {
      usableEvidence.set(match.evidence.id, match.evidence);
      continue;
    }
    const gap = {
      id: requirement.id,
      source: requirement.source,
      description: requirement.description,
      reason: match.reason,
      core: requirement.core !== false,
      evidenceIds: match.evidenceIds
    };
    if (requirement.core === false) {
      unverifiedScope.push(gap);
    } else {
      gaps.push(gap);
    }
  }
  const stateMissingEvidence = normalizeStateMissingEvidence(input.state.missingEvidence);
  for (const gap of stateMissingEvidence) {
    if (!hasManualConfirmationForGap(input, gap)) {
      gaps.push(gap);
    }
  }
  if (input.taskType === "release" && input.releaseStageAuthorized !== true) {
    gaps.push({
      id: "release-stage-authorization",
      source: "release-authorization",
      description: "release-stage authorization",
      reason: "release-stage authorization is missing",
      core: true
    });
  }
  const evidenceRefs = [...usableEvidence.keys()];
  unverifiedScope.push(...policyStatus.unverifiedScope);
  const hasManualAllowedGap = gaps.some((gap) => requirementById(requirements, gap.id)?.allowManualConfirmation === true);
  const onlyManualAllowedGaps = gaps.length > 0 && gaps.every((gap) => requirementById(requirements, gap.id)?.allowManualConfirmation === true);
  if (gaps.length > 0 && onlyManualAllowedGaps) {
    return verdictResult(
      buildVerdict(input, {
        verdict: "manual-confirmation-required",
        why: `Manual confirmation required for missing evidence: ${gaps.map((gap) => gap.description).join(", ")}.`,
        evidenceRefs,
        missingEvidence: gaps,
        unverifiedScope: gaps,
        riskLevel: "medium",
        confidence: 0.4
      }),
      diagnostics
    );
  }
  if (gaps.length > 0) {
    return verdictResult(
      buildBlockedVerdict(input, {
        why: `Missing or unusable core evidence: ${gaps.map((gap) => `${gap.description} (${gap.reason})`).join("; ")}.`,
        evidenceRefs,
        missingEvidence: gaps,
        unverifiedScope: [...gaps, ...unverifiedScope],
        riskLevel: hasManualAllowedGap ? "medium" : "high"
      }),
      diagnostics
    );
  }
  if (unverifiedScope.length > 0) {
    return verdictResult(
      buildVerdict(input, {
        verdict: "partial",
        why: `Core evidence passed, but some scope is unverified: ${unverifiedScope.map((gap) => gap.description).join(", ")}.`,
        evidenceRefs,
        missingEvidence: [],
        unverifiedScope,
        riskLevel: "medium",
        confidence: 0.55
      }),
      diagnostics
    );
  }
  if (input.taskType === "release") {
    return verdictResult(
      buildVerdict(input, {
        verdict: "release-ready",
        why: "Release evidence is fresh and release-stage authorization is present.",
        evidenceRefs,
        missingEvidence: [],
        unverifiedScope: [],
        riskLevel: "medium",
        confidence: 0.92
      }),
      diagnostics
    );
  }
  return verdictResult(
    buildVerdict(input, {
      verdict: "complete",
      why: "All required evidence is fresh, verified, and covers the requested completion scope.",
      evidenceRefs,
      missingEvidence: [],
      unverifiedScope: [],
      riskLevel: "low",
      confidence: 0.95
    }),
    diagnostics
  );
}
function evaluatePolicyStatus(input) {
  const policy = isRecord3(input.policy) ? input.policy : input.state.policy;
  if (!isRecord3(policy) || policy.noFalseCompletion !== true) {
    const gap = {
      id: "no-false-completion",
      source: "state",
      description: "no false completion policy invariant",
      reason: "no false completion cannot be disabled or omitted",
      core: true
    };
    return {
      kind: "blocked",
      why: "Blocked by policy: no false completion cannot be disabled; missing evidence must be expressed as a blocker or manual confirmation.",
      evidenceRefs: [],
      gaps: [gap],
      nextAction: {
        owner: "agent",
        summary: "Restore state.policy.noFalseCompletion to true and rerun verdict evaluation."
      },
      owner: "agent",
      riskLevel: "critical"
    };
  }
  const reportOnlyGeneratedFileGap = findReportOnlyGeneratedFileGap(input.state);
  if (reportOnlyGeneratedFileGap !== void 0) {
    return {
      kind: "blocked",
      why: `Blocked by report-only generated file boundary: ${reportOnlyGeneratedFileGap.reason}`,
      evidenceRefs: [],
      gaps: [reportOnlyGeneratedFileGap],
      nextAction: {
        owner: "agent",
        summary: "Record report-only findings under .curdx reports/evidence/artifacts/state, or switch to fix mode before mutating source."
      },
      owner: "agent",
      riskLevel: "high"
    };
  }
  const policyDecisions = collectPolicyDecisions(policy);
  const unverifiedScope = [];
  for (const decision of policyDecisions) {
    const status = stringField(decision.decision) ?? stringField(decision.status);
    if (status !== "blocked" && status !== "block" && status !== "skipped" && status !== "manual-confirmation-required") {
      continue;
    }
    const gap = policyGap(decision);
    if (decision.core === false) {
      unverifiedScope.push(gap);
      continue;
    }
    const actionType = stringField(decision.actionType) ?? "action";
    const riskLevel = riskLevelField(decision.riskLevel) ?? (status === "blocked" || status === "block" ? "high" : "medium");
    const evidenceRefs = stringArrayField(decision.evidenceRefs);
    return {
      kind: "blocked",
      why: status === "manual-confirmation-required" ? `Policy requires manual confirmation for ${actionType}: ${gap.reason}` : `Policy ${status === "skipped" ? "skipped" : "blocked"} ${actionType}: ${gap.reason}`,
      evidenceRefs,
      gaps: [gap],
      nextAction: isRecord3(decision.nextAction) ? decision.nextAction : {
        owner: "user",
        summary: status === "manual-confirmation-required" ? "Provide manual confirmation or policy authorization before completion." : "Resolve the policy blocker before claiming completion."
      },
      owner: stringField(decision.owner) ?? (status === "manual-confirmation-required" ? "user" : "agent"),
      riskLevel
    };
  }
  for (const route of collectCapabilityRoutes(policy)) {
    const status = stringField(route.decision) ?? "unknown";
    const blocksCompletion = route.blocksCompletion === true || status === "blocked";
    const gap = capabilityRouteGap(route);
    if (blocksCompletion) {
      const evidenceRefs = stringArrayField(route.evidenceRefs);
      return {
        kind: "blocked",
        why: `Capability route blocked ${stringField(route.selectedCapabilityId) ?? stringField(route.primaryCapabilityId) ?? stringField(route.requirementId) ?? "capability"}: ${gap.reason}`,
        evidenceRefs,
        gaps: [gap],
        nextAction: isRecord3(route.nextAction) ? route.nextAction : {
          owner: route.manualConfirmationRequired === true ? "user" : "agent",
          summary: "Resolve the capability route blocker or choose an explicit degraded/manual fallback before completion."
        },
        owner: stringField(route.owner) ?? (route.manualConfirmationRequired === true ? "user" : "agent"),
        riskLevel: riskLevelField(route.riskLevel) ?? "high"
      };
    }
    const trustLevel = stringField(route.trustLevel);
    if (status === "fallback" || status === "degraded" || status === "manual-confirmation-required" || trustLevel === "degraded" || route.manualConfirmationRequired === true) {
      unverifiedScope.push(gap);
    }
  }
  return { kind: "ok", unverifiedScope };
}
function findReportOnlyGeneratedFileGap(state) {
  if (state.mode !== "report-only") return void 0;
  for (const entry of state.generatedFiles) {
    if (!isRecord3(entry)) continue;
    const path3 = stringField(entry.path);
    const category = stringField(entry.category);
    if (path3 === void 0) continue;
    if (isAllowedReportOnlyGeneratedFile(path3, category)) continue;
    return {
      id: "report-only-write-boundary",
      source: "state",
      description: "report-only generated file boundary",
      reason: `report-only mode cannot record generated file '${path3}' as '${category ?? "unknown"}'.`,
      core: true
    };
  }
  return void 0;
}
function isAllowedReportOnlyGeneratedFile(path3, category) {
  if (path3 === ".git" || path3.startsWith(".git/")) return false;
  if (path3.startsWith(".curdx/reports/")) return category === "report";
  if (path3.startsWith(".curdx/evidence/")) return category === "evidence";
  if (path3.startsWith(".curdx/artifacts/")) return category === "temporary-artifact" || category === "external-tool-output" || category === "evidence";
  if (path3.startsWith(".curdx/state/")) return category === "temporary-artifact" || category === "external-tool-output";
  return false;
}
function collectPolicyDecisions(policy) {
  const sources = [policy.actionDecisions, policy.decisions, policy.policyEffects];
  const output = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    output.push(...source.filter(isRecord3));
  }
  return output;
}
function collectCapabilityRoutes(policy) {
  const output = [];
  const sources = [policy.capabilityRoutes, policy.routes];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    output.push(...source.filter(isRecord3));
  }
  if (isRecord3(policy.routingPlan) && Array.isArray(policy.routingPlan.routes)) {
    output.push(...policy.routingPlan.routes.filter(isRecord3));
  }
  return output;
}
function policyGap(decision) {
  const id = stringField(decision.id) ?? stringField(decision.actionType) ?? "policy-action";
  return {
    id: `policy-${id}`,
    source: "state",
    description: stringField(decision.description) ?? `policy decision for ${stringField(decision.actionType) ?? id}`,
    reason: stringField(decision.reason) ?? stringField(decision.message) ?? "policy decision prevented verified execution",
    core: decision.core !== false,
    evidenceIds: stringArrayField(decision.evidenceRefs)
  };
}
function capabilityRouteGap(route) {
  const id = stringField(route.id) ?? stringField(route.requirementId) ?? stringField(route.selectedCapabilityId) ?? "capability-route";
  return {
    id: `capability-${id}`,
    source: "state",
    description: stringField(route.description) ?? `capability route for ${stringField(route.requirementId) ?? id}`,
    reason: stringField(route.reason) ?? stringField(route.degradedReason) ?? "capability routing could not provide full-trust evidence",
    core: route.core !== false,
    evidenceIds: stringArrayField(route.evidenceRefs)
  };
}
function findUsableEvidence(input, requirement) {
  const candidates = input.evidence.filter((entry) => matchesRequirement(entry, requirement));
  if (candidates.length === 0) {
    return { ok: false, reason: `missing ${requirement.source} evidence` };
  }
  const evidenceIds = [];
  let lastUnusableReason = `no verified passing ${requirement.source} evidence`;
  for (const entry of candidates) {
    evidenceIds.push(entry.id);
    const validation = validateContract("evidence", entry);
    if (!validation.ok) {
      lastUnusableReason = "evidence contract validation failed";
      continue;
    }
    if (entry.runId !== input.state.runId || entry.goalId !== input.state.goalId) {
      lastUnusableReason = "evidence run or goal does not match state";
      continue;
    }
    if (entry.status !== "passed") {
      lastUnusableReason = `evidence status is ${entry.status}`;
      continue;
    }
    if (entry.trustLevel === "self-reported" || entry.trustLevel === "degraded") {
      lastUnusableReason = `evidence trust level is ${entry.trustLevel}`;
      continue;
    }
    const freshness = evaluateEvidenceFreshness({ evidence: entry, target: requirement.target, now: input.now });
    if (!freshness.ok) {
      lastUnusableReason = freshness.reason;
      continue;
    }
    return { ok: true, evidence: entry };
  }
  return { ok: false, reason: lastUnusableReason, evidenceIds };
}
function matchesRequirement(entry, requirement) {
  if (entry.source !== requirement.source) return false;
  if (requirement.capabilityId !== void 0 && entry.capabilityId !== requirement.capabilityId) return false;
  return true;
}
function inferRequirements(taskType) {
  switch (taskType) {
    case "frontend":
      return [
        inferredRequirement("browser", "browser journey evidence"),
        inferredRequirement("api", "API request/response evidence")
      ];
    case "fullstack":
      return [
        inferredRequirement("browser", "browser journey evidence"),
        inferredRequirement("api", "API request/response evidence"),
        inferredRequirement("data", "data persistence evidence")
      ];
    case "data":
      return [inferredRequirement("data", "data readback evidence")];
    case "backend":
      return [inferredRequirement("api", "API evidence")];
    case "release":
      return [inferredRequirement("release", "release evidence")];
    case "manual":
      return [inferredRequirement("manual", "manual confirmation evidence")];
    default:
      return [inferredRequirement("command", "command evidence")];
  }
}
function inferredRequirement(source, description) {
  return {
    id: `required-${source}`,
    source,
    description,
    core: true,
    allowManualConfirmation: source === "manual"
  };
}
function normalizeStateMissingEvidence(value) {
  return value.map((entry, index) => {
    if (isRecord3(entry)) {
      return {
        id: typeof entry.id === "string" ? entry.id : `state-missing-${index + 1}`,
        source: typeof entry.source === "string" ? entry.source : "state",
        description: typeof entry.description === "string" ? entry.description : typeof entry.summary === "string" ? entry.summary : "state missing evidence",
        reason: typeof entry.reason === "string" ? entry.reason : "state lists missing evidence",
        core: typeof entry.core === "boolean" ? entry.core : true
      };
    }
    return {
      id: `state-missing-${index + 1}`,
      source: "state",
      description: String(entry),
      reason: "state lists missing evidence",
      core: true
    };
  });
}
function buildBlockedVerdict(input, overrides) {
  return buildVerdict(input, {
    verdict: "blocked",
    nextAction: input.state.nextAction,
    owner: "agent",
    riskLevel: "high",
    confidence: 0.2,
    ...overrides
  });
}
function buildVerdict(input, overrides) {
  return {
    schemaVersion: 1,
    nextAction: input.state.nextAction,
    owner: "agent",
    riskLevel: "medium",
    confidence: 0.5,
    ...overrides
  };
}
function verdictResult(verdict, diagnostics) {
  const validation = validateContract("completionVerdict", verdict);
  if (!validation.ok) {
    return {
      ok: true,
      verdict: {
        schemaVersion: 1,
        verdict: "blocked",
        why: `Internal verdict contract validation failed: ${validation.issues.map((issue2) => issue2.message).join("; ")}`,
        evidenceRefs: [],
        missingEvidence: validation.issues,
        nextAction: {
          owner: "agent",
          summary: "Fix completion verdict evaluator output contract."
        },
        owner: "agent",
        riskLevel: "high",
        confidence: 0,
        unverifiedScope: validation.issues
      },
      diagnostics: [
        ...diagnostics,
        {
          code: "invalid-verdict-output",
          message: "Evaluator generated invalid completion verdict output."
        }
      ]
    };
  }
  return { ok: true, verdict: validation.value, diagnostics };
}
function blockerGap(blocker) {
  return {
    id: blocker.code,
    source: blocker.releaseGate === true ? "release" : "state",
    description: blocker.message,
    reason: blocker.message,
    core: blocker.core !== false,
    evidenceIds: blocker.evidenceRefs
  };
}
function requirementById(requirements, id) {
  return requirements.find((requirement) => requirement.id === id);
}
function hasManualConfirmationForGap(input, gap) {
  return (input.manualConfirmations ?? []).some((confirmation) => {
    if (confirmation.requirementIds?.includes(gap.id) === true) return true;
    if (gap.evidenceIds !== void 0 && confirmation.evidenceRefs?.some((ref) => gap.evidenceIds?.includes(ref)) === true) return true;
    return false;
  });
}
function stringField(value) {
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function stringArrayField(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : [];
}
function riskLevelField(value) {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  return void 0;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hooks/lib/evidence-bridge.ts
function slug(input) {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}
function deriveIds(state, specDir) {
  const base = slug(basename2(specDir) || (typeof state.name === "string" ? state.name : "") || "run");
  const runId = typeof state.runId === "string" && state.runId.length > 0 ? state.runId : `curdx-${base}`;
  const goalId = typeof state.goalId === "string" && state.goalId.length > 0 ? state.goalId : `goal-${base}`;
  return { runId, goalId };
}
function hashCommand(command) {
  return createHash("sha256").update(command).digest("hex").slice(0, 16);
}
function timestampMs(timestamp) {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}
function toEvidenceBlock(phase, block, ids) {
  const passed = block.exitCode === 0;
  const command = typeof block.command === "string" ? block.command : "";
  return {
    schemaVersion: 1,
    id: `evidence-${ids.runId}-${phase}-${block.taskIndex ?? 0}-${timestampMs(block.timestamp)}`,
    runId: ids.runId,
    goalId: ids.goalId,
    source: "hook",
    capabilityId: phase,
    trustLevel: passed ? "verified" : "degraded",
    status: passed ? "passed" : "failed",
    summary: command.length > 0 ? command : `verify ${phase}`,
    artifacts: [],
    startedAt: block.timestamp,
    completedAt: block.timestamp,
    freshness: { validatedAt: block.timestamp, commandHash: hashCommand(command) },
    privacy: { classification: "local-only", containsSensitiveData: false, redacted: false },
    redactions: []
  };
}
function toStateLedger(phase, ids, workspaceRoot, evidenceIds, at) {
  return {
    schemaVersion: 1,
    runId: ids.runId,
    goalId: ids.goalId,
    workspaceRoot,
    mode: "verification",
    policy: { noFalseCompletion: true },
    scope: {},
    expectedJourney: {},
    status: "running",
    verdictStatus: "pending",
    phase,
    startedAt: at,
    updatedAt: at,
    evidenceIds,
    missingEvidence: [],
    artifactIndexPath: ".curdx/artifacts/index.jsonl",
    dirtyBaseline: { capturedAt: at, files: [] },
    generatedFiles: [],
    nextAction: {
      owner: "agent",
      summary: "Complete remaining verification before claiming completion."
    }
  };
}
function buildHookRequirement(phase, command) {
  return {
    id: `required-hook-${phase}`,
    source: "hook",
    capabilityId: phase,
    description: `verified hook evidence for phase '${phase}'`,
    core: true,
    target: { commandHash: hashCommand(command) }
  };
}
async function appendPhaseEvidenceBestEffort(evidence, workspaceRoot) {
  try {
    await appendEvidence({ workspaceRoot, evidence });
  } catch {
  }
}
async function crossCheckPhase(base, state, phase, block, workspaceRoot, specDir) {
  try {
    const ids = deriveIds(state, specDir);
    const command = typeof block.command === "string" ? block.command : "";
    const evidence = toEvidenceBlock(phase, block, ids);
    const ledger = toStateLedger(phase, ids, workspaceRoot, [evidence.id], block.timestamp);
    if (!validateContract("evidence", evidence).ok) return base;
    if (!validateContract("stateLedger", ledger).ok) return base;
    await appendPhaseEvidenceBestEffort(evidence, workspaceRoot);
    const result = evaluateCompletionVerdict({
      state: ledger,
      evidence: [evidence],
      requirements: [buildHookRequirement(phase, command)],
      taskType: "command",
      claimedComplete: true,
      now: block.timestamp
    });
    const verdict = result.verdict.verdict;
    if (verdict !== "complete" && verdict !== "release-ready") {
      return {
        ok: false,
        reason: `Completion cross-check ${verdict}: ${result.verdict.why}`,
        command: base.command ?? command
      };
    }
    return base;
  } catch {
    return base;
  }
}

// src/hooks/lib/verify-blocks.ts
var VERIFICATION_PHASES = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution"
];
function getVerificationPhase(state) {
  const raw = typeof state.phase === "string" ? state.phase : "";
  if (!VERIFICATION_PHASES.includes(raw)) {
    return null;
  }
  return raw;
}
async function verifyPhaseBlock(state, phase, specDir) {
  const block = state.verificationBlocks?.[phase];
  if (block === void 0) {
    return { ok: false, reason: "missing", command: "" };
  }
  if (block.exitCode !== 0) {
    return {
      ok: false,
      reason: block.failedReason ?? "verification failed",
      command: block.command
    };
  }
  if (block.srcMtime > Date.parse(block.timestamp)) {
    const srcIso = new Date(block.srcMtime).toISOString();
    const specName = basename3(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src changed at ${srcIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command
    };
  }
  if (typeof state.lastSrcEditMs === "number" && state.lastSrcEditMs > Date.parse(block.timestamp)) {
    const editIso = new Date(state.lastSrcEditMs).toISOString();
    const specName = basename3(specDir);
    return {
      ok: false,
      reason: `Stale evidence for phase '${phase}': src edited at ${editIso}, last verified at ${block.timestamp}. Re-run: ${block.command}. Spec: ${specName}.`,
      command: block.command
    };
  }
  if (phase === "execution" && typeof block.taskIndex === "number") {
    const currentTaskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
    if (block.taskIndex !== currentTaskIndex) {
      const specName = basename3(specDir);
      return {
        ok: false,
        reason: `Stale evidence for phase 'execution': block recorded against task index ${block.taskIndex}, current task index is ${currentTaskIndex}. Re-run: ${block.command}. Spec: ${specName}.`,
        command: block.command
      };
    }
  }
  return { ok: true };
}
async function verifyPhaseBlockWithEvidence(state, phase, specDir, workspaceRoot) {
  const base = await verifyPhaseBlock(state, phase, specDir);
  if (!base.ok) return base;
  const block = state.verificationBlocks?.[phase];
  if (block === void 0) return base;
  try {
    return await crossCheckPhase(base, state, phase, block, workspaceRoot ?? specDir, specDir);
  } catch {
    return base;
  }
}

// src/hooks/lib/smart-route.ts
import { existsSync as existsSync5, readFileSync as readFileSync6 } from "node:fs";
import { basename as basename7, join as join5 } from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/hooks/lib/auto-policy.ts
import { fileURLToPath } from "node:url";
import { basename as basename4 } from "node:path";
var LOW_RISK_RE = /\b(readme|docs?|documentation|typo|copy|wording|comment|comments|changelog|license|format text|rename label|css copy|style text)\b/i;
var HIGH_RISK_RE = /\b(auth|authentication|authorization|permission|permissions|security|secret|secrets|token|password|oauth|payment|billing|invoice|migration|database|schema|release|publish|tag|manifest|plugin\.json|claude-plugin|hooks?\.json|hook|subagent|agent|sandbox|destructive|data loss|concurrency|race|cache|cost|pricing)\b/i;
var CRITICAL_RISK_RE = /\b(payment|billing|security|secret|secrets|password|token|oauth|authorization|permission|migration|data loss|release|publish|tag|hooks?\.json|plugin\.json|claude-plugin)\b/i;
var DESTRUCTIVE_INTENT_RE = /\b(rm\s+-rf|delete\s+(file|files|directory|directories|folder|folders|branch|branches|tag|tags|database|schema|table|record|records|data|repo|repository)|remove\s+(file|files|directory|directories|folder|folders|branch|branches|tag|tags|database|schema|table|record|records|data|repo|repository)|drop\s+(database|schema|table)|wipe|purge|destroy)\b|删除(文件|目录|数据|数据库|表|仓库|分支|标签)|删库|清空数据/i;
var EPIC_TRIAGE_RE = /\b(epic|multi-spec|multiple specs|multiple subsystems|cross-system|whole app|entire app|rewrite|rebuild|platform|framework migration|全量|重写|多个子系统|史诗)\b/i;
var ADD_OR_FIX_RE = /\b(add|build|create|implement|support|fix|debug|repair|resolve|refactor|change|modify|update)\b/i;
function normalizeWords(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function parseFlags(flags) {
  const text = ` ${flags ?? ""} `;
  const modeMatch = text.match(/\s--mode\s+(auto|fast|deep)(?=\s|$)/);
  const granularityMatch = text.match(/\s--task-granularity\s+(auto|coarse|standard|fine)(?=\s|$)/) ?? text.match(/\s--tasks-size\s+(auto|coarse|standard|fine)(?=\s|$)/);
  const reviewMatch = text.match(
    /\s--review\s+(minimal|standard|strict)(?=\s|$)/
  );
  return {
    mode: modeMatch?.[1] ?? "auto",
    taskGranularity: granularityMatch?.[1],
    review: reviewMatch?.[1]
  };
}
function countDistinctDirs(files) {
  const dirs = /* @__PURE__ */ new Set();
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
function bumpRisk(a, b) {
  const order = ["low", "medium", "high", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
function classifyRisk(goal, files, fileCount) {
  let risk = "medium";
  const reasons = [];
  if (LOW_RISK_RE.test(goal)) {
    risk = "low";
    reasons.push("low-risk wording/docs signal");
  }
  if (!ADD_OR_FIX_RE.test(goal) && fileCount <= 2) {
    risk = bumpRisk(risk, "low");
    reasons.push("small unclear change; keep validation targeted");
  }
  if (HIGH_RISK_RE.test(goal) || DESTRUCTIVE_INTENT_RE.test(goal) || files.some((f) => HIGH_RISK_RE.test(f) || DESTRUCTIVE_INTENT_RE.test(f))) {
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
function classifyExecutionMode(args) {
  const reasons = [];
  let executionMode;
  if (EPIC_TRIAGE_RE.test(args.goal) || args.fileCount >= 16 || args.dirCount >= 6 || typeof args.taskCount === "number" && args.taskCount > 12) {
    executionMode = "epic-triage";
    reasons.push("epic-level or multi-subsystem task/file surface");
  } else if (args.risk === "critical" || args.fileCount >= 9) {
    executionMode = "deep-spec";
    reasons.push("critical/high blast radius requires deep spec");
  } else if (args.risk === "high" || args.fileCount >= 4) {
    executionMode = "standard";
    reasons.push("moderate implementation surface");
  } else if (args.risk === "low" && args.fileCount <= 1) {
    executionMode = "direct";
    reasons.push("single low-risk change");
  } else if (args.fileCount <= 3) {
    executionMode = "spec-lite";
    reasons.push("small bounded change");
  } else {
    executionMode = "standard";
    reasons.push("default standard slice");
  }
  if (args.mode === "deep" && executionMode !== "epic-triage") {
    executionMode = executionMode === "direct" || executionMode === "spec-lite" ? "standard" : "deep-spec";
    reasons.push("explicit deep mode");
  }
  if (args.mode === "fast" && executionMode === "deep-spec" && args.risk !== "critical") {
    executionMode = "standard";
    reasons.push("explicit fast mode without critical risk");
  }
  return { executionMode, reasons };
}
function policyForExecutionMode(executionMode) {
  switch (executionMode) {
    case "direct":
      return {
        executionDriver: "goal",
        taskGranularity: "none",
        taskTargetRange: { min: 0, max: 1 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        maxGlobalIterations: 5,
        maxTaskIterations: 2
      };
    case "spec-lite":
      return {
        executionDriver: "goal",
        taskGranularity: "coarse",
        taskTargetRange: { min: 1, max: 3 },
        reviewCadence: "minimal",
        verificationLevel: "targeted",
        subagentPolicy: "none",
        maxGlobalIterations: 8,
        maxTaskIterations: 3
      };
    case "standard":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 3, max: 7 },
        reviewCadence: "final",
        verificationLevel: "standard",
        subagentPolicy: "on-demand",
        maxGlobalIterations: 18,
        maxTaskIterations: 4
      };
    case "deep-spec":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 12 },
        reviewCadence: "periodic",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
    case "epic-triage":
      return {
        executionDriver: "goal",
        taskGranularity: "standard",
        taskTargetRange: { min: 5, max: 10 },
        reviewCadence: "strict",
        verificationLevel: "strict",
        subagentPolicy: "per-slice",
        maxGlobalIterations: 30,
        maxTaskIterations: 5
      };
  }
}
function applyOverrides(policy, overrides) {
  const next = { ...policy };
  if (overrides.taskGranularity !== void 0 && overrides.taskGranularity !== "auto") {
    next.taskGranularity = overrides.taskGranularity;
    next.reasons = [
      ...next.reasons,
      `explicit task-granularity=${overrides.taskGranularity}`
    ];
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
function classifyAutoPolicy(input) {
  const goal = normalizeWords(input.goal);
  const flags = parseFlags(input.flags);
  const changedFiles = input.changedFiles ?? [];
  const estimatedFiles = typeof input.estimatedFiles === "number" && Number.isFinite(input.estimatedFiles) ? Math.max(0, Math.floor(input.estimatedFiles)) : changedFiles.length;
  const fileCount = Math.max(estimatedFiles, changedFiles.length);
  const dirCount = countDistinctDirs(changedFiles);
  const riskResult = classifyRisk(goal, changedFiles, fileCount);
  const modeResult = classifyExecutionMode({
    goal,
    risk: riskResult.risk,
    fileCount,
    dirCount,
    taskCount: input.taskCount,
    mode: flags.mode
  });
  const base = policyForExecutionMode(modeResult.executionMode);
  const taskCount = input.taskCount;
  const shouldSplitSpec = modeResult.executionMode === "epic-triage" || typeof taskCount === "number" && taskCount > base.taskTargetRange.max;
  return applyOverrides(
    {
      version: 2,
      mode: flags.mode,
      risk: riskResult.risk,
      executionMode: modeResult.executionMode,
      shouldSplitSpec,
      reasons: [...riskResult.reasons, ...modeResult.reasons],
      ...base
    },
    flags
  );
}
function parseList(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main() {
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
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(policy, null, 2) + "\n");
}
function isDirectRun() {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename4(entry).startsWith("auto-policy.");
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  main();
}

// src/hooks/lib/project-topology.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync3,
  readdirSync as readdirSync3,
  statSync as statSync3
} from "node:fs";
import { homedir as homedir2 } from "node:os";
import path2, { basename as basename5, isAbsolute as isAbsolute2, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var FRONTEND_KEY_RE = /^(frontend|front-end|web|ui|client|admin|前端)$/i;
var BACKEND_KEY_RE = /^(backend|back-end|api|server|service|后端)$/i;
var SHARED_KEY_RE = /^(shared|common|contracts?|types?|sdk|共享|协议)$/i;
var INFRA_KEY_RE = /^(infra|infrastructure|deploy|ops|devops|docker|k8s)$/i;
var MOBILE_KEY_RE = /^(mobile|ios|android|app)$/i;
var DATABASE_KEY_RE = /^(database|db|mysql|postgres|postgresql|redis|mongo|数据库)$/i;
var UI_GOAL_RE = /\b(ui|ux|frontend|front-end|react|vue|vite|next|nuxt|page|screen|component|button|form|css|style|layout|页面|前端|组件|样式)\b/i;
var BACKEND_GOAL_RE = /\b(backend|back-end|api|endpoint|controller|service|spring|spring boot|spring cloud|dto|entity|repository|database|db|migration|接口|后端|数据库)\b/i;
var CONTRACT_GOAL_RE = /\b(contract|openapi|swagger|api response|dto|schema|client generation|接口字段|接口返回|契约)\b/i;
var AUTH_GOAL_RE = /\b(auth|login|logout|session|permission|oauth|jwt|登录|鉴权|权限)\b/i;
function isDir2(p) {
  try {
    return statSync3(p).isDirectory();
  } catch {
    return false;
  }
}
function isFile(p) {
  try {
    return statSync3(p).isFile();
  } catch {
    return false;
  }
}
function readText(file) {
  try {
    return readFileSync3(file, "utf8");
  } catch {
    return "";
  }
}
function meaningfulProjectEntries(projectRoot) {
  try {
    return readdirSync3(projectRoot).filter((name) => {
      if (name === ".git" || name === ".hg" || name === ".svn") return false;
      if (name === ".DS_Store" || name === "Thumbs.db") return false;
      if (name === ".claude" || name === ".curdx") return false;
      if (name === "specs") return false;
      return true;
    });
  } catch {
    return [];
  }
}
function normalizeSerializedPath(input) {
  const trimmed = input.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed || trimmed === "./") return ".";
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
}
function toPosixPath(p) {
  return p.split(path2.sep).join("/");
}
function relativeOrDot(from, to) {
  const rel = toPosixPath(relative(from, to));
  return rel.length === 0 ? "." : rel;
}
function roleFromKey(key) {
  const normalized = key.trim().toLowerCase();
  if (FRONTEND_KEY_RE.test(normalized)) return "frontend";
  if (BACKEND_KEY_RE.test(normalized)) return "backend";
  if (SHARED_KEY_RE.test(normalized)) return "shared";
  if (INFRA_KEY_RE.test(normalized)) return "infra";
  if (MOBILE_KEY_RE.test(normalized)) return "mobile";
  if (DATABASE_KEY_RE.test(normalized)) return "database";
  return "auto";
}
function rootNameFromRole(role, fallbackPath) {
  if (role !== "auto" && role !== "unknown") return role;
  const base = basename5(fallbackPath);
  return base === "." || base === ".." || base.length === 0 ? "current" : base;
}
function extractFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  return match?.[1] ?? raw;
}
function cleanScalar(value) {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "").trim();
}
function parseCodeRootsFromCurdxSettings(projectRoot) {
  const settingsPath = path2.join(projectRoot, ".claude", "curdx-flow.local.md");
  if (!isFile(settingsPath)) return [];
  const block = extractFrontmatter(readText(settingsPath));
  const lines = block.split(/\r?\n/);
  const roots = [];
  let inCodeRoots = false;
  let current;
  function flush() {
    if (!current?.path) return;
    const role = current.role ?? "auto";
    roots.push({
      name: current.name ?? rootNameFromRole(role, current.path),
      path: normalizeSerializedPath(current.path),
      role,
      source: "curdx-settings",
      confidence: 0.99
    });
    current = void 0;
  }
  for (const line of lines) {
    if (/^\s*code_roots\s*:/.test(line)) {
      inCodeRoots = true;
      continue;
    }
    if (!inCodeRoots) continue;
    if (/^\S/.test(line) && !/^\s*-/.test(line)) {
      flush();
      break;
    }
    const itemMatch = line.match(/^\s*-\s*(.*)$/);
    if (itemMatch) {
      flush();
      current = {};
      const inline = itemMatch[1]?.trim() ?? "";
      const inlineMatch = inline.match(/^(\w+)\s*:\s*(.+)$/);
      if (inlineMatch?.[1] && inlineMatch[2]) {
        const key2 = inlineMatch[1];
        const value2 = cleanScalar(inlineMatch[2]);
        if (key2 === "name") current.name = value2;
        if (key2 === "path") current.path = value2;
        if (key2 === "role" || key2 === "kind") {
          current.role = roleFromKey(value2);
        }
      }
      continue;
    }
    const propMatch = line.match(/^\s+(name|path|role|kind)\s*:\s*(.+)$/);
    if (!propMatch?.[1] || propMatch[2] === void 0) continue;
    current ??= {};
    const key = propMatch[1];
    const value = cleanScalar(propMatch[2]);
    if (key === "name") current.name = value;
    if (key === "path") current.path = value;
    if (key === "role" || key === "kind") current.role = roleFromKey(value);
  }
  flush();
  return roots.filter((r) => r.role !== "database");
}
function claudeMdCandidates(projectRoot) {
  return [
    path2.join(projectRoot, "CLAUDE.md"),
    path2.join(projectRoot, ".claude", "CLAUDE.md"),
    path2.join(projectRoot, "CLAUDE.local.md")
  ];
}
function extractDevBlocks(raw) {
  const lines = raw.split(/\r?\n/);
  const blocks = [];
  let activeLevel = 0;
  let current = [];
  function flush() {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  for (const line of lines) {
    const header = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (header?.[1] && header[2]) {
      const level = header[1].length;
      const title = header[2].trim().toLowerCase();
      if (activeLevel > 0 && level <= activeLevel) {
        flush();
        activeLevel = 0;
      }
      if (/\b(dev|development|local services|local development)\b/i.test(title) || /(开发|本地开发|开发环境)/.test(title)) {
        activeLevel = level;
        current = [];
      }
      continue;
    }
    if (activeLevel > 0) current.push(line);
  }
  flush();
  return blocks;
}
function parseRootsFromDevText(text) {
  const roots = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,40})\s*[:：]\s*(.+?)\s*$/
    );
    if (!match?.[1] || match[2] === void 0) continue;
    const key = match[1].trim();
    const role = roleFromKey(key);
    if (role === "database" || role === "unknown") continue;
    const value = normalizeSerializedPath(match[2].split(/\s+/)[0] ?? "");
    if (!value || value.includes("://") || value.startsWith("$")) continue;
    roots.push({
      name: rootNameFromRole(role, value),
      path: value,
      role,
      source: "claude-md",
      confidence: 0.95
    });
  }
  return roots;
}
function parseRootsFromClaudeMd(projectRoot) {
  const roots = [];
  const warnings = [];
  let devContextFound = false;
  for (const file of claudeMdCandidates(projectRoot)) {
    if (!isFile(file)) continue;
    const raw = readText(file);
    const blocks = extractDevBlocks(raw);
    if (blocks.length === 0) continue;
    devContextFound = true;
    for (const block of blocks) {
      roots.push(...parseRootsFromDevText(block));
      if (/(password|passwd|token|secret|jdbc:|mysql:\/\/|postgres:\/\/|mongodb:\/\/|redis:\/\/)/i.test(block)) {
        warnings.push(
          "Dev context mentions database or sensitive-looking values; topology output stores only paths and omits credentials."
        );
      }
    }
  }
  return { roots, devContextFound, warnings };
}
function readJsonObject(file) {
  try {
    const parsed = JSON.parse(readFileSync3(file, "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function stringRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
function hasDep(pkg, name) {
  if (!pkg) return false;
  const deps = {
    ...stringRecord(pkg["dependencies"]),
    ...stringRecord(pkg["devDependencies"]),
    ...stringRecord(pkg["peerDependencies"])
  };
  return Object.prototype.hasOwnProperty.call(deps, name);
}
function hasAnyDep(pkg, names) {
  return names.some((name) => hasDep(pkg, name));
}
function detectPackageManager(rootAbs) {
  if (isFile(path2.join(rootAbs, "pnpm-lock.yaml")) || isFile(path2.join(rootAbs, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (isFile(path2.join(rootAbs, "bun.lockb")) || isFile(path2.join(rootAbs, "bun.lock"))) return "bun";
  if (isFile(path2.join(rootAbs, "yarn.lock"))) return "yarn";
  if (isFile(path2.join(rootAbs, "package-lock.json"))) return "npm";
  if (isFile(path2.join(rootAbs, "pom.xml"))) return "maven";
  if (isFile(path2.join(rootAbs, "build.gradle")) || isFile(path2.join(rootAbs, "build.gradle.kts"))) return "gradle";
  return void 0;
}
function hasManifestOrSource(rootAbs) {
  return [
    "index.html",
    "package.json",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "go.mod",
    "pyproject.toml",
    "Cargo.toml",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "src",
    "app",
    "packages"
  ].some((entry) => existsSync2(path2.join(rootAbs, entry)));
}
function pushUnique(items, item) {
  if (!items.includes(item)) items.push(item);
}
function classifyRoot(rootAbs, role) {
  const kinds = [];
  const frameworks = [];
  const pkg = readJsonObject(path2.join(rootAbs, "package.json"));
  const pom = readText(path2.join(rootAbs, "pom.xml"));
  const gradle = [
    readText(path2.join(rootAbs, "build.gradle")),
    readText(path2.join(rootAbs, "build.gradle.kts"))
  ].join("\n");
  const buildText = `${pom}
${gradle}`;
  if (isFile(path2.join(rootAbs, "index.html")) && (isFile(path2.join(rootAbs, "app.js")) || isFile(path2.join(rootAbs, "styles.css")))) {
    pushUnique(kinds, "frontend-app");
    frameworks.push("static-html");
  }
  if (isFile(path2.join(rootAbs, ".claude-plugin", "plugin.json"))) {
    pushUnique(kinds, "claude-code-plugin");
    frameworks.push("claude-code-plugin");
  }
  if (pkg) {
    if (hasDep(pkg, "react") || hasDep(pkg, "next")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "next") ? "next" : "react");
    }
    if (hasDep(pkg, "vue") || hasDep(pkg, "nuxt")) {
      pushUnique(kinds, "frontend-app");
      frameworks.push(hasDep(pkg, "nuxt") ? "nuxt" : "vue");
    }
    if (hasDep(pkg, "vite") || isFile(path2.join(rootAbs, "vite.config.ts")) || isFile(path2.join(rootAbs, "vite.config.js"))) {
      pushUnique(kinds, "frontend-app");
      if (!frameworks.includes("vite")) frameworks.push("vite");
    }
    if (hasAnyDep(pkg, ["express", "fastify", "koa", "@nestjs/core", "hono"])) {
      pushUnique(kinds, "backend-service");
      if (hasDep(pkg, "@nestjs/core")) frameworks.push("nestjs");
      else if (hasDep(pkg, "fastify")) frameworks.push("fastify");
      else if (hasDep(pkg, "hono")) frameworks.push("hono");
      else frameworks.push("node-api");
    }
    if (typeof pkg["bin"] === "string" || pkg["bin"] && typeof pkg["bin"] === "object") {
      pushUnique(kinds, "cli");
    }
    if (role === "shared") pushUnique(kinds, "shared-library");
  }
  if (/spring-boot-starter/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-boot");
  }
  if (/spring-cloud/i.test(buildText)) {
    pushUnique(kinds, "backend-service");
    frameworks.push("spring-cloud");
  }
  if (isDir2(path2.join(rootAbs, "src", "main", "java"))) {
    pushUnique(kinds, "backend-service");
    if (!frameworks.includes("java")) frameworks.push("java");
  }
  if (isFile(path2.join(rootAbs, "go.mod"))) {
    pushUnique(kinds, "backend-service");
    frameworks.push("go");
  }
  if (isFile(path2.join(rootAbs, "pyproject.toml"))) {
    const pyproject = readText(path2.join(rootAbs, "pyproject.toml"));
    if (/(fastapi|django|flask)/i.test(pyproject)) {
      pushUnique(kinds, "backend-service");
      frameworks.push(/fastapi/i.test(pyproject) ? "fastapi" : /django/i.test(pyproject) ? "django" : "flask");
    }
  }
  if (isFile(path2.join(rootAbs, "Dockerfile")) || isFile(path2.join(rootAbs, "docker-compose.yml")) || isFile(path2.join(rootAbs, "docker-compose.yaml"))) {
    pushUnique(kinds, "infra");
  }
  if (role === "frontend") pushUnique(kinds, "frontend-app");
  if (role === "backend") pushUnique(kinds, "backend-service");
  if (role === "plugin") pushUnique(kinds, "claude-code-plugin");
  if (role === "infra") pushUnique(kinds, "infra");
  if (role === "mobile") pushUnique(kinds, "mobile-app");
  if (kinds.length === 0) kinds.push("unknown");
  return {
    kinds,
    frameworks: [...new Set(frameworks)],
    packageManager: detectPackageManager(rootAbs)
  };
}
function settingsAdditionalDirectories(projectRoot) {
  const entries = [];
  const candidates = [
    { file: path2.join(projectRoot, ".claude", "settings.json"), base: projectRoot },
    { file: path2.join(projectRoot, ".claude", "settings.local.json"), base: projectRoot },
    { file: path2.join(homedir2(), ".claude", "settings.json"), base: path2.join(homedir2(), ".claude") }
  ];
  for (const candidate of candidates) {
    const parsed = readJsonObject(candidate.file);
    const dirs = parsed?.["additionalDirectories"];
    if (!Array.isArray(dirs)) continue;
    for (const dir of dirs) {
      if (typeof dir !== "string" || dir.trim().length === 0) continue;
      entries.push(isAbsolute2(dir) ? resolve2(dir) : resolve2(candidate.base, dir));
    }
  }
  return [...new Set(entries)];
}
function containsPath(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !isAbsolute2(rel);
}
function rootAccess(rootAbs, cwd, additionalDirs) {
  if (!existsSync2(rootAbs)) return "missing-path";
  if (containsPath(cwd, rootAbs)) return "inside-working-directory";
  if (additionalDirs.some((dir) => containsPath(dir, rootAbs))) {
    return "configured-additional-directory";
  }
  return "outside-working-directory";
}
function addOrMergeRoot(map, root, projectRoot) {
  const abs = isAbsolute2(root.path) ? resolve2(root.path) : resolve2(projectRoot, root.path);
  const key = abs;
  const existing = map.get(key);
  if (!existing || root.confidence > existing.confidence) {
    map.set(key, root);
  }
}
function siblingCandidates(projectRoot) {
  const currentBase = basename5(projectRoot).toLowerCase();
  const parent = resolve2(projectRoot, "..");
  if (!isDir2(parent)) return [];
  const currentLooksBackend = /^(backend|api|server|service|services)$/.test(currentBase);
  const currentLooksFrontend = /^(frontend|web|ui|client|admin)$/.test(currentBase);
  if (!currentLooksBackend && !currentLooksFrontend) return [];
  const names = readdirSync3(parent).slice(0, 80);
  const out = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const abs = path2.join(parent, name);
    if (abs === projectRoot || !isDir2(abs)) continue;
    const lower = name.toLowerCase();
    if (currentLooksBackend && /^(frontend|web|ui|client|admin)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "frontend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
    if (currentLooksFrontend && /^(backend|api|server|service)$/.test(lower)) {
      out.push({
        name: lower,
        path: relativeOrDot(projectRoot, abs),
        role: "backend",
        source: "sibling-scan",
        confidence: 0.72
      });
    }
  }
  return out;
}
function detectWorkspaceState(projectRoot, roots) {
  const meaningfulEntries = meaningfulProjectEntries(projectRoot);
  if (meaningfulEntries.length === 0) return "empty";
  const accessibleRoots = roots.filter((root) => root.access !== "missing-path");
  const hasFrontend = accessibleRoots.some(
    (root) => root.role === "frontend" || root.kinds.includes("frontend-app")
  );
  const hasBackend = accessibleRoots.some(
    (root) => root.role === "backend" || root.kinds.includes("backend-service")
  );
  const hasMultipleRoots = new Set(accessibleRoots.map((root) => root.path)).size > 1;
  if (hasMultipleRoots && hasFrontend && hasBackend) return "split-repo";
  const current = accessibleRoots.find((root) => root.path === ".");
  const currentAbs = projectRoot;
  const currentKnown = current !== void 0 && current.kinds.some((kind) => kind !== "unknown" && kind !== "infra");
  if (currentKnown || hasManifestOrSource(currentAbs)) return "existing";
  return "scaffolded";
}
function discoverRawRoots(projectRoot) {
  const fromClaude = parseRootsFromClaudeMd(projectRoot);
  const map = /* @__PURE__ */ new Map();
  addOrMergeRoot(map, {
    name: "current",
    path: ".",
    role: "auto",
    source: "cwd",
    confidence: 0.5
  }, projectRoot);
  for (const root of parseCodeRootsFromCurdxSettings(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  for (const root of fromClaude.roots) addOrMergeRoot(map, root, projectRoot);
  for (const root of siblingCandidates(projectRoot)) addOrMergeRoot(map, root, projectRoot);
  return {
    roots: [...map.values()],
    devContextFound: fromClaude.devContextFound,
    warnings: fromClaude.warnings
  };
}
function buildAccessFix(missingRoots) {
  const addDirs = missingRoots.filter((root) => root.access === "outside-working-directory").map((root) => `/add-dir ${root.path}`);
  const missingPaths = missingRoots.filter((root) => root.access === "missing-path").map((root) => `Path not found: ${root.path}`);
  const lines = [...addDirs, ...missingPaths];
  return lines.length > 0 ? lines.join("\n") : void 0;
}
function rootMatches(root, role) {
  if (root.role === role) return true;
  if (role === "frontend") return root.kinds.includes("frontend-app");
  if (role === "backend") return root.kinds.includes("backend-service");
  if (role === "shared") return root.kinds.includes("shared-library");
  return root.kinds.includes("claude-code-plugin");
}
function inferRequiredRoots(goal, roots) {
  const text = (goal ?? "").trim();
  if (text.length === 0) return [];
  const required = /* @__PURE__ */ new Map();
  const frontendRoots = roots.filter((root) => rootMatches(root, "frontend"));
  const backendRoots = roots.filter((root) => rootMatches(root, "backend"));
  const sharedRoots = roots.filter((root) => rootMatches(root, "shared"));
  function add(root, reason) {
    required.set(root.name, {
      name: root.name,
      path: root.path,
      reason,
      access: root.access
    });
  }
  if (UI_GOAL_RE.test(text)) {
    for (const root of frontendRoots) add(root, "goal mentions UI/frontend behavior");
  }
  if (BACKEND_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "goal mentions backend/API behavior");
  }
  if (CONTRACT_GOAL_RE.test(text)) {
    for (const root of backendRoots) add(root, "API contract work needs backend source");
    for (const root of frontendRoots) add(root, "API contract work needs consuming frontend source");
    for (const root of sharedRoots) add(root, "API contract work may use shared contracts");
  }
  if (AUTH_GOAL_RE.test(text) && frontendRoots.length > 0 && backendRoots.length > 0) {
    for (const root of backendRoots) add(root, "auth flow spans backend behavior");
    for (const root of frontendRoots) add(root, "auth flow spans frontend behavior");
  }
  return [...required.values()];
}
function discoverProjectTopology(options = {}) {
  const cwd = resolve2(options.cwd ?? process.cwd());
  const projectRoot = findRepoRoot(cwd);
  const additionalDirs = settingsAdditionalDirectories(projectRoot);
  const raw = discoverRawRoots(projectRoot);
  const roots = [];
  for (const root of raw.roots) {
    const rootAbs = isAbsolute2(root.path) ? resolve2(root.path) : resolve2(projectRoot, root.path);
    const classified = classifyRoot(rootAbs, root.role);
    roots.push({
      name: root.name,
      path: normalizeSerializedPath(root.path),
      role: root.role,
      kinds: classified.kinds,
      frameworks: classified.frameworks,
      ...classified.packageManager ? { packageManager: classified.packageManager } : {},
      access: rootAccess(rootAbs, cwd, additionalDirs),
      source: root.source,
      confidence: root.confidence
    });
  }
  const requiredRoots = inferRequiredRoots(options.goal, roots);
  const missingRoots = requiredRoots.filter(
    (root) => root.access === "outside-working-directory" || root.access === "missing-path"
  );
  const workspaceState = detectWorkspaceState(projectRoot, roots);
  return {
    version: 1,
    cwd,
    projectRoot,
    workspaceState,
    devContextFound: raw.devContextFound,
    roots,
    requiredRoots,
    missingRoots,
    ...missingRoots.length > 0 ? { accessFix: buildAccessFix(missingRoots) } : {},
    warnings: [...new Set(raw.warnings)]
  };
}
function renderContextMap(topology) {
  const lines = [
    "# Project Context Map",
    "",
    `Project root: ${topology.projectRoot}`,
    `Workspace state: ${topology.workspaceState}`,
    `Dev context found: ${topology.devContextFound ? "yes" : "no"}`,
    "",
    "## Code Roots",
    ""
  ];
  for (const root of topology.roots) {
    const frameworks = root.frameworks.length > 0 ? `; frameworks: ${root.frameworks.join(", ")}` : "";
    const packageManager = root.packageManager ? `; package manager: ${root.packageManager}` : "";
    lines.push(
      `- ${root.name}: ${root.path} (${root.role}; ${root.kinds.join(", ")}; ${root.access}${frameworks}${packageManager})`
    );
  }
  if (topology.requiredRoots.length > 0) {
    lines.push("", "## Required For Current Goal", "");
    for (const root of topology.requiredRoots) {
      lines.push(`- ${root.name}: ${root.reason}; access: ${root.access}`);
    }
  }
  if (topology.missingRoots.length > 0) {
    lines.push("", "## Access Fix", "", topology.accessFix ?? "");
  }
  if (topology.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of topology.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}
`;
}
function readArg2(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main2() {
  const argv = process.argv.slice(2);
  const cwd = readArg2("--cwd", argv);
  const goal = readArg2("--goal", argv);
  const format = readArg2("--format", argv) ?? "json";
  const topology = discoverProjectTopology({ cwd, goal });
  if (format === "context-map") {
    process.stdout.write(renderContextMap(topology));
    return;
  }
  process.stdout.write(JSON.stringify(topology, null, 2) + "\n");
}
function isDirectRun2() {
  try {
    const entry = fileURLToPath2(import.meta.url);
    return process.argv[1] === entry && basename5(entry).startsWith("project-topology.");
  } catch {
    return false;
  }
}
if (isDirectRun2()) {
  main2();
}

// src/hooks/lib/tool-capabilities.ts
import { basename as basename6 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/core/capabilities/tokens.ts
var KNOWN_CAPABILITY_TOKEN_PATTERN = String.raw`\b(?:claude-mem|context7|sequential-thinking|chrome-devtools-mcp|chrome devtools mcp|ui[\s_-]*ux[\s_-]*(?:pro[\s_-]*)?max|pua)\b`;
function knownCapabilityTokenRegex() {
  return new RegExp(KNOWN_CAPABILITY_TOKEN_PATTERN, "gi");
}

// src/hooks/lib/capability-normalization.ts
function stripKnownCapabilityTokens(input) {
  return (input ?? "").replace(knownCapabilityTokenRegex(), " ");
}

// src/core/capabilities/catalog.ts
var CURDX_TOOL_CAPABILITIES = {
  "context7": {
    id: "context7",
    name: "Context7",
    type: "mcp",
    ownedBy: "context7",
    provisioning: "external-mcp",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Context7 MCP",
    summary: "current docs for libraries, SDKs, APIs, and frameworks",
    useWhen: "use the Context7 MCP before implementation when external library, SDK, API, or framework behavior matters.",
    skipWhen: "Skip for pure local logic, typos, and code paths fully understood from this repository.",
    missingAction: "Enable the external context7 MCP server from your setup script or configure https://mcp.context7.com/mcp."
  },
  "claude-mem": {
    id: "claude-mem",
    name: "claude-mem",
    type: "plugin",
    ownedBy: "claude-mem",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/claude-mem:mem-search",
    summary: "cross-session memory search and phased plan/execution commands",
    useWhen: "Use /claude-mem:mem-search when similar work, prior decisions, or repeated failures may exist; use /claude-mem:make-plan only for genuinely phased work.",
    skipWhen: "Skip when the task is new, obvious, and smaller than a short local edit.",
    missingAction: "Install/enable claude-mem from the thedotmack marketplace dependency."
  },
  "sequential-thinking": {
    id: "sequential-thinking",
    name: "sequential-thinking",
    type: "mcp",
    ownedBy: "sequential-thinking",
    provisioning: "external-mcp",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "sequential-thinking MCP",
    summary: "structured hypothesis breakdown for hard architecture and debugging problems",
    useWhen: "Use for architecture tradeoffs, migrations, security/data/release risk, or debugging where assumptions may change.",
    skipWhen: "Skip for direct edits, simple lookups, and deterministic fixes.",
    missingAction: "Enable the external sequential-thinking MCP server from your setup script."
  },
  "chrome-devtools-mcp": {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    type: "plugin",
    ownedBy: "chrome-devtools-mcp",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend", "gate"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "Chrome DevTools MCP",
    summary: "real browser console, network, DOM, performance, and screenshot/snapshot verification",
    useWhen: "Use for browser runtime behavior, UI regressions, DOM/CSS issues, network failures, and frontend verification.",
    skipWhen: "Skip for backend-only code with no browser-facing behavior.",
    missingAction: "Install/enable chrome-devtools-mcp and make sure Chrome is installed."
  },
  "ui-ux-pro-max": {
    id: "ui-ux-pro-max",
    name: "ui-ux-pro-max",
    type: "plugin",
    ownedBy: "ui-ux-pro-max",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "ui-ux-pro-max plugin skills",
    summary: "frontend UX/design guidance for UI pages, components, and interaction polish",
    useWhen: "Use when building or changing visible UI, interaction design, frontend layout, or visual quality.",
    skipWhen: "Skip for backend-only changes, copy-only edits, and internal CLI/library work.",
    missingAction: "Install/enable ui-ux-pro-max from the ui-ux-pro-max-skill marketplace dependency."
  },
  "pua": {
    id: "pua",
    name: "pua",
    type: "plugin",
    ownedBy: "pua",
    provisioning: "plugin-dependency",
    curdxRole: ["recommend"],
    doNotReimplement: true,
    expectedByDefault: true,
    invocation: "/pua:pua-loop or /pua:p9",
    summary: "structured retries and parallel task decomposition",
    useWhen: "Use after multiple failed attempts or for truly independent parallel work slices.",
    skipWhen: "Skip on first-attempt failures, known fixes, and work that is sequential by dependency.",
    missingAction: "Install/enable pua from the pua-skills marketplace dependency."
  },
  "docs-query": {
    id: "docs-query",
    name: "Docs query",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Context7 or official docs",
    summary: "phase-specific grounding against current documentation",
    useWhen: "Use before implementation when quality gates mark docs as required.",
    skipWhen: "Skip when local code fully defines the behavior and no external API/version matters."
  },
  "browser-verification": {
    id: "browser-verification",
    name: "Browser verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "Playwright or Chrome DevTools MCP",
    summary: "repeatable browser/runtime proof for UI and full-stack behavior",
    useWhen: "Use when browser-facing quality gates are required or suggested.",
    skipWhen: "Skip for backend-only and CLI-only work."
  },
  "tdd-cycle": {
    id: "tdd-cycle",
    name: "TDD cycle",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "RED/GREEN/VERIFY loop",
    summary: "test-first implementation for behavior changes",
    useWhen: "Use when route/risk indicates implementation should be protected by a regression test.",
    skipWhen: "Skip for docs-only edits and pure mechanical metadata updates."
  },
  "security-review": {
    id: "security-review",
    name: "Security review",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "read-only security review",
    summary: "focused review of auth, secrets, injection, release, and dependency risk",
    useWhen: "Use when quality gates indicate auth/security/release risk.",
    skipWhen: "Skip for isolated copy edits with no executable behavior."
  },
  "stack-specific-verification": {
    id: "stack-specific-verification",
    name: "Stack-specific verification",
    type: "workflow",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["gate", "record-evidence"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route qualityGates",
    summary: "run the verifier that matches the detected stack profile",
    useWhen: "Use before completion whenever smart-route returns a suggestedVerifier.",
    skipWhen: "Skip only when no stack profile is detected and no repo verifier exists."
  },
  "context-budget": {
    id: "context-budget",
    name: "Context budget",
    type: "policy",
    ownedBy: "curdx-flow",
    provisioning: "workflow",
    curdxRole: ["route", "compile-brief"],
    doNotReimplement: false,
    expectedByDefault: true,
    invocation: "curdx-flow route contextBudget",
    summary: "limit reference loading by route and stack confidence",
    useWhen: "Use for every non-trivial route to keep the session focused.",
    skipWhen: "Skip only for no-op direct changes."
  }
};
var CURDX_TOOL_CAPABILITY_ORDER = [
  "context7",
  "docs-query",
  "claude-mem",
  "ui-ux-pro-max",
  "chrome-devtools-mcp",
  "browser-verification",
  "tdd-cycle",
  "security-review",
  "stack-specific-verification",
  "context-budget",
  "sequential-thinking",
  "pua"
];

// src/hooks/lib/tool-capabilities.ts
var CAPABILITIES = CURDX_TOOL_CAPABILITIES;
var ORDER = [...CURDX_TOOL_CAPABILITY_ORDER];
var EXTERNAL_DOCS_RE = /\b(api|sdk|library|libraries|framework|version|upgrade|dependency|dependencies|official docs?|latest docs?|claude code|plugin|mcp|hook|hooks|skill|skills|agent|agents|scaffold|starter|template|generator|initializer|initializr|react|vue|spring|spring boot|spring cloud|next\.?js|vite|webpack|node|go|python|rust|cargo|maven|gradle|cookiecutter)\b|最新|依赖|框架|插件|官方|联网|搜索|文档|脚手架|初始化|生成器|模板/i;
var MEMORY_RE = /\b(previous|before|again|remember|memory|history|similar|repeated|regression|already solved|same bug|past decision)\b|之前|上次|记得|历史|做过|又|重复|老问题/i;
var UI_RE = /\b(ui|ux|frontend|front-end|browser|chrome|dom|css|html|layout|component|page|form|modal|responsive|visual|render|react|vue|vite|next\.?js|screenshot|interaction)\b|前端|页面|浏览器|样式|交互|组件|布局|视觉|截图/i;
var BROWSER_VERIFY_RE = /\b(browser|chrome|dom|css|network|console|performance|render|screenshot|e2e|playwright|visual regression|interaction)\b|浏览器|控制台|网络|性能|渲染|截图|端到端/i;
var COMPLEX_RE = /\b(architecture|architect|migration|migrate|security|auth|authentication|authorization|permission|oauth|payment|billing|database|schema|release|publish|tag|hook|subagent|multi[- ]?repo|monorepo|cross[- ]?system|concurrency|race|cache|rewrite|refactor)\b|架构|迁移|安全|权限|认证|数据库|发布|重写|并发|跨仓库|多仓库/i;
var STUCK_RE = /\b(stuck|failed|failure|fails|flaky|retry|debug|investigate|root cause|not working|broken|regression)\b|卡住|失败|报错|不行|修不好|定位|排查/i;
var REPEATED_FAILURE_RE = /\b(repeated|multiple failed|failed twice|failed 2|again failed|keeps failing|stuck again)\b|连续失败|多次失败|失败两次|又失败|反复失败|一直失败/i;
var PARALLEL_RE = /\b(parallel|multi-agent|team|decompose|split|epic|multiple subsystems|large refactor)\b|并行|多智能体|拆分|史诗|多模块/i;
var LOW_RISK_LOCAL_RE = /\b(typo|readme|docs?|comment|comments|copy|wording|rename label|format text)\b|错别字|注释|文案/i;
function normalize(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasAny(values, candidates) {
  const set = new Set((values ?? []).map((v) => v.toLowerCase()));
  return candidates.some((candidate) => set.has(candidate.toLowerCase()));
}
function capabilityAvailability(id, available) {
  const cap = CAPABILITIES[id];
  if (cap.type === "workflow" || cap.type === "policy") {
    return { availability: "known-available", availabilityState: "workflow" };
  }
  const expectedAvailability = cap.provisioning === "external-mcp" ? "external-expected" : "plugin-dependency";
  if (available === null) {
    return {
      availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
      availabilityState: cap.expectedByDefault ? "expected" : "missing"
    };
  }
  if (available.has(id)) {
    return { availability: "known-available", availabilityState: "available" };
  }
  return {
    availability: cap.expectedByDefault ? expectedAvailability : "check-if-installed",
    availabilityState: "missing"
  };
}
function pushRecommendation(out, available, id, phase, reason, instruction, extra = {}) {
  const availability = capabilityAvailability(id, available);
  if (out.some((rec2) => rec2.id === id)) return;
  const cap = CAPABILITIES[id];
  out.push({
    id,
    name: cap.name,
    type: cap.type,
    invocation: cap.invocation,
    phase,
    ...extra,
    availability: availability.availability,
    availabilityState: availability.availabilityState,
    ownedBy: cap.ownedBy,
    provisioning: cap.provisioning,
    curdxRole: cap.curdxRole,
    doNotReimplement: cap.doNotReimplement,
    expectedByDefault: cap.expectedByDefault,
    ...availability.availabilityState === "missing" && cap.missingAction ? { missingAction: cap.missingAction } : {},
    reason,
    instruction,
    triggerReason: reason,
    requiredWhen: cap.curdxRole.includes("gate") ? "Required when this route reaches its matching quality gate." : "Use when the coordinator is in the matching phase and the task context still fits this reason.",
    fallbackWhenMissing: cap.missingAction ?? (cap.doNotReimplement ? "Do not rebuild this capability inside curdx-flow; continue with the local workflow only if the evidence gate can still be satisfied." : "Use the local curdx-flow workflow path for this capability.")
  });
}
function sortRecommendations(recs) {
  return [...recs].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}
function recommendToolCapabilities(input) {
  const goal = normalize(input.goal);
  const semanticGoal = normalize(stripKnownCapabilityTokens(goal));
  const route = normalize(input.route);
  const risk = normalize(input.risk);
  const topologyKinds2 = input.topologyKinds ?? [];
  const topologyFrameworks2 = input.topologyFrameworks ?? [];
  const stackProfile = input.stackProfile;
  const qualityGates = input.qualityGates ?? [];
  const contextBudget = input.contextBudget;
  const missingRoots = input.missingRoots ?? 0;
  const available = input.availableCapabilities === void 0 ? null : new Set(input.availableCapabilities.filter(Boolean));
  const recs = [];
  if (missingRoots > 0) {
    return recs;
  }
  const externalDocsRelevant = EXTERNAL_DOCS_RE.test(semanticGoal);
  const localLowRisk = LOW_RISK_LOCAL_RE.test(semanticGoal) && route === "direct-change" && !externalDocsRelevant;
  if (localLowRisk) {
    return recs;
  }
  const hasFrontend = UI_RE.test(semanticGoal) || hasAny(topologyKinds2, ["frontend-app"]) || hasAny(topologyFrameworks2, ["react", "vue", "next.js", "vite"]);
  const browserRuntime = BROWSER_VERIFY_RE.test(semanticGoal) || hasFrontend;
  const complex = COMPLEX_RE.test(semanticGoal) && route !== "direct-change" || risk === "high" || risk === "critical" || route === "full-spec" || route === "epic-split";
  const stuck = STUCK_RE.test(semanticGoal);
  const repeatedFailure = REPEATED_FAILURE_RE.test(semanticGoal) || (input.recentFailures ?? 0) >= 2;
  const parallel = PARALLEL_RE.test(semanticGoal) || route === "epic-split";
  const stackIds = stackProfile?.detected.map((stack) => stack.id) ?? [];
  const docsGate = qualityGates.find((gate) => gate.id.endsWith("-docs"));
  const browserGate = qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const tddGate = qualityGates.find((gate) => gate.id.endsWith("-tdd"));
  const securityGate = qualityGates.find((gate) => gate.id.endsWith("-security-review"));
  const baselineGate = qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  if (externalDocsRelevant || docsGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "context7",
      "before-coding",
      docsGate?.reason ?? "external documentation or current API behavior is likely relevant",
      stackProfile?.primary === "claude-code-plugin" ? "Start from official Claude Code docs; use Context7 only for external library/framework docs." : "Use Context7 before editing so version-specific library behavior is grounded in current docs.",
      { category: "docs", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "docs-query",
      "before-coding",
      docsGate?.reason ?? "documentation grounding should happen before implementation",
      "Query official/current docs first, then summarize only the decisions that affect this route.",
      { category: "docs", stackIds }
    );
  }
  if (MEMORY_RE.test(semanticGoal) || stuck || route === "full-spec" || route === "epic-split") {
    pushRecommendation(
      recs,
      available,
      "claude-mem",
      "planning",
      "similar prior work or longer-running plan may exist",
      "Search memory before planning; use make-plan only when the work is genuinely phased.",
      { category: "context", stackIds }
    );
  }
  if (hasFrontend) {
    pushRecommendation(
      recs,
      available,
      "ui-ux-pro-max",
      "implementation",
      "visible frontend behavior or UI quality is in scope",
      "Use ui-ux-pro-max guidance for UI structure, interaction, responsive behavior, and visual polish when the work needs deeper UI/UX critique.",
      { category: "verification", stackIds }
    );
  }
  if (browserRuntime || browserGate !== void 0) {
    pushRecommendation(
      recs,
      available,
      "chrome-devtools-mcp",
      "verification",
      browserGate?.reason ?? "browser runtime behavior should be verified in a real browser",
      "Use Chrome DevTools MCP for console, network, DOM, performance, or visual proof after implementation.",
      { category: "verification", stackIds }
    );
    pushRecommendation(
      recs,
      available,
      "browser-verification",
      "verification",
      browserGate?.reason ?? "browser-facing behavior needs repeatable runtime evidence",
      "Prefer Playwright for repeatable E2E; use Chrome DevTools MCP when high-fidelity runtime inspection is needed.",
      { category: "verification", stackIds }
    );
  }
  if (tddGate?.required === true) {
    pushRecommendation(
      recs,
      available,
      "tdd-cycle",
      "implementation",
      tddGate.reason,
      "Start with a focused failing test or reproduction when behavior is changing; keep the test in the final verifier.",
      { category: "tdd", stackIds }
    );
  }
  if (securityGate !== void 0 || COMPLEX_RE.test(semanticGoal)) {
    pushRecommendation(
      recs,
      available,
      "security-review",
      "verification",
      securityGate?.reason ?? "the task touches a risk surface that benefits from security review",
      "Run a read-only security pass over auth, input validation, secrets, dependencies, and release metadata before completion.",
      { category: "security", stackIds }
    );
  }
  if ((baselineGate !== void 0 || stackProfile?.primary !== "unknown") && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "stack-specific-verification",
      "verification",
      baselineGate?.reason ?? "detected stack should drive the final verifier",
      baselineGate?.command ? `Run the stack verifier: ${baselineGate.command}.` : "Use the repository's documented verifier for the detected stack.",
      { category: "verification", stackIds }
    );
  }
  if (contextBudget !== void 0 && route !== "direct-change") {
    pushRecommendation(
      recs,
      available,
      "context-budget",
      "planning",
      `context budget is ${contextBudget.level}`,
      contextBudget.strategy,
      { category: "context", stackIds }
    );
  }
  if (complex || stuck) {
    pushRecommendation(
      recs,
      available,
      "sequential-thinking",
      "planning",
      "risk or uncertainty requires explicit hypothesis management",
      "Use sequential-thinking to break assumptions before choosing the implementation path.",
      { category: "context", stackIds }
    );
  }
  if (stuck && repeatedFailure || parallel) {
    pushRecommendation(
      recs,
      available,
      "pua",
      stuck ? "recovery" : "planning",
      stuck ? "the goal indicates repeated failure or debugging difficulty" : "large work may contain independent parallel slices",
      stuck ? "Use /pua:pua-loop only after local triage confirms the first fix path is not working." : "Use /pua:p9 only after dependencies prove the slices can run independently.",
      { category: stuck ? "recovery" : "context", stackIds }
    );
  }
  return sortRecommendations(recs);
}
function parseList2(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg3(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function main3() {
  const argv = process.argv.slice(2);
  const recommendations = recommendToolCapabilities({
    goal: readArg3("--goal", argv),
    route: readArg3("--route", argv),
    risk: readArg3("--risk", argv),
    topologyKinds: parseList2(readArg3("--topology-kinds", argv)),
    topologyFrameworks: parseList2(readArg3("--topology-frameworks", argv)),
    missingRoots: Number(readArg3("--missing-roots", argv) ?? 0),
    availableCapabilities: readArg3("--available-capabilities", argv) ? parseList2(readArg3("--available-capabilities", argv)) : void 0
  });
  process.stdout.write(JSON.stringify(recommendations, null, 2) + "\n");
}
function isDirectRun3() {
  try {
    const entry = fileURLToPath3(import.meta.url);
    return process.argv[1] === entry && basename6(entry).startsWith("tool-capabilities.");
  } catch {
    return false;
  }
}
if (isDirectRun3()) {
  main3();
}

// src/hooks/lib/project-brain.ts
import { appendFileSync as appendFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync4, statSync as statSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3, resolve as resolve3 } from "node:path";
var MAX_REASON = 240;
var MAX_COMMAND = 180;
var MAX_SUMMARY = 900;
var MAX_PATH = 400;
var MAX_AGENT_FIELD = 120;
var MAX_BRAIN_BYTES = 64 * 1024;
var MAX_BRAIN_LINES = 400;
function normalizeCwd(cwd) {
  return resolve3(cwd ?? process.cwd());
}
function brainPath(cwd) {
  return join3(normalizeCwd(cwd), ".curdx", "brain.jsonl");
}
function truncate(value, limit) {
  if (value === void 0) return void 0;
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 3))}...`;
}
function normalizeEvent(event) {
  const out = {
    version: 1,
    type: event.type,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (event.route) out.route = event.route;
  if (event.stack) out.stack = event.stack;
  if (event.phase) out.phase = event.phase;
  if (event.command) out.command = truncate(event.command, MAX_COMMAND);
  if (typeof event.exitCode === "number" && Number.isFinite(event.exitCode)) {
    out.exitCode = event.exitCode;
  }
  if (event.verifier) out.verifier = truncate(event.verifier, MAX_COMMAND);
  if (event.reason) out.reason = truncate(event.reason, MAX_REASON);
  if (event.summary) out.summary = truncate(event.summary, MAX_SUMMARY);
  if (typeof event.files === "number" && Number.isFinite(event.files)) {
    out.files = Math.max(0, Math.floor(event.files));
  }
  if (event.sessionId) out.sessionId = truncate(event.sessionId, MAX_AGENT_FIELD);
  if (event.agentId) out.agentId = truncate(event.agentId, MAX_AGENT_FIELD);
  if (event.agentType) out.agentType = truncate(event.agentType, MAX_AGENT_FIELD);
  if (event.parentAgentId) out.parentAgentId = truncate(event.parentAgentId, MAX_AGENT_FIELD);
  if (event.transcriptPath) out.transcriptPath = truncate(event.transcriptPath, MAX_PATH);
  if (event.stopReason) out.stopReason = truncate(event.stopReason, MAX_REASON);
  return out;
}
function appendBrainEvent(cwd, event) {
  const path3 = brainPath(cwd);
  if (process.env.CURDX_FLOW_BRAIN === "off") return { ok: true, path: path3 };
  try {
    mkdirSync3(join3(normalizeCwd(cwd), ".curdx"), { recursive: true });
    appendFileSync2(path3, JSON.stringify(normalizeEvent(event)) + "\n", "utf8");
    compactBrainIfNeeded(path3);
    return { ok: true, path: path3 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: path3, error: message };
  }
}
function compactBrainIfNeeded(path3) {
  try {
    if (statSync4(path3).size <= MAX_BRAIN_BYTES) return;
    const lines = readFileSync4(path3, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-MAX_BRAIN_LINES);
    writeFileSync2(path3, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
  } catch {
  }
}
function parseBrainLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (parsed.version !== 1) return null;
    if (parsed.type !== "route-compiled" && parsed.type !== "edit-batch" && parsed.type !== "verification-run" && parsed.type !== "verification-blocked" && parsed.type !== "last-mile-decision" && parsed.type !== "compact-summary" && parsed.type !== "subagent-started" && parsed.type !== "subagent-stopped") {
      return null;
    }
    if (typeof parsed.timestamp !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
function readBrainEvents(cwd, limit = 100) {
  const path3 = brainPath(cwd);
  if (!existsSync3(path3)) return [];
  try {
    const lines = readFileSync4(path3, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.slice(Math.max(0, lines.length - Math.max(1, limit))).map(parseBrainLine).filter((event) => event !== null);
    return parsed;
  } catch {
    return [];
  }
}
function uniqueRecent(values, limit) {
  const out = [];
  for (const value of values.reverse()) {
    if (!value || out.includes(value)) continue;
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}
function summarizeProjectBrain(cwd) {
  const path3 = brainPath(cwd);
  const events = readBrainEvents(cwd, 200);
  const failures = events.filter((event) => event.type === "verification-blocked" || event.exitCode !== void 0 && event.exitCode !== 0).slice(-5).reverse().map((event) => ({
    timestamp: event.timestamp,
    type: event.type,
    phase: event.phase,
    command: event.command,
    reason: event.reason
  }));
  const verifierHints = uniqueRecent(
    events.filter((event) => event.type === "verification-run" && event.exitCode === 0).map((event) => event.command ?? event.verifier),
    5
  );
  const compactEvent = events.filter((event) => event.type === "compact-summary" && event.summary).at(-1);
  return {
    path: path3,
    exists: existsSync3(path3),
    totalEvents: events.length,
    lastUpdated: events.length > 0 ? events[events.length - 1]?.timestamp ?? null : null,
    stackHints: uniqueRecent(events.map((event) => event.stack), 5),
    verifierHints,
    recentFailures: failures,
    ...compactEvent?.summary ? {
      lastCompactSummary: {
        timestamp: compactEvent.timestamp,
        summary: compactEvent.summary
      }
    } : {}
  };
}

// src/hooks/lib/stack-capabilities.ts
import { existsSync as existsSync4, readFileSync as readFileSync5, readdirSync as readdirSync4 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join4, resolve as resolve4 } from "node:path";
var STACKS = {
  "static-html": {
    id: "static-html",
    name: "Static HTML",
    frameworks: ["static-html"],
    goalPattern: /\b(static html|static frontend|static page|static web|vanilla js|vanilla javascript|plain html|html\/css\/js|index\.html|styles\.css|app\.js)\b|静态页面|原生\s*(js|javascript)/i,
    manifestHints: ["index.html"],
    docsQuery: "MDN documentation for HTML, CSS, DOM events, and browser behavior",
    tdd: "Use small DOM/browser interaction checks for user-visible behavior.",
    security: "Review DOM insertion, event handling, unsafe HTML, and local file serving assumptions.",
    verifierCommands: ["node --check app.js"],
    releaseCommands: ["node --check app.js"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "typescript": {
    id: "typescript",
    name: "TypeScript",
    frameworks: ["typescript"],
    goalPattern: /\b(ts|typescript|typecheck|tsconfig)\b/i,
    manifestHints: ["tsconfig.json", "tsconfig.*.json"],
    docsQuery: "TypeScript official documentation for compiler and project configuration",
    tdd: "Write focused tests first when behavior changes; keep typecheck as a mandatory gate.",
    security: "Review unsafe casts, unchecked external input, and dependency/script changes.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "react": {
    id: "react",
    name: "React",
    frameworks: ["react"],
    goalPattern: /\b(react|jsx|tsx|react component|react hook)\b/i,
    manifestHints: ["package.json:react"],
    docsQuery: "React official documentation for current component and hook behavior",
    tdd: "Prefer component or interaction tests for user-visible behavior.",
    security: "Review XSS, unsafe HTML, auth state leaks, and client-side permission assumptions.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "vue": {
    id: "vue",
    name: "Vue",
    frameworks: ["vue", "vite"],
    goalPattern: /\b(vue|vue3|vite|pinia|vue router|vue component)\b/i,
    manifestHints: ["package.json:vue", "vite.config.*"],
    docsQuery: "Vue and Vite official documentation for current project setup and runtime behavior",
    tdd: "Prefer component or interaction tests; keep vue-tsc/typecheck and build gates.",
    security: "Review template injection, route guards, auth state leaks, and unsafe dynamic HTML.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "next": {
    id: "next",
    name: "Next.js",
    frameworks: ["next"],
    goalPattern: /\b(next\.?js|next|app router|server action|route handler)\b/i,
    manifestHints: ["next.config.*", "package.json:next"],
    docsQuery: "Next.js official documentation for routing, server actions, rendering, and build behavior",
    tdd: "Test server/client boundaries and route handlers before broad UI changes.",
    security: "Review server/client data exposure, auth, cookies, headers, and route handlers.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "node": {
    id: "node",
    name: "Node.js",
    frameworks: ["node-api", "nestjs", "fastify", "hono"],
    goalPattern: /\b(node|api|express|fastify|nestjs|hono|server)\b/i,
    manifestHints: ["package.json"],
    docsQuery: "Node.js and framework official documentation for current API behavior",
    tdd: "Use unit/integration tests around API behavior and error paths.",
    security: "Review input validation, auth, command execution, secrets, and dependency scripts.",
    verifierCommands: ["npm test", "npm run typecheck", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-boot": {
    id: "spring-boot",
    name: "Spring Boot",
    frameworks: ["spring-boot"],
    goalPattern: /\b(spring boot|spring|maven|gradle|controller|service|repository)\b|后端|接口/i,
    manifestHints: ["pom.xml:spring-boot", "build.gradle:spring-boot"],
    docsQuery: "Spring Boot official documentation for current runtime, testing, and actuator behavior",
    tdd: "Use slice or integration tests for controller/service/repository behavior.",
    security: "Review auth filters, authorization, validation, configuration, and secret exposure.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "spring-cloud": {
    id: "spring-cloud",
    name: "Spring Cloud",
    frameworks: ["spring-cloud"],
    goalPattern: /\b(spring cloud|gateway|config server|eureka|openfeign|resilience4j)\b/i,
    manifestHints: ["pom.xml:spring-cloud", "build.gradle:spring-cloud"],
    docsQuery: "Spring Cloud official documentation for current integration, gateway, and config behavior",
    tdd: "Prefer integration tests or contract tests for cross-service behavior.",
    security: "Review gateway filters, service auth, config leakage, and network boundaries.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "standard",
      "full-spec": "expanded",
      "epic-split": "expanded"
    }
  },
  "python": {
    id: "python",
    name: "Python",
    frameworks: ["python", "fastapi", "django", "flask"],
    goalPattern: /\b(python|pytest|fastapi|django|flask|pyproject|ruff)\b/i,
    manifestHints: ["pyproject.toml", "requirements.txt"],
    docsQuery: "Python framework official documentation for current API and testing behavior",
    tdd: "Use pytest around behavior and regression reproduction.",
    security: "Review deserialization, SQL/query construction, auth, secrets, and dependency pinning.",
    verifierCommands: ["pytest", "python -m pytest", "ruff check .", "mypy ."],
    releaseCommands: ["python -m build"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "go": {
    id: "go",
    name: "Go",
    frameworks: ["go"],
    goalPattern: /\b(go|golang|go test|go mod|goroutine|grpc)\b/i,
    manifestHints: ["go.mod"],
    docsQuery: "Go official documentation for current standard library and tooling behavior",
    tdd: "Use table-driven tests and keep go test ./... as the baseline gate.",
    security: "Review context cancellation, goroutine leaks, input validation, auth, and unsafe file/network paths.",
    verifierCommands: ["go test ./...", "go vet ./...", "go build ./..."],
    releaseCommands: ["go test ./..."],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "rust": {
    id: "rust",
    name: "Rust",
    frameworks: ["rust"],
    goalPattern: /\b(rust|cargo|crate|tokio|axum)\b/i,
    manifestHints: ["Cargo.toml"],
    docsQuery: "Rust and crate official documentation for current API and safety behavior",
    tdd: "Use cargo test and focused regression tests before implementation changes.",
    security: "Review unsafe blocks, parsing, auth, IO boundaries, and dependency features.",
    verifierCommands: ["cargo test", "cargo clippy -- -D warnings", "cargo build"],
    releaseCommands: ["cargo test"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  },
  "claude-code-plugin": {
    id: "claude-code-plugin",
    name: "Claude Code plugin",
    frameworks: ["claude-code-plugin"],
    goalPattern: /\b(claude code|plugin|skill|agent|hook|hooks|mcp|marketplace|tag|release)\b/i,
    manifestHints: [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "skills/*/SKILL.md",
      "plugins/*/.claude-plugin/plugin.json",
      "plugins/*/hooks/hooks.json",
      "plugins/*/skills/*/SKILL.md"
    ],
    docsQuery: "Claude Code official docs for plugins, skills, agents, hooks, dependencies, and release tags",
    tdd: "Use focused hook/runner tests and the real Claude Code smoke path before release.",
    security: "Review hook fail-open behavior, plugin metadata, dependency declarations, and release tags.",
    verifierCommands: [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "npm run test:runner",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc"
    ],
    releaseCommands: ["claude plugin validate ./plugins/curdx-flow", "npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded"
    }
  }
};
var STACK_PRIORITY = {
  "claude-code-plugin": 110,
  "next": 100,
  "static-html": 95,
  "react": 90,
  "vue": 90,
  "spring-cloud": 85,
  "spring-boot": 80,
  "go": 75,
  "rust": 75,
  "python": 75,
  "typescript": 30,
  "node": 20
};
var RELEASE_GOAL_RE = /\b(release|publish|deploy|tag)\b|发布|部署|上线|打包|标签/i;
var NPM_RELEASE_RE = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
function hasReleaseGoal(goal) {
  const text = stripKnownCapabilityTokens(goal);
  return RELEASE_GOAL_RE.test(text) || NPM_RELEASE_RE.test(text);
}
function normalizeText(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function rootFsPath(projectRoot, root) {
  return isAbsolute3(root.path) ? resolve4(root.path) : resolve4(projectRoot, root.path);
}
function readText2(file) {
  try {
    return readFileSync5(file, "utf8");
  } catch {
    return "";
  }
}
function packageJsonContains(rootAbs, pattern) {
  return pattern.test(readText2(join4(rootAbs, "package.json")));
}
function globSegmentToRegExp(segment) {
  return new RegExp(
    `^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`
  );
}
function globPathExists(rootAbs, hint) {
  const parts = hint.split("/").filter(Boolean);
  function walk(dir, idx) {
    if (idx >= parts.length) return existsSync4(dir);
    const part = parts[idx];
    if (!part) return false;
    if (!part.includes("*")) return walk(join4(dir, part), idx + 1);
    let entries;
    try {
      entries = readdirSync4(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const pattern = globSegmentToRegExp(part);
    return entries.some((entry) => pattern.test(entry.name) && walk(join4(dir, entry.name), idx + 1));
  }
  return walk(rootAbs || ".", 0);
}
function hasManifestHint(rootAbs, hint) {
  if (hint.includes(":")) {
    const [file, needle] = hint.split(":", 2);
    if (!file || !needle) return false;
    return readText2(join4(rootAbs, file)).toLowerCase().includes(needle.toLowerCase());
  }
  if (hint.includes("*")) {
    return globPathExists(rootAbs, hint);
  }
  return existsSync4(join4(rootAbs, hint));
}
function scoreStack(stack, roots, projectRoot, goal) {
  const evidence = [];
  let score = 0;
  if (stack.goalPattern.test(goal)) {
    score += stack.id === "claude-code-plugin" ? 0.46 : ["react", "vue", "next", "spring-cloud", "spring-boot"].includes(stack.id) ? 0.32 : 0.24;
    evidence.push("goal keyword");
  }
  for (const root of roots) {
    const rootAbs = rootFsPath(projectRoot, root);
    const frameworkHits = root.frameworks.filter(
      (framework) => stack.frameworks.includes(framework)
    );
    if (frameworkHits.length > 0) {
      score += 0.34;
      evidence.push(`${root.path}: framework ${frameworkHits.join(",")}`);
    }
    for (const hint of stack.manifestHints) {
      if (hasManifestHint(rootAbs, hint)) {
        score += 0.18;
        evidence.push(`${root.path}: ${hint}`);
      }
    }
    if (stack.id === "typescript" && packageJsonContains(rootAbs, /"typescript"\s*:/i)) {
      score += 0.2;
      evidence.push(`${root.path}: package.json:typescript`);
    }
  }
  if (score <= 0) return null;
  const confidence = Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
  return {
    id: stack.id,
    name: stack.name,
    confidence,
    evidence: [...new Set(evidence)].slice(0, 5)
  };
}
function detectStackProfile(input) {
  const goal = normalizeText(stripKnownCapabilityTokens(input.goal));
  const roots = input.topology.roots;
  const detected = Object.values(STACKS).map((stack) => scoreStack(stack, roots, input.topology.projectRoot, goal)).filter((item) => item !== null).sort(
    (a, b) => b.confidence - a.confidence || STACK_PRIORITY[b.id] - STACK_PRIORITY[a.id]
  );
  const primary = detected[0]?.id ?? "unknown";
  const confidence = detected[0]?.confidence ?? 0;
  const warnings = [];
  if (primary === "unknown") {
    warnings.push("No first-class stack profile detected; use repository scripts as the verifier source.");
  }
  if (detected.length > 1 && detected[0] && detected[1] && detected[1].confidence > 0.5) {
    warnings.push("Multiple stack profiles are relevant; keep verification multi-root and avoid single-stack assumptions.");
  }
  return {
    version: 1,
    primary,
    detected,
    confidence,
    evidence: detected.flatMap((item) => item.evidence).slice(0, 8),
    warnings
  };
}
function stackFor(profile) {
  return profile.primary === "unknown" ? null : STACKS[profile.primary];
}
function selectCommand(commands, roots, projectRoot) {
  for (const command of commands) {
    if (command.startsWith("./mvnw") && !roots.some((root) => existsSync4(join4(rootFsPath(projectRoot, root), "mvnw")))) {
      continue;
    }
    if (command.startsWith("./gradlew") && !roots.some((root) => existsSync4(join4(rootFsPath(projectRoot, root), "gradlew")))) {
      continue;
    }
    return command;
  }
  return commands[0] ?? null;
}
function selectQualityGates(input) {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "";
  const risk = input.risk ?? "";
  if (stack === null) {
    return [
      {
        id: "repo-verification",
        phase: "verification",
        required: route !== "direct-change",
        command: null,
        reason: "No stack profile matched; use the repository's documented verification command."
      }
    ];
  }
  const primaryCommand = selectCommand(stack.verifierCommands, input.topology.roots, input.topology.projectRoot);
  const gates = [
    {
      id: `${stack.id}-docs`,
      phase: "before-coding",
      required: /plugin|hook|skill|agent|latest|official|framework|api|sdk/i.test(
        stripKnownCapabilityTokens(input.goal)
      ) || stack.id === "claude-code-plugin",
      command: null,
      reason: stack.docsQuery
    },
    {
      id: `${stack.id}-tdd`,
      phase: "implementation",
      required: route !== "direct-change" && risk !== "low",
      command: null,
      reason: stack.tdd
    },
    {
      id: `${stack.id}-baseline`,
      phase: "verification",
      required: true,
      command: primaryCommand,
      reason: `Baseline verification for ${stack.name}.`
    }
  ];
  if (stack.browser) {
    gates.push({
      id: `${stack.id}-browser`,
      phase: "verification",
      required: route !== "direct-change",
      command: stack.id === "static-html" ? null : "npm run test:e2e",
      reason: "Browser-facing behavior needs Playwright or Chrome DevTools MCP evidence."
    });
  }
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (risk === "high" || risk === "critical" || /auth|security|permission|oauth|secret|release|publish|tag/i.test(semanticGoal)) {
    gates.push({
      id: `${stack.id}-security-review`,
      phase: "verification",
      required: risk === "critical" || /auth|security|permission|oauth|secret/i.test(semanticGoal),
      command: null,
      reason: stack.security
    });
  }
  const releaseGoal = hasReleaseGoal(input.goal);
  if (route === "epic-split" || releaseGoal) {
    gates.push({
      id: `${stack.id}-release`,
      phase: "release",
      required: releaseGoal,
      command: selectCommand(stack.releaseCommands, input.topology.roots, input.topology.projectRoot),
      reason: `Release-facing ${stack.name} work needs the stricter release gate.`
    });
  }
  return gates;
}
function selectSuggestedVerifier(input) {
  const browserGate = input.qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (browserGate && /ui|browser|frontend|page|component|css|layout|交互|页面|前端/i.test(semanticGoal)) {
    return {
      kind: "browser",
      command: browserGate.command,
      fallback: "Chrome DevTools MCP",
      needsRuntime: true,
      reason: browserGate.reason
    };
  }
  if (input.stackProfile.primary === "claude-code-plugin") {
    return {
      kind: "plugin-smoke",
      command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      fallback: "claude plugin validate ./plugins/curdx-flow",
      needsRuntime: false,
      reason: "Claude Code plugin changes need real plugin validation in addition to unit tests."
    };
  }
  const baseline = input.qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  return {
    kind: baseline?.command?.includes("build") ? "build" : "unit",
    command: baseline?.command ?? null,
    fallback: "Use the repository's documented verify command.",
    needsRuntime: false,
    reason: baseline?.reason ?? "Use local verification evidence before completion."
  };
}
function selectContextBudget(input) {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "full-spec";
  const routeDefault = route === "direct-change" ? "tiny" : route === "scaffold" || route === "prototype" || route === "lite-spec" ? "focused" : route === "epic-split" ? "expanded" : "standard";
  const level = stack?.contextBudget[route] ?? routeDefault;
  const limits = {
    tiny: 2,
    focused: 4,
    standard: 8,
    expanded: 12
  };
  return {
    level,
    maxReferenceFiles: limits[level],
    strategy: level === "tiny" ? "Read only the directly touched files plus one local convention file." : level === "focused" ? "Read the target files, nearest tests, and one relevant reference before editing." : level === "standard" ? "Use bounded discovery across source, tests, docs, and official references." : "Split discovery by subsystem and summarize before implementation."
  };
}
function readArg4(name, argv) {
  const idx = argv.indexOf(name);
  return idx === -1 ? void 0 : argv[idx + 1];
}
function main4() {
  const argv = process.argv.slice(2);
  const cwd = readArg4("--cwd", argv);
  const goal = readArg4("--goal", argv) ?? "";
  const route = readArg4("--route", argv);
  const risk = readArg4("--risk", argv);
  const topology = discoverProjectTopology({ cwd, goal });
  const stackProfile = detectStackProfile({ cwd, goal, topology, route, risk });
  const qualityGates = selectQualityGates({ cwd, goal, topology, route, risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal, topology, route, risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal, topology, route, risk, stackProfile });
  process.stdout.write(JSON.stringify({
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget
  }, null, 2) + "\n");
}
function isDirectRun4() {
  try {
    return process.argv[1]?.endsWith("stack-capabilities.mjs") === true;
  } catch {
    return false;
  }
}
if (isDirectRun4()) {
  main4();
}

// src/hooks/lib/smart-route.ts
function normalizeText2(input) {
  return (input ?? "").trim().replace(/\s+/g, " ");
}
function hasFlag(flags, flag) {
  return new RegExp(`(^|\\s)${flag.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`).test(
    flags ?? ""
  );
}
function parseList3(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}
function readArg5(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function specNameFromPath(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? specPath;
}
function loadActiveSpecFromPath(cwd, specPath) {
  const statePath = join5(cwd, specPath, ".curdx-state.json");
  let phase = "unknown";
  let completed = false;
  if (existsSync5(statePath)) {
    try {
      const parsed = JSON.parse(readFileSync6(statePath, "utf8"));
      if (typeof parsed.phase === "string" && parsed.phase.trim().length > 0) {
        phase = parsed.phase;
      }
      completed = parsed.completed === true;
    } catch {
      phase = "unknown";
    }
  } else if (existsSync5(join5(cwd, specPath, "tasks.md"))) {
    phase = "execution";
  } else if (existsSync5(join5(cwd, specPath, "design.md"))) {
    phase = "tasks";
  } else if (existsSync5(join5(cwd, specPath, "requirements.md"))) {
    phase = "design";
  } else if (existsSync5(join5(cwd, specPath, "research.md"))) {
    phase = "requirements";
  }
  return {
    name: specNameFromPath(specPath),
    path: specPath,
    phase,
    completed
  };
}
function findActiveSpec(input) {
  const cwd = input.cwd ?? process.cwd();
  const fresh = hasFlag(input.flags, "--fresh");
  if (fresh) return void 0;
  const explicitName = normalizeText2(input.name);
  if (explicitName) {
    const found = findSpec(explicitName, { cwd });
    if (found.ok) return loadActiveSpecFromPath(cwd, found.path);
    return void 0;
  }
  const current = resolveCurrent({ cwd });
  if (current === null) return void 0;
  return loadActiveSpecFromPath(cwd, current);
}
function nextActionForActiveSpec(spec) {
  if (spec.completed) {
    return `Active spec '${spec.name}' is completed; start a new spec or run /curdx-flow:refactor ${spec.name}.`;
  }
  switch (spec.phase) {
    case "research":
      return `Continue '${spec.name}' with /curdx-flow:requirements after reviewing research.md.`;
    case "requirements":
      return `Continue '${spec.name}' with /curdx-flow:design.`;
    case "design":
      return `Continue '${spec.name}' with /curdx-flow:tasks.`;
    case "tasks":
      return `Continue '${spec.name}' with /curdx-flow:implement.`;
    case "execution":
      return `Resume '${spec.name}' with /curdx-flow:implement.`;
    default:
      return `Inspect '${spec.name}' with /curdx-flow:status, then continue the next missing phase.`;
  }
}
function publicPolicy(policy) {
  return {
    mode: policy.mode,
    risk: policy.risk,
    executionMode: policy.executionMode,
    executionDriver: policy.executionDriver,
    taskGranularity: policy.taskGranularity,
    taskTargetRange: policy.taskTargetRange,
    reviewCadence: policy.reviewCadence,
    verificationLevel: policy.verificationLevel,
    subagentPolicy: policy.subagentPolicy,
    maxGlobalIterations: policy.maxGlobalIterations,
    maxTaskIterations: policy.maxTaskIterations,
    shouldSplitSpec: policy.shouldSplitSpec
  };
}
function routeFromPolicy(policy) {
  if (policy.shouldSplitSpec || policy.executionMode === "epic-triage") {
    return "epic-split";
  }
  if (policy.executionMode === "direct") return "direct-change";
  if (policy.executionMode === "spec-lite") return "lite-spec";
  return "full-spec";
}
var STACK_RE = /\b(vue|vue3|vite|pinia|vue router|react|next\.?js|nuxt|static html|vanilla js|index\.html|styles\.css|app\.js|spring|spring boot|spring cloud|maven|gradle|java|node|nestjs|fastapi|go|postgres|mysql|redis|docker)\b|前端|后端|全栈|全家桶/i;
var ARTIFACT_RE = /\b(prd|spec|requirements?|design doc|figma|wireframe|openapi|swagger|api doc|接口文档|产品文档|需求文档|设计稿|原型图)\b/i;
var SCAFFOLD_RE = /\b(scaffold|bootstrap|init|starter|template|skeleton|create project|create app|new project|setup project)\b|脚手架|初始化|搭建项目|创建项目|项目骨架|先搭骨架|搭骨架/i;
var PROTOTYPE_RE = /\b(prototype|poc|demo|spike|experiment|technical validation|prove|验证|原型|演示|技术验证|试验)\b/i;
var PRODUCT_RE = /\b(app|application|system|platform|saas|crm|dashboard|admin|portal|product|service|tool)\b|系统|平台|后台|管理端|应用|产品|工具|开发一套|做一个|做一套/i;
var PRODUCT_DOMAIN_HINT_RE = /\b(crm|customer|order|inventory|invoice|booking|calendar|todo|task|project|ticket|commerce|shop|blog|cms|dashboard|admin|user|auth|report)\b|客户|订单|库存|合同|发票|预约|日历|待办|任务|项目|工单|商城|电商|博客|内容|后台|用户|权限|登录|报表/i;
var FIX_RE = /\b(fix|bug|debug|repair|resolve|broken|regression|修复|报错|失败|排查|定位)\b/i;
var REFACTOR_RE = /\b(refactor|rewrite|cleanup|restructure|重构|重写|整理)\b/i;
var RELEASE_RE = /\b(release|publish|deploy|tag|上线|发布|部署|打包)\b/i;
var NPM_RELEASE_RE2 = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
var DEMO_RE = /\b(demo|prototype|poc|演示|原型)\b/i;
var PRODUCTION_RE = /\b(production|prod|ship|launch|deploy|release|上线|生产|发布|可用|能用)\b/i;
function hasReleaseIntent(goal) {
  return RELEASE_RE.test(goal) || NPM_RELEASE_RE2.test(goal);
}
function classifyIntent(goal, topology) {
  const semanticGoal = stripKnownCapabilityTokens(goal);
  const artifactProvided = ARTIFACT_RE.test(semanticGoal);
  const stackSpecified = STACK_RE.test(semanticGoal);
  let intentKind = "unknown";
  if (artifactProvided) intentKind = "import-spec";
  else if (SCAFFOLD_RE.test(semanticGoal)) intentKind = "scaffold";
  else if (PROTOTYPE_RE.test(semanticGoal)) intentKind = "prototype";
  else if (hasReleaseIntent(semanticGoal)) intentKind = "release";
  else if (FIX_RE.test(semanticGoal)) intentKind = "fix";
  else if (REFACTOR_RE.test(semanticGoal)) intentKind = "refactor";
  else if (PRODUCT_RE.test(semanticGoal)) intentKind = "product";
  else if (goal.length > 0) intentKind = "feature";
  let deliveryExpectation = "maintenance";
  if (DEMO_RE.test(semanticGoal)) deliveryExpectation = "demo";
  else if (PRODUCTION_RE.test(semanticGoal)) deliveryExpectation = "production";
  else if (intentKind === "product" || topology.workspaceState === "empty") {
    deliveryExpectation = "usable-app";
  }
  const missingFacts = [];
  if (topology.workspaceState === "empty" && intentKind === "product" && !artifactProvided && !PRODUCT_DOMAIN_HINT_RE.test(semanticGoal)) {
    missingFacts.push("product domain, target user, MVP acceptance criteria");
  }
  if (topology.workspaceState === "empty" && (intentKind === "product" || intentKind === "feature") && !stackSpecified) {
    missingFacts.push("preferred stack or permission to choose defaults");
  }
  if (intentKind === "prototype" && !/success|metric|prove|验证|成功|标准/i.test(semanticGoal)) {
    missingFacts.push("prototype success criterion");
  }
  let clarity = "medium";
  if (artifactProvided || intentKind === "scaffold") clarity = "high";
  else if (missingFacts.length > 0) clarity = "low";
  else if (stackSpecified || intentKind === "fix" || intentKind === "refactor") clarity = "high";
  let confidence = 0.62;
  if (artifactProvided || SCAFFOLD_RE.test(semanticGoal) || PROTOTYPE_RE.test(semanticGoal)) confidence += 0.22;
  if (stackSpecified) confidence += 0.08;
  if (missingFacts.length > 0) confidence -= 0.18;
  confidence = Math.max(0.1, Math.min(0.98, Number(confidence.toFixed(2))));
  let recommendedAction = "route with deterministic policy";
  if (topology.workspaceState === "empty") {
    if (intentKind === "scaffold") {
      recommendedAction = "select an official/ecosystem scaffold source when available, create the requested skeleton, then run baseline verification";
    } else if (intentKind === "import-spec") {
      recommendedAction = "import the provided artifact, derive plan/tasks, then implement";
    } else if (intentKind === "prototype") {
      recommendedAction = "create a bounded prototype spec with an explicit success criterion";
    } else if (clarity === "low") {
      recommendedAction = "perform product inception before writing application code";
    } else {
      recommendedAction = "create greenfield spec with constitution and walking skeleton tasks";
    }
  }
  return {
    workspaceState: topology.workspaceState,
    intentKind,
    clarity,
    stackSpecified,
    artifactProvided,
    deliveryExpectation,
    missingFacts,
    confidence,
    recommendedAction
  };
}
function routeFromIntent(intent, policy) {
  if (intent.workspaceState === "empty") {
    switch (intent.intentKind) {
      case "scaffold":
        return "scaffold";
      case "import-spec":
        return "import-spec";
      case "prototype":
        return "prototype";
      case "product":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      case "feature":
        return intent.clarity === "low" ? "product-inception" : "greenfield-spec";
      default:
        return "product-inception";
    }
  }
  return routeFromPolicy(policy);
}
function reasonForRoute(route, policy, intent) {
  if (route === "scaffold" || route === "product-inception" || route === "greenfield-spec" || route === "prototype" || route === "import-spec") {
    return intent.recommendedAction;
  }
  return policy.reasons[0] ?? "deterministic policy classification";
}
function routeDefaults(route) {
  switch (route) {
    case "direct-change":
      return {
        nextAction: "Handle directly in the current turn; do not create a spec or tasks.md.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "lite-spec":
      return {
        nextAction: "Create a lightweight spec and 1-3 value-slice tasks, then execute without unnecessary subagents.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 3
      };
    case "full-spec":
      return {
        nextAction: "Run the full research, requirements, design, tasks, and implementation workflow.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "epic-split":
      return {
        nextAction: "Run /curdx-flow:triage; do not force this work into one oversized spec.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "scaffold":
      return {
        nextAction: "Select an official/ecosystem scaffold source when available, create the requested skeleton, record assumptions, then run baseline verification.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 1
      };
    case "product-inception":
      return {
        nextAction: "Create product context first: mission, constraints, roadmap, tech-stack assumptions, and project constitution before application code.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 0
      };
    case "greenfield-spec":
      return {
        nextAction: "Create a greenfield spec with constitution, technical plan, walking skeleton, and vertical-slice tasks.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 10
      };
    case "prototype":
      return {
        nextAction: "Create a bounded prototype spec, define the success criterion, implement the thinnest proof, and verify it.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: false,
        taskCountLimit: 5
      };
    case "import-spec":
      return {
        nextAction: "Import the provided PRD/spec/design/API artifact, normalize it into curdx-flow artifacts, then plan implementation.",
        shouldCreateSpec: true,
        shouldCreateTasks: true,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "resume-current":
      return {
        nextAction: "Resume the active spec at its next incomplete phase.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: true,
        taskCountLimit: 12
      };
    case "blocked-ask-user":
      return {
        nextAction: "Ask one focused question before continuing.",
        shouldCreateSpec: false,
        shouldCreateTasks: false,
        shouldUseSubagent: false,
        taskCountLimit: 0
      };
  }
}
function publicTopology(topology) {
  return {
    workspaceState: topology.workspaceState,
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function topologyKinds(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.kinds))];
}
function topologyFrameworks(topology) {
  return [...new Set(topology.roots.flatMap((root) => root.frameworks))];
}
function classifySmartRoute(input) {
  const goal = normalizeText2(input.goal);
  const cwd = input.cwd ?? process.cwd();
  const activeSpec = findActiveSpec({ ...input, cwd });
  const topology = discoverProjectTopology({ cwd, goal });
  const intent = classifyIntent(goal, topology);
  const policy = classifyAutoPolicy({
    goal,
    flags: input.flags,
    changedFiles: input.changedFiles,
    estimatedFiles: input.estimatedFiles,
    taskCount: input.taskCount
  });
  const routeCandidate = routeFromIntent(intent, policy);
  const stackProfile = detectStackProfile({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk
  });
  const qualityGates = selectQualityGates({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile,
    qualityGates
  });
  const contextBudget = selectContextBudget({
    cwd,
    goal,
    topology,
    route: routeCandidate,
    risk: policy.risk,
    stackProfile
  });
  const brain = summarizeProjectBrain(cwd);
  const recommendations = recommendToolCapabilities({
    goal,
    route: routeCandidate,
    risk: policy.risk,
    topologyKinds: topologyKinds(topology),
    topologyFrameworks: topologyFrameworks(topology),
    stackProfile,
    qualityGates,
    contextBudget,
    missingRoots: topology.missingRoots.length,
    availableCapabilities: input.availableCapabilities,
    recentFailures: brain.recentFailures.length
  });
  if (activeSpec !== void 0 && !activeSpec.completed && goal.length === 0) {
    return {
      version: 1,
      route: "resume-current",
      reason: "active unfinished spec found and no new goal was provided",
      activeSpec,
      ...routeDefaults("resume-current"),
      nextAction: nextActionForActiveSpec(activeSpec),
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["active unfinished spec"]
    };
  }
  if (activeSpec !== void 0 && !activeSpec.completed && normalizeText2(input.name).length > 0 && goal.length > 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "requested spec already exists and is unfinished",
      activeSpec,
      blockedReason: "Ask whether to resume the existing spec or rerun with --fresh for new work.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: recommendations,
      policy: publicPolicy(policy),
      reasons: ["existing unfinished spec with new goal text"]
    };
  }
  const explicitName = normalizeText2(input.name);
  if (explicitName && !hasFlag(input.flags, "--fresh")) {
    const found = findSpec(explicitName, { cwd });
    if (!found.ok && found.reason === "ambiguous") {
      return {
        version: 1,
        route: "blocked-ask-user",
        reason: "multiple specs match the requested name",
        blockedReason: `Ambiguous spec '${explicitName}': ${found.matches.join(", ")}`,
        ...routeDefaults("blocked-ask-user"),
        topology: publicTopology(topology),
        intent,
        stackProfile,
        qualityGates,
        suggestedVerifier,
        contextBudget,
        recommendedCapabilities: recommendations,
        policy: publicPolicy(policy),
        reasons: ["ambiguous spec name"]
      };
    }
  }
  if (goal.length === 0) {
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "no goal and no resumable active spec",
      blockedReason: "Ask for the goal or a spec name.",
      ...routeDefaults("blocked-ask-user"),
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["missing goal"]
    };
  }
  if (topology.missingRoots.length > 0) {
    const missing = topology.missingRoots.map((root) => `${root.name} (${root.path})`).join(", ");
    return {
      version: 1,
      route: "blocked-ask-user",
      reason: "related code root is not accessible",
      blockedReason: `Goal requires ${missing}. ${topology.accessFix ?? "Add the missing root before continuing."}`,
      ...routeDefaults("blocked-ask-user"),
      nextAction: topology.accessFix ?? "Add the missing code root, then rerun /curdx-flow:start.",
      topology: publicTopology(topology),
      intent,
      stackProfile,
      qualityGates,
      suggestedVerifier,
      contextBudget,
      recommendedCapabilities: [],
      policy: publicPolicy(policy),
      reasons: ["related code root is outside current Claude Code access"]
    };
  }
  const route = routeCandidate;
  const defaults = routeDefaults(route);
  return {
    version: 1,
    route,
    reason: reasonForRoute(route, policy, intent),
    ...defaults,
    topology: publicTopology(topology),
    intent,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    recommendedCapabilities: recommendations,
    policy: publicPolicy(policy),
    reasons: policy.reasons
  };
}
function main5() {
  const argv = process.argv.slice(2);
  const goal = readArg5("--goal", argv) ?? "";
  const name = readArg5("--name", argv);
  const flags = readArg5("--flags", argv) ?? "";
  const cwd = readArg5("--cwd", argv);
  const files = parseList3(readArg5("--files", argv));
  const availableCapabilities = parseList3(readArg5("--available-capabilities", argv));
  const estimatedRaw = readArg5("--estimated-files", argv);
  const taskRaw = readArg5("--task-count", argv);
  const route = classifySmartRoute({
    goal,
    name,
    flags,
    cwd,
    changedFiles: files,
    availableCapabilities: availableCapabilities.length > 0 ? availableCapabilities : void 0,
    estimatedFiles: estimatedRaw === void 0 ? void 0 : Number(estimatedRaw),
    taskCount: taskRaw === void 0 ? void 0 : Number(taskRaw)
  });
  process.stdout.write(JSON.stringify(route, null, 2) + "\n");
}
function isDirectRun5() {
  try {
    const entry = fileURLToPath4(import.meta.url);
    return process.argv[1] === entry && basename7(entry).startsWith("smart-route.");
  } catch {
    return false;
  }
}
if (isDirectRun5()) {
  main5();
}

// src/hooks/lib/last-mile-orchestrator.ts
import { basename as basename9 } from "node:path";
import { fileURLToPath as fileURLToPath6 } from "node:url";

// src/hooks/lib/workflow-snapshot.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync6, readFileSync as readFileSync7, statSync as statSync5 } from "node:fs";
import { basename as basename8, isAbsolute as isAbsolute4, join as join6 } from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// src/hooks/_shared/markdown-task-parser.ts
var TASK_LINE_RE = /^- \[[ x]\]/;
var INDENTED_RE = /^  /;
var BLANK_RE = /^\s*$/;
var TASK_HEADER_RE = /^- \[([ x])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
function normalize2(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function trimTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && BLANK_RE.test(lines[end - 1] ?? "")) end--;
  return lines.slice(0, end);
}
function parseTaskList(markdown) {
  if (!markdown) return [];
  const lines = normalize2(markdown).split("\n");
  const tasks = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const trimmed = trimTrailingBlankLines(current.lines);
    const lineEnd = current.lineStart + trimmed.length - 1;
    tasks.push({
      ...current.meta,
      raw: trimmed.join("\n"),
      lineEnd
    });
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (TASK_LINE_RE.test(line)) {
      flush();
      const m = line.match(TASK_HEADER_RE);
      const completed = m ? m[1] === "x" : false;
      const id = m && m[2] ? m[2] : void 0;
      const title = m && m[3] !== void 0 ? m[3] : line;
      current = {
        lines: [line],
        lineStart: lineNo,
        lineEnd: lineNo,
        meta: { id, title, completed }
      };
      continue;
    }
    if (!current) continue;
    if (INDENTED_RE.test(line) || BLANK_RE.test(line)) {
      current.lines.push(line);
      continue;
    }
    flush();
  }
  flush();
  return tasks;
}

// src/hooks/lib/workflow-snapshot.ts
function readArg6(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function normalizeSpecPath(cwd, specPath) {
  if (isAbsolute4(specPath)) return specPath;
  return join6(cwd, specPath);
}
function specNameFromPath2(specPath) {
  const parts = specPath.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? basename8(specPath);
}
function resolveSpecPath(input) {
  const cwd = input.cwd ?? process.cwd();
  const explicit = input.spec?.trim();
  if (explicit) {
    if (explicit.startsWith("./") || explicit.startsWith("../") || isAbsolute4(explicit)) {
      return explicit;
    }
    const found = findSpec(explicit, { cwd });
    if (found.ok) return found.path;
    return explicit;
  }
  return resolveCurrent({ cwd, sessionId: input.sessionId }) ?? void 0;
}
function readJsonFile(path3) {
  try {
    return { ok: true, value: JSON.parse(readFileSync7(path3, "utf8")) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
function artifact(specFs, filename) {
  const p = join6(specFs, filename);
  if (!existsSync6(p)) return { exists: false, path: p };
  try {
    const st = statSync5(p);
    return {
      exists: true,
      path: p,
      mtimeMs: st.mtimeMs,
      bytes: st.size
    };
  } catch {
    return { exists: true, path: p };
  }
}
function extractVerify(raw) {
  const m = raw.match(/^\s+- \*\*Verify\*\*:\s*(.+)$/m);
  return m?.[1]?.trim();
}
function extractFiles(raw) {
  const m = raw.match(/^\s+- \*\*Files\*\*:\s*(.+)$/m);
  const value = m?.[1]?.trim();
  if (!value) return [];
  return value.split(/[,;]/).map((part) => part.trim().replace(/^`|`$/g, "")).filter(Boolean);
}
function buildTaskSnapshot(specFs, state) {
  const tasksPath = join6(specFs, "tasks.md");
  if (!existsSync6(tasksPath)) {
    return { total: 0, completed: 0, pending: 0, currentIndex: 0 };
  }
  let tasks = [];
  try {
    tasks = parseTaskList(readFileSync7(tasksPath, "utf8"));
  } catch {
    tasks = [];
  }
  const total = tasks.length;
  const completed = tasks.reduce((n, task) => n + (task.completed ? 1 : 0), 0);
  const pending = total - completed;
  const rawIndex = typeof state?.taskIndex === "number" ? state.taskIndex : completed;
  const currentIndex = Math.max(0, Math.min(rawIndex, Math.max(total - 1, 0)));
  const currentTask = tasks[currentIndex];
  return {
    total,
    completed,
    pending,
    currentIndex,
    ...currentTask ? {
      current: {
        ...currentTask.id ? { id: currentTask.id } : {},
        title: currentTask.title,
        lineStart: currentTask.lineStart,
        lineEnd: currentTask.lineEnd,
        ...extractVerify(currentTask.raw) ? { verify: extractVerify(currentTask.raw) } : {},
        files: extractFiles(currentTask.raw)
      }
    } : {}
  };
}
function gitSnapshot(cwd) {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split(/\r?\n/).filter(Boolean);
    return {
      available: true,
      ...branch ? { branch } : {},
      dirty: status.length > 0,
      changedFiles: status.length
    };
  } catch {
    return { available: false, dirty: false, changedFiles: 0 };
  }
}
function compactTopology(topology) {
  return {
    workspaceState: topology.workspaceState,
    devContextFound: topology.devContextFound,
    roots: topology.roots,
    requiredRoots: topology.requiredRoots,
    missingRoots: topology.missingRoots,
    ...topology.accessFix ? { accessFix: topology.accessFix } : {},
    warnings: topology.warnings
  };
}
function isLiteSpecState(state) {
  const route = state?.route?.route;
  return state?.autoPolicy?.executionMode === "spec-lite" || route === "lite-spec";
}
function inferNextAction(state, artifacts, tasks) {
  if (state?.completed === true) return "Spec is completed. Use /curdx-flow:refactor for follow-up changes.";
  if (isLiteSpecState(state)) {
    if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
    if (tasks.pending > 0) return "Run /curdx-flow:implement.";
    return "All task checkboxes are complete; run verification/refactor or mark complete.";
  }
  if (!artifacts.research.exists) return "Run /curdx-flow:research.";
  if (!artifacts.requirements.exists) return "Run /curdx-flow:requirements.";
  if (!artifacts.design.exists) return "Run /curdx-flow:design.";
  if (!artifacts.tasks.exists) return "Run /curdx-flow:tasks.";
  if (tasks.pending > 0) return "Run /curdx-flow:implement.";
  return "All task checkboxes are complete; run verification/refactor or mark complete.";
}
function buildGates(stateInfo, artifacts, tasks, topology) {
  const gates = [];
  const isLiteSpec = stateInfo.autoPolicy?.executionMode === "spec-lite";
  if (!stateInfo.exists) gates.push("missing-state");
  if (stateInfo.exists && !stateInfo.valid) gates.push("invalid-state");
  if (topology && topology.missingRoots.length > 0) gates.push("missing-code-root");
  if (isLiteSpec) {
    if (!artifacts.tasks.exists) gates.push("missing-tasks");
  } else {
    if (!artifacts.research.exists) gates.push("missing-research");
    if (!artifacts.requirements.exists && artifacts.research.exists) gates.push("missing-requirements");
    if (!artifacts.design.exists && artifacts.requirements.exists) gates.push("missing-design");
    if (!artifacts.tasks.exists && artifacts.design.exists) gates.push("missing-tasks");
  }
  if (artifacts.tasks.exists && tasks.total === 0) gates.push("empty-tasks");
  if (tasks.total > 0 && stateInfo.phase === "execution" && tasks.pending === 0 && !stateInfo.completed) {
    gates.push("completion-unmarked");
  }
  return gates;
}
function buildWorkflowSnapshot(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const specPath = resolveSpecPath({ ...input, cwd });
  const topology = compactTopology(discoverProjectTopology({ cwd, goal: input.goal ?? "" }));
  const git = gitSnapshot(cwd);
  const brain = summarizeProjectBrain(cwd);
  if (!specPath) {
    return {
      version: 2,
      cwd,
      active: false,
      state: {
        exists: false,
        valid: false,
        completed: false,
        awaitingApproval: false,
        quickMode: false,
        recommendedCapabilities: [],
        verificationBlocks: {}
      },
      artifacts: {
        research: { exists: false, path: join6(cwd, "research.md") },
        requirements: { exists: false, path: join6(cwd, "requirements.md") },
        design: { exists: false, path: join6(cwd, "design.md") },
        tasks: { exists: false, path: join6(cwd, "tasks.md") },
        progress: { exists: false, path: join6(cwd, ".progress.md") }
      },
      tasks: { total: 0, completed: 0, pending: 0, currentIndex: 0 },
      topology,
      git,
      recovery: {
        recentFailures: brain.recentFailures,
        ...brain.lastCompactSummary ? { lastCompactSummary: brain.lastCompactSummary } : {}
      },
      nextAction: "No active spec. Run /curdx-flow:start <name> <goal>.",
      gates: ["no-active-spec"]
    };
  }
  const specFs = normalizeSpecPath(cwd, specPath);
  const statePath = join6(specFs, ".curdx-state.json");
  let state = null;
  const stateInfo = {
    exists: existsSync6(statePath),
    valid: false,
    completed: false,
    awaitingApproval: false,
    quickMode: false,
    recommendedCapabilities: [],
    verificationBlocks: {}
  };
  if (stateInfo.exists) {
    const parsed = readJsonFile(statePath);
    if (parsed.ok) {
      state = parsed.value;
      stateInfo.valid = true;
      stateInfo.version = parsed.value.version;
      stateInfo.phase = parsed.value.phase;
      stateInfo.completed = parsed.value.completed === true;
      stateInfo.awaitingApproval = parsed.value.awaitingApproval === true;
      stateInfo.quickMode = parsed.value.quickMode === true;
      stateInfo.autoPolicy = parsed.value.autoPolicy;
      stateInfo.recommendedCapabilities = parsed.value.recommendedCapabilities ?? [];
      stateInfo.projectTopology = parsed.value.projectTopology;
      stateInfo.verificationBlocks = parsed.value.verificationBlocks ?? {};
    } else {
      stateInfo.error = parsed.error;
    }
  }
  const artifacts = {
    research: artifact(specFs, "research.md"),
    requirements: artifact(specFs, "requirements.md"),
    design: artifact(specFs, "design.md"),
    tasks: artifact(specFs, "tasks.md"),
    progress: artifact(specFs, ".progress.md")
  };
  const tasks = buildTaskSnapshot(specFs, state);
  return {
    version: 2,
    cwd,
    active: existsSync6(specFs),
    spec: {
      name: specNameFromPath2(specPath),
      path: specPath,
      fsPath: specFs,
      statePath
    },
    state: stateInfo,
    artifacts,
    tasks,
    topology,
    git,
    recovery: {
      recentFailures: brain.recentFailures,
      ...brain.lastCompactSummary ? { lastCompactSummary: brain.lastCompactSummary } : {}
    },
    nextAction: inferNextAction(state, artifacts, tasks),
    gates: buildGates(stateInfo, artifacts, tasks, topology)
  };
}
function main6() {
  const argv = process.argv.slice(2);
  const snapshot = buildWorkflowSnapshot({
    cwd: readArg6("--cwd", argv),
    spec: readArg6("--spec", argv),
    goal: readArg6("--goal", argv),
    sessionId: readArg6("--session-id", argv)
  });
  process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
}
function isDirectRun6() {
  try {
    const entry = fileURLToPath5(import.meta.url);
    return process.argv[1] === entry && basename8(entry).startsWith("workflow-snapshot.");
  } catch {
    return false;
  }
}
if (isDirectRun6()) {
  main6();
}

// src/hooks/lib/last-mile-orchestrator.ts
var RELEASE_RE2 = /\b(release|publish|deploy|tag|version|changelog)\b|发布|部署|上线|打包|版本|标签|提测|灰度/i;
var NPM_RELEASE_RE3 = /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;
var FAILURE_RE = /\b(fail|failed|failure|error|stuck|retry|debug|broken|regression)\b|失败|报错|卡住|重试|排查|定位|回归|崩溃|阻塞|无法|不通过/i;
function normalize3(value) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
function unique(values) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
function rec(route, id) {
  return route.recommendedCapabilities.find((item) => item.id === id);
}
function hasRec(route, id) {
  return rec(route, id) !== void 0;
}
function missingCapabilityIds(route) {
  return route.recommendedCapabilities.filter((item) => item.availabilityState === "missing" && item.expectedByDefault).map((item) => item.id);
}
function isReleaseSensitive(goal, route) {
  return route.intent.intentKind === "release" || RELEASE_RE2.test(goal) || NPM_RELEASE_RE3.test(goal) || route.qualityGates.some((gate) => gate.id.endsWith("-release")) || route.stackProfile.primary === "claude-code-plugin" && RELEASE_RE2.test(goal);
}
function hasVerificationGap(input, snapshot) {
  if (input.verification?.ok === false) return true;
  if (input.hookEvent === "TaskCompleted") return true;
  return snapshot.gates.some(
    (gate) => gate === "completion-unmarked" || gate === "missing-tasks" || gate === "empty-tasks" || gate === "invalid-state"
  );
}
function inferPhase(input, route, snapshot, brain) {
  const goal = normalize3(input.goal);
  if (isReleaseSensitive(goal, route)) return "releasing";
  if (input.verification?.ok === false || brain.recentFailures.length >= 2) return "recovering";
  if (input.hookEvent === "TaskCompleted") return "verifying";
  if (FAILURE_RE.test(goal)) return "debugging";
  const statePhase = snapshot.state.phase;
  if (statePhase === "execution") return "implementing";
  if (statePhase === "research") return "discovering";
  if (statePhase === "requirements" || statePhase === "design" || statePhase === "tasks") {
    return "planning";
  }
  if (route.route === "blocked-ask-user" || route.route === "product-inception") return "discovering";
  if (route.shouldCreateSpec) return "planning";
  return "implementing";
}
function inferProblemTypes(input, route, snapshot, brain) {
  const goal = normalize3(input.goal);
  const out = [];
  if (route.route === "blocked-ask-user" || route.intent.missingFacts.length > 0) {
    out.push("missing-context");
  }
  if (hasRec(route, "ui-ux-pro-max")) out.push("ui-quality-risk");
  if (hasRec(route, "chrome-devtools-mcp") || hasRec(route, "browser-verification")) {
    out.push("browser-evidence-needed");
  }
  if (brain.recentFailures.length >= 2 || hasRec(route, "pua") || /\b(repeated|twice|again)\b|反复|连续|又失败|多次/i.test(goal)) {
    out.push("repeated-failure");
  }
  if (isReleaseSensitive(goal, route)) out.push("release-risk");
  if (hasVerificationGap(input, snapshot)) out.push("verification-gap");
  if (snapshot.git.dirty && snapshot.git.changedFiles > 8 || snapshot.gates.includes("missing-code-root")) {
    out.push("scope-drift");
  }
  if (missingCapabilityIds(route).length > 0) out.push("dependency-missing");
  return unique(out);
}
function capabilityAction(recItem) {
  const required = recItem.curdxRole.includes("gate") || recItem.category === "docs" || recItem.category === "verification" || recItem.category === "security" || recItem.id === "pua";
  return {
    id: recItem.id,
    name: recItem.name,
    invocation: recItem.invocation,
    phase: recItem.phase,
    availabilityState: recItem.availabilityState,
    required,
    triggerReason: recItem.triggerReason,
    action: recItem.availabilityState === "missing" ? recItem.fallbackWhenMissing : recItem.instruction,
    fallbackWhenMissing: recItem.fallbackWhenMissing
  };
}
function evidenceRequired(input, route, snapshot, problems) {
  const out = route.qualityGates.filter((gate) => gate.required).map((gate) => gate.command ? `${gate.id}: ${gate.command}` : gate.id);
  const verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback;
  if (verifier) out.push(`suggested-verifier: ${verifier}`);
  if (problems.includes("browser-evidence-needed")) {
    out.push("browser evidence: Playwright pass or Chrome DevTools MCP console/network/DOM proof");
  }
  if (problems.includes("release-risk")) {
    out.push("release evidence: curdx-flow doctor, plugin validate, hook freshness, version/tag parity");
  }
  if (problems.includes("verification-gap")) {
    const phase = input.verification?.phase ?? snapshot.state.phase ?? "execution";
    out.push(`fresh verification block for phase '${phase}'`);
  }
  return unique(out).slice(0, 8);
}
function evidenceSatisfied(snapshot, brain) {
  const verified = Object.entries(snapshot.state.verificationBlocks).filter(([, block]) => block?.exitCode === 0 && typeof block.command === "string").map(([phase, block]) => `${phase}: ${block?.command}`);
  return unique([...verified, ...brain.verifierHints.map((hint) => `brain: ${hint}`)]).slice(0, 6);
}
function blockingGates(route, snapshot, problems) {
  const out = [...snapshot.gates];
  if (route.blockedReason) out.push(`route-blocked: ${route.blockedReason}`);
  for (const id of missingCapabilityIds(route)) {
    out.push(`dependency-missing: ${id}`);
  }
  if (problems.includes("release-risk")) out.push("release-gate-required");
  return unique(out);
}
function firstCapability(plan, id) {
  return plan.find((item) => item.id === id);
}
function instructionFor(phase, problems, plan, route, snapshot) {
  if (problems.includes("dependency-missing")) {
    const missing = plan.filter((item) => item.availabilityState === "missing").map((item) => item.id).join(", ");
    return `Run curdx-flow doctor and fix missing expected capabilities before relying on them: ${missing}.`;
  }
  if (problems.includes("repeated-failure")) {
    const memory = firstCapability(plan, "claude-mem");
    const pua = firstCapability(plan, "pua");
    const parts = [
      memory ? `${memory.invocation} for prior decisions/failures` : "read .curdx/brain.jsonl for recent failures",
      pua ? `${pua.invocation} for structured recovery or parallel diagnosis` : "switch to systematic recovery before another edit"
    ];
    return `Stop the same edit loop; ${parts.join(", ")}.`;
  }
  if (problems.includes("ui-quality-risk")) {
    const uiUx = firstCapability(plan, "ui-ux-pro-max");
    const design = uiUx !== void 0 && uiUx.availabilityState !== "missing" ? uiUx.invocation : "the available ui-ux-pro-max guidance";
    return `Apply ${design} before changing visible UI, then keep browser evidence as the completion gate.`;
  }
  if (problems.includes("browser-evidence-needed")) {
    return "After implementation, collect browser runtime evidence with Playwright or Chrome DevTools MCP before claiming completion.";
  }
  if (problems.includes("release-risk")) {
    return "Before tag, push, or publish, run the release gate: official Claude Code docs check, curdx-flow doctor, plugin validate, hook freshness, and npm/plugin tag parity.";
  }
  if (problems.includes("verification-gap")) {
    return `Do not finish yet; satisfy the verifier for ${snapshot.spec?.name ?? "the active spec"} and record fresh evidence.`;
  }
  if (phase === "planning") return "Create or resume the smallest spec/task plan that satisfies the route, then enter implementation.";
  return route.nextAction;
}
function recoveryFor(problems, plan, input) {
  if (!problems.includes("repeated-failure") && !problems.includes("verification-gap")) return null;
  const phase = input.verification?.phase ?? "current phase";
  const reason = input.verification?.reason ?? "missing or failed evidence";
  const memory = firstCapability(plan, "claude-mem");
  const pua = firstCapability(plan, "pua");
  return [
    `Recovery for ${phase}: ${reason}.`,
    memory ? `First search memory with ${memory.invocation}.` : "First inspect .curdx/brain.jsonl and the failing verifier output.",
    pua ? `If the same fix path already failed, use ${pua.invocation} for decomposition/retry discipline.` : "If the same fix path already failed, decompose before editing again.",
    "Then run the suggested verifier and record the result before completion."
  ].join(" ");
}
function decideLastMile(input = {}) {
  const cwd = input.cwd;
  const goal = normalize3(input.goal);
  const snapshot = input.snapshot ?? buildWorkflowSnapshot({ cwd, goal, spec: input.name });
  const route = input.routeFacts ?? classifySmartRoute(input);
  const brain = summarizeProjectBrain(cwd);
  const phase = inferPhase(input, route, snapshot, brain);
  const problemTypes = inferProblemTypes(input, route, snapshot, brain);
  const capabilityPlan = route.recommendedCapabilities.map(capabilityAction);
  const blocking = blockingGates(route, snapshot, problemTypes);
  const coordinatorInstruction = instructionFor(phase, problemTypes, capabilityPlan, route, snapshot);
  const recoveryInstruction = recoveryFor(problemTypes, capabilityPlan, input);
  const decision = {
    version: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    phase,
    problemType: problemTypes[0] ?? null,
    problemTypes,
    task: {
      goal,
      route: route.route,
      stack: route.stackProfile.primary,
      risk: route.policy.risk,
      activeSpec: snapshot.spec?.name ?? route.activeSpec?.name ?? null,
      currentTask: snapshot.tasks.current?.title ?? null
    },
    capabilityPlan,
    evidenceRequired: evidenceRequired(input, route, snapshot, problemTypes),
    evidenceSatisfied: evidenceSatisfied(snapshot, brain),
    blockingGates: blocking,
    coordinatorInstruction,
    recoveryInstruction
  };
  if (input.record === true) {
    appendBrainEvent(cwd, {
      type: "last-mile-decision",
      route: route.route,
      stack: route.stackProfile.primary,
      phase,
      reason: [
        `problem=${decision.problemType ?? "none"}`,
        `instruction=${coordinatorInstruction}`
      ].join(" "),
      files: input.toolNames?.length
    });
  }
  return decision;
}
function readArg7(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return void 0;
  return argv[idx + 1];
}
function parseList4(value) {
  if (!value) return [];
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}
function main7() {
  const argv = process.argv.slice(2);
  const available = parseList4(readArg7("--available-capabilities", argv));
  const decision = decideLastMile({
    cwd: readArg7("--cwd", argv),
    goal: readArg7("--goal", argv) ?? "",
    name: readArg7("--spec", argv) ?? readArg7("--name", argv),
    changedFiles: parseList4(readArg7("--files", argv)),
    availableCapabilities: available.length > 0 ? available : void 0,
    hookEvent: "runtime",
    record: argv.includes("--record")
  });
  process.stdout.write(JSON.stringify(decision, null, 2) + "\n");
}
function isDirectRun7() {
  try {
    const entry = fileURLToPath6(import.meta.url);
    return process.argv[1] === entry && basename9(entry).startsWith("last-mile-orchestrator.");
  } catch {
    return false;
  }
}
if (isDirectRun7()) {
  main7();
}

// src/hooks/task-completed-verifier.ts
function passThrough() {
  process4.stdout.write(JSON.stringify({ continue: true }));
  process4.exit(0);
}
function emitBlock(reason) {
  process4.stderr.write(`${reason}
`);
  process4.exit(2);
}
function buildTaskCompletedGateReason(input) {
  const baseReason = input.reason === "missing" ? `missing verification block for phase '${input.phase}'` : input.reason ?? "verification failed";
  const identity = [
    typeof input.state.runId === "string" && input.state.runId.length > 0 ? `runId=${input.state.runId}` : void 0,
    typeof input.state.goalId === "string" && input.state.goalId.length > 0 ? `goalId=${input.state.goalId}` : void 0,
    `spec=${basename10(input.specDir)}`,
    `phase=${input.phase}`
  ].filter((item) => item !== void 0).join(" ");
  const nextAction = typeof input.command === "string" && input.command.length > 0 ? `Re-run: ${input.command}.` : `Next action: run /curdx-flow:${input.phase} to record fresh verification evidence.`;
  return `${baseReason}. ${identity}. ${nextAction}${input.verifierHint}${input.recoveryHint}`;
}
async function main8() {
  let input;
  try {
    input = await readStdinJson();
  } catch {
    passThrough();
  }
  if (input.hook_event_name !== "TaskCompleted") {
    passThrough();
  }
  if (typeof input.task_id !== "string" || input.task_id.length === 0) {
    passThrough();
  }
  const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process4.cwd();
  const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!specPath) {
    passThrough();
  }
  const specDir = join7(cwd, specPath);
  const stateFile = join7(specDir, ".curdx-state.json");
  if (!existsSync7(stateFile)) {
    passThrough();
  }
  let state;
  try {
    state = JSON.parse(readFileSync8(stateFile, "utf8"));
  } catch {
    passThrough();
  }
  const phase = getVerificationPhase(state);
  if (phase === null) {
    passThrough();
  }
  let result;
  try {
    result = await verifyPhaseBlockWithEvidence(state, phase, specDir, cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logHookError(
      {
        hook: "task-completed-verifier",
        event: "verify_phase_block",
        msg,
        stack: err instanceof Error ? err.stack ?? "" : "",
        cwd,
        spec: basename10(specDir)
      },
      err instanceof Error ? err : void 0
    );
    process4.stderr.write("[task-completed-verifier] verification helper error; failing open\n");
    passThrough();
  }
  if (!result.ok) {
    let verifierHint = "";
    let routeName = "unknown";
    let stack = "unknown";
    let verifier;
    let recoveryHint = "";
    try {
      const route = classifySmartRoute({ cwd });
      routeName = route.route;
      stack = route.stackProfile.primary;
      verifier = route.suggestedVerifier.command ?? route.suggestedVerifier.fallback ?? void 0;
      if (verifier) verifierHint = ` Suggested verifier: ${verifier}.`;
      const lastMile = decideLastMile({
        cwd,
        routeFacts: route,
        hookEvent: "TaskCompleted",
        verification: {
          ok: false,
          phase,
          reason: result.reason ?? "verification failed",
          command: result.command
        },
        record: true
      });
      recoveryHint = ` Last-mile recovery: ${lastMile.recoveryInstruction ?? lastMile.coordinatorInstruction}`;
    } catch {
      verifierHint = "";
      recoveryHint = "";
    }
    appendBrainEvent(cwd, {
      type: "verification-blocked",
      route: routeName,
      stack,
      phase,
      verifier,
      reason: result.reason ?? "verification failed"
    });
    emitBlock(buildTaskCompletedGateReason({
      state,
      phase,
      specDir,
      reason: result.reason,
      command: result.command,
      verifierHint,
      recoveryHint
    }));
  }
  process4.exit(0);
}
main8().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  logHookError(
    {
      hook: "task-completed-verifier",
      event: "uncaught",
      msg,
      stack: err instanceof Error ? err.stack ?? "" : ""
    },
    err instanceof Error ? err : void 0
  );
  process4.stderr.write("[task-completed-verifier] internal error; failing open\n");
  passThrough();
});
//# sourceMappingURL=task-completed-verifier.mjs.map
