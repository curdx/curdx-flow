# Plan: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Status:** draft
**Spec:** [spec.md](./spec.md)

## Constitution Check

Before architecting, check `.claude/rules/constitution.md` hard rules. For each rule potentially affected by this plan, fill the table:

| Rule | Affected? | How we comply |
|------|-----------|---------------|
| NO CODE WITHOUT SPEC | yes | spec.md exists at this feature dir |
| NO PRODUCTION CODE WITHOUT FAILING TEST | yes | tasks.md will sequence test-then-impl per FR |
| NO FIX WITHOUT ROOT CAUSE | n/a | not a bug fix |
| NO COMPLETION WITHOUT EVIDENCE | yes | verify.md will record bash output + (if frontend) screenshots |
| NO SECRETS IN COMMITS | yes | no env vars or keys touched |

If any cell would say "we'll skip this rule because...", **stop**. Either change the plan or escalate to amend the constitution via `/curdx:refactor`.

## Complexity Tracking

If this plan introduces complexity beyond the simplest viable approach (e.g., new framework, new service boundary, new build step), justify here.

| Complexity added | Why simpler doesn't work |
|------------------|--------------------------|
| ... | ... |

If the table is empty, the plan defaults to the simplest path.

## Architecture

### Component diagram

```
{{ASCII_OR_MERMAID}}
```

### Stack decisions

| Decision | Choice | Why | Alternatives rejected |
|----------|--------|-----|----------------------|
| Web framework | ... | ... | ... |
| Test runner | ... | ... | ... |
| Persistence | ... | ... | ... |

### Data model

```
{{TYPE_DEFINITIONS_OR_SCHEMA}}
```

### Surface

| Endpoint / function | Inputs | Outputs | Side effects |
|---------------------|--------|---------|--------------|
| ... | ... | ... | ... |

### Error handling

| Failure mode | Detection | Recovery |
|--------------|-----------|----------|
| ... | ... | ... |

## File structure

What new files / dirs will exist after this feature lands.

```
src/
├── ...
tests/
├── ...
```

## Test strategy

- **Unit:** what we'll cover, what we won't and why
- **Integration:** what boundaries we'll exercise
- **End-to-end:** if frontend, how (playwright? chrome-devtools-mcp?)

## Verification commands

What `verify.md` will run to confirm the feature works:

```bash
# example
npm test -- spec/feature-{{slug}}.spec.ts
curl -sf http://localhost:3000/health | jq .
```

## Risks

- ...

## Existing patterns to follow

Files / conventions in this codebase that should guide implementation:

- ...
