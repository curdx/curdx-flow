# curdx-flow

> Solo full-stack workflow for Claude Code — spec-driven, TDD-enforced, fresh-context subagent execution, evidence-based verification.

A Claude Code plugin that gives a single developer the discipline of a senior team: every change starts from a spec, every spec becomes a plan, every plan decomposes into atomic tasks, every task runs in a fresh subagent context with TDD enforcement, and nothing is "done" without fresh verification evidence.

**Status:** v0.1 (Round 1 of 3 — skeleton). Backend TDD pipeline works end-to-end. Frontend testing, debug/review/verify, and ship come in Round 2 and 3.

## Install

```bash
npx curdx-flow@latest install
```

This installs:
- `curdx-flow` plugin into Claude Code
- [`claude-mem`](https://github.com/thedotmack/claude-mem) — cross-session memory layer (SQLite + Chroma + 13 MCP tools)
- [`pua`](https://github.com/tanweai/pua) — failure-detection and behavioral protocol injection
- [`@modelcontextprotocol/server-sequential-thinking`](https://www.npmjs.com/package/@modelcontextprotocol/server-sequential-thinking) — multi-step reasoning MCP
- [`@upstash/context7-mcp`](https://www.npmjs.com/package/@upstash/context7-mcp) — up-to-date library docs MCP

Re-running the installer is safe: already-installed deps are detected and skipped; missing pieces are filled in; user-disabled hooks are respected.

### Lightweight install (you already have claude-mem and pua)

```bash
claude plugin marketplace add curdx/curdx-flow
claude plugin install curdx@curdx-flow
```

Claude Code's plugin system recursively installs declared dependencies and registers MCP servers + hooks automatically.

## First use

```bash
cd your-project
claude
> /curdx:init
> /curdx:spec hello-api
> /curdx:plan
> /curdx:tasks
> /curdx:implement
```

The Stop-hook loop drives `/curdx:implement` autonomously: each task gets a fresh subagent context, returns `DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`, atomic-commits when accepted, advances `task_index`, and exits cleanly when `ALL_TASKS_COMPLETE` is emitted.

## Philosophy

Five iron rules, enforced by `PreToolUse` hooks reading `.claude/rules/constitution.md`:

1. **No code without a spec** — modifying `src/**` requires `.curdx/features/NNN/spec.md` to exist.
2. **No production code without a failing test** — TDD is mandatory for all backend logic and all frontend components with non-trivial behavior.
3. **No fix without root cause** — bug-fix tasks must walk the 4-phase systematic-debug methodology.
4. **No completion without fresh evidence** — "done" claims require this-turn command output, not "should pass" or past run logs.
5. **No secrets in commits** — `git commit` is intercepted, staged files scanned for credentials.

## Comparisons

This plugin synthesizes the best ideas from 8 reference projects (with each contribution attributed in `docs/COMPARISONS.md`):

- [github/spec-kit](https://github.com/github/spec-kit) — spec → plan → tasks pipeline, constitution as hard gate
- [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) — plugin packaging, adversarial review, story format
- [obra/superpowers](https://github.com/obra/superpowers) — subagent-driven development, 4-status protocol, verification-before-completion, anti-sycophancy
- [tzachbon/smart-ralph](https://github.com/tzachbon/smart-ralph) — Stop-hook loop, 3-choice approval, VE/VF protocols
- [garrytan/gstack](https://github.com/garrytan/gstack) — atomic settings patching, careful/freeze guardrails, builder profile
- [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) — atomic XML task format, wave-based parallel execution
- [tanweai/pua](https://github.com/tanweai/pua) — failure-detection hook, frustration interception (used as dependency)
- [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) — cross-session memory (used as dependency)

## License

MIT — see [LICENSE](./LICENSE).
