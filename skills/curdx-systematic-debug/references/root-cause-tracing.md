# Root-cause tracing — backward data-flow walk

## When to use

In Phase 1 of systematic-debug, when the failing assertion tells you WHAT is wrong but not WHY.

## The technique

Start at the failing assertion. Walk backward through the data flow, one hop at a time, until you find the point where the bad value was introduced.

### Example

**Failing test:**
```
expect(response.body.user.email).toBe('alice@example.com')
// actual: undefined
```

**Backward walk:**

1. `response.body.user.email` is undefined. Why?
2. `response.body.user` — is this populated? Log it. → `{ id: 42, name: 'alice' }` — the `email` field is missing.
3. Why is `email` missing? Find where `response.body.user` is built. → `userController.getUser()`.
4. Inside `getUser`, what builds the response? → `userSerializer(user)`.
5. Inside `userSerializer`, does it include email? → it uses `pick(user, ['id', 'name'])` — NO email!
6. Why `pick(user, ['id', 'name'])` and not `['id', 'name', 'email']`? → `git blame` says the 'email' field was removed 2 commits ago as part of "privacy compliance" refactor.
7. Root cause: the refactor correctly removed email from the default serializer but missed updating the test fixture that depended on it. The test should either use a different serializer that includes email, OR the spec should clarify email is no longer in the response.

**What did NOT work:**
- "Let me add `email` back to the serializer" — would break the privacy compliance intent.
- "Let me mock the response" — masks the bug, doesn't fix it.

**What DID work:**
- Tracing the data backward revealed a spec ambiguity (the privacy refactor vs. the test's assumption), which routes correctly to `/curdx:refactor --file spec` rather than a code change.

## The key skills

### 1. At every hop, add instrumentation, not assumptions

Don't assume `user.email` is being set "somewhere". Add a log. Dump the object. Confirm.

### 2. Read the actual code, don't infer

If the function is called `sanitizeInput`, do NOT assume it sanitizes anything. Read the body. It might be a no-op, a stub, or something unexpected.

### 3. Check every boundary

Each boundary (function → function, service → service, DB → code) is a possible mutation point. Log at each until you find the one that introduces the bad value.

### 4. Git blame the suspicious lines

When you find the bad mutation, `git blame` the relevant commit. Understanding *why* the change was made often reveals whether it's a bug in the change or a bug in an earlier assumption that the change accidentally exposed.

## Multi-component systems

When you have > 3 components, don't trace linearly. Instead:

1. **Add tracing at every boundary** (entry of each component).
2. **Run the scenario.** Collect traces.
3. **Read the traces** — find the first boundary where the value goes bad.
4. Now you have a focused search area.

Concrete bash example for a 4-layer pipeline (webhook → build → signing → keychain):

```bash
# temporarily add stderr logging at each boundary
# layer 1: webhook
echo "[webhook] received event: $(jq -c . <<< "$PAYLOAD")" >&2
# layer 2: build
echo "[build] starting with artifact: $ARTIFACT, size: $(stat -c%s "$ARTIFACT")" >&2
# layer 3: signing
echo "[signing] input hash: $(shasum "$ARTIFACT"), key id: $KEY_ID" >&2
# layer 4: keychain
echo "[keychain] requested key: $KEY_ID, found: $(security find-identity -p codesigning | grep -c "$KEY_ID")" >&2
```

When the pipeline fails, the first boundary where the expected value is wrong is the locus of the bug — search there, not at the visible failure.

## Forbidden

- **"Skip to the answer"** — pattern-matching without tracing. Sometimes works; often leads to fix-the-symptom-not-the-cause.
- **"Must be the test infrastructure"** — prove it by running the same test against known-good code on the same infra.
- **"Works in dev, breaks in prod"** — find the environmental diff; don't just add environment-specific code paths.

## When to stop tracing

If you've traced 10+ hops backward and still can't find the locus:
- The bug is probably not in the data flow — it might be in the execution order, concurrency, or an environmental constraint
- Switch strategies: see Phase 2 (pattern analysis with a working case) of systematic-debug
