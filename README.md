<div align="center">

# curdx-flow

**Spec-driven delivery for Claude Code — turn a single prompt into a reviewable, resumable, verifiable delivery record.**

[![npm version](https://img.shields.io/npm/v/@curdx/flow?style=for-the-badge&logo=npm&logoColor=white&color=3B82F6&labelColor=0B1020)](https://www.npmjs.com/package/@curdx/flow)
[![GitHub release](https://img.shields.io/github/v/release/curdx/curdx-flow?style=for-the-badge&logo=github&color=60A5FA&labelColor=0B1020)](https://github.com/curdx/curdx-flow/releases)
[![License](https://img.shields.io/badge/license-MIT-A78BFA?style=for-the-badge&labelColor=0B1020)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-FBBF24?style=for-the-badge&labelColor=0B1020)](https://docs.claude.com/en/docs/claude-code/plugins)

**English** · [简体中文](README.zh-CN.md)

![curdx-flow overview](docs/assets/readme/curdx-flow-overview.en.svg)

`/curdx-flow:start` reads your repo and your goal, then auto-routes: handle directly · light spec · full spec · resume work · or triage one big ask into linked specs.

</div>

---

## Why it exists

Claude Code can write code. Real feature work exposes three failure modes the moment it gets serious:

| Without curdx-flow | With curdx-flow |
| --- | --- |
| **Context rot** — chats grow long, the model forgets the original ask | Goal is pinned to `requirements.md`. Survives every restart. |
| **Completion hallucination** — "it's done" with no command, browser, or CI output | Completion requires `verificationBlocks`. No silent passes. |
| **Process mismatch** — small edits crushed by ceremony, big features rushed in one shot | `/start` routes: direct · light · full · resume · triage |

It isn't another project management system. It's an **execution discipline layer** for Claude Code.

## 30-second install

Requires Claude Code **v2.1.154 or newer** (check with `claude --version`; `curdx-flow doctor` surfaces the floor as `platformFloor`).

Native marketplace install is the primary path:

```bash
claude plugin marketplace add curdx/curdx-flow
claude plugin install curdx-flow@curdx
```

Inside Claude Code:

```text
/curdx-flow:help
/curdx-flow:start todo-app build a todo app with create/edit/complete/delete, browser-verified
```

Optionally, the `@curdx/flow` npm installer is a convenience bootstrap: it asks for your language (中文 / English), opens an interactive picker for the optional companion plugins and MCP servers, and writes the managed block in `~/.claude/CLAUDE.md`. Companion plugins are **soft-detected at runtime, not hard dependencies** — curdx-flow installs and runs without them (degraded, with a `doctor` hint):

```bash
npx @curdx/flow install
```

CI / scripted environments? Skip prompts and add everything: `npx @curdx/flow install --all --yes --lang en`.

## Workflow

![curdx-flow workflow loop](docs/assets/readme/curdx-flow-loop.en.svg)

The typical path:

1. **Start** — identify repo, goal, risk, and any existing specs.
2. **Research** — gather code facts, official docs, prior context.
3. **Requirements** — turn the goal into acceptance criteria and boundaries.
4. **Design** — capture approach, risks, interfaces, verification strategy.
5. **Tasks** — slice into value-bearing tasks, each with a verify command.
6. **Implement** — execute task-by-task via native `/goal` plus specialist agents.
7. **Verify** — record command / browser / CI / release / npm evidence into `verificationBlocks`.

## Common commands

| Command | Purpose |
| --- | --- |
| `/curdx-flow:start [name] [goal]` | Recommended entry. Auto-routes, creates, or resumes a spec. |
| `/curdx-flow:new <name> [goal]` | Force-create a new spec (no auto-resume). |
| `/curdx-flow:requirements` | Generate requirements + acceptance criteria from research/goal. |
| `/curdx-flow:design` | Generate technical design from requirements. |
| `/curdx-flow:tasks` | Generate executable tasks from design. |
| `/curdx-flow:implement` | Run the task loop with verification. |
| `/curdx-flow:status` | Current spec, progress, health, next command. |
| `/curdx-flow:triage [epic] [goal]` | Decompose a large goal into linked specs with explicit dependencies. |
| `/curdx-flow:prompt-optimize [draft]` | Refine a prompt + routing suggestion without executing. |
| `/curdx-flow:cancel [name]` | Stop execution or delete spec state (with confirmation). |

## Capabilities it coordinates

curdx-flow is a Claude Code plugin. The companions below are **soft-detected at runtime** — none is a hard dependency in the manifest, so curdx-flow installs and runs without them:

| Capability | Type | How curdx-flow uses it |
| --- | --- | --- |
| `pua` | Claude Code plugin | Recovery after repeated failure, parallel planning, Chinese-language skills. |
| `claude-mem` | Claude Code plugin | Search prior decisions, similar tasks, recurring failure modes. |
| `chrome-devtools-mcp` | Claude Code plugin | Real Chrome: DOM, console, network, screenshot evidence. |
| `ui-ux-pro-max` | Claude Code plugin | Design judgment and quality checks for visible UI/UX. |
| `context7` | External MCP | Current library / framework docs — detected, not bundled. |
| `sequential-thinking` | External MCP | Explicit hypothesis decomposition for high-risk tasks — detected, not bundled. |

When one is missing, `curdx-flow doctor` reports the degraded state and the fix — it won't silently skip critical evidence.

## CLI

`@curdx/flow` ships both an installer and a diagnostic tool:

```bash
# Show install state
npx @curdx/flow status

# Install or update plugins / MCP capabilities
npx @curdx/flow install --all --yes
npx @curdx/flow update

# Analyze Claude Code session logs
npx @curdx/flow analyze

# Validate verificationBlocks for the current spec
npx @curdx/flow check
```

The plugin also exposes a runtime `curdx-flow` CLI for skills and hooks:

```bash
curdx-flow doctor
curdx-flow route --compile --goal "release a Claude Code plugin"
curdx-flow dev detect
curdx-flow dev up
curdx-flow dev health
curdx-flow dev verify
curdx-flow dev down
```

## When to use it

Use it for:

- Claude Code plugins, CLIs, full-stack apps, frontend pages, backend services, release flows.
- Work where research → requirements → design → tasks → execution → verification all need to be traceable.
- Release-grade tasks that need browser, CI, npm / GitHub Release evidence.
- Tasks that have failed several times and need a recoverable failure trail.

Skip it for:

- One-off "what does this snippet mean?" questions.
- Requests where you explicitly want answers without file edits.
- Zero-risk one-line tweaks — `/curdx-flow:start` will route those to direct execution or a light spec anyway.

## What a spec looks like

By default, specs land under `specs/<name>/`:

```text
specs/
└── todo-app/
    ├── research.md
    ├── requirements.md
    ├── design.md
    ├── tasks.md
    ├── .curdx-state.json
    └── .progress.md
```

Ground rules:

- `research.md` / `requirements.md` / `design.md` / `tasks.md` are committable context assets.
- `.curdx-state.json` is execution state: phase, task index, verificationBlocks, recovery info.
- `.progress.md` is runtime progress + learning — usually `.gitignore`-d.
- Completion claims must trace back to `verificationBlocks` — not just to model prose.

## Repo structure

```text
src/
  core/                     # differentiated core: capabilities, contracts, evidence, verdict
  hooks/                    # Claude Code hook source + shared runtime libraries (hooks/lib)
  flows/                    # optional npm bootstrap (companion picker + CLAUDE.md sync) + analyze
  registry/                 # legacy companion-install layer (native `claude plugin` is primary)
  i18n/ runner/ ui/         # CLI plumbing for the optional bootstrap
plugins/curdx-flow/         # The Claude Code plugin itself
  .claude-plugin/           # plugin.json (+ $schema)
  skills/                   # /curdx-flow:* slash skills
  agents/                   # executor, reviewer, QA, architect, PM, …
  hooks/                    # Claude Code hook configs + committed script bundles
  schemas/                  # state / evidence / report contract schemas
scripts/                    # build, version bump, validation, Claude Code smoke
tests/                      # Vitest tests
```

## Local development

```bash
npm ci
npm run build
npm run build:hooks
npm run typecheck
npm run test:hooks
```

Release-grade validation:

```bash
npm run verify
claude plugin validate ./plugins/curdx-flow
CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc
```

After editing anything under `src/hooks/**` you must run:

```bash
npm run build:hooks
npm run check:hooks-fresh
npm run test:hooks
```

## Release rules

Bump version through the script — never by hand:

```bash
node scripts/bump-version.mjs patch
```

A release requires two tags pushed together:

```bash
git tag -a vX.Y.Z -m "@curdx/flow X.Y.Z"
git tag -a curdx-flow--vX.Y.Z -m "curdx-flow X.Y.Z"
git push origin main vX.Y.Z curdx-flow--vX.Y.Z
```

- `vX.Y.Z` — triggers the npm publish.
- `curdx-flow--vX.Y.Z` — the plugin tag Claude Code's marketplace resolves.
- Don't push tags until `npm run verify`, `claude plugin validate`, and `test:claudecc` all pass.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/curdx-flow:*` not visible | Run `claude plugin list`; confirm `curdx-flow@curdx` is installed and enabled. |
| Plugin dependency missing | Re-sync via `npx @curdx/flow install curdx-flow --yes`. |
| Chrome DevTools MCP unavailable | Confirm `chrome-devtools-mcp@chrome-devtools-plugins` is installed and local Chrome is present. |
| Spec stuck mid-execution | `/curdx-flow:status` for the current phase, then resume as advised or `/curdx-flow:cancel`. |
| Unsure if release is safe | `npm run verify && claude plugin validate ./plugins/curdx-flow && CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc`. |
| `.curdx/` appearing in your repo | Local advisory log (route decisions, edit batches, subagent lifecycle). Capped at 64 KB, never network-uploaded. Add `.curdx/` to your `.gitignore` to keep it out of commits. Set `CURDX_FLOW_BRAIN=off` to disable recording entirely. |

## References

- Claude Code Plugins: <https://docs.claude.com/en/docs/claude-code/plugins>
- Claude Code Hooks: <https://docs.claude.com/en/docs/claude-code/hooks>
- npm package: <https://www.npmjs.com/package/@curdx/flow>
- Releases: <https://github.com/curdx/curdx-flow/releases>

## License

MIT
