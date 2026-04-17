'use strict';

/**
 * v0.3.0 (example / template) — template for future migrations
 *
 * This file is NOT an active migration — it's a reference template. Real
 * migrations should be named `v<MAJOR>.<MINOR>.<PATCH>.js` (without
 * `.example`) and the installer's `runMigrations` function will pick them
 * up automatically.
 *
 * Because Round 1-3 of curdx-flow were non-breaking at the state-schema
 * level, no real migrations have been needed yet. When the first
 * state-schema change happens (likely around v1.0), this template can be
 * copied as the starting point.
 *
 * @param {object} state - parsed ~/.curdx/install-state.json
 *                         (mutate in place; caller writes back atomically)
 */
module.exports = function(state) {
  // 1. IDEMPOTENCY CHECK — return early if state already reflects this migration.
  //    Without this, a user re-running `npx curdx-flow install --force` would
  //    re-apply the migration and corrupt valid state.
  if (state.schemaVersion >= 2) return;

  // 2. Example: rename a field
  if (state.mcps !== undefined && state.mcpsRegistered === undefined) {
    state.mcpsRegistered = state.mcps;
    delete state.mcps;
  }

  // 3. Example: backfill a new required field from existing data
  if (!state.installerPlatform) {
    state.installerPlatform = `${process.platform}-${process.arch}`;
  }

  // 4. Example: clean up a deprecated field
  if (state.legacyFoo !== undefined) {
    delete state.legacyFoo;
  }

  // 5. Mark as migrated (bump schema version)
  state.schemaVersion = 2;

  // 6. Optional: log for the installer to surface
  console.log('[migration v0.3.0 example] upgraded state schema to v2');
};
