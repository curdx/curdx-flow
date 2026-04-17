---
description: Package up the current project's curdx-flow state and recent events into a sanitized tarball for sharing with the maintainer. Collects state.json + events.jsonl + active feature artifacts + versions; applies regex-based secret redaction; writes a human-readable REPORT.md summary.
argument-hint: [--strict] [--include-transcript] [--no-preview] [--here]
allowed-tools: Read, Bash, AskUserQuestion
---

You are running `/curdx:snapshot`. Goal: produce a shareable diagnostic bundle for the maintainer when something goes wrong.

This is NOT a bug-fixing command; it's a "here's what happened in my session" packager. For actual bug investigation, use `/curdx:debug`.

## Pre-checks

1. Read `.curdx/state.json`. If missing, tell the user this project isn't initialized (they need `/curdx:init` first).
2. Parse flags from `$ARGUMENTS`:
   - `--strict` — maximally aggressive redaction (emails + all IPs, on top of default secrets)
   - `--include-transcript` — add Claude Code's native transcript (`~/.claude/projects/.../session.jsonl`, last 5000 lines sanitized). **Default off** because transcripts contain raw tool outputs and potentially user prompts with PII.
   - `--no-preview` — skip the "seal tarball? [Y/n]" confirmation
   - `--here` — write tarball to current directory instead of `$HOME`

## Steps

### 1. Surface what's about to happen

Run `/curdx:doctor` first (as a separate call via `Read`-ing `.curdx/state.json` and printing the state). The snapshot script CANNOT invoke slash commands itself, so encourage the user to paste doctor output into the bug report thread manually if needed.

### 2. Run the snapshot script

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" $ARGUMENTS
```

Arguments pass through verbatim.

### 3. Explain the output to the user

After the script finishes, it prints the tarball path. Surface to the user:

- Where the tarball is (`~/curdx-snapshot-<timestamp>.tar.gz` by default)
- Approximate size
- What's inside (events.jsonl, state.json, features/active/, config.json, install-state, versions, REPORT.md)
- What's NOT inside by default (transcript — pass `--include-transcript` to add; full bash commands — only first word logged; file paths — basenames only)
- Reminder: sanitization is regex-based; user should skim REPORT.md before sharing to catch anything the regex missed

### 4. Next-step suggestion

```
snapshot ready: ~/curdx-snapshot-{timestamp}.tar.gz

contents:
  - REPORT.md        human-readable summary (scan this first!)
  - events.jsonl     {N} session events, sanitized
  - state.json       current phase + task progress
  - config.json      stack detection + testing mode
  - features/        active feature's spec/plan/tasks (sanitized)
  - install-state.json dependency versions
  - versions.txt     claude/node/jq/git versions

to share:
  - email / DM / upload the tar.gz to the curdx-flow maintainer
  - before sharing, at minimum: `tar -tzf the-tarball` to list contents,
    `tar -xzO the-tarball <file> | less` to spot-check contents

default redaction covers: API keys (anthropic/openai/github/gitlab/aws/
google/slack), bearer tokens, PEM private keys, DB URLs with creds,
KEY=VALUE env entries containing TOKEN/SECRET/KEY/PASSWORD/CREDENTIAL,
JWT, home directory paths, /var/folders.

--strict ALSO redacts emails and all IPv4 addresses.
--include-transcript adds ~/.claude/projects/<project>/<session>.jsonl
  (last 5000 lines, sanitized) — this is the richest source of context
  but also most likely to contain sensitive info you typed.
```

## When to use

- Something broke in `/curdx:implement` that isn't your fault (loop stuck, constitution denying legitimate edits, hooks misfiring)
- The maintainer asked for logs
- You want to audit your own session — skim `events.jsonl` and `REPORT.md` to understand what curdx-flow actually did

## What the bundle does NOT replace

- `/curdx:doctor` — run that FIRST to surface install-level issues before packaging
- Git history — commits tell the "what changed" story; the bundle tells the "how we got there" story
- Claude Code's native `/feedback` — that goes to Anthropic about Claude Code itself, not about curdx-flow
