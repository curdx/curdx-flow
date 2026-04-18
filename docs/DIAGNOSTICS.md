# Diagnostics and bug reports

curdx-flow records structured events during every session and can package them into a sanitized tarball for the maintainer. This doc explains what's captured, where it lives, and how to use it.

## The three layers of observability

1. **Claude Code native transcripts** — not managed by curdx-flow. Stored at `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`. Contain the full user/assistant/tool/tool_result stream. **NOT sanitized** — may contain secrets typed into prompts.

2. **Claude Code OpenTelemetry** — optional, not managed by curdx-flow. Enable with `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_EXPORTER_OTLP_ENDPOINT=...` to ship metrics/events/traces to any OTLP backend (Grafana, Honeycomb, self-hosted). See [Claude Code monitoring docs](https://code.claude.com/docs/en/monitoring-usage). Out of scope for curdx-flow to manage.

3. **curdx-flow events.jsonl** — what this doc is about. Lives at `<project>/.curdx/logs/events.jsonl`. Written by every curdx-flow hook. Captures things Claude's native transcript misses: phase transitions, `/curdx:*` command invocations, subagent dispatches, skill activations, hook decisions, Stop-loop iterations.

## What's in events.jsonl

One event per line, JSONL format. Every event has these common fields:

- `ts` — ISO 8601 UTC timestamp
- `session` — Claude Code session id
- `phase` — `.curdx/state.json` phase at the moment of the event
- `active_feature` — current feature directory name (or empty string)
- `event` — event type (see below)

Event types and their extra fields:

| event | extra fields | emitted by |
|---|---|---|
| `session_start` | `matcher` (startup/resume/compact/clear) | load-context.sh |
| `user_prompt` | (none) | phase-guard.sh |
| `curdx_command` | `command` (e.g. `/curdx:plan`) | phase-guard.sh |
| `tool_call` | `tool`, plus one of: `subagent` / `skill` / `command` / `file` | log-activity.sh |
| `tool_result` | `tool`, `exit_code` (bash only) | log-activity.sh |
| `hook_denied` | `hook`, `rule` or `pattern`, `tool` | enforce-constitution.sh, careful-bash.sh |
| `hook_asked` | `hook`, `pattern` | careful-bash.sh |
| `failure_escalation` | `level` (L1/L2/L3), `failure_count` | failure-escalate.sh |
| `pre_compact` | (none) | save-state.sh |
| `stop_loop_continue` | `next_task`, `task_index`, `total_tasks`, `global_iteration` | implement-loop.sh |

Example sequence for a `/curdx:plan` run:

```jsonl
{"ts":"2026-04-17T10:00:00Z","session":"abc","phase":"init","event":"session_start","matcher":"startup"}
{"ts":"2026-04-17T10:00:05Z","session":"abc","phase":"spec-complete","event":"curdx_command","command":"/curdx:plan"}
{"ts":"2026-04-17T10:00:06Z","session":"abc","phase":"plan","event":"tool_call","tool":"Task","subagent":"curdx-architect"}
{"ts":"2026-04-17T10:00:12Z","session":"abc","phase":"plan","event":"tool_call","tool":"mcp__context7__resolve-library-id"}
{"ts":"2026-04-17T10:01:45Z","session":"abc","phase":"plan","event":"tool_call","tool":"Write","file":"plan.md"}
```

## Privacy

Event entries are **structured metadata only** — no prompt text, no full bash commands, no file contents. What's in each event:

- Tool name (`Task`, `Skill`, `Bash`, `Edit`, `Write`, `mcp__*`) — safe
- First word of bash commands (`npm`, `git`, `curl`) — safe
- Basename of files being edited (no path, no directory) — safe
- Subagent type / skill name — safe
- Hook decision reasons — structured (rule id, pattern name), not free text
- Phase and active feature name — not sensitive

**NOT in events**: prompt text, raw tool outputs, full bash commands, file contents, file paths. Those go to Claude Code's transcript, not curdx-flow's log.

## Log rotation

`events.jsonl` grows unbounded during active use. When it hits 5 MB, `log-event.sh` rotates it to `events.jsonl.1` (single generation kept). Further growth starts a fresh `events.jsonl`.

If you want to reset logs entirely:

```bash
rm -rf .curdx/logs/events.jsonl .curdx/logs/events.jsonl.1
```

This is safe — hooks will recreate the log on next event.

## `/curdx:snapshot` — packaging for sharing

```bash
# in an initialized project
claude
> /curdx:snapshot
```

Produces `~/curdx-snapshot-<timestamp>.tar.gz` containing:

- `REPORT.md` — human-readable summary with the **full** event timeline (not truncated), current state, hook firings, git log + status
- `events.jsonl` — full event log for the current session generation
- `events.jsonl.1` / `.2` — rotated event logs from earlier bursts (if present)
- `state.json` — `.curdx/state.json`
- `config.json` — `.curdx/config.json`
- `install-state.json` — `~/.curdx/install-state.json`
- `features/` — **every** feature directory under `.curdx/features/` (not just the active one)
- `debug/` — every `/curdx:debug` session
- `settings/` — project `.claude/settings.json`, `settings.local.json`, and user `~/.claude/settings.json`
- `hooks/` — the actual hook scripts as installed, so the maintainer can spot version drift
- `transcripts/` — Claude Code's native session transcripts for this project, full length
- `git/` — `log.txt` (200 commits), `status.txt`, `diff-HEAD.patch`, `stash.txt`, `remotes.txt`
- `env.txt` — safe env vars (CLAUDE_*, OTEL_*, CURDX_*, PATH, SHELL, LANG, TERM), secret-like names filtered out
- `versions.txt` — claude-code/node/jq/git/bash versions + `uname -a`
- `META.txt` — generation metadata + share guidance

Default mode is **RAW** — no redaction. Because the bundle is typically
shared one-to-one with the maintainer, redacted logs would hide the exact
cause of bugs. Opt into scrubbing explicitly with `--redact` (or `--strict`
for the strongest mode).

Optional flags:

- `--redact` — run the regex sanitizer (API keys, bearer tokens, JWTs, DB creds, home paths, etc.)
- `--strict` — same as `--redact`, plus redact emails and all IPv4 addresses
- `--no-transcript` — skip Claude Code's native transcripts (they're the most likely place to contain secrets you typed into prompts; excluding trades fidelity for privacy)
- `--no-preview` — skip the "seal tarball? [Y/n]" prompt
- `--here` — write tarball to `$PWD` instead of `$HOME`

