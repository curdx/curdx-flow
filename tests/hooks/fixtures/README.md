# Hook fixtures

Stable, version-controlled inputs that drive the v6 → v7 byte-equal regression
tests in `tests/hooks/baselines/`.

## Snapshot-spec-state pattern

Hook outputs depend on filesystem state that the live repo's spec directory
mutates as work progresses. To keep baselines reproducible, fixtures point at
*frozen* spec workspaces under `/tmp/curdx-fixture-*/` rather than the live
`./specs/`. The baseline-generation script (`tests/hooks/baselines/generate.sh`)
populates these workspaces deterministically before each run.

Each workspace exercises a different state branch:

| Workspace | Purpose |
| --- | --- |
| `/tmp/curdx-fixture-empty/` | No spec, no `.claude/` settings — empty cwd path |
| `/tmp/curdx-fixture-spec/` | Single spec `demo-spec` mid-execution (taskIndex=1, total=3) |
| `/tmp/curdx-fixture-quick/` | Spec with `quickMode=true`, phase=`design` |
| `/tmp/curdx-fixture-corrupt/` | Spec with corrupt JSON state (triggers `decision:block`) |
| `/tmp/curdx-fixture-completed/` | Spec where all tasks are checked off |

The `generate.sh` script recreates each workspace from scratch so baselines are
deterministic across machines.

## Per-hook fixtures

- `load-spec-context/` — JSON payloads delivered on stdin to the SessionStart hook.
- `quick-mode-guard/` — JSON payloads delivered on stdin to the PreToolUse hook.
- `stop-watcher/` — JSON payloads delivered on stdin to the Stop hook.
- `update-spec-index/` — Invocation specs (cwd + argv); the script ignores stdin.

The fixture file naming reflects the state branch it exercises (e.g.
`quick-active.json`, `corrupt-state.json`).

## Adding a new fixture

1. Drop `<name>.json` into the appropriate hook directory.
2. If the fixture needs a new workspace, update `generate.sh` to provision it.
3. Re-run `generate.sh` and commit the resulting baseline.
4. Once committed, the baseline is **frozen** — never regenerate it from a
   later v6 release. A v7 .mjs port that diverges has a regression.
