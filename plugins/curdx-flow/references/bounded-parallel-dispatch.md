# Bounded Parallel Dispatch

> Used by: research.md, start.md, triage-flow.md, and any future commands needing parallel agent dispatch

## Coordinator Role

The research command is a **coordinator, not a researcher**. It MUST delegate ALL research work to subagents:
- `Explore` subagent for fast codebase analysis (read-only, uses Haiku model)
- `research-analyst` subagent for web research (needs WebSearch/WebFetch)

The coordinator never performs web searches, codebase analysis, or writes research.md content itself.

> Cross-reference: see [`coordinator-pattern.md`](./coordinator-pattern.md) for the underlying single-coordinator-as-truth-source rationale.

## Domain Coverage

Bounded parallel dispatch applies to four operational domains. Each has a different risk profile and a different rule for when fan-out is safe.

| Domain | When to fan out | Independence holds because... | Risk level | Coordinator role |
|---|---|---|---|---|
| Discovery | Pre-spec product/greenfield/inception work, empty workspace, or `blocked-ask-user` with non-empty `intent.missingFacts` — before writing any product-context artifact AND before asking the user clarifying questions | Each missing fact, candidate stack, prior-art topic, and prior-decision lookup is its own search space | LOW | Synthesize findings into grounded `[Recommended]` interview options OR into product-context artifact drafts; never write artifacts from a single agent's output alone |
| Research | Multiple unrelated topics, each with own scope | Each topic is its own search space | LOW | Synthesize findings into single research.md |
| Review | Phase-boundary review against frozen artifact (post-design / post-tasks / pre-commit) | Diff is immutable snapshot | LOW | Dedupe findings, arbitrate contradictions, synthesize verdicts |
| Debug | Investigating live failure, AFTER sequential triage narrowed to ≤3 leads | Each lead is an independent hypothesis | HIGH — never fan-out-first | Sequential triage first; then dispatch with explicit verifier step |

> **Discovery vs Research:** Discovery runs BEFORE a spec exists (or before the user has answered enough questions to scope one). Research runs inside an active spec's research phase. The same agent types (research-analyst, Explore) may be used, but the coordinator role differs: Discovery feeds interview questions and product-context artifacts; Research feeds a single `research.md`.

## Independence Criteria

Pre-flight checklist. Before dispatching N agents in parallel, **ALL THREE** must hold. If any criterion fails → DO NOT fan out. Run sequentially or refactor inputs until they hold.

1. **Independent input** — no agent waits on another's output to begin.
   *Failure mode if ignored:* sequential masquerading as parallel; coordination overhead dominates.
2. **Independent output** — no write conflicts unless serialized through coordinator.
   *Failure mode if ignored:* lost writes; data races; one agent's output silently wins.
3. **Independent context** — no agent reads from peer's mid-flight state.
   *Failure mode if ignored:* stale reads; reasoning on partial data; cascading wrong conclusions.

## Per-Domain Anti-patterns

### Research domain (3 — preserved from original doc)

1. **Multi-topic single agent** — combining multiple external topics into one agent dilutes focus and creates redundant searches.
   *Coordinator: do this instead* — one research-analyst per external topic; one Explore per codebase concern.
2. **Multi-topic Explore** — assigning one Explore agent to "find everything related to the spec" mixes orthogonal codebase concerns into one report.
   *Coordinator: do this instead* — break codebase exploration into multiple Explore teammates, one per component or concern.
3. **Sequential Agent spawn** — spawning Agent calls one at a time across separate messages runs them sequentially, defeating parallelism.
   *Coordinator: do this instead* — issue ALL Agent calls in ONE message so the runtime executes them in true parallel.

### Review domain (5 — new)

4. **Fixation on obvious** — multiple reviewers all gravitate to surface defects and miss subtle ones because their attention overlaps on whatever is loudest.
   *Coordinator: do this instead* — assign each reviewer a single concern axis (correctness, security, perf, style, spec-fit) so coverage is by partition not vote.
5. **Duplicate findings without dedup owner** — N reviewers each report the same lint error, inflating signal noise and forcing the human reader to dedupe by hand.
   *Coordinator: do this instead* — the coordinator dedupes findings by signature before synthesis; reviewers never see each other's output.