## Sanitization — what gets redacted (only with `--redact` / `--strict`)

With `--redact`:

| Pattern | Replacement |
|---|---|
| `sk-ant-*` (Anthropic) | `<REDACTED:anthropic-key>` |
| `sk-*` (OpenAI, inc. `sk-proj-*`) | `<REDACTED:openai-key>` |
| `ghp_*` / `github_pat_*` / `gho_*` / `ghu_*` / `ghs_*` | `<REDACTED:github-*>` |
| `glpat-*` (GitLab) | `<REDACTED:gitlab-pat>` |
| `AKIA*` / `ASIA*` (AWS) | `<REDACTED:aws-*>` |
| `AIza*` (Google) | `<REDACTED:google-api-key>` |
| `xox[baprs]-*` (Slack) | `<REDACTED:slack-token>` |
| `Authorization: Bearer ...` | `Authorization: Bearer <REDACTED:bearer-token>` |
| `-----BEGIN ... PRIVATE KEY-----` block | `<REDACTED:pem-private-key>` |
| `proto://user:pass@host` (DB URLs) | `proto://<REDACTED:db-creds>@host` |
| `*TOKEN*=val`, `*SECRET*=val`, `*KEY*=val`, `*PASSWORD*=val`, etc. | `KEY=<REDACTED:env-secret>` |
| `eyJ...` JWT (3-segment) | `<REDACTED:jwt>` |
| `/Users/<name>`, `/home/<name>`, `/var/folders/...` | `/Users/REDACTED`, etc. |

With `--strict` additionally:

| Pattern | Replacement |
|---|---|
| Email addresses | `<REDACTED:email>` |
| IPv4 addresses | `<REDACTED:ipv4>` (loopback and private ranges not preserved) |

**Sanitization is regex-based — not semantic.** It catches common patterns; it cannot catch novel / custom token formats. Always **skim REPORT.md** before sharing broadly. If you find something the regex missed, report it so we can widen the patterns.

### Why raw by default?

The snapshot is designed for the maintainer to reproduce a failure you saw on your machine. Home paths, exact phase transitions, the actual next-task string the loop was stuck on — all of it matters. Redacting by default turned every bug report into a guessing game. You still get `--redact` / `--strict` for when the bundle will travel further than one trusted recipient.

## Recipient-side analysis

When you receive someone's `curdx-snapshot-<ts>.tar.gz`:

1. Extract: `tar -xzf curdx-snapshot-*.tar.gz`
2. Read `REPORT.md` first — current state, recent events, hook firings summary
3. Grep `events.jsonl` for the failing command/hook:
   ```bash
   jq 'select(.event == "hook_denied")' events.jsonl | less
   jq 'select(.event == "failure_escalation")' events.jsonl | less
   jq 'select(.event == "stop_loop_continue") | [.ts, .task_index, .total_tasks, .next_task]' events.jsonl
   ```
4. Cross-check `state.json` — was phase/task_index/awaiting_approval consistent with what the user describes?
5. For `hook_denied` events: the `rule` (for enforce-constitution) or `pattern` (for careful-bash) tells you WHY the hook blocked
6. For `stop_loop_continue`: the `global_iteration` tells you how many turns the loop ran; if it's near 100 and the loop is stuck, the `next_task` hasn't advanced

## Scope boundaries

- curdx-flow's events.jsonl is **per-project**, written inside `.curdx/logs/`. There's no user-global event log.
- events.jsonl is **append-only**; hooks never rewrite or delete past entries (other than rotation at 5 MB).
- snapshot is **read-only** — it never modifies the source files it bundles.
- No data is sent anywhere automatically. `/curdx:snapshot` produces a LOCAL file. Sharing it with the maintainer is a manual act.

## Relation to Claude Code's `/feedback`

Claude Code's built-in `/feedback` command sends feedback to Anthropic about Claude Code itself. Use it for Claude-the-product issues. For curdx-flow-specific issues, use `/curdx:snapshot` and send the tarball to the curdx-flow maintainer directly.
