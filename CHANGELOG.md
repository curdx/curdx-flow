# Changelog

All notable changes to `@curdx/flow` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/) and the project follows [Semantic Versioning](https://semver.org/).

## 3.1.0 — 2026-04-26

Major rewrite preserving the same goal (one-command installer for Claude Code plugins and MCP servers) with a cleaner internal architecture and broader coverage.

### Added

- **Bilingual UI** — every interactive run starts with a 中文 / English picker; default is auto-detected from `$LANG`. No config file is written.
- **Two new MCP servers**:
  - `sequential-thinking` (`@modelcontextprotocol/server-sequential-thinking`)
  - `context7` (Upstash HTTP MCP) with optional API key prompt at install time
- **`citty` subcommand mode** — `npx @curdx/flow install|uninstall|update|status` for non-interactive / CI use, alongside the original interactive menu.
- **`status --json`** — machine-readable install state for scripting.
- **`install --all --yes`** — non-interactive bulk install.
- **`Pkg` registry abstraction** (`src/registry/types.ts`) — every installable item declares `isInstalled / install / uninstall / update / prereqCheck / configPrompts` once, and the four flows (install / uninstall / update / status) use the same interface. Future additions are a single file in `src/registry/`.
- **Idempotency layer** — every flow pre-checks state via cached `claude plugin list --json` / `claude mcp list` parsing, so re-running after a partial install is safe.
- **`prereqCheck` for `chrome-devtools-mcp`** — detects Node ≥ 20.19 and a locally installed Chrome before attempting install.
- **GitHub Actions CI + Release workflows** — Node 20 + 22 matrix on PRs; `v*` tag triggers `npm publish --provenance --access public` and an auto-noted GitHub Release.

### Changed

- `@clack/prompts` upgraded **0.8.x → 1.2.x** (Node ≥ 20.12 required).
- Bundler: now `tsup` producing a single 35 KB ESM file (`dist/index.mjs`) with shebang banner — no more multi-file dist.
- Plugin registry now uses the **real marketplace name** from `.claude-plugin/marketplace.json`, not the GitHub repo path. Specifically `chrome-devtools-mcp` lives in marketplace `chrome-devtools-plugins`, not `chrome-devtools-mcp`.

### Removed

- `~/.curdx-flow/config.json` — language preference is no longer persisted; the picker runs every interactive session.
