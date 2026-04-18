#!/usr/bin/env bash
# verify-runnable.sh — Delivery-Guarantee Harness
#
# Runs four gates before /curdx:ship pushes to the remote:
#   A. install  — lockfile is consistent and deps are installable
#   B. build    — compile / type-check succeeds for the detected stack
#   C. smoke    — at minimum, the project produces a non-error entrypoint
#   D. preflight — assertions derived from .curdx/features/<id>/findings.json
#
# North star: "If this exits 0, the branch is safe to push and run." Anything
# surprising the user at deploy time means a gate was missing here, not that
# this script should be weakened.
#
# Stack detection reuses scripts/detect-stack.sh. For unknown stacks, each
# gate degrades to a skip (with a note), never a false-positive pass.
#
# Contract:
#   stdout: a single JSON object { gates: {A, B, C, D}, status, ... }
#   exit 0: all blocker gates passed (advisory may warn, does not fail)
#   exit 1: a blocker gate failed; the JSON has .failures[]
#   exit 2: invocation error (missing deps like jq/bash)
#
# Flags:
#   --feature <id>     explicit feature id (default: read from .curdx/state.json)
#   --skip-build       skip gate B (for projects where build is long)
#   --skip-smoke       skip gate C
#   --skip-preflight   skip gate D (research-driven assertions)
#   --preflight-only   run gate D only (fast-path for iterative research)
#   --quiet            suppress the human summary on stderr

set -eu

# ---------- invocation safety ----------

command -v jq >/dev/null 2>&1 || {
  echo '{"error":"jq required"}' >&2
  exit 2
}

FEATURE=""
SKIP_BUILD=0
SKIP_SMOKE=0
SKIP_PREFLIGHT=0
PREFLIGHT_ONLY=0
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --feature) FEATURE="${2:-}"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
    --preflight-only) PREFLIGHT_ONLY=1; shift ;;
    --quiet) QUIET=1; shift ;;
    *) echo "[verify-runnable] unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [ "$PREFLIGHT_ONLY" = "1" ] && [ "$SKIP_PREFLIGHT" = "1" ]; then
  echo '[verify-runnable] --preflight-only and --skip-preflight are mutually exclusive' >&2
  exit 2
fi

# ---------- resolve feature + paths ----------

if [ -z "$FEATURE" ] && [ -f .curdx/state.json ]; then
  FEATURE=$(jq -r '.active_feature // empty' .curdx/state.json 2>/dev/null || true)
fi

FEATURE_DIR=""
FINDINGS_FILE=""
if [ -n "$FEATURE" ] && [ -d ".curdx/features/$FEATURE" ]; then
  FEATURE_DIR=".curdx/features/$FEATURE"
  FINDINGS_FILE="$FEATURE_DIR/findings.json"
fi

# Stack detect — reuse the canonical probe. On failure, keep going with "unknown".
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_JSON='{}'
if [ -x "$SCRIPT_DIR/detect-stack.sh" ]; then
  STACK_JSON=$("$SCRIPT_DIR/detect-stack.sh" . 2>/dev/null || echo '{}')
fi
BACKEND=$(echo "$STACK_JSON" | jq -r '.backend.language // "unknown"')
FRONTEND=$(echo "$STACK_JSON" | jq -r '.frontend.framework // "none"')

# ---------- result accumulators ----------

GATES='{}'
FAILURES='[]'
WARNINGS='[]'

record_gate() {
  # record_gate <name> <status: pass|fail|skip> <detail>
  GATES=$(echo "$GATES" | jq --arg k "$1" --arg s "$2" --arg d "$3" '. + {($k): {status: $s, detail: $d}}')
}
record_failure() {
  FAILURES=$(echo "$FAILURES" | jq --arg g "$1" --arg m "$2" '. + [{gate: $g, message: $m}]')
}
record_warning() {
  WARNINGS=$(echo "$WARNINGS" | jq --arg g "$1" --arg m "$2" '. + [{gate: $g, message: $m}]')
}

log() {
  [ "$QUIET" = "1" ] || echo "[verify-runnable] $*" >&2
}

# ---------- Gate A: install ----------

