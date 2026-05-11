---
enabled: true
default_max_iterations: 5
auto_commit_spec: true
quick_mode_default: false
specs_dirs: ["./specs"]
code_roots:
  - name: current
    path: "."
    role: auto
context_policy:
  auto_discover_from_claude_md: true
  auto_discover_sibling_roots: true
  require_related_roots_accessible: true
---

# curdx-flow Configuration

This file configures curdx-flow plugin behavior for this project.

## Settings

### enabled
Enable/disable the plugin entirely. Set to `false` to disable all hooks and commands.

### default_max_iterations
Default maximum retries per failed task before blocking (default: 5).

### auto_commit_spec
Whether to automatically commit spec files after generation (default: true).

### quick_mode_default
Whether to run in quick mode by default when no flag provided (default: false).

### specs_dirs
Array of directories where specs can be stored (default: `["./specs"]`).

This enables organizing specs across multiple directories, useful for:
- **Monorepos**: Keep specs close to their related packages
- **Large projects**: Group specs by feature area or team
- **Separation of concerns**: Distinguish infra specs from product specs

When a spec name exists in multiple directories, commands will prompt for disambiguation.

### code_roots
Optional list of source-code roots. Users do not need to maintain this if the project `CLAUDE.md` has a short Dev section, but it is useful when local paths differ by machine.

Each root supports:
- `name`: Stable short name for the root
- `path`: Path relative to this project root, or an absolute path
- `role`: `auto`, `frontend`, `backend`, `shared`, `plugin`, `infra`, or `mobile`

### context_policy
Controls how curdx-flow discovers and validates project topology:
- `auto_discover_from_claude_md`: Read project `CLAUDE.md` Dev sections
- `auto_discover_sibling_roots`: Detect obvious sibling frontend/backend repos
- `require_related_roots_accessible`: Block routing when a goal needs a root outside Claude Code access

## Usage

Create this file at `.claude/curdx-flow.local.md` in your project root to customize plugin behavior.

## Example

```yaml
---
enabled: true
default_max_iterations: 3
auto_commit_spec: false
quick_mode_default: true
---

# curdx-flow Configuration

Custom settings for this project.
```

## CLAUDE.md Dev Section Example

Most teams should keep topology in the development project's `CLAUDE.md` and let curdx-flow infer the rest:

```markdown
# Dev

- frontend: ../frontend
- backend: .
- database: use local dev env only; see .env.example
```

Do not write real database passwords, tokens, or production URLs in `CLAUDE.md`.

## Monorepo Example

For monorepos, configure multiple specs directories to keep specs organized by package:

```yaml
---
enabled: true
specs_dirs:
  - "./specs"
  - "./packages/frontend/specs"
  - "./packages/backend/specs"
  - "./packages/shared/specs"
---

# curdx-flow Configuration

Specs are organized by package in this monorepo.
```

With this setup:
- `/curdx-flow:start my-feature` creates spec in `./specs/` (first configured dir)
- `/curdx-flow:start my-feature --specs-dir ./packages/frontend/specs` creates in frontend
- `/curdx-flow:status` lists all specs from all configured directories
- `/curdx-flow:switch my-feature` prompts if name exists in multiple directories
