import { createRequire as __ccr } from 'node:module';
import { fileURLToPath as __ccu } from 'node:url';
import { dirname as __ccd } from 'node:path';
const require = __ccr(import.meta.url);
const __filename = __ccu(import.meta.url);
const __dirname = __ccd(__filename);

// src/hooks/lib/check-verification-blocks.ts
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
var VERIFICATION_PHASES = [
  "research",
  "requirements",
  "design",
  "tasks",
  "execution"
];
async function runVerificationCheck(opts = {}) {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const env = opts.env ?? process.env;
  const specsDir = path.join(repoRoot, "specs");
  const specDir = resolveActiveSpecDir(specsDir);
  if (!specDir) {
    return {
      ok: true,
      code: 0,
      skipped: true,
      message: "check-verification-blocks: no active spec found, skipping.\n"
    };
  }
  if (env.CURDX_VERIFY_SKIP_BLOCKS === "1") {
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: "[check-verification-blocks] CURDX_VERIFY_SKIP_BLOCKS=1 \u2014 skipping gate.\n"
    };
  }
  const stateFile = path.join(specDir, ".curdx-state.json");
  let state;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 failed to read ${path.relative(repoRoot, stateFile)}: ${msg}
`
    };
  }
  if (typeof state !== "object" || state === null || !("verificationBlocks" in state)) {
    const rel2 = path.relative(repoRoot, specDir);
    return {
      ok: true,
      code: 0,
      skipped: true,
      specDir,
      message: `[check-verification-blocks] No verificationBlocks defined \u2014 skipping (treat as initial state)
  Active spec: ${rel2}
`
    };
  }
  const blocks = state.verificationBlocks;
  const blocksObj = blocks && typeof blocks === "object" && !Array.isArray(blocks) ? blocks : null;
  const presentPhases = blocksObj ? Object.keys(blocksObj).filter(
    (p) => blocksObj[p] !== void 0 && blocksObj[p] !== null
  ) : [];
  if (!blocksObj || presentPhases.length === 0) {
    const rel2 = path.relative(repoRoot, specDir);
    return {
      ok: false,
      code: 2,
      specDir,
      message: `\u2717 No verificationBlocks found. Run the appropriate phase verification command.
  Active spec: ${rel2}
  Hint: each phase must record an entry in .curdx-state.json::verificationBlocks
        (see plugins/curdx-flow/references/iron-law-verification.md).
`
    };
  }
  const failures = [];
  for (const phase of presentPhases) {
    if (!VERIFICATION_PHASES.includes(phase)) {
      failures.push({
        phase,
        reason: `unknown phase key "${phase}"`,
        command: "(remove from state)"
      });
      continue;
    }
    const raw = blocksObj[phase];
    if (typeof raw !== "object" || raw === null) {
      failures.push({
        phase,
        reason: "block is not an object",
        command: "(rewrite block)"
      });
      continue;
    }
    const block = raw;
    const command = typeof block.command === "string" ? block.command : "(unknown command)";
    const exitCode = block.exitCode;
    const timestamp = block.timestamp;
    const srcMtime = block.srcMtime;
    const failedReason = block.failedReason;
    if (exitCode !== 0) {
      failures.push({
        phase,
        reason: typeof failedReason === "string" && failedReason.length > 0 ? `verification failed: ${failedReason} (exitCode=${String(exitCode)})` : `verification failed (exitCode=${String(exitCode)})`,
        command
      });
      continue;
    }
    const ts = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
    if (Number.isNaN(ts)) {
      failures.push({
        phase,
        reason: `invalid timestamp "${String(timestamp)}"`,
        command
      });
      continue;
    }
    if (typeof srcMtime !== "number" || !Number.isFinite(srcMtime) || srcMtime < 0) {
      failures.push({
        phase,
        reason: `invalid srcMtime ${String(srcMtime)}`,
        command
      });
      continue;
    }
    if (ts < srcMtime) {
      const srcIso = new Date(srcMtime).toISOString();
      failures.push({
        phase,
        reason: `stale evidence: src changed at ${srcIso}, last verified at ${String(timestamp)}`,
        command
      });
    }
  }
  if (failures.length > 0) {
    const rel2 = path.relative(repoRoot, specDir);
    let message = "\u2717 verificationBlocks gate failed:\n";
    message += `  Active spec: ${rel2}
`;
    for (const f of failures) {
      message += `  - phase "${f.phase}": ${f.reason}
`;
      message += `      Re-run: ${f.command}
`;
    }
    message += "\n";
    message += "See plugins/curdx-flow/references/iron-law-verification.md for the full checklist.\n";
    return { ok: false, code: 2, specDir, message };
  }
  const rel = path.relative(repoRoot, specDir);
  return {
    ok: true,
    code: 0,
    specDir,
    message: `All verificationBlocks valid.
  Active spec: ${rel}
  Phases verified: ${presentPhases.join(", ")}
`
  };
}
function resolveActiveSpecDir(specsDir) {
  const pointer = path.join(specsDir, ".current-spec");
  if (existsSync(pointer)) {
    try {
      const name = readFileSync(pointer, "utf8").trim();
      if (name) {
        const dir = path.join(specsDir, name);
        if (existsSync(path.join(dir, ".curdx-state.json"))) return dir;
      }
    } catch {
    }
  }
  if (!existsSync(specsDir)) return null;
  let entries;
  try {
    entries = readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let latest = null;
  let latestMtime = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const stateFile = path.join(specsDir, e.name, ".curdx-state.json");
    if (!existsSync(stateFile)) continue;
    try {
      const st = statSync(stateFile);
      if (st.mtimeMs > latestMtime) {
        latestMtime = st.mtimeMs;
        latest = path.join(specsDir, e.name);
      }
    } catch {
      continue;
    }
  }
  return latest;
}
export {
  runVerificationCheck
};
//# sourceMappingURL=check-verification-blocks.mjs.map
