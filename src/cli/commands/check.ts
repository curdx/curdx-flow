// src/cli/commands/check.ts
//
// Implements the `npx @curdx/flow check` CLI subcommand (Task 2.23).
// Wraps `runVerificationCheck` from `src/hooks/lib/check-verification-blocks.ts`
// — the same lib that backs `scripts/check-verification-blocks.mjs`'s
// release-time gate, per design.md §Component 7 (D3 hybrid).
//
// Path note: the project's other CLI subcommand sources live in `src/flows/`
// (analyze, install, status, uninstall, update). This new command is placed
// at `src/cli/commands/check.ts` per the task spec's literal Files list
// (Task 2.23). Wiring into the citty dispatcher in `src/index.ts` is the
// follow-up Task 2.24's responsibility.
//
// Behavior:
//   - argv is reserved for future flags (e.g. `--spec <name>`) and is
//     currently ignored. Accepting `args: string[]` keeps the signature
//     stable for Task 2.24 dispatcher wiring.
//   - On pass: writes "All verificationBlocks valid.\n" to stdout, exits 0.
//   - On fail: writes the full diagnostic blob to stderr, exits 2.
//
// Spec: specs/spec-verification-iron-law/tasks.md Task 2.23

import { runVerificationCheck } from "../../hooks/lib/check-verification-blocks.ts";

/**
 * Entry point for the `check` subcommand. The `args` parameter is reserved
 * for future flags; today the only operational input is `process.cwd()` and
 * `process.env.CURDX_VERIFY_SKIP_BLOCKS` (handled inside the lib).
 *
 * Calls `process.exit` directly (per task step 4/5):
 *  - On pass → stdout `"All verificationBlocks valid.\n"` + exit 0.
 *  - On fail → stderr <diagnostic blob> + exit 2.
 *
 * The diagnostic blob is produced by `runVerificationCheck` and already
 * includes the active spec path, per-phase failure reasons, and re-run
 * commands.
 */
export async function runCheckCommand(args: string[]): Promise<void> {
  // args reserved for future flags (e.g. --spec, --json). Touch the
  // parameter so eslint/no-unused-vars stays clean without weakening the
  // public type signature, which Task 2.24 dispatcher relies on.
  void args;

  const result = await runVerificationCheck();

  if (result.ok) {
    // Lib message includes "All verificationBlocks valid.\n" plus active
    // spec / phases lines on the success path. Per task step 5 the
    // canonical pass output is the headline only — write that to stdout
    // verbatim (the rest of the lib message goes to stderr as info).
    process.stdout.write("All verificationBlocks valid.\n");
    if (result.specDir !== undefined) {
      // Strip the leading headline (already written) and emit the rest as
      // informational stderr — keeps stdout clean for downstream pipes.
      const rest = result.message.replace(
        /^All verificationBlocks valid\.\n/,
        "",
      );
      if (rest.length > 0) process.stderr.write(rest);
    }
    process.exit(0);
  }

  process.stderr.write(result.message);
  process.exit(2);
}