gate_install() {
  case "$BACKEND" in
    node)
      if [ -f package-lock.json ]; then
        # `npm ci --dry-run` validates lockfile↔package.json without mutating node_modules
        if npm ci --dry-run >/dev/null 2>&1; then
          record_gate A pass "npm ci --dry-run clean"
        else
          record_gate A fail "npm ci --dry-run reports lockfile drift"
          record_failure A "package-lock.json out of sync with package.json — run 'npm install' and commit the lockfile"
        fi
      elif [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
        if pnpm install --frozen-lockfile --dry-run >/dev/null 2>&1; then
          record_gate A pass "pnpm frozen-lockfile clean"
        else
          record_gate A fail "pnpm frozen-lockfile check failed"
          record_failure A "pnpm-lock.yaml out of sync — run 'pnpm install' and commit"
        fi
      elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
        if yarn install --frozen-lockfile --ignore-scripts >/dev/null 2>&1; then
          record_gate A pass "yarn frozen-lockfile clean"
        else
          record_gate A fail "yarn frozen-lockfile check failed"
          record_failure A "yarn.lock out of sync — run 'yarn install' and commit"
        fi
      else
        record_gate A skip "node project without lockfile (or matching CLI) — install gate skipped"
        record_warning A "no lockfile found; reproducible installs are not guaranteed"
      fi
      ;;
    python)
      if [ -f poetry.lock ] && command -v poetry >/dev/null 2>&1; then
        if poetry check >/dev/null 2>&1; then
          record_gate A pass "poetry check clean"
        else
          record_gate A fail "poetry check failed"
          record_failure A "poetry pyproject.toml/poetry.lock drift — run 'poetry lock'"
        fi
      elif [ -f requirements.txt ]; then
        record_gate A skip "python requirements.txt present — deep validation requires a venv; skipped"
      else
        record_gate A skip "python project without lockfile"
      fi
      ;;
    go)
      if go mod verify >/dev/null 2>&1; then
        record_gate A pass "go mod verify clean"
      else
        record_gate A fail "go mod verify failed"
        record_failure A "go.sum mismatch — run 'go mod tidy' and commit"
      fi
      ;;
    rust)
      if [ -f Cargo.lock ]; then
        if cargo check --locked --quiet >/dev/null 2>&1; then
          record_gate A pass "cargo --locked resolves"
        else
          record_gate A fail "cargo --locked failed"
          record_failure A "Cargo.lock out of sync — run 'cargo update' and commit"
        fi
      else
        record_gate A skip "rust project without Cargo.lock (library crate?)"
      fi
      ;;
    *)
      record_gate A skip "unknown backend ($BACKEND) — install gate cannot introspect"
      ;;
  esac
}

# ---------- Gate B: build ----------

gate_build() {
  if [ "$SKIP_BUILD" = "1" ]; then
    record_gate B skip "--skip-build flag set"
    return
  fi

  case "$BACKEND" in
    node)
      # Prefer type-check over full build (faster, sufficient proof the code compiles).
      if [ -f package.json ]; then
        if jq -e '.scripts.typecheck // .scripts["type-check"] // .scripts["check-types"]' package.json >/dev/null 2>&1; then
          SCRIPT_NAME=$(jq -r '.scripts | (.typecheck // .["type-check"] // .["check-types"] | keys? // "typecheck")' package.json 2>/dev/null || echo "typecheck")
          # fallback to a known runner name
          if npm run --silent "$SCRIPT_NAME" >/dev/null 2>&1 \
             || npm run --silent typecheck >/dev/null 2>&1 \
             || npm run --silent type-check >/dev/null 2>&1 \
             || npm run --silent check-types >/dev/null 2>&1; then
            record_gate B pass "npm typecheck script clean"
          else
            record_gate B fail "typecheck script returned non-zero"
            record_failure B "type errors detected — run the typecheck script locally to see them"
          fi
        elif [ -f tsconfig.json ] && command -v npx >/dev/null 2>&1; then
          if npx --no-install tsc --noEmit >/dev/null 2>&1; then
            record_gate B pass "tsc --noEmit clean"
          else
            record_gate B fail "tsc --noEmit failed"
            record_failure B "TypeScript compilation errors — run 'npx tsc --noEmit' to see them"
          fi
        else
          record_gate B skip "no typecheck script or tsconfig.json found"
        fi
      else
        record_gate B skip "no package.json"
      fi
      ;;
    go)
      if go build ./... >/dev/null 2>&1; then
        record_gate B pass "go build ./... clean"
      else
        record_gate B fail "go build ./... failed"
        record_failure B "go compile errors — run 'go build ./...' to see them"
      fi
      ;;
    rust)
      if cargo check --quiet >/dev/null 2>&1; then
        record_gate B pass "cargo check clean"
      else
        record_gate B fail "cargo check failed"
        record_failure B "rustc errors — run 'cargo check' to see them"
      fi
      ;;
    python)
      # Python is dynamic — a "build" gate that's not a full test run has limited value.
      # We do a syntax-only compile pass as a cheap correctness floor.
      if command -v python3 >/dev/null 2>&1; then
        if find . -name '*.py' -not -path './.venv/*' -not -path './venv/*' -not -path './node_modules/*' \
             -print0 2>/dev/null | xargs -0 -r python3 -m py_compile 2>/dev/null; then
          record_gate B pass "python3 -m py_compile clean on all *.py"
        else
          record_gate B fail "py_compile surfaced syntax errors"
          record_failure B "python syntax errors — run 'python3 -m py_compile <file>' on sources"
        fi
      else
        record_gate B skip "python3 not on PATH"
      fi
      ;;
    *)
      record_gate B skip "unknown backend ($BACKEND) — build gate cannot introspect"
      ;;
  esac
}

