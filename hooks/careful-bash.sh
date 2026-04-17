#!/usr/bin/env bash
# careful-bash.sh — PreToolUse hook (matcher: Bash)
#
# Flags dangerous bash commands with permissionDecision="ask" so the user
# must confirm. Whitelists common cleanup patterns (rm -rf node_modules etc.)
# so we don't nag on safe commands.
#
# Also enforces Rule 5 (NO SECRETS IN COMMITS) by scanning staged files
# when the command is a git commit.
#
# Pattern borrowed from gstack's careful/bin/check-careful.sh.
#
# Contract: stdin JSON, stdout JSON or empty, exit 0.
#   Ask:    {"permissionDecision":"ask","message":"..."}
#   Deny:   {"permissionDecision":"deny","permissionDecisionReason":"..."}
#   Allow:  empty stdout

set -eu

command -v jq >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
[ "$TOOL_NAME" != "Bash" ] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$COMMAND" ] && exit 0

CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
[ -n "$CWD" ] && cd "$CWD" 2>/dev/null || true

ask() {
  local msg="$1"
  local pattern="${2:-unknown}"
  jq -n --arg m "$msg" --arg p "$pattern" '{permissionDecision:"ask", message:$m, hookMetadata:{curdx_pattern:$p}}'
  exit 0
}

deny() {
  local reason="$1"
  jq -n --arg r "$reason" '{permissionDecision:"deny", permissionDecisionReason:$r}'
  exit 0
}

# ---------- Rule 5: NO SECRETS IN COMMITS ----------
# Before a git commit proceeds, scan staged files for credential patterns.
if echo "$COMMAND" | grep -qE '^[[:space:]]*git[[:space:]]+commit\b'; then
  # collect staged file contents (additions only, via git diff --cached)
  STAGED_DIFF=$(git diff --cached 2>/dev/null | grep '^+' | grep -v '^+++' || true)

  if [ -n "$STAGED_DIFF" ]; then
    # Common secret patterns (borrowed from trufflehog/gitleaks common set)
    # We scan diff output not files directly to stay fast.
    if echo "$STAGED_DIFF" | grep -qE '(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9_-]{20,})'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains what looks like an Anthropic or OpenAI API key (sk-...). Unstage with 'git restore --staged <file>' and remove the secret."
    fi
    if echo "$STAGED_DIFF" | grep -qE '(ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,})'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains a GitHub personal access token. Unstage and rotate the token immediately."
    fi
    if echo "$STAGED_DIFF" | grep -qE 'glpat-[A-Za-z0-9_-]{20,}'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains a GitLab personal access token. Unstage and rotate."
    fi
    if echo "$STAGED_DIFF" | grep -qE 'AKIA[0-9A-Z]{16}'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains what looks like an AWS access key ID (AKIA...). Unstage and rotate."
    fi
    if echo "$STAGED_DIFF" | grep -qE 'AIza[0-9A-Za-z_-]{35}'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains what looks like a Google API key (AIza...). Unstage and rotate."
    fi
    if echo "$STAGED_DIFF" | grep -qE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains a private key. Unstage, remove, and rotate the key."
    fi
    # database URLs with embedded passwords
    if echo "$STAGED_DIFF" | grep -qE '(postgres|postgresql|mysql|mongodb|redis)://[^:@ ]+:[^@ ]+@'; then
      deny "Rule 5 (NO SECRETS IN COMMITS): staged diff contains a database URL with embedded credentials. Move to an env var."
    fi
  fi

  # staged .env file (not in .gitignore)
  if git diff --cached --name-only 2>/dev/null | grep -qE '(^|/)\.env(\.[a-z]+)?$'; then
    deny "Rule 5 (NO SECRETS IN COMMITS): .env file is staged. Move to .gitignore and commit the example (.env.example) instead."
  fi
fi

