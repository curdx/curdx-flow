#!/usr/bin/env bash
# snapshot.sh — collect + sanitize + bundle curdx-flow diagnostics into a tarball.
#
# Output: ~/curdx-snapshot-<timestamp>.tar.gz  (or current dir with --here)
#
# What it collects (per-project, not cross-project):
#   - REPORT.md           human-readable summary (timeline of recent events,
#                         current phase, active feature, recent commits)
#   - events.jsonl        .curdx/logs/events.jsonl (sanitized)
#   - state.json          .curdx/state.json (sanitized)
#   - config.json         .curdx/config.json (sanitized)
#   - install-state.json  ~/.curdx/install-state.json (sanitized)
#   - features/           .curdx/features/<active>/*.md (sanitized) — only the
#                         active feature; others skipped to keep bundle small
#   - debug/              .curdx/debug/<active>.md if active_debug_slug set
#   - doctor.txt          NOT produced here — ask user to paste /curdx:doctor
#                         output separately (hook-level bash can't reliably
#                         invoke Claude to run a slash command)
#   - versions.txt        claude/node/jq/git versions
#   - META.txt            generation info + selected options + instruction
#                         for the recipient
#
# Usage:
#   bash scripts/snapshot.sh                # default: minimal bundle
#   bash scripts/snapshot.sh --strict       # aggressive redaction (email + IP)
#   bash scripts/snapshot.sh --include-transcript  # add Claude native transcript
#   bash scripts/snapshot.sh --here         # output into $PWD instead of $HOME
#   bash scripts/snapshot.sh --out PATH     # explicit output dir
#   bash scripts/snapshot.sh --no-preview   # skip the sanitization preview

set -eu

command -v jq >/dev/null 2>&1 || { echo "error: jq required" >&2; exit 2; }
command -v tar >/dev/null 2>&1 || { echo "error: tar required" >&2; exit 2; }

# args
STRICT=0
INCLUDE_TRANSCRIPT=0
PREVIEW=1
OUT_DIR="$HOME"

while [ $# -gt 0 ]; do
  case "$1" in
    --strict) STRICT=1 ;;
    --include-transcript) INCLUDE_TRANSCRIPT=1 ;;
    --no-preview) PREVIEW=0 ;;
    --here) OUT_DIR="$PWD" ;;
    --out) shift; OUT_DIR="${1:-$HOME}" ;;
    -h|--help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# sanitize wrapper
SANITIZE_SCRIPT="$(cd "$(dirname "$0")" && pwd)/lib/sanitize.sh"
[ -f "$SANITIZE_SCRIPT" ] || { echo "error: cannot find $SANITIZE_SCRIPT" >&2; exit 2; }

sanitize() {
  if [ "$STRICT" = "1" ]; then
    bash "$SANITIZE_SCRIPT" --strict
  else
    bash "$SANITIZE_SCRIPT"
  fi
}

# locate project root (walk up for .curdx/)
find_project_root() {
  local d="$PWD" i=0
  while [ "$i" -lt 10 ]; do
    [ -d "$d/.curdx" ] && { echo "$d"; return; }
    local parent
    parent=$(dirname "$d")
    [ "$parent" = "$d" ] && return
    d="$parent"
    i=$((i + 1))
  done
}

PROJECT_ROOT=$(find_project_root)
if [ -z "$PROJECT_ROOT" ]; then
  echo "error: not inside a curdx-flow-initialized project (no .curdx/ found in $PWD or parents)" >&2
  echo "tip: cd into your project first, or run /curdx:init." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

# timestamp
TS=$(date -u +%Y%m%dT%H%M%SZ)
BUNDLE_DIR="$OUT_DIR/curdx-snapshot-$TS"
TARBALL="$OUT_DIR/curdx-snapshot-$TS.tar.gz"

mkdir -p "$BUNDLE_DIR"
echo "[snapshot] collecting into $BUNDLE_DIR"

# ---------- META.txt ----------
cat > "$BUNDLE_DIR/META.txt" <<META
curdx-flow snapshot
generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
project_root: $(echo "$PROJECT_ROOT" | sanitize)
platform: $(uname -sr)
options:
  strict: $STRICT
  include_transcript: $INCLUDE_TRANSCRIPT

what to do with this bundle:
  - email / DM / upload this tar.gz to the curdx-flow maintainer
  - DO NOT post publicly without reviewing REPORT.md and events.jsonl
  - redaction has been applied but is regex-based; spot-check before sharing
  - transcript (if included) is most likely to contain sensitive info
