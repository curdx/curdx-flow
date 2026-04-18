# contracts/

Single source of truth for API contracts shared between frontend and backend in a full-stack feature. One subdirectory per feature id:

```
contracts/
├── 001-hello-api/
│   └── openapi.yaml        # REST — default
├── 002-realtime-chat/
│   └── trpc.ts             # tRPC alternative
└── 003-graph-explorer/
    └── schema.graphql      # GraphQL alternative
```

## Who writes what

- **Written by `curdx-contractor`** after `curdx-analyst` produces `spec.md` and before `curdx-architect` writes `plan.md`. The contractor's output is immutable once `curdx-architect` starts — any later change goes through `/curdx:refactor --file contract` with cascade detection.
- **Consumed by `curdx-architect`** when sequencing tasks: every backend task implementing an endpoint has the contract file in `<read_first>`; every frontend task calling an endpoint has the same file in `<read_first>`.
- **Consumed by `curdx-builder`** at implementation time via the `curdx-read-first` and `curdx-contract-first` skills (hard gates — the builder physically cannot skip reading the contract).
- **Consumed by `curdx-verifier`** during `/curdx:verify` to re-check that every endpoint in the contract has a passing integration test.

## Why

2026 consensus on full-stack AI code generation (OpenSpec, Intent, Kiro, GitHub spec-kit, BMAD-METHOD, Cursor 2.0's parallel agents): the dominant cause of "AI wrote the backend and frontend separately and they don't talk to each other" is **contract drift**. Solution: declare the contract first, then generate both sides from it. OpenSpec's published benchmark: 75% reduction in integration-cycle time when API-first was mandated.

## Format selection

The contractor picks the format based on `.curdx/config.json.stack`:

| Stack shape | Contract format |
|---|---|
| Node backend + any frontend using `fetch` | `openapi.yaml` (OpenAPI 3.1) |
| Node backend + frontend in same repo / same monorepo | `trpc.ts` (if tRPC is in package.json) |
| Any backend + GraphQL client (`graphql`, `urql`, `@apollo/client`) | `schema.graphql` (GraphQL SDL) |
| Python / Go / Rust backend + any frontend | `openapi.yaml` |

If the stack is ambiguous, the contractor asks the user via `AskUserQuestion` rather than guessing.

## Drift detection

`scripts/verify-runnable.sh` Gate C is extended (when `contracts/<feature-id>/` exists) to run a codegen-diff check: regenerate client types from the contract into `/tmp`, diff against the committed types — any diff means the code drifted from the contract or vice versa. Fail the gate; surface via `/curdx:verify`.

## Anti-patterns (enforced by `curdx-contract-first` skill)

- Hand-writing request/response types in backend AND frontend separately — they will drift within one session.
- Adding a new endpoint in code without first adding it to the contract — `curdx-read-first` will block the edit because the contract file is in `<read_first>`.
- Editing the contract after `curdx-architect` has sequenced tasks without running `/curdx:refactor --file contract` — cascade detection is skipped, `tasks.md` references a stale contract.

See `skills/curdx-contract-first/SKILL.md` for the enforcement discipline.
