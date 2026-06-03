# Iron Law: Verification Before Completion

> Single source of truth for the curdx-flow Iron Law. This file is intentionally
> compaction-resilient — every other surface (hooks, skill, CLI) points back here.
> Used by: `verification-before-completion` skill, `stop-watcher` hook,
> `task-completed-verifier` hook, `npm run verify`, `npx curdx-flow check`.

## Iron Law

**No completion claim without fresh verification.** A phase, task, commit, tag,
or release may not be marked complete unless a `VerificationBlock` exists for
the relevant phase in `.curdx-state.json::verificationBlocks` AND that block
records `exitCode === 0` AND `timestamp >= srcMtime` of the relevant source
tree. Three failure classes — **missing**, **failed**, **stale** — all map to
exit code 2 with a copy-pasteable fix command. The Iron Law is enforced in
hook code (`stop-watcher.mjs`, `task-completed-verifier.mjs`), in state schema
(`spec.schema.json::verificationBlock`), and in this reference doc; this triple
redundancy survives LLM context compaction.

## Two-Layer Model

The Iron Law is enforced by two independent layers. **Layer-1 alone is
sufficient** — every user gets full Iron Law coverage without enabling any
experimental flags. Layer-2 is a strictly additive reinforcement.

| Layer | Hook | Status | Trigger | Failure Mode |
|---|---|---|---|---|
| **Layer-1** | `Stop` (`hooks/scripts/stop-watcher.mjs`) | **GA, mandatory** | Every Claude Code stop event | Blocks with exit 2 + reason |
| **Layer-2** | `TaskCompleted` (`hooks/scripts/task-completed-verifier.mjs`) | Opt-in | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` AND Agent Teams subagent task close | Blocks with exit 2 + reason |

**Layer-1 properties**:
- Registered unconditionally in `hooks/hooks.json` under the `Stop` event.
- Reads `verificationBlocks[phase]` for the active spec phase.
- First statement in `runStopHook()` is `if (input.stop_hook_active) return { continue: false };` — anti-loop guard, prevents recursive blocks (NFR-7).
- Idempotent: re-running with the same fresh block returns `{ continue: true }`.

**Layer-2 properties**:
- Bundle ships in every install but stays dormant unless Claude Code dispatches
  the `TaskCompleted` event, which only happens with Agent Teams enabled.
- Reuses the same `verifyPhaseBlock()` lib as Layer-1 — never diverges.
- Defensive guard: missing `task_id` or wrong `hook_event_name` → pass-through.
- When both layers fire on the same condition, Layer-1 short-circuits first;
  user sees one effective block, never duplicates.

**Why two layers**: Layer-1 fires once per stop event (coarse-grained, every
user). Layer-2 fires per subagent task close (fine-grained, opt-in). On any
machine without Agent Teams, Layer-2 is unreachable — bundle cost is zero.

## VerificationBlock Field Reference

Schema: `plugins/curdx-flow/schemas/spec.schema.json::$defs.verificationBlock`.
TS interface: `src/hooks/_shared/types.ts::VerificationBlock`.

```typescript
type VerificationPhase = "research" | "requirements" | "design" | "tasks" | "execution";

