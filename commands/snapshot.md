---
description: Package up the current project's curdx-flow state, logs, transcripts, settings, and git state into a tarball for the maintainer. Default is RAW (no redaction) — pass --redact to scrub secrets. Produces REPORT.md summary with the FULL event timeline.
argument-hint: [--redact] [--strict] [--no-transcript] [--no-preview] [--here]
allowed-tools: Read, Bash, AskUserQuestion
---

You are running `/curdx:snapshot`. Goal: produce a diagnostic bundle the
maintainer can use to fully reproduce and analyze a curdx-flow issue on
someone else's machine.

This is NOT a bug-fixing command; it's a "here's what happened" packager.
For actual bug investigation, use `/curdx:debug`.

## Design choice: completeness over privacy

The bundle is shared one-to-one with the maintainer of curdx-flow. Redacted
logs hide the exact cause of bugs, so the default is **no redaction**. If
the user wants to share the bundle more broadly (posting on a public issue,
forwarding to a third party), they can pass `--redact` or `--strict`.

## Pre-checks

1. Read `.curdx/state.json`. If missing, tell the user this project isn't initialized (they need `/curdx:init` first).
2. Parse flags from `$ARGUMENTS`:
   - `--redact` — run the regex sanitizer on every file (secrets, home paths, bearer tokens, JWTs, DB creds, etc.)
   - `--strict` — `--redact` PLUS emails and all IPv4 addresses
   - `--no-transcript` — skip Claude Code's native transcripts (they're included by default for full fidelity)
   - `--no-preview` — skip the "seal tarball? [Y/n]" confirmation
   - `--here` — write tarball to current directory instead of `$HOME`

## Steps

### 1. Run the snapshot script

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" $ARGUMENTS
```

Arguments pass through verbatim. `CLAUDE_PLUGIN_ROOT` is exported so the
script can locate the installed hook scripts to include in the bundle.

### 2. Explain the output to the user

After the script finishes, it prints the tarball path. Surface to the user:

- Where the tarball is (`~/curdx-snapshot-<timestamp>.tar.gz` by default)
- Approximate size
- What's inside (full list below)
- Whether redaction ran (yes if user passed `--redact`/`--strict`; otherwise raw)
- Reminder: if they're sharing beyond the maintainer, re-run with `--redact`

### 3. Bundle contents

```
snapshot ready: ~/curdx-snapshot-{timestamp}.tar.gz

contents:
  - REPORT.md               human-readable summary with the FULL event
                            timeline (not truncated), hook firings,
                            current state, git log + status
  - events.jsonl            all events from the current log
  - events.jsonl.1 / .2     rotated logs from prior bursts (if present)
  - state.json              phase + task progress
  - config.json             stack detection + testing mode
  - install-state.json      dependency versions
  - features/               EVERY feature directory (spec/plan/tasks/...)
  - debug/                  every /curdx:debug session
  - settings/               project + user .claude/settings.json(s)
  - hooks/                  installed plugin hooks (for version-drift checks)
  - transcripts/            all Claude native session transcripts for this
                            project, full length (skip with --no-transcript)
  - git/log.txt             last 200 commits
  - git/status.txt          working tree status
  - git/diff-HEAD.patch     uncommitted diff vs HEAD
  - git/stash.txt           stash list
  - env.txt                 safe env vars (CLAUDE_*, OTEL_*, PATH, etc.)
  - versions.txt            claude/node/jq/git/bash versions + uname -a
  - META.txt                generation metadata + share guidance

to share:
  - email / DM / upload the tar.gz to the curdx-flow maintainer
  - before sharing, at minimum: `tar -tzf the-tarball` to list contents,
    `tar -xzO the-tarball <file> | less` to spot-check contents

redaction (opt-in via --redact / --strict):
  API keys (anthropic/openai/github/gitlab/aws/google/slack), bearer tokens,
  PEM private keys, DB URLs with creds, KEY=VALUE env entries containing
  TOKEN/SECRET/KEY/PASSWORD/CREDENTIAL, JWTs, home directory paths,
  /var/folders. --strict ALSO redacts emails and all IPv4 addresses.
```

## When to use

- Something broke in `/curdx:implement` that isn't your fault (loop stuck, constitution denying legitimate edits, hooks misfiring)
- The maintainer asked for logs to diagnose an issue on your machine
- You want to audit your own session — skim `REPORT.md` to see the full timeline

## What the bundle does NOT replace

- `/curdx:doctor` — run that FIRST to surface install-level issues before packaging
- Git history — commits tell the "what changed" story; the bundle tells the "how we got there" story
- Claude Code's native `/feedback` — that goes to Anthropic about Claude Code itself, not about curdx-flow