6. **Contradictions without synthesis** — Reviewer A says "use pattern X", Reviewer B says "avoid X"; the report passes both through with no arbiter.
   *Coordinator: do this instead* — the coordinator arbitrates contradictions, picks one verdict with cited rationale, and never passes raw conflicts downstream.
7. **Stale-state reviewer** — a slow reviewer reads code that has been amended mid-review, producing comments that no longer apply.
   *Coordinator: do this instead* — freeze the artifact (commit SHA or file snapshot) before dispatch and pin every reviewer to that snapshot.
8. **Role-prompt specialization drift** — a "spec-compliance reviewer" inadvertently inherits code-quality concerns from training data and reports out-of-scope findings.
   *Coordinator: do this instead* — pin reviewer scope explicitly in the prompt and reject out-of-scope findings at synthesis time.

### Debug domain (5 — new)

9. **Hypothesis overwrite via shared scratchpad** — investigators stomp on each other's working notes when they share a write surface.
   *Coordinator: do this instead* — give each agent an isolated context and an isolated output file; merge only at synthesis.
10. **Prover-without-verifier** — an agent claims root cause found and the coordinator accepts it without a second pass to validate.
    *Coordinator: do this instead* — dispatch a verifier as a separate role that reproduces the failure under the proposed fix.
11. **Partial-findings-Frankenstein** — the coordinator combines half-true partial reports into a wrong overall conclusion.
    *Coordinator: do this instead* — require each agent to attach an explicit evidence chain; reject syntheses that lack traceable evidence per claim.
12. **Dead-end branches consuming budget** — fanning out before triage burns tokens on dead leads, exhausting budget before promising leads get explored.
    *Coordinator: do this instead* — sequential triage first → narrow to ≤3 leads → THEN parallel deep-dive. Never fan-out-first.
13. **Missing distributed tracing for attribution** — when agents fan out, the coordinator can't tell which agent owned which finding, breaking accountability and follow-up.
    *Coordinator: do this instead* — tag every finding with the originating agent ID at synthesis; preserve attribution end-to-end.

> **Debug-specific rule:** sequential triage → narrow to ≤3 leads → parallel deep-dive → explicit verifier. **Never fan-out-first.**

### Discovery domain (5 — new)

14. **Question-before-discovery** — asking the user clarifying questions before fanning out subagents to resolve `intent.missingFacts` that are answerable from the codebase, prior memory, or current external docs.
    *Coordinator: do this instead* — for `product-inception`, `greenfield-spec`, `prototype`, `import-spec`, or `blocked-ask-user` routes with non-empty `missingFacts`, fan out Explore + claude-mem + research-analyst in ONE message FIRST, then ask only the irreducible user-decision questions with `[Recommended]` answers grounded in findings.
15. **Single-agent product context** — writing `mission.md`, `roadmap.md`, `tech-stack.md`, or `constitution.md` from one research-analyst alone, or worse, from the main coordinator directly without delegation.
    *Coordinator: do this instead* — fan out one agent per artifact concern (target user, candidate stacks, prior art, repo conventions, security/test standards) and synthesize across them before drafting any artifact.
16. **Skipping prior-decision check** — burning tokens on fresh external research when prior decisions, failed attempts, or similar projects already exist in `claude-mem` or the user's `.planning/` notes.
    *Coordinator: do this instead* — every Discovery fan-out must include at least one claude-mem search agent (general-purpose agent invoking `mcp__plugin_claude-mem_mcp-search__*` tools) AND one Explore agent rooted at `.planning/`, `docs/`, and `CLAUDE.md` when those exist.
17. **Re-discover-after-each-answer** — discovering, asking one user question, then re-discovering after the answer, then asking again. This serializes work that should be one upfront fan-out.
    *Coordinator: do this instead* — extract ALL high-leverage `missingFacts` upfront, fan out once with N parallel agents, synthesize, then conduct the interview in a single tight pass.
18. **Discovery-as-implementation** — using Discovery fan-out agents to write source code, make irreversible decisions, or commit files. Discovery agents are read-only fact-gatherers by contract.
    *Coordinator: do this instead* — Discovery agents return findings only; the coordinator (or a downstream phase agent inside `/curdx-flow:research` etc.) makes decisions and writes artifacts.

