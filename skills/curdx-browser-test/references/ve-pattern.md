# The VE Pattern — dev-server lifecycle for browser tests

## Why three steps

Every browser test must start a real dev server, run assertions against it, and guarantee the server stops. Skipping any step creates problems:

- Skip VE1 (start): the test hits a stale server from a previous run, asserting against old code
- Skip VE3 (cleanup): dev server leaks across test runs; port conflicts; "it works on my machine" variance
- Skip VE2's evidence capture: "passing" means nothing without screenshots + console-error records

## VE1 — Start dev server

```bash
# read dev command from config (fallback: npm run dev)
DEV_CMD=$(jq -r '.dev_command // "npm run dev"' .curdx/config.json)
PORT="${PORT:-3000}"   # projects can override via env
EVIDENCE=".curdx/features/$ACTIVE/evidence"
mkdir -p "$EVIDENCE"

# launch in background, capture pid, redirect output
nohup bash -c "$DEV_CMD" > "$EVIDENCE/dev.log" 2>&1 &
echo $! > "$EVIDENCE/dev.pid"

# wait for readiness — max 60s
DEADLINE=$(( $(date +%s) + 60 ))
while [ $(date +%s) -lt $DEADLINE ]; do
  if curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
    echo "dev server up on :$PORT"
    break
  fi
  # check if process died
  if ! ps -p "$(cat "$EVIDENCE/dev.pid")" >/dev/null 2>&1; then
    echo "dev server died during startup; see $EVIDENCE/dev.log" >&2
    exit 1
  fi
  sleep 0.5
done
```

Key details:
- `nohup` + `&` + pid file — standard Unix background-process pattern
- Output goes to `dev.log` so failure mode is inspectable
- Readiness check via curl, not a fixed `sleep` — fixes flakiness
- Process-liveness check inside the poll loop — catches "dev server crashed immediately" cases

## VE2 — Run assertions + capture evidence

Branch by `.curdx/config.json` `browser_testing.mode`:

- `playwright` → see `playwright.md`
- `chrome-devtools` → see `chrome-devtools.md`
- `both` → run playwright suite first, then chrome-devtools-mcp-driven assertions for WebGL parts

Always:
- Capture at least one screenshot to `evidence/`
- Capture console errors and assert zero (or explicitly allowlist third-party noise)
- Capture network errors if `--trace` or equivalent is used

## VE3 — Cleanup (mandatory, runs on failure)

Use `trap` in bash OR `try/finally` in Node scripts to guarantee cleanup runs even when VE2 throws:

```bash
cleanup_ve3() {
  PID=$(cat "$EVIDENCE/dev.pid" 2>/dev/null)
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    # wait up to 3s for graceful shutdown
    for i in 1 2 3; do
      ps -p "$PID" >/dev/null 2>&1 || break
      sleep 1
    done
    # force kill if still alive
    ps -p "$PID" >/dev/null 2>&1 && kill -9 "$PID" 2>/dev/null || true
  fi
  # also kill anything still holding the port (child processes, detached workers)
  lsof -ti ":$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  rm -f "$EVIDENCE/dev.pid"
}
trap cleanup_ve3 EXIT INT TERM
```

Key details:
- SIGTERM first, then SIGKILL after 3s — respects dev server's own cleanup (e.g., HMR tears down workers)
- `lsof -ti :PORT` catches zombie children that `kill $PID` missed
- `trap ... EXIT INT TERM` runs on any exit path including SIGINT (Ctrl-C during automated runs)

## The VF variant — bug-fix Reality Check

When the active feature is a bug fix (task tagged `[FIX]` or phase was `debug`), VE2 expands to two captures:

**VF-BEFORE** (run once, at `/curdx:debug` start):
1. VE1 start dev server
2. Run the exact reproduction command (from the bug report) against it
3. Capture stdout + screenshot if visual → `evidence/before-$ts.log`
4. VE3 cleanup

**VF-AFTER** (run at `/curdx:verify` end, after the fix):
1. VE1 start dev server
2. Run the SAME reproduction command
3. Capture → `evidence/after-$ts.log`
4. Diff BEFORE vs AFTER — should show the failure mode is gone
5. VE3 cleanup

The verification.md for a bug fix includes both outputs in a Regression Proof section.

## Anti-patterns

- **`sleep 5` instead of curl polling**: flaky; fast machines waste time, slow machines fail.
- **Not using `trap`**: the one time VE2 throws is the one time the dev server leaks.
- **Hardcoding `PORT=3000`**: respect `PORT` env, read `package.json` `start` script if parsable, fall back to 3000.
- **Running browser tests in parallel with other browser tests**: ports conflict; Playwright's `fullyParallel: true` doesn't interact well with our single-dev-server-per-feature model. Keep `fullyParallel: false` in generated configs.
- **Killing only `$PID`**: frameworks like Next.js / Vite spawn children. Use `lsof -ti :PORT` as the belt-and-suspenders.
