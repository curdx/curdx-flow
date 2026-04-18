---
description: Diagnostic check — verifies jq / claude CLI / claude-mem worker / MCPs / hooks / rules / constitution are all in working order. Pure read-only.
argument-hint: [--fix] (offer auto-fixes for resolvable issues)
allowed-tools: Read, Grep, Glob, Bash
---

You are running `/curdx:doctor`. Pure diagnostic — checks that every layer curdx-flow depends on is present and healthy. Reports pass/fail per check with a specific remediation per failure.

With `--fix`, offers to attempt the specific remediation for each failing check (e.g., re-run the installer for missing hooks).

## Checklist

Run each check in order. Print a pass/fail line per check. At the end, print a summary with exit code.

### 1. Core CLI tools

```bash
command -v jq >/dev/null 2>&1 && echo "  ✓ jq installed" || echo "  ✗ jq MISSING — brew install jq / apt install jq"
command -v git >/dev/null 2>&1 && echo "  ✓ git installed" || echo "  ✗ git MISSING — install git"
command -v node >/dev/null 2>&1 && echo "  ✓ node installed ($(node -v))" || echo "  ✗ node MISSING — install node >= 18"
command -v npx >/dev/null 2>&1 && echo "  ✓ npx available" || echo "  ✗ npx MISSING — comes with node/npm"
command -v claude >/dev/null 2>&1 && echo "  ✓ claude CLI installed" || echo "  ✗ claude MISSING — install Claude Code CLI"
```

### 2. Installation state

```bash
STATE_FILE="$HOME/.curdx/install-state.json"
if [ -f "$STATE_FILE" ]; then
  VER=$(jq -r '.version // "unknown"' "$STATE_FILE")
  CM=$(jq -r '.dependencies["claude-mem"].installed // false' "$STATE_FILE")
  PUA=$(jq -r '.dependencies.pua.installed // false' "$STATE_FILE")
  echo "  ✓ install-state.json present (v$VER)"
  [ "$CM" = "true" ] && echo "  ✓ claude-mem installed per state" || echo "  ✗ claude-mem NOT in state — re-run: npx curdx-flow install"
  [ "$PUA" = "true" ] && echo "  ✓ pua installed per state" || echo "  ✗ pua NOT in state — re-run: npx curdx-flow install"
else
  echo "  ✗ no install-state.json at $STATE_FILE — run: npx curdx-flow install"
fi
```

### 3. claude plugin registration

```bash
# `claude plugin list` may not have a stable --json flag; parse the human-
# readable output instead. The format from the CLI is:
#   ❯ <name>@<marketplace>
#       Version: ...
#       Status: ✔ enabled
# We grep for "<name>@" followed by enabled status nearby.
if command -v claude >/dev/null 2>&1; then
  PLUGIN_LIST=$(claude plugin list 2>/dev/null || echo "")
  check_enabled() {
    local plugin="$1"
    # find the plugin block (next ~3 lines after its name) and check for "enabled"
    echo "$PLUGIN_LIST" | awk -v p="$plugin@" '
      $0 ~ p { found=1; next }
      found && /Status:/ && /enabled/ { print "yes"; exit }
      found && /^❯ / && $0 !~ p { found=0 }
    '
  }
  if [ "$(check_enabled curdx)" = "yes" ]; then
    echo "  ✓ curdx plugin enabled in Claude Code"
  else
    echo "  ✗ curdx plugin NOT enabled — run: claude plugin install curdx@curdx-flow"
  fi
  if [ "$(check_enabled claude-mem)" = "yes" ]; then
    echo "  ✓ claude-mem plugin enabled"
  else
    echo "  ℹ claude-mem plugin not enabled (memory features will degrade but core still works)"
  fi
  if [ "$(check_enabled pua)" = "yes" ]; then
    echo "  ✓ pua plugin enabled"
  else
    echo "  ℹ pua plugin not enabled (behavioral protocol absent; not required)"
  fi
fi
```

### 4. claude-mem worker (localhost:37777)

```bash
if command -v curl >/dev/null 2>&1; then
  if curl -sf --max-time 2 http://localhost:37777/health >/dev/null 2>&1 || \
     curl -sf --max-time 2 http://localhost:37777/ >/dev/null 2>&1; then
    echo "  ✓ claude-mem worker responding on :37777"
  else
    echo "  ✗ claude-mem worker NOT responding on :37777 — run: npx claude-mem start"
  fi
fi
```

### 5. MCP servers declared

Read `.claude-plugin/plugin.json` — confirm mcpServers section is present:

