#!/usr/bin/env bash
# enforce-constitution.sh — PreToolUse hook (matcher: Edit|Write)
#
# Enforces hard rules from .claude/rules/constitution.md at the tool level.
# Rules that can be mechanically checked by file path + state + test presence:
#   Rule 1: NO CODE WITHOUT SPEC — editing production source requires an active spec.
#   Rule 2: NO PRODUCTION CODE WITHOUT FAILING TEST — [GREEN] edits need a failing test.
#
# Rules that can't be mechanically checked (NO FIX WITHOUT ROOT CAUSE,
# NO COMPLETION WITHOUT EVIDENCE) live in agent prompts and skills.
# Rule 5 (NO SECRETS IN COMMITS) is in careful-bash.sh since it intercepts git commit.
#
# Contract: stdin JSON, stdout JSON or empty, exit 0 always.
#   Allow:  exit 0 (empty stdout)
#   Deny:   print {"permissionDecision":"deny","permissionDecisionReason":"..."} to stdout

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

. "$(dirname "$0")/lib/log-event.sh"

# only care about Edit/Write
[ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ] && exit 0
[ -z "$FILE_PATH" ] && exit 0
[ -z "$CWD" ] && exit 0

cd "$CWD" 2>/dev/null || exit 0

# no curdx state = no enforcement (user opted out or hasn't initialized)
STATE=".curdx/state.json"
[ -f "$STATE" ] || exit 0

# helpers
deny() {
  local rule="$1" reason="$2"
  curdx_log "$CWD" "$SESSION_ID" "$(jq -n -c --arg h "enforce-constitution" --arg r "$rule" --arg t "$TOOL_NAME" '{event: "hook_denied", hook: $h, rule: $r, tool: $t}')"
  jq -n --arg r "$reason" '{permissionDecision:"deny", permissionDecisionReason:$r}'
  exit 0
}

# normalize the file path to project-relative
REL_PATH="${FILE_PATH#$CWD/}"
REL_PATH="${REL_PATH#./}"

