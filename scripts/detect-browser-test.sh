#!/usr/bin/env bash
# detect-browser-test.sh — pick playwright vs chrome-devtools-mcp for frontend testing
#
# Heuristics:
#   - playwright already in package.json devDeps → "playwright"
#   - has webgl/canvas/three/maps deps OR src/ has getContext('webgl') → "chrome-devtools"
#   - both signals → "both"
#   - no signals + has frontend → "prompt" (caller must ask user)
#   - no frontend at all → "none"
#
# Output: JSON on stdout. No mutation.
#
# Usage: ./detect-browser-test.sh [project-dir]

set -eu

PROJ_DIR="${1:-$PWD}"
cd "$PROJ_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq required"}' >&2
  exit 1
fi

mode=""
signals="[]"

if [ -f package.json ]; then
  pkg=$(cat package.json)

  # signal 1: playwright present
  if echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("@playwright/test") or has("playwright")' >/dev/null 2>&1; then
    mode="playwright"
    signals=$(echo "$signals" | jq '. + ["package.json:@playwright/test"]')
  fi

  # signal 2: webgl / canvas / 3D / maps deps
  webgl_deps='["three","@react-three/fiber","@react-three/drei","mapbox-gl","maplibre-gl","leaflet","cesium","@deck.gl/core","deck.gl","pixi.js","@pixi/app","konva","babylonjs","@babylonjs/core","ogl","regl"]'
  has_webgl_dep=$(echo "$pkg" | jq --argjson deps "$webgl_deps" '
    (.dependencies // {}) + (.devDependencies // {}) | keys
    | map(. as $k | $deps | index($k))
    | map(select(. != null)) | length > 0
  ')
  if [ "$has_webgl_dep" = "true" ]; then
    matched_dep=$(echo "$pkg" | jq -r --argjson deps "$webgl_deps" '
      (.dependencies // {}) + (.devDependencies // {}) | keys
      | map(. as $k | $deps | index($k) | if . then $k else empty end)
      | first
    ')
    if [ -z "$mode" ]; then mode="chrome-devtools"; else mode="both"; fi
    signals=$(echo "$signals" | jq --arg s "package.json:$matched_dep" '. + [$s]')
  fi
fi

# signal 3: src/ has WebGL canvas calls
if [ -d src ] && grep -rq "getContext\(['\"]webgl2\?['\"]" src 2>/dev/null; then
  if [ -z "$mode" ] || [ "$mode" = "playwright" ]; then
    mode="${mode:+both}"
    [ -z "$mode" ] && mode="chrome-devtools"
  fi
  signals=$(echo "$signals" | jq '. + ["src/:getContext-webgl"]')
fi

# fallback: if no signals at all but we know there's a frontend, prompt user
if [ -z "$mode" ]; then
  if [ -f package.json ] && [ -d src ] || [ -d app ] || [ -d pages ] || [ -d components ]; then
    mode="prompt"
  else
    mode="none"
  fi
fi

desc=""
case "$mode" in
  playwright) desc="Playwright CLI for forms / CRUD / standard UI" ;;
  chrome-devtools) desc="chrome-devtools-mcp for WebGL / canvas / 3D / maps" ;;
  both) desc="playwright for standard UI; chrome-devtools-mcp for WebGL parts" ;;
  prompt) desc="frontend detected but no test scaffolding; user should pick" ;;
  none) desc="no frontend detected" ;;
esac

install_cmds="[]"
case "$mode" in
  playwright|both)
    install_cmds=$(echo "$install_cmds" | jq '. + ["npm i -D @playwright/test", "npx playwright install"]')
    ;;
esac
case "$mode" in
  chrome-devtools|both)
    install_cmds=$(echo "$install_cmds" | jq '. + ["claude mcp add chrome-devtools --scope project -- npx -y chrome-devtools-mcp@latest --isolated"]')
    ;;
esac

jq -n \
  --arg mode "$mode" \
  --argjson signals "$signals" \
  --arg dir "$PROJ_DIR" \
  --arg desc "$desc" \
  --argjson install "$install_cmds" \
  '{
    mode: $mode,
    auto_detected: true,
    detection_signals: $signals,
    project_dir: $dir,
    description: $desc,
    install_commands: $install
  }'
