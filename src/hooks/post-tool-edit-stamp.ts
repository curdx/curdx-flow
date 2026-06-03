import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "./_shared/run-hook.js";
import { resolveCurrent } from "./_shared/path-resolver.js";
import { writeFileAtomic } from "./_shared/atomic-write.js";
import type { CurdxState } from "./_shared/types.js";

runHook(async (input) => {
  const cwd = input?.cwd;
  if (!cwd) {
    return;
  }

  const specPath = resolveCurrent({ cwd, sessionId: input.session_id });
  if (!specPath) {
    return;
  }

  const stateFile = join(cwd, specPath, ".curdx-state.json");
  if (!existsSync(stateFile)) {
    return;
  }

  let state: CurdxState;
  try {
    state = JSON.parse(readFileSync(stateFile, "utf8")) as CurdxState;
  } catch {
    return;
  }

  state.lastSrcEditMs = Date.now();
  try {
    writeFileAtomic(stateFile, JSON.stringify(state) + "\n");
  } catch {
    return;
  }
});