META

# ---------- versions.txt ----------
{
  echo "curdx-flow: $(jq -r '.version // "unknown"' "$HOME/.curdx/install-state.json" 2>/dev/null || echo "unknown")"
  echo "node: $(node --version 2>/dev/null || echo "not installed")"
  echo "jq: $(jq --version 2>/dev/null || echo "not installed")"
  echo "git: $(git --version 2>/dev/null || echo "not installed")"
  if command -v claude >/dev/null 2>&1; then
    echo "claude: $(claude --version 2>/dev/null | head -1 || echo "version unknown")"
  else
    echo "claude: not installed"
  fi
} > "$BUNDLE_DIR/versions.txt"

# ---------- sanitize + copy state.json / config.json ----------
if [ -f ".curdx/state.json" ]; then
  sanitize < ".curdx/state.json" > "$BUNDLE_DIR/state.json"
fi
if [ -f ".curdx/config.json" ]; then
  sanitize < ".curdx/config.json" > "$BUNDLE_DIR/config.json"
fi

# ---------- sanitize + copy install-state.json (user-global) ----------
if [ -f "$HOME/.curdx/install-state.json" ]; then
  sanitize < "$HOME/.curdx/install-state.json" > "$BUNDLE_DIR/install-state.json"
fi

# ---------- sanitize + copy events.jsonl ----------
if [ -f ".curdx/logs/events.jsonl" ]; then
  sanitize < ".curdx/logs/events.jsonl" > "$BUNDLE_DIR/events.jsonl"
  EVENT_COUNT=$(wc -l < "$BUNDLE_DIR/events.jsonl" | tr -d ' ')
else
  EVENT_COUNT=0
fi

# ---------- sanitize + copy active feature artifacts ----------
ACTIVE_FEATURE=""
if [ -f ".curdx/state.json" ]; then
  ACTIVE_FEATURE=$(jq -r '.active_feature // empty' .curdx/state.json 2>/dev/null || true)