> **Discovery-specific rule:** before the first user question AND before writing the first product-context artifact in greenfield/inception routes, run one upfront fan-out (claude-mem + Explore + N research-analyst in ONE message). Treat `intent.missingFacts` as the work-list.

## Subagent-vs-Grep Guidance

> *"Claude Opus 4.6 has a strong predilection for subagents and may spawn them in situations where a simpler, direct approach would suffice — for example, the model may spawn subagents for code exploration when a direct grep call is faster and sufficient."* — Anthropic Claude Code Advanced Patterns `[R1-27]`

Field reports confirm: 30-60s subagent overhead vs <1s grep call when the only need is a string match.

**Use grep when:** exact string, single concern, single file or known glob.
**Use subagent when:** semantic exploration, multi-file synthesis, any of the 4 domains above with all 3 independence criteria holding, OR — even with a single topic — the work would flood main context with file/log/search-result tokens you won't reference again.

> *"Use [a subagent] when a side task would flood your main conversation with search results, logs, or file contents you won't reference again: the subagent does that work in its own context and returns only the summary."* — Anthropic Claude Code docs (`/en/sub-agents`)

The context-pollution rule overrides the parallelism rule. A single Discovery subagent that reads 50 files and returns a 200-word summary is correct usage even though only one agent runs.

## Topic Identification

Before invoking any subagents, analyze the goal and break it into independent research areas:

| Category | Agent Type | Examples |
|----------|-----------|----------|
| External/Best Practices | `research-analyst` | Industry standards, patterns, libraries |
| Codebase Analysis | `Explore` | Existing implementations, patterns, constraints |
| Related Specs | `Explore` | Other specs in ./specs/ that may overlap |
| Domain-Specific (web) | `research-analyst` | Specialized topics needing focused web research |
| Domain-Specific (code) | `Explore` | Specialized topics needing codebase exploration |
| Quality Commands | `Explore` | Project lint/test/build commands discovery |
| Verification Tooling | `Explore` | Dev server, test runner, browser deps, E2E configs, ports |
| Discovery — prior memory | `general-purpose` invoking `mcp__plugin_claude-mem_mcp-search__*` | Prior decisions, failed attempts, similar projects in user's claude-mem history |
| Discovery — repo context | `Explore` rooted at `.planning/`, `docs/`, `CLAUDE.md` | Existing planning notes, conventions, project docs already on disk |
| Discovery — candidate stacks / prior art | `research-analyst` (one per candidate) | "Best PTY-to-web bridge in 2026", "node-pty alternatives", "how does Aider abstract sessions" — one per missing fact |

**Minimum requirement**: 2 topics (1 research-analyst + 1 Explore). There are zero exceptions to the parallel requirement.

### Topic Deduplication

- Each research-analyst handles ONE external topic; each Explore handles ONE codebase concern
- Break external research into MULTIPLE research-analyst teammates -- do NOT combine multiple external topics into one agent
- Example: "Add OAuth with rate limiting" becomes 3 research-analyst agents (OAuth patterns, rate limiting strategies, security best practices)
- When NOT to split: topics are tightly coupled and depend on each other, or splitting would create redundant searches

## Dispatch Pattern (Direct Agent Default, Teams Optional)

Agent Teams are experimental and disabled by default in Claude Code. Direct `Agent(...)` dispatch is the baseline contract. Use `TeamCreate` / `TaskCreate` / `TaskList` / `SendMessage` only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set and those tools are visible in the current session. If any team step fails, continue with the direct Agent path; the outputs and merge contract stay the same.

### Step 1: Optional Progress Tasks

Create one visible native task per topic when `TaskCreate` is available. This is for UI progress only and never gates the research output.

```
TaskCreate(
  subject: "[Topic name] research",
  description: "Research [topic] for $spec. Output: ./specs/$spec/.research-[topic-slug].md",
  activeForm: "Researching [topic]"
)
```

If `TaskCreate` is unavailable or returns an error, log a short warning and proceed.

### Step 2: Optional Team Setup

Skip this step unless Agent Teams are enabled and available.

1. `TeamDelete()` once to release any stale team; errors are harmless.
2. `TeamCreate(team_name: "research-$spec", description: "Parallel research for $spec")`
3. If setup fails, continue with direct Agent dispatch and omit `team_name` / `name` fields in Step 3.

