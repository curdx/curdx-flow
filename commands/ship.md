---
description: Commit all feature artifacts and push to the current branch. No PR creation, no CI monitoring. Requires /curdx:verify to have run (or --skip-verify to override).
argument-hint: [--skip-verify] [--no-push]
allowed-tools: Read, Write, Edit, Bash
---

You are running `/curdx:ship`. This is the final step in the feature lifecycle. Scope is intentionally minimal: commit + push. PR creation / CI monitoring / auto-merge are NOT in scope (per user direction — no CI adapter layer).

## Pre-checks

1. Read `.curdx/state.json`. Must have `active_feature`.
2. Verify every committed task:
   ```bash
   cd "$CWD"
   total=$(grep -c '^<task id=' ".curdx/features/$ACTIVE/tasks.md" 2>/dev/null || echo 0)
   done=$(grep -c 'status="done"' ".curdx/features/$ACTIVE/tasks.md" 2>/dev/null || echo 0)
   [ "$done" -lt "$total" ] && echo "Not all tasks complete ($done/$total)" && exit 1
   ```
3. Unless `--skip-verify`: require `.curdx/features/$ACTIVE/verification.md` to exist AND contain `**Result:** VERIFIED`. If not, refuse with clear message directing to `/curdx:verify`.
4. Read `.curdx/config.json` to check git settings.

## Steps

### 1. Update state

```bash
. "${CLAUDE_PLUGIN_ROOT}/scripts/lib/state-io.sh"
state_merge '{"phase": "ship", "awaiting_approval": false}'
```

### 2. Stage artifacts

Any feature artifacts not yet committed (e.g., verification.md, review.md, analysis.md that were generated after implement's atomic commits):

```bash
git add ".curdx/features/$ACTIVE/"
```

### 3. Commit remaining artifacts (if any staged)

```bash
if ! git diff --cached --quiet; then
  git commit -m "$(cat <<MSG
docs(${ACTIVE#[0-9]*-}): add verification + review for ${ACTIVE}

Final artifacts from the /curdx:verify + /curdx:review passes.
MSG
)"
fi
```

The commit message uses the feature slug (strip numeric prefix) as the scope.

### 4. Determine the current branch

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
```

If we're on main / master / trunk: refuse.
```
/curdx:ship cannot push feature work directly to main/master/trunk.
Create or switch to a feature branch first, e.g.:
  git checkout -b feature/{feature_slug}
```

### 5. Push (unless --no-push)

```bash
git push -u origin "$BRANCH" 2>&1
```

If push fails due to auth: surface the error with the one-liner "check your git credentials (or use git credential helper)" — don't try to auto-fix credentials.

If push fails due to non-fast-forward: surface the error with `git pull --rebase origin "$BRANCH"` as the suggested fix — do NOT auto-rebase.

### 6. Print summary

```
shipped: {feature_id}

  branch:       {branch}
  commits:      {count from /curdx:implement + this one}
  pushed to:    origin/{branch}

the feature is now on the remote. next steps are out of curdx-flow's scope:
  - open a PR in your git platform's UI (or use `gh pr create` / `glab mr create`)
  - request reviews from teammates
  - watch CI (curdx-flow does not do this per design choice)

when the PR is merged:
  /curdx:cancel {feature_id}  — clean up .curdx/features/ for this feature
  (or leave it; claude-mem will index the artifacts for future reference)
```

### 7. Update state

```bash
state_merge '{"phase": "shipped", "awaiting_approval": true}'
```

## Failure modes

- **Tasks not done**: surface the unchecked task ids; suggest `/curdx:implement` or `/curdx:status`
- **Verification not done**: surface; suggest `/curdx:verify`
- **Unclean working tree** (unexpected uncommitted files): list the files; ask whether to stage/commit them or stash
- **Currently on main**: refuse (see step 4)
- **Push fails (auth)**: surface, don't retry without user input
- **Push fails (non-fast-forward)**: surface the `git pull --rebase` suggestion

## Why this is minimal

The Round 2 design document explicitly cut the CI adapter layer (GitHub / GitLab / Gitea / Azure / Jenkins) because:

1. It added 10+ platform-specific scripts for a use case that varies wildly across users
2. Private-git setups vary too much for a one-size-fits-all solution
3. `gh` / `glab` / `tea` CLIs exist and the user can invoke them directly
4. Auto-merging a feature branch is not something a generic workflow tool should do — the team's merge policy is project-specific

`/curdx:ship` intentionally stops at push. Anything beyond is the user's git-platform UI or a platform-specific CLI invocation they make themselves.