```bash
PLUGIN_JSON="${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"
if [ -f "$PLUGIN_JSON" ]; then
  for mcp in sequential-thinking context7; do
    if jq -e ".mcpServers.\"$mcp\"" "$PLUGIN_JSON" >/dev/null 2>&1; then
      echo "  ✓ MCP declared: $mcp"
    else
      echo "  ✗ MCP missing from plugin.json: $mcp"
    fi
  done
fi
```

### 6. Hooks registered (from plugin)

```bash
HOOKS_JSON="${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json"
if [ -f "$HOOKS_JSON" ]; then
  for event in SessionStart UserPromptSubmit PreToolUse PostToolUse PreCompact Stop; do
    if jq -e ".hooks.$event" "$HOOKS_JSON" >/dev/null 2>&1; then
      echo "  ✓ hook registered: $event"
    else
      echo "  ✗ hook missing: $event"
    fi
  done
else
  echo "  ✗ hooks/hooks.json not found at $HOOKS_JSON — plugin install is broken"
fi
```

### 7. Hook scripts executable

```bash
HOOK_DIR="${CLAUDE_PLUGIN_ROOT}/hooks"
for f in implement-loop.sh enforce-constitution.sh careful-bash.sh load-context.sh phase-guard.sh failure-escalate.sh save-state.sh; do
  if [ -x "$HOOK_DIR/$f" ]; then
    echo "  ✓ hook executable: $f"
  else
    echo "  ✗ hook not executable: $f"
  fi
done
```

### 8. Project initialization (when run inside a project)

```bash
cd "$CWD"
if [ -f .curdx/config.json ] && [ -f .curdx/state.json ]; then
  echo "  ✓ this project is curdx-flow-initialized"
  PHASE=$(jq -r '.phase' .curdx/state.json)
  echo "     current phase: $PHASE"
else
  echo "  ℹ this project is NOT curdx-flow-initialized (run /curdx:init to start)"
fi
```

### 9. Constitution present and parseable

```bash
C=".claude/rules/constitution.md"
if [ -f "$C" ]; then
  if grep -q "## Hard Rules" "$C" 2>/dev/null; then
    HARD_COUNT=$(awk '/## Hard Rules/,/## Soft Rules|## Advisory/' "$C" | grep -cE '^### [0-9]+\. ')
    echo "  ✓ constitution present ($HARD_COUNT hard rules detected)"
    [ "$HARD_COUNT" -gt 10 ] && echo "    ⚠  $HARD_COUNT > 10 hard rules — cognitive load is high; consider converting some to soft rules"
  else
    echo "  ✗ constitution exists but has no '## Hard Rules' section — re-copy from ${CLAUDE_PLUGIN_ROOT}/rules/constitution.md"
  fi
else
  echo "  ℹ constitution not present at $C (run /curdx:init to copy it)"
fi
```

### 10. Path-scoped rules

```bash
for rule in tdd.md no-sycophancy.md; do
  if [ -f ".claude/rules/$rule" ]; then
    echo "  ✓ rule present: .claude/rules/$rule"
  else
    echo "  ℹ rule not present: $rule (optional; run /curdx:init to copy)"
  fi
done
```

### 10a. Global protocols (SessionStart inject)

The `load-context.sh` SessionStart hook injects a "Global Protocols" block as
`additionalContext` into every Claude session where this plugin is enabled —
regardless of cwd. Resolution order is opt-out marker → user override → shipped
default. Verify which one is in effect:

```bash
if [ -f "$HOME/.curdx/no-global-protocols" ]; then
  echo "  ℹ global protocols: DISABLED (opt-out marker at ~/.curdx/no-global-protocols)"
elif [ -f "$HOME/.curdx/user-protocols.md" ]; then
  LINES=$(wc -l < "$HOME/.curdx/user-protocols.md" | tr -d ' ')
  echo "  ✓ global protocols: USER-CUSTOMIZED (~/.curdx/user-protocols.md, $LINES lines)"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/protocols/global-protocols.md" ]; then
  LINES=$(wc -l < "${CLAUDE_PLUGIN_ROOT}/protocols/global-protocols.md" | tr -d ' ')
  echo "  ✓ global protocols: SHIPPED DEFAULT ($LINES lines, source: \$CLAUDE_PLUGIN_ROOT/protocols/global-protocols.md)"
else
  echo "  ✗ global protocols: NEITHER user override NOR shipped default found — re-install with: npx curdx-flow install --force"
fi
```

To customize: copy the shipped default to `~/.curdx/user-protocols.md` and edit.
To opt out: `touch ~/.curdx/no-global-protocols`.
To re-enable: `rm ~/.curdx/no-global-protocols`.

### 11. Git state sanity

