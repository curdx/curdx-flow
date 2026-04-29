# CLAUDE.md — curdx-flow

Project-level instructions for Claude Code working in this repo. Read once at session start.

## What this repo is

`@curdx/flow` is a dual-purpose deliverable:

1. **npm CLI** (`npx @curdx/flow`) — interactive installer for Claude Code plugins and MCP servers. Source in `src/`, built with `tsup` into `dist/index.mjs`.
2. **Bundled Claude plugin** `curdx-flow@curdx` — spec-driven dev workflow (`/curdx-flow:*` slash commands). Lives in `plugins/curdx-flow/`; `.claude-plugin/marketplace.json` advertises it.

Both ship in the same npm package. A single version number governs the whole repo.

## Layout cheatsheet

```
src/                                 CLI source (TypeScript)
dist/                                tsup build output (gitignored, npm-published)
scripts/check-versions.mjs           version-drift gate (5 fields, see below)
plugins/curdx-flow/                  bundled plugin tree
  .claude-plugin/plugin.json         plugin manifest (version field)
  hooks/hooks.json                   plugin hooks
  schemas/spec.schema.json           spec schema
.claude-plugin/marketplace.json      marketplace index (plugins[curdx-flow].version)
.github/workflows/ci.yml             typecheck + build on push/PR
.github/workflows/release.yml        npm publish + GH release on tag push
CHANGELOG.md                         Keep-a-Changelog format
```

## Release SOP

The release pipeline is automated end-to-end **once a tag is pushed**. Local work is just: bump versions, update changelog, commit, tag, push.

### 1. Pick the version

Default to **PATCH bump** (`6.0.1 → 6.0.2`). Always confirm the bump level with the user before editing any file — never autonomously decide MAJOR/MINOR.

### 2. Sync all 5 version fields

`scripts/check-versions.mjs` will fail the build if any of these drift. Edit all of them to the same value:

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `package-lock.json` | `version` (top-level) |
| `package-lock.json` | `packages[""].version` |
| `plugins/curdx-flow/.claude-plugin/plugin.json` | `version` |
| `.claude-plugin/marketplace.json` | `plugins[name="curdx-flow"].version` |

The fastest correct path is `npm version <patch|minor|major> --no-git-tag-version` (handles package.json + both lock fields), then manually edit the two plugin manifests. Re-run `npm run check-versions` to confirm.

### 3. Update CHANGELOG.md

Prepend a new section at the top:

```
## X.Y.Z — YYYY-MM-DD

### Added | Changed | Fixed | Breaking
- ...
```

Match the tone of existing entries — concrete, references commit SHAs / file paths when relevant.

### 4. Commit + tag + push

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

The tag push triggers `.github/workflows/release.yml`, which runs:

1. `npm ci`
2. `npm run check-versions` (the 5-field gate)
3. `npm run build`
4. `npm publish --provenance --access public` (uses `NPM_TOKEN` secret)
5. `softprops/action-gh-release@v2` — auto-generates release notes from commits

`prepublishOnly` in package.json (`check-versions && typecheck && build`) is a defense-in-depth guard for anyone running `npm publish` locally — CI does not rely on it.

### 5. Verify

- GitHub → Releases tab shows `vX.Y.Z` with auto notes
- `npm view @curdx/flow version` returns the new version
- `npx @curdx/flow@X.Y.Z --help` resolves

## Things that have broken before — don't repeat

- **v5.0.0** bumped `plugin.json` but missed `marketplace.json`. The Claude CLI kept advertising the old version and the installer's update path silently no-op'd. Fix shipped as commit `e234fb8`; `check-versions.mjs` was added to make this a hard build failure. → Always sync **all 5 fields** in step 2.
- **v6.0.0** bumped `package.json` but missed `package-lock.json`. CI's `npm ci` failed because lockfile and manifest disagreed. Fix shipped as commit `d90f081`. → `npm version --no-git-tag-version` does this for you; don't hand-edit only `package.json`.

## Don'ts

- Don't bump the version without explicit user confirmation of the bump level.
- Don't skip `npm run check-versions` locally — let it catch drift before CI does.
- Don't push tags to main without first pushing the release commit (the workflow checks out the tag's commit, which must contain the bumped versions).
- Don't run `npm publish` manually unless CI is broken and the user explicitly asks. The workflow has provenance + `NPM_TOKEN` already wired up.
- Don't amend or force-push a release tag once it's on origin — npm publishes are immutable, so a re-push would create a tag/registry mismatch. Make a new patch version instead.

## Local dev

```bash
npm install
npm run dev          # tsup watch
npm run typecheck
npm run build
node dist/index.mjs  # smoke test the CLI
```

The bundled plugin (`plugins/curdx-flow/`) is shipped as static files — there's no build step for it. Edits to plugin manifests / hooks / skills take effect on the next `claude plugin install` / `update`.
