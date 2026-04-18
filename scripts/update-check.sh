#!/usr/bin/env bash
# update-check.sh — periodic version check for curdx-flow.
#
# Queries the npm registry for the latest published version of curdx-flow
# and compares against the installed package.json version. Throttled via a
# cache file so we call the network at most once per 24h.
#
# Pattern lifted from gstack's bin/gstack-update-check; simplified (no snooze
# levels, no telemetry, no "just upgraded" marker for now). Drop-in contract:
#
# Output (one line, or nothing):
#   UPGRADE_AVAILABLE <old> <new>   — npm registry has a newer version
#   (nothing)                       — up to date, throttled, disabled, or check failed
#
# Opt-out:
#   touch ~/.curdx/no-update-check
#
# Env overrides (for testing):
#   CURDX_PLUGIN_ROOT   — override auto-detected plugin root
#   CURDX_REMOTE_URL    — override npm registry URL
#   CURDX_STATE_DIR     — override ~/.curdx state dir
#   CURDX_CACHE_TTL_MIN — override cache TTL in minutes (default 1440 = 24h)
#
# Contract: exits 0 always. Never writes to stderr on the happy path — a
# network blip must not pollute SessionStart output.

set -eu

PLUGIN_ROOT="${CURDX_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STATE_DIR="${CURDX_STATE_DIR:-$HOME/.curdx}"
OPT_OUT="$STATE_DIR/no-update-check"
CACHE_FILE="$STATE_DIR/.last-update-check"
PKG_FILE="$PLUGIN_ROOT/package.json"
REMOTE_URL="${CURDX_REMOTE_URL:-https://registry.npmjs.org/curdx-flow/latest}"
CACHE_TTL_MIN="${CURDX_CACHE_TTL_MIN:-1440}"

# --force busts the cache (used by /curdx:doctor)
FORCE=0
if [ "${1:-}" = "--force" ]; then
  FORCE=1
  rm -f "$CACHE_FILE"
fi

# Step 0: opt-out
[ -f "$OPT_OUT" ] && exit 0

# Step 1: need jq + curl for the real check
command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Step 2: read local version from package.json
LOCAL=""
if [ -f "$PKG_FILE" ]; then
  LOCAL=$(jq -r '.version // empty' "$PKG_FILE" 2>/dev/null || true)
fi
[ -z "$LOCAL" ] && exit 0

# Step 3: cache-first — if cache is fresh, replay it
if [ -f "$CACHE_FILE" ] && [ "$FORCE" -eq 0 ]; then
  CACHED=$(cat "$CACHE_FILE" 2>/dev/null || true)
  STALE=$(find "$CACHE_FILE" -mmin +"$CACHE_TTL_MIN" 2>/dev/null || true)
  if [ -z "$STALE" ] && [ -n "$CACHED" ]; then
    case "$CACHED" in
      UP_TO_DATE\ *)
        CACHED_VER=$(echo "$CACHED" | awk '{print $2}')
        # Only trust cache if the local version hasn't changed underneath us
        # (e.g. user just upgraded). If it has, fall through to fresh fetch.
        [ "$CACHED_VER" = "$LOCAL" ] && exit 0
        ;;
      UPGRADE_AVAILABLE\ *)
        CACHED_OLD=$(echo "$CACHED" | awk '{print $2}')
        CACHED_NEW=$(echo "$CACHED" | awk '{print $3}')
        if [ "$CACHED_OLD" = "$LOCAL" ]; then
          # Still on the old version → replay the upgrade prompt.
          echo "UPGRADE_AVAILABLE $CACHED_OLD $CACHED_NEW"
          exit 0
        fi
        # Local version moved on (user upgraded) → invalidate and re-fetch.
        ;;
    esac
  fi
fi

# Step 4: slow path — hit the registry
mkdir -p "$STATE_DIR"

REMOTE=$(curl -sf --max-time 5 "$REMOTE_URL" 2>/dev/null || true)
REMOTE_VER=""
if [ -n "$REMOTE" ]; then
  REMOTE_VER=$(echo "$REMOTE" | jq -r '.version // empty' 2>/dev/null || true)
fi

# Validate: must look like semver (x.y.z). A garbled / HTML / empty response
# means network trouble or registry hiccup; treat as "up to date" so we don't
# nag on transient errors.
if ! echo "$REMOTE_VER" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$'; then
  echo "UP_TO_DATE $LOCAL" > "$CACHE_FILE"
  exit 0
fi

if [ "$LOCAL" = "$REMOTE_VER" ]; then
  echo "UP_TO_DATE $LOCAL" > "$CACHE_FILE"
  exit 0
fi

# Versions differ — emit the upgrade line and persist it for the next 24h so
# hooks running multiple times per day don't re-hit the network.
echo "UPGRADE_AVAILABLE $LOCAL $REMOTE_VER" > "$CACHE_FILE"
echo "UPGRADE_AVAILABLE $LOCAL $REMOTE_VER"
