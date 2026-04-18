#!/usr/bin/env bash
# snapshot.sh — collect + bundle curdx-flow diagnostics into a tarball.
#
# Output: ~/curdx-snapshot-<timestamp>.tar.gz  (or current dir with --here)
#
# Philosophy: this bundle is shared between a user and the maintainer to debug
# curdx-flow itself. Completeness beats privacy here — by default we include
# raw content. Pass --redact (or --strict) to run the sanitize regexes.
#
# What it collects:
#   - REPORT.md           human-readable summary (current phase, full events
#                         timeline, hook firings, recent commits, git status)
#   - events.jsonl        .curdx/logs/events.jsonl (full)
#   - events.jsonl.1/.2   rotated event logs, if present
#   - state.json          .curdx/state.json
#   - config.json         .curdx/config.json
#   - install-state.json  ~/.curdx/install-state.json
#   - features/           ALL .curdx/features/<slug>/*.md (every feature, not
#                         just the active one — historical context matters)
#   - debug/              ALL .curdx/debug/*.md
#   - settings/           .claude/settings.json, .claude/settings.local.json,
#                         ~/.claude/settings.json (to spot hook misconfig)
#   - hooks/              plugin hook scripts as actually installed (resolves
#                         "what version of the hook ran" mystery)
#   - transcripts/        Claude Code native transcripts for THIS project
#                         (all session .jsonl files, full — no tail cap).
#                         Pass --no-transcript to skip.
#   - git/                git log (200), git status, git diff HEAD, stash list
#   - env.txt             relevant env vars (CLAUDE_*, OTEL_*, CURDX_*, PATH, SHELL, LANG, TERM)
#   - versions.txt        claude/node/jq/git/bash versions + uname -a
#   - META.txt            generation info + selected options + warning
#
# Usage:
#   bash scripts/snapshot.sh                # default: raw, complete bundle
#   bash scripts/snapshot.sh --redact       # apply regex secret scrubber
#   bash scripts/snapshot.sh --strict       # same as --redact, plus emails + IPs
#   bash scripts/snapshot.sh --no-transcript  # skip Claude native transcripts
#   bash scripts/snapshot.sh --here         # output into $PWD instead of $HOME
#   bash scripts/snapshot.sh --out PATH     # explicit output dir
#   bash scripts/snapshot.sh --no-preview   # skip the sanitization preview

set -eu

command -v jq >/dev/null 2>&1 || { echo "error: jq required" >&2; exit 2; }
command -v tar >/dev/null 2>&1 || { echo "error: tar required" >&2; exit 2; }

# args
REDACT=0
STRICT=0
INCLUDE_TRANSCRIPT=1
PREVIEW=1
OUT_DIR="$HOME"

while [ $# -gt 0 ]; do
  case "$1" in
    --redact) REDACT=1 ;;
    --strict) REDACT=1; STRICT=1 ;;
    --no-transcript) INCLUDE_TRANSCRIPT=0 ;;
    --include-transcript) INCLUDE_TRANSCRIPT=1 ;; # kept for back-compat; now default
    --no-preview) PREVIEW=0 ;;
    --here) OUT_DIR="$PWD" ;;
    --out) shift; OUT_DIR="${1:-$HOME}" ;;
    -h|--help)
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

SANITIZE_SCRIPT="$(cd "$(dirname "$0")" && pwd)/lib/sanitize.sh"

