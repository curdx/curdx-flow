import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/stop-watcher.ts
import {
  existsSync as existsSync2,
  readFileSync as readFileSync3,
  readdirSync as readdirSync3,
  statSync as statSync3,
  unlinkSync as unlinkSync2
} from "node:fs";
import { spawn } from "node:child_process";
import { basename as basename4, dirname as dirname2, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
import process5 from "node:process";

// src/hooks/_shared/run-hook.ts
import path2 from "node:path";
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

// src/hooks/_shared/run-hook.ts
function deriveHookName() {
  const entry = process4.argv[1];
  if (!entry) return "unknown-hook";
  return path2.basename(entry).replace(/\.(mjs|js|ts)$/, "");
}
async function runHook(handler, options = {}) {
  const { readStdin = true } = options;
  const hookName = deriveHookName();
  let stdinForCtx = {};
  try {
    try {
      stdinForCtx = readStdin ? await readStdinJson() : {};
    } catch (parseErr) {
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      logHookError(
        {
          hook: hookName,
          event: "stdin_parse",
          msg: e.message,
          stack: e.stack ?? ""
        },
        e
      );
      throw e;
    }
    const output = await handler(stdinForCtx);
    if (output !== void 0 && output !== null) {
      process4.stdout.write(JSON.stringify(output) + "\n");
    }
    process4.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    logHookError(
      {
        hook: hookName,
        event: "uncaught",
        msg,
        stack,
        ...typeof stdinForCtx.cwd === "string" ? { cwd: stdinForCtx.cwd } : {},
        ...typeof stdinForCtx.transcript_path === "string" ? { transcript_path: stdinForCtx.transcript_path } : {}
      },
      err instanceof Error ? err : void 0
    );
    process4.stderr.write(`[hook] ${msg}
`);
    process4.exit(0);
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

// src/hooks/_shared/atomic-write.ts
import { writeFileSync as writeFileSync2, renameSync as renameSync2 } from "node:fs";
import { randomBytes } from "node:crypto";
function writeFileAtomic(path3, data) {
  const tmp = `${path3}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  writeFileSync2(tmp, data);
  renameSync2(tmp, path3);
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
  const artifactEntries = (input.artifacts ?? []).map((artifact) => {
    const normalized = normalizeArtifactIndexEntry(artifact, input.evidence, nowIso(input.now));
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
  const artifactIssues = artifacts.flatMap((artifact) => {
    const normalized = normalizeArtifactIndexEntry(artifact, evidence, createdAt);
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

// src/hooks/stop-watcher.ts
var SETTINGS_REL_PATH2 = ".claude/curdx-flow.local.md";
var ALL_TASKS_COMPLETE_RE = /(^|\W)ALL_TASKS_COMPLETE(\W|$)/;
function preserveDotPrefix(specPath, specsDirs) {
  for (const dir of specsDirs) {
    if (!dir.startsWith("./")) continue;
    const body = dir.slice(2);
    if (body && specPath.startsWith(`${body}/`)) return `./${specPath}`;
    if (body && specPath === body) return `./${specPath}`;
  }
  return specPath;
}
function normalizeText(input) {
  if (!input) return "";
  let s = input;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n?/g, "\n");
}
function readEnabledSetting(settingsPath) {
  let raw;
  try {
    raw = readFileSync3(settingsPath, "utf8");
  } catch {
    return null;
  }
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  const block = fmMatch?.[1];
  if (!block) return null;
  const line = block.split(/\r?\n/).find((l) => /^enabled\s*:/.test(l));
  if (!line) return null;
  const value = line.replace(/^enabled\s*:\s*/, "");
  const cleaned = value.replace(/[\s"']/g, "").toLowerCase();
  return cleaned || null;
}
async function maybeWaitForRecentStateFile(stateFile) {
  let mtimeMs;
  try {
    mtimeMs = statSync3(stateFile).mtimeMs;
  } catch {
    return;
  }
  const ageMs = Date.now() - mtimeMs;
  if (ageMs < 2e3) {
    await new Promise((r) => setTimeout(r, 1e3));
  }
}
function tailContainsCompletionMarker(transcriptPath, lineCount) {
  let raw;
  try {
    raw = readFileSync3(transcriptPath, "utf8");
  } catch {
    return false;
  }
  const lines = normalizeText(raw).split("\n");
  const slice = lines.slice(Math.max(0, lines.length - lineCount));
  for (const line of slice) {
    if (ALL_TASKS_COMPLETE_RE.test(line)) return true;
  }
  return false;
}
function markSpecCompletedInEpic(cwd, epicName, specName) {
  const epicStateFile = join3(
    cwd,
    "specs",
    "_epics",
    epicName,
    ".epic-state.json"
  );
  if (!existsSync2(epicStateFile)) return;
  let epic;
  try {
    epic = JSON.parse(readFileSync3(epicStateFile, "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(epic.specs)) return;
  let mutated = false;
  for (const entry of epic.specs) {
    if (entry && entry.name === specName) {
      entry.status = "completed";
      mutated = true;
    }
  }
  if (!mutated) return;
  try {
    writeFileAtomic(epicStateFile, JSON.stringify(epic, null, 2) + "\n");
    process5.stderr.write(
      `[curdx-flow] Updated epic '${epicName}': spec '${specName}' marked completed
`
    );
  } catch {
  }
}
function fireUpdateSpecIndex() {
  let here;
  try {
    here = typeof __filename === "string" && __filename.length > 0 ? __filename : fileURLToPath(import.meta.url);
  } catch {
    here = fileURLToPath(import.meta.url);
  }
  const scriptDir = dirname2(here);
  const target = join3(scriptDir, "update-spec-index.mjs");
  if (!existsSync2(target)) return;
  try {
    const child = spawn(process5.execPath, [target, "--quiet"], {
      stdio: ["ignore", "ignore", "ignore"],
      detached: true
    });
    child.unref();
  } catch {
  }
}
function cleanupStaleProgressFiles(specDirFs) {
  let entries;
  try {
    entries = readdirSync3(specDirFs);
  } catch {
    return;
  }
  const now = Date.now();
  const sixtyMinMs = 60 * 60 * 1e3;
  for (const name of entries) {
    if (!name.startsWith(".progress-task-") || !name.endsWith(".md")) continue;
    const fp = join3(specDirFs, name);
    let mtimeMs;
    try {
      mtimeMs = statSync3(fp).mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs > sixtyMinMs) {
      try {
        unlinkSync2(fp);
      } catch {
      }
    }
  }
}
function countUncheckedTasks(tasksFile) {
  let raw;
  try {
    raw = readFileSync3(tasksFile, "utf8");
  } catch {
    return 0;
  }
  const lines = normalizeText(raw).split("\n");
  let n = 0;
  for (const line of lines) {
    if (/^\s*- \[ \]/.test(line)) n++;
  }
  return n;
}
function buildVerificationBlockFailDecision(phase, result, specName) {
  const cmd = typeof result.command === "string" && result.command.length > 0 ? result.command : `/curdx-flow:${phase} (re-run phase to record verification)`;
  let reason;
  let systemMessage;
  if (result.reason === "missing") {
    reason = `Phase '${phase}' has no verification block. Run: ${cmd}. Spec: ${specName}. Then try again.`;
    systemMessage = `curdx-flow: phase '${phase}' missing verification block (spec: ${specName})`;
  } else if (typeof result.reason === "string" && result.reason.startsWith("Stale evidence")) {
    reason = result.reason;
    systemMessage = `curdx-flow: phase '${phase}' verification stale (spec: ${specName})`;
  } else {
    const detail = result.reason ?? "verification failed";
    reason = `Verification failed for phase '${phase}': ${detail}. Fix and re-run: ${cmd}. Spec: ${specName}.`;
    systemMessage = `curdx-flow: phase '${phase}' verification failed (spec: ${specName})`;
  }
  return {
    decision: "block",
    reason,
    systemMessage
  };
}
function buildMalformedVerificationBlock(specName) {
  const reason = `Phase 'unknown' verificationBlocks malformed in .curdx-state.json. Fix: edit ${specName}/.curdx-state.json (or run /curdx-flow:cancel). Spec: ${specName}. See references/iron-law-verification.md.`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: verificationBlocks malformed (spec: ${specName})`
  };
}
function buildCorruptStateBlock(specPath) {
  const reason = `ERROR: Corrupt state file at ${specPath}/.curdx-state.json

Recovery options:
1. Reset state: /curdx-flow:implement (reinitializes from tasks.md)
2. Cancel spec: /curdx-flow:cancel`;
  return {
    decision: "block",
    reason,
    systemMessage: "curdx-flow: corrupt state file"
  };
}
function buildCostRunawayBlock(state, specName, stateFilePath) {
  const globalIter = typeof state.globalIteration === "number" ? state.globalIteration : 1;
  const maxGlobal = typeof state.maxGlobalIterations === "number" ? state.maxGlobalIterations : 100;
  const taskIter = typeof state.taskIteration === "number" ? state.taskIteration : 1;
  const maxTask = typeof state.maxTaskIterations === "number" ? state.maxTaskIterations : 5;
  if (globalIter >= maxGlobal) {
    const reason = `Cost runaway guard tripped: globalIteration=${globalIter} >= maxGlobalIterations=${maxGlobal}.
Loop blocked. Either:
- Investigate why your loop ran ${globalIter} iterations (check .progress.md)
- Override with: /curdx-flow:implement --max-global-iterations <higher-cap>
- Reset by editing ${stateFilePath}: set globalIteration to a lower value

Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway \u2014 globalIteration cap reached (${specName})`
    };
  }
  if (taskIter >= maxTask) {
    const reason = `Cost runaway guard tripped: taskIteration=${taskIter} >= maxTaskIterations=${maxTask}.
Loop blocked. Either:
- Investigate why your loop ran ${taskIter} iterations (check .progress.md)
- Override with: /curdx-flow:implement --max-task-iterations <higher-cap>
- Reset by editing ${stateFilePath}: set taskIteration to a lower value

Spec: ${specName}  Phase: implement`;
    return {
      decision: "block",
      reason,
      systemMessage: `curdx-flow: cost runaway \u2014 taskIteration cap reached (${specName})`
    };
  }
  return null;
}
function buildUncheckedTasksBlock(specPath, taskIndex, totalTasks, unchecked) {
  const reason = `Tasks incomplete: state index (${taskIndex}) reached total (${totalTasks}), but tasks.md has ${unchecked} unchecked items.

## Action Required
1. Read ${specPath}/tasks.md and find unchecked tasks (- [ ])
2. Execute remaining unchecked tasks via spec-executor
3. Update .curdx-state.json totalTasks to match actual count
4. Only output ALL_TASKS_COMPLETE when every task in tasks.md is checked off
5. Do NOT add new tasks \u2014 complete existing ones only`;
  return {
    decision: "block",
    reason,
    systemMessage: `curdx-flow: ${unchecked} unchecked tasks remain in tasks.md`
  };
}
runHook(async (input) => {
  if (input?.stop_hook_active === true) {
    return;
  }
  const cwd = input?.cwd;
  if (!cwd) return;
  const settingsPath = join3(cwd, SETTINGS_REL_PATH2);
  if (existsSync2(settingsPath)) {
    const enabled = readEnabledSetting(settingsPath);
    if (enabled === "false") return;
  }
  const rawSpecPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!rawSpecPath) return;
  const specPath = preserveDotPrefix(rawSpecPath, getSpecsDirs({ cwd }));
  const specName = basename4(specPath);
  const stateFile = join3(cwd, specPath, ".curdx-state.json");
  if (!existsSync2(stateFile)) return;
  await maybeWaitForRecentStateFile(stateFile);
  try {
    const capState = JSON.parse(readFileSync3(stateFile, "utf8"));
    if (capState.completed !== true) {
      const runawayBlock = buildCostRunawayBlock(capState, specName, stateFile);
      if (runawayBlock) return runawayBlock;
    }
  } catch {
  }
  const transcriptPath = input.transcript_path;
  if (transcriptPath && existsSync2(transcriptPath)) {
    const handleCompletion = async (variant) => {
      const label = variant === "primary" ? "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript" : "[curdx-flow] ALL_TASKS_COMPLETE detected in transcript (tail-end)";
      process5.stderr.write(label + "\n");
      let parsedState;
      let stateMalformed = false;
      try {
        parsedState = JSON.parse(readFileSync3(stateFile, "utf8"));
      } catch {
        parsedState = void 0;
        stateMalformed = true;
      }
      if (stateMalformed) {
        return buildMalformedVerificationBlock(specName);
      }
      if (parsedState?.completed === true) {
        return void 0;
      }
      const epicName = parsedState && typeof parsedState.epicName === "string" && parsedState.epicName.length > 0 ? parsedState.epicName : void 0;
      if (parsedState) {
        const knownPhase = getVerificationPhase(parsedState);
        if (knownPhase !== null) {
          let result;
          try {
            result = await verifyPhaseBlockWithEvidence(
              parsedState,
              knownPhase,
              join3(cwd, specPath),
              cwd
            );
          } catch {
            return buildMalformedVerificationBlock(specName);
          }
          if (!result.ok) {
            return buildVerificationBlockFailDecision(
              knownPhase,
              result,
              specName
            );
          }
        }
      }
      const currentEpicFile = join3(cwd, "specs", ".current-epic");
      if (epicName && existsSync2(currentEpicFile)) {
        markSpecCompletedInEpic(cwd, epicName, specName);
      }
      fireUpdateSpecIndex();
      return void 0;
    };
    if (tailContainsCompletionMarker(transcriptPath, 500)) {
      const blocked = await handleCompletion("primary");
      if (blocked) return blocked;
      return;
    }
    if (tailContainsCompletionMarker(transcriptPath, 20)) {
      const blocked = await handleCompletion("fallback");
      if (blocked) return blocked;
      return;
    }
  }
  let state;
  try {
    state = JSON.parse(readFileSync3(stateFile, "utf8"));
  } catch {
    return buildCorruptStateBlock(specPath);
  }
  if (state.completed === true) {
    return;
  }
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  const taskIndex = typeof state.taskIndex === "number" ? state.taskIndex : 0;
  const totalTasks = typeof state.totalTasks === "number" ? state.totalTasks : 0;
  if (phase === "execution") {
    process5.stderr.write(
      `[curdx-flow] Session stopped during spec: ${specName} | Task: ${taskIndex + 1}/${totalTasks}
`
    );
  }
  if (phase === "execution" && taskIndex >= totalTasks && totalTasks > 0) {
    const tasksFile = join3(cwd, specPath, "tasks.md");
    if (existsSync2(tasksFile)) {
      const unchecked = countUncheckedTasks(tasksFile);
      if (unchecked > 0) {
        process5.stderr.write(
          `[curdx-flow] State says complete but tasks.md has ${unchecked} unchecked items
`
        );
        return buildUncheckedTasksBlock(
          specPath,
          taskIndex,
          totalTasks,
          unchecked
        );
      }
    }
    process5.stderr.write(
      `[curdx-flow] All tasks verified complete for ${specName}
`
    );
    return;
  }
  if (phase === "execution" && taskIndex < totalTasks) {
    if (state.awaitingApproval === true) {
      process5.stderr.write(
        `[curdx-flow] awaitingApproval=true, allowing stop for user gate
`
      );
      return;
    }
    cleanupStaleProgressFiles(join3(cwd, specPath));
    process5.stderr.write(
      `[curdx-flow] execution remains in progress; native /goal or a later /curdx-flow:implement invocation should drive the next turn
`
    );
    return;
  }
  cleanupStaleProgressFiles(join3(cwd, specPath));
});
//# sourceMappingURL=stop-watcher.mjs.map
