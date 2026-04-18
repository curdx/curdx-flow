---
name: curdx-contract-first
description: Use when implementing ANY endpoint (backend) or client call (frontend) in a feature that has a contracts/<feature-id>/ directory. Iron law — NO ENDPOINT OR CLIENT CALL WITHOUT READING THE CONTRACT FILE THIS TURN. Prevents the single most common full-stack AI failure mode: backend and frontend drifting into incompatible types within one session.
---

# Contract-First Discipline (curdx-contract-first)

## Iron Law

**NO ENDPOINT OR CLIENT CALL WITHOUT READING THE CONTRACT FILE THIS TURN.**

If the feature has `contracts/<feature-id>/<file>` and you are about to Edit/Write code under `src/`, `app/`, `pkg/`, `lib/`, or any production source path, AND the change touches an API surface, you MUST have opened and read the contract file in the current turn — not "read it earlier", not "remember it from the plan". Re-read it this turn.

Code that does not match the contract is a bug, regardless of whether the tests happen to pass. Tests validate behavior within one component; the contract validates the wire between components.

## When this skill activates

This skill auto-loads when ALL of these are true:

- Active feature directory `.curdx/features/<feature-id>/` exists
- `contracts/<feature-id>/` directory exists (i.e., curdx-contractor ran for this feature)
- Current tool call is Edit/Write touching a production source path
- The target file is in the current task's `<files>` AND that task's `<read_first>` cites the contract file

When it does NOT activate:

- Unit-level implementation that doesn't cross the network boundary (pure functions, reducers, helpers)
- Migration / schema / seed scripts (those are architect's territory, not contract)
- Test files (tests encode behavior, not wire format; they reference the contract indirectly via the types generated from it)

## The flow you must follow

### 1. Identify the contract file for the feature

```bash
FEATURE=$(jq -r '.active_feature' .curdx/state.json)
CONTRACT_DIR="contracts/$FEATURE"
# one of: openapi.yaml, trpc.ts, schema.graphql
CONTRACT=$(ls "$CONTRACT_DIR"/*.{yaml,ts,graphql} 2>/dev/null | head -1)
```

If no contract exists for a feature the user says is full-stack — STOP. That means `curdx-contractor` was skipped. Surface this: the user should run (or let the meta-skill dispatch) the contractor before you write implementation code.

### 2. Read the contract this turn

Open the file with the `Read` tool. Do not rely on having read it in a prior turn; context compaction may have evicted it. This is the same discipline as `curdx-read-first`, applied to the wire format.

### 3. Identify the exact endpoint / procedure / field you're touching

Before writing code, name it out loud in your response:

> "I'm about to implement `POST /users/:id/password-reset` from `contracts/014-pwd-reset/openapi.yaml`. Request shape: `{ email: string }`. Response 200: `{ resetToken: string, expiresAt: ISODateTime }`. Error 404: `{ code: 'USER_NOT_FOUND' }`."

If you cannot find the endpoint in the contract — STOP. Either the task is out of scope (raise `NEEDS_CONTEXT`) or the contract is missing this endpoint (raise `BLOCKED: contract missing endpoint X; run /curdx:refactor --file contract`).

### 4. Write code that exactly matches the contract

- Field names: byte-identical to contract.
- Optionality: only optional when contract says so.
- Error shapes: every contract-declared error is handled; no invented error codes.
- HTTP status codes: per contract; do not "be more helpful" with a 200 when contract says 204.

### 5. Verify the match before returning DONE

- Backend: at minimum, type-check or run schema-validation (`@redocly/cli lint` for OpenAPI consumers, tRPC's native type check, GraphQL's schema.graphql vs resolver check).
- Frontend: the generated client types should have been regenerated (see NOTES.md in the contract dir for the codegen command); verify your imports match the generated types without `as any` escape hatches.

## Anti-patterns (hard-blocked or flagged)

| Thought / action | Why it's wrong | What to do instead |
|---|---|---|
| "I'll just add `rememberMe` to the request — it's a common field." | Contract drift. Frontend won't send it; backend parses it; inconsistency. | Add it to the contract first (via `/curdx:refactor --file contract`), then regenerate, then implement. |
| "The error is obviously a 400 — I'll return 400 even though contract says 422." | Status-code drift. Frontend's error handling branches on contract's code. | Follow the contract. If 400 is actually right, update the contract and regenerate. |
| "I'll define a type locally because importing the generated one feels heavy." | Types drift the moment the contract changes. | Always import from the generated types. If they're awkward, that's a contract-design issue — fix at the source. |
| "The contract says required but this field is sometimes null in practice." | The contract is the source of truth. "In practice" means the spec or the contract is wrong. | Raise via `NEEDS_CONTEXT` — the analyst or contractor needs to make it optional explicitly. |
| "I'll implement the endpoint more permissively (accept extra fields)." | Poe's Law of API design: extra fields become required over time. | Be strict per contract. Any permissiveness must be declared. |

## When you catch yourself rationalizing

The following thoughts mean you're about to break the discipline. Stop.

- "I'll just read the contract quickly after I write the code." — No. Read first.
- "The test passes, so it must be fine." — Tests pass both sides of a drift if both sides agree on the wrong shape. Contract catches what tests can't.
- "The spec is vague here, so I'll just pick something reasonable." — That's `NEEDS_CLARIFICATION` to the analyst, not a guess.
- "The frontend person / the backend person already hard-coded this shape." — One side already drifted; don't compound it. Fix at the contract.

## Integration with other skills

- `curdx-read-first` — complementary. Read-first enforces "open every `<read_first>` file"; contract-first enforces "and in particular, treat the contract file as the authority for wire shapes."
- `curdx-tdd` — tests generated from the contract are inherently contract-aligned (e.g. Schemathesis from OpenAPI). Prefer generated tests over hand-written ones for API surfaces.
- `curdx-verify-evidence` — the verifier uses the contract to auto-generate integration tests and run them against the running backend in `/curdx:verify`. Evidence includes "all contract endpoints returned per their declared shape."