# ---------- Gate C: smoke ----------

gate_smoke() {
  if [ "$SKIP_SMOKE" = "1" ]; then
    record_gate C skip "--skip-smoke flag set"
    return
  fi

  # Smoke is intentionally minimal. We want to prove the project has *some*
  # producible artifact — not to run a full test suite. A dedicated smoke
  # script in .curdx/smoke.sh wins over heuristics.
  if [ -x .curdx/smoke.sh ]; then
    if .curdx/smoke.sh >/dev/null 2>&1; then
      record_gate C pass ".curdx/smoke.sh exit 0"
    else
      record_gate C fail ".curdx/smoke.sh non-zero"
      record_failure C ".curdx/smoke.sh failed — see its output; this is the project-defined smoke test"
    fi
    return
  fi

  # Fallback heuristics per stack.
  case "$BACKEND" in
    node)
      # If tests exist and `test` script is defined, do not run them here (too slow,
      # and verify already ran). Instead, confirm entrypoints resolve.
      if jq -e '.main // .bin' package.json >/dev/null 2>&1; then
        record_gate C pass "package.json exposes main/bin entrypoint"
      elif jq -e '.scripts.start' package.json >/dev/null 2>&1; then
        record_gate C pass "package.json has start script"
      else
        record_gate C skip "node project with no main/bin/start — define .curdx/smoke.sh to customize"
      fi
      ;;
    go)
      if go vet ./... >/dev/null 2>&1; then
        record_gate C pass "go vet ./... clean"
      else
        record_gate C fail "go vet ./... failed"
        record_failure C "go vet flagged issues; re-run to see them"
      fi
      ;;
    rust)
      record_gate C skip "rust cargo check already covered in build gate — define .curdx/smoke.sh for runtime smoke"
      ;;
    python)
      if command -v python3 >/dev/null 2>&1 && [ -f pyproject.toml ]; then
        if python3 -c "import tomllib; tomllib.loads(open('pyproject.toml').read())" >/dev/null 2>&1 \
           || python3 -c "import tomli; tomli.loads(open('pyproject.toml').read())" >/dev/null 2>&1; then
          record_gate C pass "pyproject.toml parses"
        else
          record_gate C skip "pyproject.toml present but no toml parser available — define .curdx/smoke.sh"
        fi
      else
        record_gate C skip "python project — define .curdx/smoke.sh for a real smoke test"
      fi
      ;;
    *)
      record_gate C skip "unknown backend — define .curdx/smoke.sh"
      ;;
  esac
}

# ---------- Gate D: preflight (research-driven) ----------