# ---------- Rule exemptions: files the constitution does NOT guard ----------
# test files, generated code, docs, config, migrations, and curdx's own files
case "$REL_PATH" in
  # test files — always allowed (tests are governed by TDD skill, not constitution hook)
  *.test.*|*.spec.*|*_test.go|*_test.py|tests/*|test/*|__tests__/*|spec/*|specs/*)
    exit 0 ;;
  # curdx's own state (modifications go through orchestrator; skip enforcement here)
  .curdx/*|.claude/*)
    exit 0 ;;
  # docs, licenses, READMEs
  *.md|docs/*|LICENSE|CHANGELOG*|*.txt)
    exit 0 ;;
  # top-level config (shouldn't be gated by spec requirement)
  package.json|tsconfig*.json|.eslintrc*|.prettierrc*|vite.config.*|vitest.config.*|jest.config.*|playwright.config.*|Cargo.toml|go.mod|pyproject.toml|requirements.txt|Gemfile|composer.json|.env*|.gitignore|.mcp.json)
    exit 0 ;;
  # migrations and schema files
  migrations/*|prisma/*|db/migrate/*|schema.sql|*.sql)
    exit 0 ;;
  # ci / github config
  .github/*|.gitlab-ci.yml|Jenkinsfile|.drone.yml|.woodpecker.yml|.circleci/*)
    exit 0 ;;
esac

# ---------- Identify if this file is "production source" ----------
# Production source = under src/, app/, lib/, pkg/, internal/, api/ (and not test files)
is_production_source=false
case "$REL_PATH" in
  src/*|app/*|lib/*|pkg/*|internal/*|api/*|server/*|backend/*|frontend/*|components/*|pages/*|routes/*|models/*|controllers/*|services/*|handlers/*)
    is_production_source=true ;;
esac

[ "$is_production_source" != "true" ] && exit 0

# ---------- Rule 1: NO CODE WITHOUT SPEC ----------
PHASE=$(jq -r '.phase // "unknown"' "$STATE")
ACTIVE_FEATURE=$(jq -r '.active_feature // empty' "$STATE")

# allowed phases where src edits make sense
case "$PHASE" in
  execution|quick|debug)
    ;;  # proceed
  init|init-complete|spec|spec-complete|plan|plan-complete|tasks|tasks-complete)
    deny "1" "Rule 1 (NO CODE WITHOUT SPEC): current phase is '$PHASE'. You can only edit $REL_PATH when phase is 'execution' (after /curdx:tasks) or 'quick'/'debug'. Run /curdx:implement to enter execution mode, /curdx:quick for trivial changes, or /curdx:debug for bug investigation."
    ;;
esac

if [ -z "$ACTIVE_FEATURE" ] && [ "$PHASE" = "execution" ]; then
  deny "1" "Rule 1 (NO CODE WITHOUT SPEC): state.phase is 'execution' but no active_feature. This is inconsistent state; run /curdx:status to inspect."
fi

if [ "$PHASE" = "execution" ] && [ -n "$ACTIVE_FEATURE" ]; then
  SPEC_FILE=".curdx/features/$ACTIVE_FEATURE/spec.md"
  if [ ! -f "$SPEC_FILE" ]; then
    deny "1" "Rule 1 (NO CODE WITHOUT SPEC): active feature $ACTIVE_FEATURE has no spec.md at $SPEC_FILE. Run /curdx:spec first."
  fi
fi

# ---------- Rule 2: NO PRODUCTION CODE WITHOUT FAILING TEST ----------
# This rule is contextual — it applies when implementing NEW behavior.
# In execution phase, we check whether the current task is [GREEN] or [REFACTOR]:
#   - [RED]  tasks create the failing test itself → skip this check
#   - [GREEN]/[REFACTOR] → a test file must exist AND have referenced the target module
#   - Tasks without TDD tags (e.g., Setup, Foundation, Polish) → skip
#
# Detection: parse current task from tasks.md at task_index
if [ "$PHASE" = "execution" ] && [ -n "$ACTIVE_FEATURE" ]; then
  TASKS_FILE=".curdx/features/$ACTIVE_FEATURE/tasks.md"
  TASK_INDEX=$(jq -r '.task_index // 0' "$STATE")

  if [ -f "$TASKS_FILE" ]; then
    # extract the (task_index+1)-th task block
    CURRENT_TASK=$(awk -v n="$((TASK_INDEX + 1))" '
      /^<task id=/ { i++; if (i == n) { p = 1; print; next } }
      p && /^<\/task>/ { print; exit }
      p { print }
    ' "$TASKS_FILE")

    # only enforce if this task is tagged [GREEN] or [REFACTOR]
    if echo "$CURRENT_TASK" | grep -qE '\[(GREEN|REFACTOR)\]'; then
      # quick heuristic: is there ANY test file in the repo?
      # A stronger check would verify a specific test file exists targeting this module;
      # for v0.2 we keep it as "tests exist at all" to avoid false negatives.
      if ! find tests test __tests__ spec 2>/dev/null | grep -qE '\.(test|spec)\.' 2>/dev/null; then
        if ! find . -name '*_test.go' -o -name '*_test.py' 2>/dev/null | head -1 | grep -q .; then
          # Derive an actionable install command from config (testing.runner='unknown'
          # = no framework configured). Mirrors the suggestion printed by /curdx:init
          # when stack detection found no runner.
          RUNNER=""
          if [ -f ".curdx/config.json" ]; then
            RUNNER=$(jq -r '.testing.runner // "unknown"' .curdx/config.json 2>/dev/null || echo unknown)
          fi
          BACKEND=""
          if [ -f ".curdx/config.json" ]; then
            BACKEND=$(jq -r '.stack.backend.language // "unknown"' .curdx/config.json 2>/dev/null || echo unknown)
          fi
          HINT=""
          if [ "$RUNNER" = "unknown" ]; then
            case "$BACKEND" in
              node)   HINT=" No runner is configured — install one, then re-run /curdx:init:\n    npm i -D vitest && npm pkg set scripts.test=\"vitest run\"" ;;
              python) HINT=" No runner is configured — install one, then re-run /curdx:init:\n    pip install pytest && mkdir -p tests" ;;
              ruby)   HINT=" No runner is configured — install one, then re-run /curdx:init:\n    bundle add rspec --group=test && bundle exec rspec --init" ;;
              *)      HINT=" No runner is configured — install your language's test runner, then re-run /curdx:init." ;;
            esac
          fi
          deny "2" "Rule 2 (NO PRODUCTION CODE WITHOUT FAILING TEST): current task is [GREEN]/[REFACTOR] but no test files exist in this repo. The [RED] task should have created a failing test first. Back up and run the [RED] task.${HINT}"
        fi
      fi
    fi
  fi
fi

# all checks passed — allow
exit 0