```bash
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  echo "  ✓ git repo (branch: $BRANCH)"
  DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
  echo "     uncommitted changes: $DIRTY files"
  case "$BRANCH" in
    main|master|trunk)
      echo "    ⚠  on $BRANCH — create a feature branch before /curdx:implement"
      ;;
  esac
else
  echo "  ℹ not a git repo (curdx-flow can still run but /curdx:ship won't work)"
fi
```

### 12. Browser test setup (if frontend project)

```bash
if [ -f .curdx/config.json ]; then
  MODE=$(jq -r '.browser_testing.mode // "none"' .curdx/config.json)
  case "$MODE" in
    playwright|both)
      if [ -d node_modules/@playwright ] || [ -f node_modules/.bin/playwright ]; then
        echo "  ✓ playwright installed"
      else
        echo "  ✗ playwright declared but not installed — run: npm i -D @playwright/test && npx playwright install"
      fi
      ;;
    chrome-devtools|both)
      if [ -f .mcp.json ] && jq -e '.mcpServers["chrome-devtools"]' .mcp.json >/dev/null 2>&1; then
        echo "  ✓ chrome-devtools-mcp registered in .mcp.json"
      else
        echo "  ✗ chrome-devtools mode declared but MCP not registered — run: claude mcp add chrome-devtools --scope project -- npx -y chrome-devtools-mcp@latest --isolated"
      fi
      ;;
    none|prompt)
      echo "  ℹ browser testing mode: $MODE"
      ;;
  esac
fi
```

### 13. Update-check state

Reports what the local update-check cache knows. Pure read (no network) by default. With `--fix`, runs the checker with `--force` to bust the cache and query the npm registry synchronously.

```bash
OPT_OUT="$HOME/.curdx/no-update-check"
CACHE_FILE="$HOME/.curdx/.last-update-check"
if [ -f "$OPT_OUT" ]; then
  echo "  ℹ update-check: DISABLED (opt-out marker at ~/.curdx/no-update-check)"
elif [ -f "$CACHE_FILE" ]; then
  CACHED=$(cat "$CACHE_FILE" 2>/dev/null || true)
  MTIME=$(stat -c %Y "$CACHE_FILE" 2>/dev/null || stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)
  AGE_MIN=$(( ( $(date +%s) - MTIME ) / 60 ))
  case "$CACHED" in
    UPGRADE_AVAILABLE*)
      OLD=$(echo "$CACHED" | awk '{print $2}')
      NEW=$(echo "$CACHED" | awk '{print $3}')
      echo "  ⚠  update-check: upgrade available ($OLD → $NEW, cached ${AGE_MIN}m ago)"
      echo "     run: npx curdx-flow@latest install --force"
      ;;
    UP_TO_DATE*)
      echo "  ✓ update-check: up to date (cache ${AGE_MIN}m old)"
      ;;
    *)
      echo "  ℹ update-check: cache unreadable — next SessionStart will re-fetch"
      ;;
  esac
else
  echo "  ℹ update-check: no cache yet (first SessionStart has not fired)"
fi
```

With `--fix`: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/update-check.sh" --force` which busts the cache and hits the npm registry synchronously. A single-line UPGRADE_AVAILABLE / UP_TO_DATE / (empty on network failure) response is returned.

## Output format

```
curdx-flow doctor report

[core tools]
  ✓ jq
  ✓ git
  ✓ node (v20.11.0)
  ✓ claude CLI

[install state]
  ✓ install-state.json (v0.3.0)
  ✓ claude-mem installed
  ✓ pua installed

[plugin registration]
  ✓ curdx plugin enabled

[claude-mem worker]
  ✓ worker responding on :37777

[MCP servers]
  ✓ sequential-thinking
  ✓ context7

[hooks]
  ✓ SessionStart
  ✓ UserPromptSubmit
  ...

[project]
  ✓ initialized (phase: tasks-complete)
  ✓ constitution present (5 hard rules)
  ✓ playwright installed
  ℹ on feature/password-reset (good)

---
summary: 18 checks passed, 0 failed, 2 informational
```

With `--fix`, after the summary, offer a menu for each failure:

```
Attempt to fix failing checks?
  1. claude-mem worker not responding → run: npx claude-mem start
  2. ...

[y] attempt all fixes   [n] skip   [select] choose which
```

## Exit code

Exit 0 if no ✗ failures (ℹ informational is fine).
Exit 1 if any ✗ failure present.
Exit 2 if the diagnostic itself couldn't run (e.g., missing jq from the start).

## When to run

- After `npx curdx-flow install` to verify
- When something "feels broken" — hooks not firing, loop not continuing, etc.
- Periodically — `/curdx:doctor` should be safe to run anytime (read-only)
- Before opening a bug report — include the doctor output for fast triage
