# curdx-flow Workflow Contract

This is the authoritative workflow contract for public `/curdx-flow:*` skills.

## Phase Entry Contract

Every phase skill starts from facts, not memory:

1. Run `curdx-flow snapshot --goal "$goal" --spec "$spec"` when a spec may be active.
2. Treat `snapshot.gates` as blocking unless the skill explicitly owns that gate.
3. Read only the phase artifact needed for the current operation; delegate deep inspection to the phase agent.
4. Persist state with `curdx-flow state merge <state-file> <json>`.
5. Accept completion only when the phase agent emits its required marker and the expected artifact exists.

## Public Skill Roles

| Skill | Owns | Must Not Do |
| --- | --- | --- |
| `start` | route, classify workspace/intent, create/reinitialize spec state, choose direct/scaffold/inception/spec/prototype/import/epic flow | implement feature work |
| `research` | discover constraints, current docs, code patterns | write requirements/design/tasks |
| `requirements` | FR/NFR/AC, scope, locked decisions | invent architecture |
| `design` | technical architecture and rewrite boundaries | create task checkboxes |
| `tasks` | executable value-slice tasks and coverage audit | implement code |
| `implement` | coordinate task dispatch and gates | edit product files directly |
| `triage` | split oversized work into dependency-aware specs | force epic work into one spec |
| `status` | report snapshot and next action | mutate state |
| `prompt-optimize` | improve a task prompt, route suggestion, missing context, risks, and quality gates | execute the task or mutate files |

## Gate Types

- `preflight`: missing state, missing artifact, invalid topology, dirty branch for release work.
- `revision`: agent output exists but fails review, coverage, or verification.
- `escalation`: automated resolution is ambiguous or would change product intent.
- `abort`: continuing risks destructive edits, duplicate work, invalid release, or false completion.

## Completion Rules

- No phase is complete without the expected artifact on disk and a fresh state merge.
- No greenfield product phase may begin business feature implementation before product context, constitution, and a walking-skeleton task exist or are explicitly source-deferred.
- No tasks phase is complete unless `tasks.md` has `## Source Coverage Audit` and executable top-level tasks are checkbox list items (`- [ ] 1.1 ...` or `- [x] 1.1 ...`), not heading-only sections.
- No implementation task is complete without `TASK_COMPLETE`, the task Verify command, and a sane post-commit diff.
- No release/tag/push claim is complete without `npm run verify` passing in the
  same worktree and `curdx-flow doctor --cwd <repo>` showing release tag parity
  is either `complete` or `not-published`, never `incomplete`.
- No agent marker may be inferred from prose. Markers are byte-sensitive contracts.
