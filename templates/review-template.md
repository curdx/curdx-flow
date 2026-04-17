# Review: {{FEATURE_NAME}}

**Feature ID:** {{FEATURE_ID}}
**Reviewer:** curdx-reviewer (adversarial, two-stage)
**Started:** {{TIMESTAMP}}

Findings accumulate as the review iterates. Each stage is run in a fresh subagent context to enforce independent judgment.

---

## Stage 1: Spec Compliance (iteration 1)

**Verdict:** {{SPEC_COMPLIANT | SPEC_ISSUES}}

### Findings

Format per finding:

```
- **S-CRIT-1** (Critical): {file:line} — {what's wrong}. Expected (from spec/plan): {requirement}. Actual: {what the code does}. Fix: {concrete next step}.
- **S-IMP-1** (Important): ...
- **S-MIN-1** (Minor): ...
```

ID scheme:
- `S-` = Spec-compliance finding
- `CRIT` / `IMP` / `MIN` = severity
- number = serial within its severity in this iteration

### Checks performed

- [ ] Read spec.md: {N FRs}, {M ACs}, {K Out-of-Scope}
- [ ] Read plan.md: {stack decisions}, {component boundaries}
- [ ] Walked git log: `main..HEAD` — {n commits}
- [ ] Verified each task's <verify> command matches the commit
- [ ] Grep'd for scope-creep indicators (new top-level files, new top-level dirs, unexpected imports)
- [ ] Cross-checked verification.md (if present)

---

## Stage 1: Spec Compliance (iteration 2, after fixes)

{{... only present if iteration 1 had SPEC_ISSUES and builder re-ran ...}}

---

## Stage 2: Code Quality

**Runs only after Stage 1 returned SPEC_COMPLIANT.**

**Verdict:** {{QUALITY_APPROVED | QUALITY_ISSUES}}

### Findings

Format per finding:

```
- **Q-CRIT-1** (Critical): {file:line} — {issue}. Risk: {what breaks in production}. Fix: {specific approach}.
- **Q-IMP-1** (Important): ...
- **Q-MIN-1** (Minor): ...
```

### Checks performed

- [ ] Read 3-5 similar files for convention parity: {list}
- [ ] Scanned for SQL-string-building: `{result}`
- [ ] Error handling audit: every new public function has explicit handling or documented propagation
- [ ] Input validation: boundaries (user input, external API, DB results) all validated
- [ ] Test quality: assertions check behavior not just "function was called"
- [ ] Duplication: new code vs existing via Grep on key identifiers
- [ ] Complexity heuristics: longest function, deepest nesting, largest file
- [ ] Security: XSS, injection, path traversal, secret handling
- [ ] Performance: loops over DB / unbatched queries / sync I/O in hot path
- [ ] Observability: logs sufficient to debug production incidents

---

## Summary

- Stage 1 iterations: {{N}}
- Stage 2 iterations: {{M}}
- Total Critical (resolved): {{a}}
- Total Important (resolved): {{b}}
- Total Minor (tracked, may remain): {{c}}

Remaining open Minor findings are acceptable to ship but should be tracked in a backlog. Critical and Important must be resolved before the review closes.