# ---------- dangerous: rm -rf ----------
# whitelist common cleanup patterns (node_modules, dist, build artifacts, caches)
if echo "$COMMAND" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*)?-[rRf]+[a-zA-Z]*[[:space:]]'; then
  SAFE_TARGETS='node_modules|\.next|\.nuxt|dist|build|out|\.cache|\.turbo|\.parcel-cache|coverage|__pycache__|\.pytest_cache|target|\.gradle|\.mvn|vendor|_build|\.bundle|tmp|\.tmp'
  # extract the target(s) — everything after `rm -rf`
  if echo "$COMMAND" | grep -qE "rm[[:space:]]+-[rRf]+[[:space:]]+($SAFE_TARGETS)(/|[[:space:]]|$)"; then
    :  # safe cleanup, allow
  else
    ask "careful: 'rm -rf' detected. Current command:
  $COMMAND

This looks potentially destructive. If you are sure, approve. If you intended to clean a standard build artifact (node_modules, dist, .next, build, etc.), those are whitelisted — check your spelling." "rm-rf"
  fi
fi

# ---------- dangerous: dropping databases / tables ----------
if echo "$COMMAND" | grep -qiE '\b(DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)\b'; then
  ask "careful: destructive SQL detected (DROP/TRUNCATE). Current command:
  $COMMAND

Confirm you want to drop data. Consider TRUNCATE only on non-production." "drop-table"
fi

# ---------- dangerous: force push ----------
if echo "$COMMAND" | grep -qE 'git[[:space:]]+push[[:space:]]+.*(--force|-f)\b'; then
  # extra warning if target is main/master/trunk
  if echo "$COMMAND" | grep -qE '(main|master|trunk)(\b|$)'; then
    deny "Force-push to main/master/trunk is blocked by curdx-flow. If you absolutely need this, bypass with --no-verify in your environment, not through Claude."
  fi
  ask "careful: 'git push --force' detected. This rewrites remote history and can lose teammates' work. Command:
  $COMMAND" "force-push"
fi

# ---------- dangerous: git reset --hard ----------
if echo "$COMMAND" | grep -qE 'git[[:space:]]+reset[[:space:]]+.*--hard'; then
  ask "careful: 'git reset --hard' discards all uncommitted changes. Command:
  $COMMAND

Consider 'git stash' first if you have unsaved work." "reset-hard"
fi

# ---------- dangerous: discarding working tree ----------
if echo "$COMMAND" | grep -qE 'git[[:space:]]+(checkout|restore)[[:space:]]+\.(\s|$)'; then
  ask "careful: discarding all unstaged changes in the working tree. Command:
  $COMMAND" "discard-all"
fi

# ---------- dangerous: --no-verify bypassing hooks ----------
if echo "$COMMAND" | grep -qE 'git[[:space:]]+commit[[:space:]]+.*--no-verify'; then
  ask "careful: 'git commit --no-verify' skips the constitution hooks. Command:
  $COMMAND

Prefer fixing what the hook is complaining about." "no-verify"
fi

# ---------- kubectl delete ----------
if echo "$COMMAND" | grep -qE '\bkubectl[[:space:]]+delete\b'; then
  ask "careful: kubectl delete detected. Command:
  $COMMAND" "kubectl-delete"
fi

# ---------- docker system prune / rm -f ----------
if echo "$COMMAND" | grep -qE '\bdocker[[:space:]]+(system[[:space:]]+prune|rm[[:space:]]+-[fF])'; then
  ask "careful: destructive docker command. Command:
  $COMMAND" "docker-prune"
fi

# ---------- device destruction ----------
if echo "$COMMAND" | grep -qE '(>[[:space:]]*/dev/(sd[a-z]|nvme|disk[0-9])|dd[[:space:]]+.*of=/dev/)'; then
  deny "careful: writing to a block device (/dev/sd*, /dev/nvme, /dev/disk*, dd of=/dev/...). This is essentially never intended by an AI agent. Blocked."
fi

# ---------- chmod 777 / chown root ----------
if echo "$COMMAND" | grep -qE 'chmod[[:space:]]+(-R[[:space:]]+)?(a=rwx|777)'; then
  ask "careful: chmod 777 is a broad permission change. Command:
  $COMMAND

Prefer more specific permissions (644 for files, 755 for dirs, 700 for private)." "chmod-777"
fi

# all clear — allow
exit 0
