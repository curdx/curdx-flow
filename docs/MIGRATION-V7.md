# Migrating to `@curdx/flow` v7

> Cross-platform plugin runtime overhaul. v6 bash hooks → v7 bundled Node ESM. Windows + macOS + Linux all green on CI.

## TL;DR

- **What changed**: All hook scripts moved from `bash + jq` to bundled Node ESM (`*.mjs`); `jq` is no longer a runtime dependency; `hooks.json` invokes `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/*.mjs"` instead of `bash *.sh`.
- **Who's affected**: Anyone who (a) was relying on the v6 `.sh` scripts directly, (b) does not have Node 20.12+ on PATH, or (c) forked the v6 hook source. Standard plugin users who just call `/curdx-flow:*` slash commands need only update.
- **Upgrade time**: ~2 minutes. Bump Node if needed → `npm i -g @curdx/flow@7` → `claude plugin update curdx-flow`.
- **Why**: To make the plugin work on Windows out of the box and remove the `jq` install requirement on every machine. Phase 4 ships with 6-leg CI matrix (Ubuntu × Node 20/22, macOS × 22, Windows × 22).
- **Help**: See the [FAQ](#faq) below; full diff in [`CHANGELOG.md`](../CHANGELOG.md); fall back to v6 with `npm i -g @curdx/flow@6.0.6`.

## Breaking changes

1. **`hooks.json` invocation contract changed.** v6: `bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.sh`. v7: `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"` with `"shell": "bash"` set on every entry for cross-platform routing and `"async": true` added to SessionStart (mitigates Anthropic Claude Code Issue #34457 Windows event-loop deadlock).
2. **Legacy `.sh` files deleted.** Removed: `load-spec-context.sh`, `quick-mode-guard.sh`, `stop-watcher.sh`, `update-spec-index.sh`, `path-resolver.sh`, plus `test-path-resolver.sh` / `test-multi-dir-integration.sh`. Anyone who copy-pasted v6 `.sh` paths into their own automation breaks. Source of truth is now `src/hooks/*.ts` (TypeScript, bundled to `.mjs` via esbuild).
3. **`jq` is no longer a runtime dependency.** All 30 markdown sweep occurrences across plugin docs replaced with inline `node -e`, lib utility calls, or prose rewrites. Verified via hard CI gate: `! grep -rn '\bjq\b' plugins/curdx-flow`.
4. **Node 20.12+ required** (was Node 18+ in v6). Tied to esbuild output target and `import.meta.dirname` stability. Run `node --version` to check.
5. **Spec index ordering is now alphabetical** (was filesystem-inode order in v6). Deterministic across Linux/macOS/Windows. If you were relying on the old order, you weren't relying on a contract — but flagging it explicitly.
6. **`stop-watcher` mtime precision is now milliseconds** (was seconds via `stat -f %m` / `stat -c %Y`). The behavior tests use a `< 2000ms` race-window check vs v6's `< 2 sec`; functionally equivalent. Only matters if you parsed the watcher's internal log.

## Why these changes

**Cross-platform pain on Windows.** v6's `bash *.sh` invocation contract worked on macOS and Linux but failed on Windows in three different ways: (a) `bash` was missing or pointing at `WSL` on machines without Git Bash on PATH, (b) `jq` had to be installed separately and few Windows users had it, (c) the `.sh` scripts used POSIX paths (`stat -c %Y`, `find -mmin`) that have no native cmd.exe / PowerShell equivalent. Bundling everything into Node ESM and routing through `"shell": "bash"` (which Claude Code itself bridges to Git Bash on PATH for Windows) eliminates all three.

**`jq` as a dependency was an anti-pattern.** It meant every developer / CI runner that touched a curdx-flow spec had to install a separate binary that does one job (JSON munging). Node already has `JSON.parse`. The 30-occurrence markdown sweep was tedious but it removes a class of "command not found" failures forever.

**esbuild bundling for distribution simplicity.** Hook source lives in `src/hooks/*.ts` (TypeScript, type-checked, tested via vitest). At publish time, `scripts/build-hooks.mjs` esbuild-bundles each entry into a single-file ESM `.mjs` with zero runtime npm deps — Claude Code can invoke them directly, no `npm install` step. The `.mjs` artifacts are committed and ship in the npm package. CI gate `npm run check:hooks-fresh` ensures source and bundle never drift.

**Byte-equal regression as safety net.** `tests/hooks/baselines/v6.0.6/` snapshots the exact stdout/stderr of every v6 `.sh` hook on a frozen fixture. v7 hooks must produce identical output (modulo path separators and mtime fields, which are necessarily different cross-platform). Any v7 change that drifts from v6 fails CI loudly.

## Step-by-step upgrade for v6.0.x users

1. **Verify Node version.** Run `node --version`. If under `v20.12.0`, install Node 20.12+ first (e.g. via `nvm install 20`, `fnm install 20`, or platform installer). Pin to v6.0.6 instead if you cannot upgrade Node — see [Downgrade path](#downgrade-path).
2. **Update the installer.** Run `npx @curdx/flow@7 install` (or `npm i -g @curdx/flow@7` if you prefer global install). The interactive installer detects existing v6 plugin entries and updates them in place.
3. **Refresh the plugin.** From within Claude Code, run `claude plugin update curdx-flow` (or use the marketplace-driven update path if you installed via marketplace). This pulls the new `hooks.json` and bundled `.mjs` files.
4. **Smoke-test a slash command.** In a project with at least one spec, run `/curdx-flow:status`. If it prints the spec index without `jq: command not found` or `bash: ... no such file` errors, the upgrade is good. If you have a quick-mode spec mid-execution, `/curdx-flow:implement` should also resume cleanly.
5. **Optional: remove `jq` if it was only here for this plugin.** `brew uninstall jq` (macOS) / `apt remove jq` (Linux) / `choco uninstall jq` (Windows). v7 does not call it from anywhere.
6. **Optional: regenerate spec index.** v7's `update-spec-index` writes alphabetical order. If your `specs/.index/index-state.json` was committed in inode order from v6, the next hook firing will rewrite it. This is harmless.

## Custom `.sh` fork users

If you forked `plugins/curdx-flow/hooks/scripts/*.sh` in your own repo (e.g. wrapped them, patched them, or vendored them), here's what changed and what your options are:

- **The v6 `.sh` files are deleted in v7.** Your fork won't auto-update. Pulling v7 will leave your patched `.sh` files untouched but Claude Code will no longer invoke them — `hooks.json` now points at `.mjs`.
- **Source of truth is now TypeScript.** `src/hooks/{load-spec-context,quick-mode-guard,stop-watcher,update-spec-index}.ts` are the new canonical hook implementations. Each is a 1:1 port of the v6 `.sh` semantics, audited for byte-equality (see `tests/hooks/baselines/v6.0.6/` for the exact reference output).
- **Two upgrade paths**:
  - **(a) Port your patches to TypeScript and contribute upstream.** Open a PR against `src/hooks/`. The build pipeline (`npm run build:hooks`) re-bundles to `.mjs` automatically. CI runs typecheck + byte-equal regression + smoke tests.
  - **(b) Pin to v6.0.6 indefinitely.** `npm i -g @curdx/flow@6.0.6` keeps you on the last bash-only release. v6.0.6 is locked in npm and will not be republished. You will not get cross-platform support, jq removal, or any v7+ fixes.
- **Reference for parity work**: `src/hooks/_shared/markdown-task-parser.ts` replaces the awk state machine; `src/hooks/_shared/atomic-write.ts` replaces `mktemp + mv`; `src/hooks/_shared/path-resolver.ts` replaces the `path-resolver.sh` source-able function library. Each module has JSDoc documenting which v6 bash construct it replaces.

## Downgrade path

If v7 breaks something for you and you need to roll back fast:

```bash
# CLI installer
npm i -g @curdx/flow@6.0.6
# or one-shot
npx @curdx/flow@6.0.6 install
```

Then re-run `claude plugin update curdx-flow` to pick up the v6 plugin manifest.

**Safety guarantees**:

- **v6.0.6 is locked in npm.** It will not be republished or yanked. You can always pin back.
- **Spec data files are forward- and backward-compatible.** No schema changes between v6 and v7. Specs created on v7 read fine on v6 and vice versa. The only thing v6 cannot read is the alphabetical spec-index ordering (it'll just rewrite to inode order on next firing — also harmless).
- **No state-file surgery needed.** v6 and v7 share the same `.curdx-state.json` shape. Downgrade is a one-command operation, no data migration, no cleanup.

If the bug is something we should fix in v7, please [file an issue](https://github.com/curdx/curdx-flow/issues) so we can patch v7 properly rather than leaving you on v6 forever.

## FAQ

**Q: Do I still need to install `jq`?**
A: No. v7 has zero runtime `jq` dependency. The CI gate `! grep -rn '\bjq\b' plugins/curdx-flow` ensures it never sneaks back. You can `brew uninstall jq` if it was only here for this plugin.

**Q: What if I don't have Node 20.12+ and can't upgrade?**
A: Pin to `@curdx/flow@6.0.6`. v6 supports Node 18+ and bash + jq. No new features will land there but it will keep working.

**Q: Will my existing specs work after the upgrade?**
A: Yes. The spec format (`requirements.md`, `design.md`, `tasks.md`, `.progress.md`, `.curdx-state.json`) is unchanged. The only difference at the file-system layer is the spec-index ordering (now alphabetical). Your in-flight execution loops resume cleanly.

**Q: Does `"shell": "bash"` mean I need bash on Windows?**
A: You need a `bash` on PATH that Claude Code can invoke. On Windows, Claude Code itself bridges this via Git Bash, which most developers already have (it ships with Git for Windows). On macOS and Linux it's the system bash. We don't ship our own bash.

**Q: What's `"async": true` on SessionStart for?**
A: Mitigation for [Anthropic Claude Code Issue #34457](https://github.com/anthropics/claude-code/issues/34457): synchronous SessionStart hooks could block the Claude Code UI startup on Windows. Async lets the hook return before its work completes, unblocking the UI. The hook still does its work; it just doesn't gate the prompt.

**Q: How do I report a v7 bug?**
A: GitHub issues at the [`curdx/curdx-flow` repository](https://github.com/curdx/curdx-flow/issues). Include `node --version`, OS, plugin version (`claude plugin list`), and the exact `/curdx-flow:*` command that failed.

**Q: When will Windows officially be supported?**
A: v7.0.0 (final) ships only after the 6-leg CI matrix (Ubuntu × Node 20+22, macOS × 22, Windows × 22) is green for 2 weeks with no critical issues. The pre-release cadence is `v7.0.0-alpha.0` → `v7.0.0-beta.0` → `v7.0.0-rc.0` → `v7.0.0`, with each pre-release validating the toolchain on real Windows runners before the next.

## Verification checklist

After upgrading, run through this checklist to confirm v7 is working end-to-end:

- [ ] `node --version` reports `v20.12.0` or later.
- [ ] `npx @curdx/flow@7 --help` resolves and prints CLI help text.
- [ ] `claude plugin list` shows `curdx-flow@7.x.x` (not 6.x).
- [ ] `ls "$(claude plugin info curdx-flow --path)/hooks/scripts/"` shows `.mjs` files (not `.sh`).
- [ ] In a project with at least one spec, `/curdx-flow:status` prints the spec table without errors.
- [ ] In a spec mid-execution, `/curdx-flow:implement` resumes the task loop cleanly (no `bash`, `jq`, or `command not found` errors anywhere in the session log).
- [ ] After running any `/curdx-flow:*` command, the resulting `specs/.index/index-state.json` is in alphabetical order.
- [ ] No `jq: command not found` errors in any hook firing or slash command output.

If every box is checked, you're fully migrated. If any box fails, see [Downgrade path](#downgrade-path) and [file an issue](https://github.com/curdx/curdx-flow/issues).