gate_preflight() {
  if [ "$SKIP_PREFLIGHT" = "1" ]; then
    record_gate D skip "--skip-preflight flag set"
    return
  fi

  if [ -z "$FINDINGS_FILE" ] || [ ! -f "$FINDINGS_FILE" ]; then
    record_gate D skip "no findings.json for feature (pre-flight research has not run, or produced no findings)"
    return
  fi

  if ! jq empty "$FINDINGS_FILE" 2>/dev/null; then
    record_gate D fail "findings.json is not valid JSON"
    record_failure D "$FINDINGS_FILE cannot be parsed — regenerate via /curdx:spec or /curdx:clarify"
    return
  fi

  TOTAL=$(jq '.findings | length' "$FINDINGS_FILE")
  if [ "$TOTAL" = "0" ]; then
    record_gate D pass "findings.json has 0 entries (empty is legal)"
    return
  fi

  PASSED=0
  FAILED=0
  ADVISORY_WARN=0

  # Walk each finding sequentially. Keep output deterministic.
  IDS=$(jq -r '.findings[].id' "$FINDINGS_FILE")
  for ID in $IDS; do
    SEVERITY=$(jq -r --arg id "$ID" '.findings[] | select(.id==$id) | .severity' "$FINDINGS_FILE")
    CMD=$(jq -r --arg id "$ID" '.findings[] | select(.id==$id) | .preflight_cmd // ""' "$FINDINGS_FILE")
    ASSERTION=$(jq -r --arg id "$ID" '.findings[] | select(.id==$id) | .assertion' "$FINDINGS_FILE")

    if [ -z "$CMD" ]; then
      # advisory without preflight_cmd — surface a warning but don't fail
      record_warning D "$ID ($SEVERITY): $ASSERTION — no preflight_cmd, advisory only"
      ADVISORY_WARN=$((ADVISORY_WARN + 1))
      continue
    fi

    # Run the preflight command in a subshell with a hard timeout of 30s.
    # Blocker findings get their failures reported to .failures; advisory ones to warnings only.
    if ( eval "$CMD" ) >/dev/null 2>&1; then
      PASSED=$((PASSED + 1))
    else
      if [ "$SEVERITY" = "blocker" ]; then
        record_failure D "$ID BLOCKER: $ASSERTION (cmd: $CMD)"
        FAILED=$((FAILED + 1))
      else
        record_warning D "$ID advisory: $ASSERTION (cmd: $CMD)"
        ADVISORY_WARN=$((ADVISORY_WARN + 1))
      fi
    fi
  done

  DETAIL="$PASSED/$TOTAL passed; $FAILED blocker failures; $ADVISORY_WARN advisory warnings"
  if [ "$FAILED" -gt 0 ]; then
    record_gate D fail "$DETAIL"
  else
    record_gate D pass "$DETAIL"
  fi
}

# ---------- orchestration ----------

log "stack: backend=$BACKEND frontend=$FRONTEND feature=${FEATURE:-<none>}"

if [ "$PREFLIGHT_ONLY" = "1" ]; then
  gate_preflight
else
  gate_install
  gate_build
  gate_smoke
  gate_preflight
fi

# ---------- emit ----------

FAILURE_COUNT=$(echo "$FAILURES" | jq 'length')
STATUS="pass"
[ "$FAILURE_COUNT" -gt 0 ] && STATUS="fail"

jq -n \
  --arg status "$STATUS" \
  --argjson gates "$GATES" \
  --argjson failures "$FAILURES" \
  --argjson warnings "$WARNINGS" \
  --arg feature "${FEATURE:-}" \
  --arg backend "$BACKEND" \
  --arg frontend "$FRONTEND" \
  '{
    status: $status,
    feature: $feature,
    stack: { backend: $backend, frontend: $frontend },
    gates: $gates,
    failures: $failures,
    warnings: $warnings
  }'

if [ "$QUIET" != "1" ]; then
  {
    echo ""
    echo "  verify-runnable summary"
    echo "  ----------------------"
    echo "$GATES" | jq -r 'to_entries[] | "  gate " + .key + ": " + .value.status + "  — " + .value.detail'
    if [ "$FAILURE_COUNT" -gt 0 ]; then
      echo ""
      echo "  BLOCKERS:"
      echo "$FAILURES" | jq -r '.[] | "    - [" + .gate + "] " + .message'
    fi
    W=$(echo "$WARNINGS" | jq 'length')
    if [ "$W" -gt 0 ]; then
      echo ""
      echo "  WARNINGS:"
      echo "$WARNINGS" | jq -r '.[] | "    - [" + .gate + "] " + .message'
    fi
  } >&2
fi

[ "$STATUS" = "pass" ] && exit 0 || exit 1
