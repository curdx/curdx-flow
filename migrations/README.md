# Migrations

Versioned, idempotent migration scripts that run during `npx curdx-flow install` to bring older install states up to the current schema / convention.

## Pattern source

Borrowed from gstack's `gstack-upgrade/migrations/v*.sh`:

- One file per breaking schema change: `vX.Y.Z.js` (semver version this migration targets)
- `scripts/install.js` reads `~/.curdx/install-state.json` → `migrationsRun[]`, sorts migration files by semver, runs any whose version is between `LAST_INSTALLED_VERSION` and `CURRENT_VERSION`
- Fresh installs skip migrations and record the current version in `migrationsRun[]` directly
- Each migration is **idempotent** — re-running it must be safe (no-op on already-migrated state)

## File naming convention

```
migrations/
├── v0.2.0.js    — run when upgrading from v0.1.x to v0.2.x
├── v0.3.0.js    — run when upgrading from v0.2.x to v0.3.x
├── v1.0.0.js    — run when upgrading from v0.x to v1.0
└── README.md
```

Semver parsing: `scripts/install.js` extracts the version from the filename `v<MAJOR>.<MINOR>.<PATCH>.js` and compares with semver-ordering.

## Contract per migration

```javascript
// migrations/v0.X.0.js
'use strict';

/**
 * v0.X.0 — <one-line what this migration does>
 *
 * @param {object} state - the parsed install-state.json
 * @returns {void} - mutates `state` in place; caller writes back atomically
 */
module.exports = function(state) {
  // 1. Idempotency check: if state already reflects this migration, return early
  if (state.someNewField !== undefined) return;

  // 2. Mutate state
  state.someNewField = computeFromOldState(state);

  // 3. Remove obsolete fields
  delete state.obsoleteField;

  // 4. Optionally log (installer surfaces logs to the user)
  console.log('[migration v0.X.0] upgraded someNewField');
};
```

## What migrations can and cannot do

**Can:**
- Mutate `~/.curdx/install-state.json` fields
- Read/write files under `~/.curdx/`
- Run shell commands (e.g., re-install a broken MCP)
- Patch `.claude/rules/` files in the user's project (carefully — with SHA-256 hash check to preserve user edits; see spec-kit pattern)

**Cannot:**
- Read the user's code (out of scope — migrations are for curdx-flow state, not project state)
- Modify `.claude/settings.json` directly (let Claude Code's plugin system manage that)
- Delete arbitrary files (idempotency + safety)
- Run commands that require user interaction (migrations run unattended)

## How a migration gets triggered

1. User runs `npx curdx-flow install` (or `npx curdx-flow@latest install --force`)
2. Installer reads `~/.curdx/install-state.json`:
   - `migrationsRun: ["v0.2.0"]` (already-run migrations)
   - `version: "0.2.0"` (last installed version)
3. Installer discovers `migrations/*.js`, sorts by semver
4. For each migration with version > `state.version` AND NOT in `migrationsRun[]`:
   - Require the module
   - Call with `state` parameter
   - On success: append to `migrationsRun[]`
   - On failure: WARN (not abort — idempotent re-run on next install)
5. Write state atomically via tmp+rename

## First install (no prior state)

Fresh installs **skip all migrations** and set `migrationsRun[]` to the full list of migration versions up to current. Rationale: if someone installs v0.5.0 fresh, they don't want v0.2.0 → v0.3.0 → v0.4.0 → v0.5.0 migrations to run (the schema they're writing starts at v0.5.0).

## Examples (hypothetical)

### v0.2.0 — rename field

```javascript
module.exports = function(state) {
  if (state.mcpsRegistered !== undefined) return; // already migrated
  state.mcpsRegistered = state.mcps || [];
  delete state.mcps;
};
```

### v1.0.0 — add schema_version

```javascript
module.exports = function(state) {
  if (state.schemaVersion >= 2) return;
  state.schemaVersion = 2;
  state.installedAt = state.installedAt || state.lastUpdated || new Date().toISOString();
};
```

## Testing migrations

Create a fixture state file and run the migration:

```bash
# tests/evals/migrations/v0.2.0.test.sh
cat > /tmp/fixture-state.json <<EOF
{ "version": "0.1.5", "mcps": ["sequential-thinking"] }
EOF

node -e "
const state = require('/tmp/fixture-state.json');
require('./migrations/v0.2.0.js')(state);
console.log(JSON.stringify(state, null, 2));
"
# expected: state.mcpsRegistered == ['sequential-thinking'], state.mcps undefined
```

Each migration should have a minimal regression test under `tests/evals/migrations/`.

## Versioning discipline

- **Patch release** (0.2.0 → 0.2.1): no migration needed; user state is compatible
- **Minor release** (0.2.x → 0.3.0): migration likely needed if state schema changed
- **Major release** (0.x → 1.0): migration REQUIRED; users coming from any 0.x should migrate to 1.0 in one step (chain of internal migrations)

## Current migrations

None yet (v0.1 through v0.3 of curdx-flow were non-breaking at the state level). The first real migration will land when we change `install-state.json`'s schema.

This file exists so future contributors (or AI agents extending the framework) see the pattern even before the first real migration is needed.