### Step 3: Spawn Agents (ALL in ONE Message)

ALL Agent calls MUST be in ONE message to ensure true parallel execution. Spawning one at a time across separate messages runs them sequentially.

```
Agent(agent_type: research-analyst,
  prompt: "You are a research teammate.
    Topic: [External best practices for topic]
    Spec: $spec | Path: ./specs/$spec/
    Output: ./specs/$spec/.research-[topic].md

    Goal context: [problem, constraints, success criteria from .progress.md]

    Instructions:
    1. WebSearch for best practices, industry standards, common pitfalls
    2. Research relevant libraries/frameworks
    3. Write findings to output file
    Do NOT explore codebase -- Explore teammates handle that.
    When done, mark your task complete via TaskUpdate.")

Agent(agent_type: Explore,
  prompt: "Analyze codebase for spec: $spec
    Output: ./specs/$spec/.research-codebase.md
    Find existing patterns, dependencies, constraints related to [goal].
    Write findings to output file with sections: Existing Patterns, Dependencies, Constraints, Recommendations.")
```

When Agent Teams are enabled, add `team_name: "research-$spec"` and unique `name` fields (`researcher-1`, `explorer-1`, etc.) to the same Agent calls. Without Agent Teams, omit both fields.

For more topics, add more `researcher-N` and `explorer-N` teammates in the same message.

### Step 4: Wait and Collect

- Wait for Agent results. If using Agent Teams, wait for automatic teammate messages and use `TaskList` at most once to check progress.
- Timeout: If a teammate stalls, proceed with partial results and note incomplete topics.

### Step 5: Optional Team Shutdown

If Agent Teams were used, send `shutdown_request` to each teammate after all tasks complete, then call `TeamDelete()` to clean up. If shutdown fails, the next team setup can clean up stale state.

## Merging Results

After ALL parallel tasks complete, the coordinator merges results into a single `research.md`.

### Merge Process

1. **Read all partial files**: `.research-[topic-1].md`, `.research-codebase.md`, `.research-quality.md`, `.research-related-specs.md`, etc.

2. **Create unified `./specs/$spec/research.md`** with this structure:

```markdown
# Research: $spec

## Executive Summary
[Synthesize key findings from ALL agents - 2-3 sentences]

## External Research
[Merge from ALL .research-[topic].md files created by research-analyst agents]
### Best Practices
### Prior Art
### Pitfalls to Avoid

## Codebase Analysis
[From .research-codebase.md]
### Existing Patterns
### Dependencies
### Constraints

## Related Specs
[From .research-related-specs.md]
| Spec | Relevance | Relationship | May Need Update |

## Quality Commands
[From .research-quality.md]
| Type | Command | Source |

## Feasibility Assessment
[Synthesize from all sources]
| Aspect | Assessment | Notes |

## Recommendations for Requirements

## Open Questions

## Sources
[All URLs and file paths from all agents]
```

3. **Delete partial files** after successful merge: `rm ./specs/$spec/.research-*.md`

4. **Quality check**: Ensure no duplicate information, consistent formatting.

## Scaling by Complexity

| Scenario | Agent Count |
|----------|-------------|
| Simple, focused goal | 2 minimum: 1 research-analyst (web) + 1 Explore (codebase) |
| Goal spans multiple domains | 3-5: 2-3 research-analyst (different topics) + 1-2 Explore |
| Goal involves external APIs + codebase | 2+ research-analyst for API docs/best practices + 1+ Explore |
| Goal touches multiple components | Multiple Explore (one per component) + multiple research-analyst (one per external topic) |
| Complex architecture question | 5+: 3-4 research-analyst (different external topics) + 2-3 Explore (different code areas) |
| Discovery / Inception (empty workspace, product-inception, greenfield-spec, prototype, import-spec, or blocked-ask-user with non-empty `missingFacts`) | 3+ minimum: 1 claude-mem search agent + 1 Explore (`.planning/`, `docs/`, `CLAUDE.md`) + N research-analyst, one per candidate stack or prior-art topic in `missingFacts` |

**Note**: Verification Tooling discovery is always assigned to an Explore agent (codebase-only: package.json scripts, dependency detection, config file discovery).