fi
if [ -n "$ACTIVE_FEATURE" ] && [ -d ".curdx/features/$ACTIVE_FEATURE" ]; then
  mkdir -p "$BUNDLE_DIR/features/$ACTIVE_FEATURE"
  for f in .curdx/features/"$ACTIVE_FEATURE"/*.md; do
    [ -f "$f" ] || continue
    sanitize < "$f" > "$BUNDLE_DIR/features/$ACTIVE_FEATURE/$(basename "$f")"
  done
fi

# ---------- sanitize + copy active debug session ----------
ACTIVE_DEBUG=""
if [ -f ".curdx/state.json" ]; then
  ACTIVE_DEBUG=$(jq -r '.active_debug_slug // empty' .curdx/state.json 2>/dev/null || true)
fi
if [ -n "$ACTIVE_DEBUG" ] && [ -f ".curdx/debug/$ACTIVE_DEBUG.md" ]; then
  mkdir -p "$BUNDLE_DIR/debug"
  sanitize < ".curdx/debug/$ACTIVE_DEBUG.md" > "$BUNDLE_DIR/debug/$ACTIVE_DEBUG.md"
fi

# ---------- optional: Claude Code native transcript ----------
if [ "$INCLUDE_TRANSCRIPT" = "1" ]; then
  # Claude stores transcripts at ~/.claude/projects/<encoded-path>/<session>.jsonl
  CLAUDE_PROJECT_DIR="$HOME/.claude/projects"
  if [ -d "$CLAUDE_PROJECT_DIR" ]; then
    # find the MOST RECENTLY MODIFIED transcript across all projects
    LATEST_TRANSCRIPT=$(find "$CLAUDE_PROJECT_DIR" -name '*.jsonl' -type f -print0 2>/dev/null \
      | xargs -0 ls -t 2>/dev/null \
      | head -1 || true)
    if [ -n "$LATEST_TRANSCRIPT" ]; then
      # cap at last 5000 lines to keep bundle size reasonable
      tail -n 5000 "$LATEST_TRANSCRIPT" | sanitize > "$BUNDLE_DIR/transcript.jsonl"
    fi
  fi
fi

# ---------- REPORT.md — human-readable summary ----------
{
  echo "# curdx-flow snapshot — REPORT.md"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Strict: $STRICT | Transcript included: $INCLUDE_TRANSCRIPT"
  echo
  echo "## Current state"
  if [ -f "$BUNDLE_DIR/state.json" ]; then
    jq -r '
      "- **Phase:** " + (.phase // "unknown") + "\n" +
      "- **Active feature:** " + (.active_feature // "none") + "\n" +
      "- **Active debug:** " + (.active_debug_slug // "none") + "\n" +
      "- **Task progress:** " + ((.task_index // 0) | tostring) + " / " + ((.total_tasks // 0) | tostring) + "\n" +
      "- **Global iteration:** " + ((.global_iteration // 0) | tostring) + "\n" +
      "- **Awaiting approval:** " + ((.awaiting_approval // false) | tostring)
    ' "$BUNDLE_DIR/state.json"
  fi
  echo
  echo "## Project stack (from config.json)"
  if [ -f "$BUNDLE_DIR/config.json" ]; then
    jq -r '
      "- backend: " + (.stack.backend.language // "?") + "\n" +
      "- frontend: " + (.stack.frontend.framework // "?") + "\n" +
      "- test runner: " + (.testing.runner // "?") + "\n" +
      "- browser testing: " + (.browser_testing.mode // "none")
    ' "$BUNDLE_DIR/config.json"
  fi
  echo
  echo "## Recent events (last 30 from events.jsonl, $EVENT_COUNT total)"
  echo
  echo '```'
  if [ -f "$BUNDLE_DIR/events.jsonl" ]; then
    tail -30 "$BUNDLE_DIR/events.jsonl" | while IFS= read -r line; do
      echo "$line" | jq -r '[.ts, .event, (.command // .tool // .hook // .matcher // "")] | @tsv' 2>/dev/null || echo "$line"
    done
  else
    echo "(no events.jsonl — logging wasn't active or no events yet)"
  fi
  echo '```'
  echo
  echo "## Hook firings summary"
  echo
  if [ -f "$BUNDLE_DIR/events.jsonl" ]; then
    echo '```'
    jq -r 'select(.event == "hook_denied" or .event == "hook_asked" or .event == "failure_escalation") |
      [.ts, .event, (.hook // ""), (.rule // .pattern // .level // "")] | @tsv' \
      "$BUNDLE_DIR/events.jsonl" 2>/dev/null | tail -20
    echo '```'
  fi
  echo
  echo "## Recent git commits (20)"
  echo
  echo '```'
  git log --oneline -20 2>/dev/null | sanitize || echo "(not a git repo or no commits yet)"
  echo '```'
  echo
  echo "## Files in this bundle"
  echo
  (cd "$BUNDLE_DIR" && find . -type f -not -path './REPORT.md' | sort | sed 's|^\./|  - |')
  echo
  echo "## Next step for recipient"
  echo
  echo "1. Skim events.jsonl for suspicious activity"
  echo "2. Check state.json and features/ to understand what phase of work was active"
  echo "3. Correlate hook_denied / failure_escalation events with recent git commits"
  echo "4. For full context, ask the reporter to also paste their \`/curdx:doctor\` output"
  echo "   (this bundle doesn't include it — doctor output has to be generated from inside"
  echo "   a claude session which snapshot.sh can't do)"
} > "$BUNDLE_DIR/REPORT.md"

# ---------- preview (unless --no-preview) ----------
if [ "$PREVIEW" = "1" ]; then
  echo
  echo "[snapshot] bundle ready at: $BUNDLE_DIR"
  echo "[snapshot] files:"
  (cd "$BUNDLE_DIR" && find . -type f | sort | sed 's|^|    |')
  echo
  echo "[snapshot] sanitization preview (first 10 redactions across all files):"
  grep -rn '<REDACTED:' "$BUNDLE_DIR" 2>/dev/null | head -10 || echo "    (no secrets detected to redact)"
  echo
  printf "[snapshot] seal into tarball? [Y/n] "
  read -r confirm
  case "${confirm:-y}" in
    n|N|no|No) echo "[snapshot] aborted. the bundle dir is at $BUNDLE_DIR — you can inspect and tar it yourself."; exit 0 ;;
  esac
fi

# ---------- tarball ----------
tar -czf "$TARBALL" -C "$OUT_DIR" "$(basename "$BUNDLE_DIR")"
rm -rf "$BUNDLE_DIR"

echo
echo "[snapshot] done: $TARBALL"
SIZE=$(du -h "$TARBALL" | cut -f1)
echo "[snapshot] size: $SIZE"
echo
echo "share this file with the maintainer via email / DM / upload. it contains"
echo "sanitized state, events, and (optionally) transcript excerpts. unless you"
echo "passed --strict, emails and IPs are NOT redacted."