# filter pipeline: either identity cat, or sanitize.sh in chosen mode.
filter() {
  if [ "$REDACT" = "0" ]; then
    cat
  elif [ "$STRICT" = "1" ]; then
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
echo "[snapshot] mode: $([ "$REDACT" = "1" ] && ([ "$STRICT" = "1" ] && echo "redact (strict)" || echo "redact") || echo "raw (no redaction)")"

# ---------- META.txt ----------
cat > "$BUNDLE_DIR/META.txt" <<META
curdx-flow snapshot
generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
project_root: $PROJECT_ROOT
platform: $(uname -sr)
options:
  redact: $REDACT
  strict: $STRICT
  include_transcript: $INCLUDE_TRANSCRIPT

what to do with this bundle:
  - email / DM / upload this tar.gz to the curdx-flow maintainer
  - by default THIS BUNDLE CONTAINS RAW CONTENT (events, transcripts, paths,
    env vars). pass --redact or --strict to run the regex scrubber before
    sharing with anyone outside your trust boundary.
  - even with --redact the scrubber is regex-based and not exhaustive — spot
    check REPORT.md and events.jsonl before sharing broadly.
  - transcripts/ is the file most likely to contain sensitive info you typed
    into prompts. use --no-transcript to skip entirely.
META

# ---------- versions.txt ----------
{
  echo "curdx-flow: $(jq -r '.version // "unknown"' "$HOME/.curdx/install-state.json" 2>/dev/null || echo "unknown")"
  echo "node: $(node --version 2>/dev/null || echo "not installed")"
  echo "jq: $(jq --version 2>/dev/null || echo "not installed")"
  echo "git: $(git --version 2>/dev/null || echo "not installed")"
  echo "bash: $(bash --version 2>/dev/null | head -1 || echo "not installed")"
  if command -v claude >/dev/null 2>&1; then
    echo "claude: $(claude --version 2>/dev/null | head -1 || echo "version unknown")"
  else
    echo "claude: not installed"
  fi
  echo
  echo "uname: $(uname -a)"
} > "$BUNDLE_DIR/versions.txt"

# ---------- env.txt — safe-ish env subset ----------
{
  echo "# Environment variables relevant to curdx-flow / Claude Code."
  echo "# Secrets (API keys in env) are NOT included — we only pull known-safe prefixes."
  echo
  env | grep -E '^(CLAUDE_|OTEL_|CURDX_|PATH|SHELL|LANG|LC_|TERM|EDITOR|HOME|PWD|USER|TMPDIR|NODE_|NPM_CONFIG_)' \
    | grep -v -iE '(TOKEN|SECRET|KEY|PASSWORD|AUTH)' \
    | sort
} > "$BUNDLE_DIR/env.txt"

# ---------- copy state.json / config.json ----------
if [ -f ".curdx/state.json" ]; then
  filter < ".curdx/state.json" > "$BUNDLE_DIR/state.json"
fi
if [ -f ".curdx/config.json" ]; then
  filter < ".curdx/config.json" > "$BUNDLE_DIR/config.json"
fi

# ---------- copy install-state.json (user-global) ----------
if [ -f "$HOME/.curdx/install-state.json" ]; then
  filter < "$HOME/.curdx/install-state.json" > "$BUNDLE_DIR/install-state.json"
fi

# ---------- copy events.jsonl + rotated siblings ----------
EVENT_COUNT=0
if [ -f ".curdx/logs/events.jsonl" ]; then
  filter < ".curdx/logs/events.jsonl" > "$BUNDLE_DIR/events.jsonl"
  EVENT_COUNT=$(wc -l < "$BUNDLE_DIR/events.jsonl" | tr -d ' ')
fi
for rot in .curdx/logs/events.jsonl.1 .curdx/logs/events.jsonl.2 .curdx/logs/events.jsonl.3; do
  [ -f "$rot" ] || continue
  filter < "$rot" > "$BUNDLE_DIR/$(basename "$rot")"
  ROT_COUNT=$(wc -l < "$BUNDLE_DIR/$(basename "$rot")" | tr -d ' ')
  EVENT_COUNT=$((EVENT_COUNT + ROT_COUNT))
done

# ---------- copy ALL features (not just active) ----------
if [ -d ".curdx/features" ]; then
  for feat_dir in .curdx/features/*/; do
    [ -d "$feat_dir" ] || continue
    feat_name=$(basename "$feat_dir")
    mkdir -p "$BUNDLE_DIR/features/$feat_name"
    for f in "$feat_dir"*.md; do
      [ -f "$f" ] || continue
      filter < "$f" > "$BUNDLE_DIR/features/$feat_name/$(basename "$f")"
    done
  done
fi

# ---------- copy ALL debug sessions ----------
if [ -d ".curdx/debug" ]; then
  mkdir -p "$BUNDLE_DIR/debug"
  for f in .curdx/debug/*.md; do
    [ -f "$f" ] || continue
    filter < "$f" > "$BUNDLE_DIR/debug/$(basename "$f")"
  done
fi

# ---------- copy settings.json files ----------
mkdir -p "$BUNDLE_DIR/settings"
for src in ".claude/settings.json" ".claude/settings.local.json" "$HOME/.claude/settings.json"; do
  [ -f "$src" ] || continue
  # name the destination by origin so the maintainer can tell them apart
  case "$src" in
    .claude/settings.json)          dst="project-settings.json" ;;
    .claude/settings.local.json)    dst="project-settings.local.json" ;;
    "$HOME/.claude/settings.json")  dst="user-settings.json" ;;
  esac
  filter < "$src" > "$BUNDLE_DIR/settings/$dst"
done

# ---------- copy plugin hooks as installed (best-effort) ----------
# CLAUDE_PLUGIN_ROOT is set when snapshot runs from the slash command. If not
# set (direct bash invocation), fall back to walking up from this script.
HOOK_SRC=""
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -d "${CLAUDE_PLUGIN_ROOT}/hooks" ]; then
  HOOK_SRC="${CLAUDE_PLUGIN_ROOT}/hooks"
else
  # scripts/snapshot.sh → ../hooks
  CANDIDATE="$(cd "$(dirname "$0")/.." && pwd)/hooks"
  [ -d "$CANDIDATE" ] && HOOK_SRC="$CANDIDATE"
fi
if [ -n "$HOOK_SRC" ]; then
  mkdir -p "$BUNDLE_DIR/hooks"
  # Shell scripts + hooks.json. Walk one level; hooks/lib/ is included too.
  for f in "$HOOK_SRC"/*.sh "$HOOK_SRC"/*.json; do
    [ -f "$f" ] || continue
    cp "$f" "$BUNDLE_DIR/hooks/$(basename "$f")"
  done
  if [ -d "$HOOK_SRC/lib" ]; then
    mkdir -p "$BUNDLE_DIR/hooks/lib"
    for f in "$HOOK_SRC/lib"/*.sh; do
      [ -f "$f" ] || continue
      cp "$f" "$BUNDLE_DIR/hooks/lib/$(basename "$f")"
    done
  fi
fi

# ---------- git state ----------
if git rev-parse --git-dir >/dev/null 2>&1; then
  mkdir -p "$BUNDLE_DIR/git"
  git log --oneline -200 2>/dev/null | filter > "$BUNDLE_DIR/git/log.txt" || true
  git status --porcelain=v1 -b 2>/dev/null | filter > "$BUNDLE_DIR/git/status.txt" || true
  git diff HEAD 2>/dev/null | filter > "$BUNDLE_DIR/git/diff-HEAD.patch" || true
  git stash list 2>/dev/null | filter > "$BUNDLE_DIR/git/stash.txt" || true
  git remote -v 2>/dev/null | filter > "$BUNDLE_DIR/git/remotes.txt" || true
fi

# ---------- Claude Code native transcripts ----------
if [ "$INCLUDE_TRANSCRIPT" = "1" ]; then
  CLAUDE_PROJECT_DIR="$HOME/.claude/projects"
  if [ -d "$CLAUDE_PROJECT_DIR" ]; then
    # Claude encodes project paths by replacing / with -. Match ours first,
    # then fall back to the most recently modified project dir.
    ENCODED="$(echo "$PROJECT_ROOT" | sed 's|/|-|g')"
    TARGET_DIR=""
    if [ -d "$CLAUDE_PROJECT_DIR/$ENCODED" ]; then
      TARGET_DIR="$CLAUDE_PROJECT_DIR/$ENCODED"
    else
      # try ending-with match (in case of leading-slash / cwd drift)
      for d in "$CLAUDE_PROJECT_DIR"/*; do
        [ -d "$d" ] || continue
        case "$(basename "$d")" in
          *"$(basename "$PROJECT_ROOT")") TARGET_DIR="$d"; break ;;
        esac
      done
    fi
    if [ -n "$TARGET_DIR" ]; then
      mkdir -p "$BUNDLE_DIR/transcripts"
      for t in "$TARGET_DIR"/*.jsonl; do
        [ -f "$t" ] || continue
        filter < "$t" > "$BUNDLE_DIR/transcripts/$(basename "$t")"
      done
    fi
  fi
fi

# ---------- REPORT.md — human-readable summary ----------
{
  echo "# curdx-flow snapshot — REPORT.md"
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Redact: $REDACT | Strict: $STRICT | Transcript: $INCLUDE_TRANSCRIPT"
  echo "Project root: $PROJECT_ROOT"
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
    ' "$BUNDLE_DIR/state.json" 2>/dev/null || echo "(state.json unreadable)"
  fi
  echo
  echo "## Project stack (from config.json)"
  if [ -f "$BUNDLE_DIR/config.json" ]; then
    jq -r '
      "- backend: " + (.stack.backend.language // "?") + "\n" +
      "- frontend: " + (.stack.frontend.framework // "?") + "\n" +
      "- test runner: " + (.testing.runner // "?") + "\n" +
      "- browser testing: " + (.browser_testing.mode // "none")
    ' "$BUNDLE_DIR/config.json" 2>/dev/null || echo "(config.json unreadable)"
  fi
  echo
  echo "## All events ($EVENT_COUNT total, including rotated logs)"
  echo
  echo '```'
  # concat rotated logs (oldest first) + current; emit every row.
  for src in "$BUNDLE_DIR/events.jsonl.3" "$BUNDLE_DIR/events.jsonl.2" "$BUNDLE_DIR/events.jsonl.1" "$BUNDLE_DIR/events.jsonl"; do
    [ -f "$src" ] || continue
    while IFS= read -r line; do
      echo "$line" | jq -r '[.ts, .event, (.command // .tool // .hook // .matcher // "")] | @tsv' 2>/dev/null || echo "$line"
    done < "$src"
  done
  echo '```'
  echo
  echo "## Hook firings (denied / asked / failure escalations)"
  echo
  echo '```'
  for src in "$BUNDLE_DIR/events.jsonl.3" "$BUNDLE_DIR/events.jsonl.2" "$BUNDLE_DIR/events.jsonl.1" "$BUNDLE_DIR/events.jsonl"; do
    [ -f "$src" ] || continue
    jq -r 'select(.event == "hook_denied" or .event == "hook_asked" or .event == "failure_escalation") |
      [.ts, .event, (.hook // ""), (.rule // .pattern // .level // "")] | @tsv' \
      "$src" 2>/dev/null
  done
  echo '```'
  echo
  echo "## Recent git log (last 30 shown; full log in git/log.txt)"
  echo
  echo '```'
  if [ -f "$BUNDLE_DIR/git/log.txt" ]; then
    head -30 "$BUNDLE_DIR/git/log.txt"
  else
    echo "(not a git repo or no commits yet)"
  fi
  echo '```'
  echo
  echo "## Git status"
  echo
  echo '```'
  [ -f "$BUNDLE_DIR/git/status.txt" ] && cat "$BUNDLE_DIR/git/status.txt" || echo "(no git status)"
  echo '```'
  echo
  echo "## Files in this bundle"
  echo
  (cd "$BUNDLE_DIR" && find . -type f -not -name REPORT.md | sort | sed 's|^\./|  - |')
  echo
  echo "## Next step for recipient"
  echo
  echo "1. Skim events.jsonl (+ rotated .1/.2) for the failing sequence"
  echo "2. Check state.json and features/ to understand what phase was active"
  echo "3. Correlate hook_denied / failure_escalation events with recent commits"
  echo "4. Compare hooks/ against current curdx-flow source to rule out version drift"
  echo "5. For full context, transcripts/ holds the raw Claude session (if included)"
} > "$BUNDLE_DIR/REPORT.md"

# ---------- preview (unless --no-preview) ----------
if [ "$PREVIEW" = "1" ]; then
  echo
  echo "[snapshot] bundle ready at: $BUNDLE_DIR"
  echo "[snapshot] files:"
  (cd "$BUNDLE_DIR" && find . -type f | sort | sed 's|^|    |')
  if [ "$REDACT" = "1" ]; then
    echo
    echo "[snapshot] sanitization preview (first 10 redactions):"
    grep -rn '<REDACTED:' "$BUNDLE_DIR" 2>/dev/null | head -10 || echo "    (no secrets detected to redact)"
  else
    echo
    echo "[snapshot] NO redaction applied. Raw content included. Review before sharing."
  fi
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
if [ "$REDACT" = "0" ]; then
  echo "note: bundle is RAW (no redaction). if you're sharing outside a trusted"
  echo "      maintainer, re-run with --redact (or --strict) first."
else
  echo "note: redaction is regex-based and not exhaustive. skim REPORT.md before"
  echo "      sharing broadly."
fi
