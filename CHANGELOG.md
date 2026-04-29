# Changelog

All notable changes to `@curdx/flow` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/) and the project follows [Semantic Versioning](https://semver.org/).

## 6.0.2 — 2026-04-29

### Added

- **`CLAUDE.md` release runbook.** Documents the 5-field version-sync gate (`package.json` + `package-lock.json` root / `packages[""]` + `plugin.json` + `marketplace.json`), the tag-triggered npm publish workflow, and the historical drift incidents (v5.0.0 marketplace, v6.0.0 lockfile) so future sessions have a single-source SOP for cutting releases.
- **`scripts/bump-version.mjs` + `npm run bump-version`.** Atomically writes the target version into all 5 fields, then shells out to `check-versions` to confirm. `npm version` handles `package.json` + lockfile; the two plugin manifests are patched via targeted regex so inline arrays (e.g. `plugin.json`'s `keywords`) stay byte-identical. Supports `<X.Y.Z|patch|minor|major>` and `--dry-run`.

### Notes

- Both additions are repo-internal — neither file ships in the npm tarball (`files: ["dist", "CHANGELOG.md"]` is unchanged), so the published artifact is byte-identical to 6.0.1 modulo version metadata. This release exists to dogfood the new `bump-version` flow end-to-end.

## 4.0.1 — 2026-04-27

### Fixed

- **Migration cleanup is now exhaustive.** v4.0.0's auto-migration for the `ralph-specum` → `curdx-flow` rename only invoked `claude plugin uninstall`, which leaves substantial residue when the marketplace's plugin id has been renamed (the CLI can't resolve the legacy id and bails). The installer now manually purges every leftover artifact for legacy slugs (`ralph-specum@curdx-flow`, `ralph-specum@smart-ralph`):
  - `~/.claude/settings.json` → removes `enabledPlugins[<legacyId>]`
  - `~/.claude/plugins/installed_plugins.json` → removes `plugins[<legacyId>]`
  - `~/.claude/plugins/cache/<marketplace>/<name>/` → recursive remove
  - `~/.claude/plugins/data/<name>-<marketplace>/` → recursive remove
  - Marketplace registrations (`known_marketplaces.json`, `extraKnownMarketplaces`) are deliberately left alone — those are user-managed.
- Implementation lives in `src/runner/legacy-cleanup.ts::purgeLegacyPluginArtifacts`. Idempotent and safe: every step swallows ENOENT silently and reports JSON / IO errors via the install task log without failing the flow.

## 4.0.0 — 2026-04-27

### Breaking

- **Plugin renamed `ralph-specum` → `curdx-flow`.** The bundled spec-driven workflow plugin now lives under the `curdx-flow` brand, slash namespace `/curdx-flow:*`, full slug `curdx-flow@curdx`. The marketplace identifier was simultaneously shortened from `curdx-flow` to `curdx` (the GitHub repo source `curdx/curdx-flow` is unchanged). All in-plugin slash references, env vars (`RALPH_SPECUM_*` → `CURDX_FLOW_*`), and labels were updated accordingly.
- **Auto-migration:** the installer now detects legacy `ralph-specum@curdx-flow` and `ralph-specum@smart-ralph` installs and uninstalls them automatically before installing the new slug, so users on v3.4 / v3.5 transparently transition. Your `specs/` directory and any in-progress spec state files are not touched — the rename is purely a plugin-identity change.
- **Manual fallback:** if you'd rather run the migration yourself, execute `claude plugin uninstall ralph-specum@curdx-flow` (or `@smart-ralph`) before re-running `npx @curdx/flow install`. The old marketplace `curdx-flow` may remain registered alongside the new `curdx` marketplace; this is harmless and you can `claude plugin marketplace remove curdx-flow` if you want to clean up.

### Notes

- The plugin's authorship and license lineage (smart-ralph by tzachbon → ralph-specum fork → curdx-flow) is recorded in `plugins/curdx-flow/NOTICE.md`. MIT License preserved.
- `.claude-plugin/marketplace.json` now declares one plugin: `curdx-flow` v4.9.1 sourced from `./plugins/curdx-flow`.

## 3.5.0 — 2026-04-27

### Changed

- **`ralph-specum` is now a required bundled plugin** — it no longer appears as an optional checkbox in the install multiselect. Instead, it's listed in a dedicated "always installed" header above the prompt, alongside its current state (not installed / up-to-date / update available). When the flow runs, ralph-specum is auto-installed or auto-updated whenever it needs action; up-to-date installs are silently skipped. The other six items (pua, claude-mem, chrome-devtools-mcp, frontend-design, sequential-thinking, context7) remain optional. `--ids X` now also auto-includes required plugins that need action; users can still explicitly run `--ids ralph-specum` to force a reinstall confirmation. Uninstall flow is unchanged — users may still uninstall ralph-specum, and the next install will re-add it.
- **Internal:** `Pkg` type gains a `required?: boolean` field so future bundled plugins can opt into the same "always installed" semantics without touching install-flow code.

## 3.4.0 — 2026-04-27

### Added

- **`ralph-specum` is now a bundled plugin** — spec-driven development with autonomous task-by-task execution (research → requirements → design → tasks → implement, plus epic triage). Originally authored by [tzachbon](https://github.com/tzachbon/smart-ralph); ralph-specum v4.9.1 has been migrated into this repository as the canonical home and is no longer tracked against upstream. MIT license and authorship are preserved at `plugins/ralph-specum/LICENSE` and `plugins/ralph-specum/NOTICE.md`.
- **curdx-flow itself is now a Claude Code marketplace** — the repo ships `.claude-plugin/marketplace.json` so Claude CLI can install bundled plugins via `claude plugin marketplace add curdx/curdx-flow` + `claude plugin install ralph-specum@curdx-flow`. The flow installer wires this up automatically; users just run `npx @curdx/flow install` and ralph-specum is pre-checked in the multiselect along with the other not-installed items.

### Notes

- If you previously installed ralph-specum from the upstream `tzachbon/smart-ralph` marketplace, run `claude plugin uninstall ralph-specum@smart-ralph` before installing this version to avoid a name collision. Going forward, only the `ralph-specum@curdx-flow` build is maintained.
- Plugin files are not shipped in the npm tarball (`package.json` `files` is unchanged: `["dist", "CHANGELOG.md"]`). They live in the GitHub repo and are pulled by Claude CLI when the marketplace is added — so a `git push` of this repo must precede `npm publish` for a new release to be installable.

## 3.3.2 — 2026-04-27

### Fixed

- **CLAUDE.md sync no longer skipped on the "nothing selected" path** — when a user upgraded flow with all tools already installed and ran `install`, the multiselect would show nothing pre-checked; pressing enter without a selection caused the flow to early-return before reaching the sync step, so the managed block was never added to CLAUDE.md. Each of `install` / `update` / `uninstall` now wraps its body in `try / finally` and runs the sync at the end of any non-cancelled exit (including "nothing to do" paths). User-cancelled flows (Ctrl+C, multiselect cancel, uninstall confirm "no") still skip the sync to respect intent.

## 3.3.1 — 2026-04-27

### Fixed

- **Silent stalls between phases** — added spinners to the previously-silent windows where flow shells out to `claude plugin list --json` and `claude mcp list` (the latter performs an MCP server health check and can take 5-15 seconds). Affected sites: `install` (state-derivation between marketplace refresh and the multiselect), `update` and `uninstall` (state-derivation at flow entry), and the post-flow CLAUDE.md sync (after install/update/uninstall busts the cache, sync re-queries state). Each now shows `Checking installed state… (claude plugin list / mcp list)` with a result line so the run no longer feels frozen.
- **CLAUDE.md sync feedback** — replaced the post-hoc `p.log.info` line with a live spinner that converts to a final status line on completion, matching the marketplace-refresh and per-item install UX.

## 3.3.0 — 2026-04-27

### Added

- **CLAUDE.md sync** — every successful `install` / `update` / `uninstall` now rewrites a small managed block in `~/.claude/CLAUDE.md` so Claude Code has session-start knowledge of which tools are installed and when to use each. The block lives between `<!-- BEGIN @curdx/flow v1 -->` / `<!-- END @curdx/flow v1 -->` markers; everything outside is preserved verbatim. Uninstalling all managed items removes the block entirely.
- **`Pkg.whenToUse` and `Pkg.slashNamespace`** — two new optional registry fields. `whenToUse` is the English trigger fragment shown in the CLAUDE.md "Available tools/plugins" list (e.g. "auto-fires on 2+ failures..."). `slashNamespace` is the slash invocation pattern (e.g. `/pua:*`) — only set on plugins that expose one. Both populated for the six bundled items, sourced from each upstream's own documentation.
- **Conditional Rules section** — the block's `Rules:` lines are emitted only for currently-installed tools, so the block never advises Claude to use a tool that isn't there. The "plan first" rule names whichever planners (`sequential-thinking`, `claude-mem`) are installed.
- **`--no-claude-md` flag and `CURDX_FLOW_NO_CLAUDE_MD` env var** — opt out of the CLAUDE.md sync (CI, locked-down filesystems, or users who prefer to manage CLAUDE.md by hand).

### Notes

- Sync is **safe by default**: writes are atomic (tmp + `fs.rename`), partial CLAUDE.md changes are impossible, and a failed sync prints a warning but never aborts a successful install.
- Forward-compatible: the BEGIN/END regex matches any `v\d+` suffix, so a future `v2` block format will silently replace any pre-existing `v1` block.
- Block content is always English regardless of `--lang`. CLAUDE.md's audience is Claude itself; English keeps instructions stable and avoids diff churn from alternating language runs.

## 3.2.0 — 2026-04-26

### Added

- **Version-aware install** — `flow install` now detects already-installed items with newer versions available upstream and presents a third state `↑ installed v3.0.0 → v3.2.3 available` in the multiselect. Items with updates are pre-selected by default alongside not-installed items, so a single Enter ships "install missing + upgrade outdated".
- **Smart dispatch** — selected items route to the right operation:
  - not installed → `install` (full)
  - update available → `update` (incremental, via `claude plugin update <id>`)
  - already installed but selected → reinstall confirmation prompt (uninstall + install)
- **Marketplace cache refresh** — install flow runs `claude plugin marketplace update <name>` for each pkg's marketplace before reading `latestVersion`. Skipped per-marketplace if its cache mtime is within 1 hour. New flag `--no-refresh` to opt out entirely (CI / offline use).
- **`flow status --json` enriched** — now includes `installedVersion`, `latestVersion`, and `updateAvailable` fields for each item, so external scripts can detect upgrade candidates without parsing the multiselect UI.
- **`Pkg.installedVersion` / `Pkg.latestVersion` / `Pkg.marketplaces`** — optional methods on the registry interface. Implemented for `pua` and `claude-mem` (the two items whose marketplaces declare `version` in `.claude-plugin/marketplace.json`). Other items gracefully fall back to the boolean installed/not-installed display when versions aren't available.

### Notes

Of the 6 bundled items, only `pua` and `claude-mem` expose comparable versions. `chrome-devtools-mcp` and `frontend-design` (Anthropic official marketplace) don't declare `version` in marketplace metadata and so always render as "installed" without version. Both MCP servers (`sequential-thinking`, `context7`) have no installed-version concept (`npx -y` auto-fetches latest each launch / remote HTTP) and behave the same way.

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