interface VerificationBlock {
  command: string;            // exact shell invocation, copy-pasteable
  exitCode: number;           // 0 = passed; non-zero = failed
  timestamp: string;          // ISO 8601 UTC, when command finished
  srcMtime: number;           // ms since epoch; max mtime of relevant src files at run time
  description?: string;       // human label, e.g. "design-phase typecheck"
  failedReason?: string;      // populated when exitCode !== 0
}
```

| Field | Required | Example | Notes |
|---|---|---|---|
| `command` | yes | `"npm run verify"` | Must be re-runnable verbatim. No shell variables. |
| `exitCode` | yes | `0` | `0` = passed, anything else = failed. Hook blocks if non-zero. |
| `timestamp` | yes | `"2026-05-06T18:13:42.001Z"` | ISO 8601 UTC. Compared to `srcMtime` for staleness. |
| `srcMtime` | yes | `1746551622001` | ms since epoch. `mtimeMs` directly — do not divide by 1000. |
| `description` | no | `"design-phase typecheck"` | Human label for error messages. |
| `failedReason` | no | `"typecheck: 3 errors in src/cli/commands/check.ts"` | Populated only when `exitCode !== 0`. |

**Block lifecycle**: state map `verificationBlocks` is keyed by phase. Writing
a new block for a phase replaces the previous one atomically via
`merge-state.ts`. `$unset: ["verificationBlocks.<phase>"]` removes a single
phase block while preserving siblings.

**Example (passing block, design phase)**:

```json
{
  "verificationBlocks": {
    "design": {
      "command": "npm run typecheck",
      "exitCode": 0,
      "timestamp": "2026-05-06T18:13:42.001Z",
      "srcMtime": 1746551622001,
      "description": "design-phase typecheck"
    }
  }
}
```

**Example (failed block, execution phase)**:

```json
{
  "verificationBlocks": {
    "execution": {
      "command": "npm run verify",
      "exitCode": 2,
      "timestamp": "2026-05-06T17:55:11.000Z",
      "srcMtime": 1746550511000,
      "description": "release-gate verify",
      "failedReason": "test:hooks: 1 failed | 22 passed (tests/hooks/stop-watcher.test.ts > stale block)"
    }
  }
}
```

## Phase Boundary Checklist

Run the listed `npm` script to refresh the corresponding `verificationBlocks`
entry. Each gate (commit / tag / release) requires the listed phase keys to be
**present** AND **fresh** (`exitCode === 0` AND `timestamp >= srcMtime`).

| Gate | Required `verificationBlocks` keys | Refresh command |
|---|---|---|
| **per-task commit** | `verificationBlocks.execution` (current task's verify cmd) | `npm run typecheck` (POC tasks); `npm run test:hooks` (test tasks); `npm run verify` (gate tasks) |
| **phase exit (Stop hook)** | `verificationBlocks.<currentPhase>` | per-phase verify cmd recorded by phase agent |
| **release tag push** | `verificationBlocks.execution` | `npm run verify`, then `curdx-flow doctor --cwd <repo>` release tag parity |

**Authoritative `npm` scripts** (synced with `package.json`; tests in
`tests/runner/iron-law-doc.test.ts` enforce this list matches `package.json`):

| Script | Purpose | When to run |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | After any `.ts` edit; cheapest gate. |
| `npm run build:hooks` | Bundle `src/hooks/**/*.ts` → `plugins/curdx-flow/hooks/scripts/*.mjs` | After editing any hook source. |
| `npm run check:hooks-fresh` | Fail if bundled `.mjs` is older than its `.ts` source | CI gate; runs as part of `verify`. |
| `npm run test:hooks` | `vitest run tests/hooks` (after `build:hooks`) | After hook source or test changes. |
| `npm run verify` | Full chain: `typecheck && check-versions && check:hooks-fresh && build && check:bundle && test:hooks && test:analyze` | Release gate; pre-tag; CI. |
| `curdx-flow doctor --cwd <repo>` | Runtime, plugin, hook freshness, dependency, and release tag parity diagnostics | Before relying on npm/plugin release tags. |

The `verify` chain is the canonical release-time gate. Do not invent ad-hoc
chains — use `npm run verify` so every leg gets a fresh block.

## Failure Recovery Cookbook

The hook always prints a copy-pasteable fix command. The recovery action is
the same regardless of which layer raised the block.

| Failure class | Hook reason text | Fix |
|---|---|---|
| **missing** | `Phase '<phase>' has no verification block. Run: <recommended cmd>. Then try again.` | Run the recommended command; the agent that records the block writes `verificationBlocks.<phase>` via `merge-state.ts`. Then retry the completion claim. |
| **failed** | `Verification failed: <failedReason>. Fix and re-run: <cmd>.` | Read `failedReason`, fix the underlying error in source, re-run `<cmd>`. The fresh exit-0 block replaces the failing one. |
| **stale** | `Stale evidence: src changed at <iso>, last verified at <iso>. Re-run: <cmd>.` | Source mtime is newer than block timestamp. Re-run the same `<cmd>` to regenerate a block whose `timestamp >= srcMtime`. |
| **malformed JSON** | `verificationBlocks malformed in .curdx-state.json. See references/iron-law-verification.md.` | Inspect `.curdx-state.json`; if hand-edited, restore from git or `$unset` the bad entry and re-run the recovery command. |
| **internal error** | `internal error in verify-blocks; see logs` | Bug in `verify-blocks.ts`. File an issue with the stack trace; as a workaround, set `verificationBlocks.<phase>` manually via state merge with the exact passing block. |

**Manual recovery via state merge** (last resort): edit-by-merge through the
hook envelope is preferred over hand-editing `.curdx-state.json`. Use
`merge-state.ts` semantics:

```jsonc
{
  "verificationBlocks": {
    "<phase>": {
      "command": "<exact cmd>",
      "exitCode": 0,
      "timestamp": "<ISO 8601 UTC of when cmd finished>",
      "srcMtime": <ms-epoch from fs.statSync(...).mtimeMs>
    }
  }
}
```

To clear a single phase block: `{"$unset": ["verificationBlocks.<phase>"]}`.

## Cross-References

**Skill** (canonical, expanded scope):
- `plugins/curdx-flow/skills/verification-before-completion/SKILL.md`

**Hook source paths**:
- Layer-1: `src/hooks/stop-watcher.ts` → `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`
- Layer-2: `src/hooks/task-completed-verifier.ts` → `plugins/curdx-flow/hooks/scripts/task-completed-verifier.mjs`
- Shared lib: `src/hooks/lib/verify-blocks.ts` (used by both hooks, the npm
  `verify` chain, and `npx curdx-flow check`)
- State writer: `src/hooks/lib/merge-state.ts` (atomic `verificationBlocks` writes)

**Schema and types**:
- `plugins/curdx-flow/schemas/spec.schema.json` — `$defs.verificationBlock`
- `src/hooks/_shared/types.ts` — `VerificationBlock`, `VerificationPhase`,
  `CurdxState.verificationBlocks`

**Hook registration**:
- `plugins/curdx-flow/hooks/hooks.json` — `Stop` and `TaskCompleted` events

**Release gate**:
- `package.json::scripts.verify` — full chain
- `scripts/check-verification-blocks.mjs` — release-time block validator
- `src/cli/commands/check.ts` — `npx curdx-flow check` user-facing wrapper

**Drift prevention**:
- `tests/runner/iron-law-doc.test.ts` — asserts every `npm run` command
  referenced in this file exists in `package.json::scripts`.
