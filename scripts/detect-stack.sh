#!/usr/bin/env bash
# detect-stack.sh — detect project tech stack
#
# Walks the current directory, identifies backend language, frontend framework,
# test runner. Emits a single JSON object on stdout. No mutation.
#
# Usage: ./detect-stack.sh [project-dir]
#   default project-dir: $PWD

set -eu

PROJ_DIR="${1:-$PWD}"
cd "$PROJ_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq not installed; install jq to use detect-stack"}' >&2
  exit 1
fi

# ---------- backend ----------

backend_lang="unknown"
backend_runner=""

if [ -f package.json ]; then
  backend_lang="node"
elif [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then
  backend_lang="python"
elif [ -f go.mod ]; then
  backend_lang="go"
elif [ -f Cargo.toml ]; then
  backend_lang="rust"
elif [ -f pom.xml ] || [ -f build.gradle ] || [ -f build.gradle.kts ]; then
  backend_lang="java"
elif [ -f Gemfile ]; then
  backend_lang="ruby"
elif [ -f composer.json ]; then
  backend_lang="php"
fi

# ---------- frontend ----------

frontend_framework="none"
if [ -f package.json ]; then
  pkg=$(cat package.json)
  # check dependencies + devDependencies
  if echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("next")' >/dev/null 2>&1; then
    frontend_framework="nextjs"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("nuxt")' >/dev/null 2>&1; then
    frontend_framework="nuxt"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("@sveltejs/kit")' >/dev/null 2>&1; then
    frontend_framework="sveltekit"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("vite")' >/dev/null 2>&1; then
    frontend_framework="vite"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("react")' >/dev/null 2>&1; then
    frontend_framework="react"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("vue")' >/dev/null 2>&1; then
    frontend_framework="vue"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("svelte")' >/dev/null 2>&1; then
    frontend_framework="svelte"
  elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("solid-js")' >/dev/null 2>&1; then
    frontend_framework="solid"
  fi
fi

# ---------- test runner ----------

test_runner="unknown"
case "$backend_lang" in
  node)
    if [ -f package.json ]; then
      if echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("vitest")' >/dev/null 2>&1; then
        test_runner="vitest"
      elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("jest") or has("@types/jest")' >/dev/null 2>&1; then
        test_runner="jest"
      elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("mocha")' >/dev/null 2>&1; then
        test_runner="mocha"
      elif echo "$pkg" | jq -e '(.dependencies // {}) + (.devDependencies // {}) | has("ava")' >/dev/null 2>&1; then
        test_runner="ava"
      elif echo "$pkg" | jq -e '.scripts // {} | has("test")' >/dev/null 2>&1; then
        test_runner="npm-test"
      fi
    fi
    ;;
  python)
    if [ -f pytest.ini ] || [ -f pyproject.toml ] && grep -q "pytest" pyproject.toml 2>/dev/null; then
      test_runner="pytest"
    elif command -v unittest >/dev/null 2>&1; then
      test_runner="unittest"
    fi
    ;;
  go)
    test_runner="go-test"  # built-in
    ;;
  rust)
    test_runner="cargo-test"  # built-in
    ;;
  java)
    if [ -f pom.xml ]; then
      test_runner="maven"
    elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then
      test_runner="gradle"
    fi
    ;;
  ruby)
    if grep -q "rspec" Gemfile 2>/dev/null; then test_runner="rspec"; fi
    ;;
  php)
    test_runner="phpunit"
    ;;
esac

# ---------- dev server hint ----------

dev_command=""
if [ -f package.json ]; then
  if echo "$pkg" | jq -e '.scripts // {} | has("dev")' >/dev/null 2>&1; then
    dev_command="npm run dev"
  elif echo "$pkg" | jq -e '.scripts // {} | has("start")' >/dev/null 2>&1; then
    dev_command="npm start"
  fi
fi

# ---------- output ----------

jq -n \
  --arg backend "$backend_lang" \
  --arg frontend "$frontend_framework" \
  --arg test "$test_runner" \
  --arg dev "$dev_command" \
  --arg dir "$PROJ_DIR" \
  '{
    project_dir: $dir,
    backend: { language: $backend },
    frontend: { framework: $frontend },
    testing: { runner: $test },
    dev_command: $dev,
    is_fullstack: ($frontend != "none" and $backend != "unknown")
  }'
