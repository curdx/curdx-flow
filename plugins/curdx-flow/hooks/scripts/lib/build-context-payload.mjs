import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/build-context-payload.ts
import { basename } from "node:path";
var IRON_LAW_SUMMARY = "No completion claim without fresh verification.";
var DEFAULT_MAX_BYTES = 2048;
var PayloadOverBudgetError = class extends Error {
  /** Actual byte length of the over-budget payload. */
  byteLength;
  /** Configured byte ceiling at the time of build. */
  maxBytes;
  constructor(byteLength, maxBytes) {
    super(
      `curdx context payload exceeds budget: ${byteLength}B > ${maxBytes}B`
    );
    this.name = "PayloadOverBudgetError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
};
function buildSessionStartPayload(state, specDir) {
  const specName = basename(specDir);
  const payload = { specName };
  if (state.completed === true) {
    payload.phase = "completed";
    payload.awaitingApproval = false;
    return payload;
  }
  if (typeof state.phase === "string") {
    payload.phase = state.phase;
  }
  if (typeof state.taskIndex === "number") {
    payload.taskIndex = state.taskIndex;
  }
  if (typeof state.totalTasks === "number") {
    payload.totalTasks = state.totalTasks;
  }
  if (state.awaitingApproval === true) {
    payload.awaitingApproval = true;
  } else if (state.awaitingApproval === false) {
    payload.awaitingApproval = false;
  }
  return payload;
}
function buildSubagentBlock(state, specDir) {
  const phase = typeof state.phase === "string" ? state.phase : "unknown";
  return [
    "<curdx-spec-context>",
    `phase: ${phase}`,
    `spec: ${specDir}`,
    `iron-law: ${IRON_LAW_SUMMARY}`,
    "</curdx-spec-context>"
  ].join("\n");
}
function buildContextPayload(state, specDir, opts) {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const out = opts?.forSubagent ? buildSubagentBlock(state, specDir) : JSON.stringify(buildSessionStartPayload(state, specDir));
  const byteLength = Buffer.byteLength(out, "utf8");
  if (byteLength > maxBytes) {
    throw new PayloadOverBudgetError(byteLength, maxBytes);
  }
  return out;
}
export {
  IRON_LAW_SUMMARY,
  PayloadOverBudgetError,
  buildContextPayload
};
//# sourceMappingURL=build-context-payload.mjs.map
