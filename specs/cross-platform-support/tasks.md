# Tasks: cross-platform-support

> **Workflow**: GREENFIELD → POC-first 5 phases (granularity: **fine**, target 50+ atomic tasks)
> **Strategy**: Phase 1 ships v7.0.0-alpha.0 git tag for early Windows runner validation; Phase 2-5 stabilize → beta.0 → rc.0 → 7.0.0
> **Quality commands** (from research.md): `npm run typecheck` (= `tsc --noEmit`); `npm run check-versions`; `npm run build`; new in this spec → `build:hooks`, `check:hooks-fresh`, `test:hooks`, `verify`

---

## Phase 1: Make It Work (POC) — 50-60% of tasks

Goal: 5 hooks bundled .mjs running on Linux + macOS + Windows runner; markdown sweep complete; alpha.0 tag pushed; CI all-green on alpha.

### Bootstrap: dev deps + scaffolding

- [x] 1.1 Add esbuild + vitest dev deps
  - **Do**:
    1. `npm install --save-dev esbuild@^0.24 vitest@^2`
    2. Verify entries present in `package.json` `devDependencies`
  - **Files**: `package.json`, `package-lock.json`
  - **Done when**: `node -e "console.log(require('esbuild').version)"` prints version
  - **Verify**: `node -e "require('esbuild');require('vitest/package.json')" && echo DEPS_OK`
  - **Commit**: `chore(build): add esbuild + vitest dev deps`
  - _Requirements: FR-7, FR-13_
  - _Design: Build / test 基础设施_

- [x] 1.2 [P] Pin LF line endings via .gitattributes
  - **Do**: Create repo-root `.gitattributes` with `*.sh *.mjs *.cjs *.js text eol=lf`
  - **Files**: `.gitattributes`
  - **Done when**: File contains 4 LF-pin lines
  - **Verify**: `grep -E 'eol=lf' .gitattributes | wc -l | grep -q 4 && echo LF_OK`
  - **Commit**: `chore(repo): pin LF eol via .gitattributes (CRLF mitigation)`
  - _Requirements: FR-11, NFR-9_
  - _Design: Cross-Platform Path Handling_

- [x] 1.3 [P] Colocated package.json forces ESM in bundle dir
  - **Do**: Create `plugins/curdx-flow/hooks/scripts/package.json` with `{"type":"module"}` (mitigation for Issue #267)
  - **Files**: `plugins/curdx-flow/hooks/scripts/package.json`
  - **Done when**: File parses + `type` field is `module`
  - **Verify**: `node -e "process.exit(require('./plugins/curdx-flow/hooks/scripts/package.json').type==='module'?0:1)" && echo TYPE_OK`
  - **Commit**: `chore(hooks): colocated package.json forces ESM (mitigation #267)`
  - _Requirements: FR-11_
  - _Design: BundledTier_

- [x] 1.4 [VERIFY] Quality checkpoint: typecheck still passes after dep + scaffolding
  - **Do**: `npm run typecheck`
  - **Verify**: Command exits 0
  - **Done when**: No TS errors
  - **Commit**: None (no source changes yet)

### Shared utilities (_shared/)

- [x] 1.5 Scaffold _shared/stdin.ts (async iterator JSON reader)
  - **Do**:
    1. Create `src/hooks/_shared/stdin.ts` exporting `readStdinJson<T>(): Promise<T>`
    2. Implement async iterator over `process.stdin`, JSON.parse, exit 0 on parse error per design.md
  - **Files**: `src/hooks/_shared/stdin.ts`
  - **Done when**: TS compiles + `readStdinJson` exported
  - **Verify**: `npm run typecheck && grep -q 'readStdinJson' src/hooks/_shared/stdin.ts && echo STDIN_OK`
  - **Commit**: `feat(hooks): add _shared/stdin async iterator JSON reader`
  - _Requirements: FR-8_
  - _Design: Stdin/Stdout Contract_

- [x] 1.6 [P] Scaffold _shared/atomic-write.ts
  - **Do**:
    1. Create `src/hooks/_shared/atomic-write.ts` exporting `writeFileAtomic(path, data)`
    2. Use `writeFileSync(temp)` + `renameSync(temp, dst)` (NTFS MoveFile = atomic on same volume)
  - **Files**: `src/hooks/_shared/atomic-write.ts`
  - **Done when**: Function exported + uses `node:fs` rename
  - **Verify**: `npm run typecheck && grep -q 'renameSync' src/hooks/_shared/atomic-write.ts && echo ATOMIC_OK`
  - **Commit**: `feat(hooks): add _shared/atomic-write (mktemp+rename equivalent)`
  - _Requirements: FR-5_
  - _Design: Cross-Platform Path Handling_

- [x] 1.7 [P] Port path-resolver.sh → _shared/path-resolver.ts
  - **Do**:
    1. Create `src/hooks/_shared/path-resolver.ts` as ES module
    2. Port `curdx_find_spec`, `curdx_resolve_specs_dirs`, repo-root walking from path-resolver.sh (252 LOC)
    3. Use `path.posix.join` for serialized state paths; `path.join` for fs IO
    4. Export named functions consumed by hooks
  - **Files**: `src/hooks/_shared/path-resolver.ts`
  - **Done when**: TS compiles + named exports for find-spec / resolve-specs-dirs
  - **Verify**: `npm run typecheck && grep -E '^export ' src/hooks/_shared/path-resolver.ts | wc -l | awk '$1>=3'`
  - **Commit**: `feat(hooks): port path-resolver.sh to _shared ES module`
  - _Requirements: FR-3_
  - _Design: Component Catalog → _shared/path-resolver_

- [x] 1.8 [VERIFY] Quality checkpoint: typecheck after _shared scaffolding
  - **Do**: `npm run typecheck`
  - **Verify**: Exit 0
  - **Done when**: No type errors across new _shared/ files
  - **Commit**: None

### esbuild driver + first bundle proof

- [x] 1.9 Create scripts/build-hooks.mjs (esbuild driver)
  - **Do**:
    1. Create `scripts/build-hooks.mjs` per design.md Build Pipeline section
    2. Wire HOOK_ENTRIES (4 entrypoints) + LIB_ENTRIES (glob `src/hooks/lib/*.ts`)
    3. Apply BANNER (createRequire + fileURLToPath + dirname shim)
    4. Output to `plugins/curdx-flow/hooks/scripts/`, ext `.mjs`, sourcemap `linked`
    5. Add `npm run build:hooks` script in package.json
  - **Files**: `scripts/build-hooks.mjs`, `package.json`
  - **Done when**: `npm run build:hooks` runs to completion (even if entries empty)
  - **Verify**: `npm run build:hooks 2>&1 | tail -5 && echo BUILD_HOOKS_OK`
  - **Commit**: `feat(build): add scripts/build-hooks.mjs esbuild driver + npm script`
  - _Requirements: FR-7, FR-14_
  - _Design: Build Pipeline → esbuild 配置_

- [x] 1.10 First-bundle smoke test: throwaway hello-world hook
  - **Do**:
    1. Create temp `src/hooks/__hello.ts` that reads stdin via `_shared/stdin` and prints `{"hello":true}`
    2. Add to HOOK_ENTRIES in build-hooks.mjs (temp)
    3. Run `npm run build:hooks`
    4. `echo '{}' | node plugins/curdx-flow/hooks/scripts/__hello.mjs`
    5. Delete `src/hooks/__hello.ts` + remove from HOOK_ENTRIES
  - **Files**: `src/hooks/__hello.ts` (temp), `scripts/build-hooks.mjs` (temp edit)
  - **Done when**: Bundle exists, runs, prints `{"hello":true}`
  - **Verify**: After cleanup `[ ! -f plugins/curdx-flow/hooks/scripts/__hello.mjs ] || rm plugins/curdx-flow/hooks/scripts/__hello.mjs; echo SMOKE_OK`
  - **Commit**: None (throwaway, not committed)
  - _Requirements: FR-7_
  - _Design: 关键链路_

- [x] 1.11 [VERIFY] Quality checkpoint: bundle pipeline proven
  - **Do**: `npm run typecheck && npm run build:hooks`
  - **Verify**: Both exit 0
  - **Done when**: TS compiles + bundle runs without entries
  - **Commit**: None

### Hook ports (small first → biggest last)

- [x] 1.12 Port quick-mode-guard.sh → quick-mode-guard.ts (smallest, 47 LOC)
  - **Do**:
    1. Create `src/hooks/quick-mode-guard.ts`
    2. Read stdin via `_shared/stdin`; use `_shared/path-resolver` to find spec
    3. Check `quickMode` field in `.curdx-state.json`; emit `{decision:"deny",reason:"..."}` or `{decision:"allow"}`
    4. global try/catch → stderr + exit 0 on error
    5. Add to HOOK_ENTRIES in build-hooks.mjs
    6. Run `npm run build:hooks`
  - **Files**: `src/hooks/quick-mode-guard.ts`, `scripts/build-hooks.mjs`, `plugins/curdx-flow/hooks/scripts/quick-mode-guard.mjs` (generated)
  - **Done when**: Bundle exists; `echo '{"cwd":"/tmp"}' | node plugins/curdx-flow/hooks/scripts/quick-mode-guard.mjs` exits 0 with valid JSON stdout
  - **Verify**: `npm run build:hooks && echo '{"cwd":"/tmp"}' | node plugins/curdx-flow/hooks/scripts/quick-mode-guard.mjs | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" && echo GUARD_OK`
  - **Commit**: `feat(hooks): port quick-mode-guard.sh to TS + bundle .mjs`
  - _Requirements: FR-4, AC-2.1, AC-2.2, AC-2.3_
  - _Design: Component Catalog → quick-mode-guard_

- [x] 1.13 Port load-spec-context.sh → load-spec-context.ts (110 LOC)
  - **Do**:
    1. Create `src/hooks/load-spec-context.ts`
    2. Read stdin {cwd} via _shared/stdin; resolve active spec via _shared/path-resolver
    3. Read frontmatter / state file → emit context block JSON (matches v6 schema)
    4. global try/catch → stderr + exit 0
    5. Add to HOOK_ENTRIES; rebuild
  - **Files**: `src/hooks/load-spec-context.ts`, `scripts/build-hooks.mjs`, `plugins/curdx-flow/hooks/scripts/load-spec-context.mjs`
  - **Done when**: Bundle exists; smoke runs end-to-end with `{cwd:"<repo-root>"}` fixture
  - **Verify**: `npm run build:hooks && echo '{"cwd":"'$(pwd)'"}' | node plugins/curdx-flow/hooks/scripts/load-spec-context.mjs | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" && echo LOAD_OK`
  - **Commit**: `feat(hooks): port load-spec-context.sh to TS + bundle .mjs`
  - _Requirements: FR-2, AC-1.4_
  - _Design: Component Catalog → load-spec-context_

- [x] 1.14 Port update-spec-index.sh → update-spec-index.ts (275 LOC)
  - **Do**:
    1. Create `src/hooks/update-spec-index.ts`
    2. Walk specs_dirs from path-resolver, scan each spec for state + meta, generate `index.json`
    3. Use `path.posix.join` for paths inside index output
    4. Add to HOOK_ENTRIES; rebuild
  - **Files**: `src/hooks/update-spec-index.ts`, `scripts/build-hooks.mjs`, `plugins/curdx-flow/hooks/scripts/update-spec-index.mjs`
  - **Done when**: Bundle runs against repo and writes/prints index JSON for at least the cross-platform-support spec
  - **Verify**: `npm run build:hooks && node plugins/curdx-flow/hooks/scripts/update-spec-index.mjs --dry-run 2>&1 | head -20 && echo INDEX_OK`
  - **Commit**: `feat(hooks): port update-spec-index.sh to TS + bundle .mjs`
  - _Requirements: FR-6, AC-4.1_
  - _Design: Component Catalog → update-spec-index_

- [x] 1.15 [VERIFY] Quality checkpoint: 3 hooks bundled + typecheck
  - **Do**: `npm run typecheck && npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/*.mjs`
  - **Verify**: All exit 0; bundle dir contains 3 `.mjs` files
  - **Done when**: 3-of-4 hooks bundled successfully
  - **Commit**: None

### Stop-watcher (the hard one) with markdown-task-parser

- [x] 1.16 Create _shared/markdown-task-parser.ts (regex state machine, replaces awk)
  - **Do**:
    1. Create `src/hooks/_shared/markdown-task-parser.ts`
    2. Define small fixture inline: 3 `## Task N` blocks with sub-content
    3. Hand-write regex + state machine that extracts task block by index (replicates stop-watcher.sh awk logic)
    4. Export `extractTaskBlock(markdown, taskIndex): string` + `parseTaskList(markdown): TaskMeta[]`
  - **Files**: `src/hooks/_shared/markdown-task-parser.ts`
  - **Done when**: Functions exported, TS compiles
  - **Verify**: `npm run typecheck && grep -E '^export ' src/hooks/_shared/markdown-task-parser.ts | wc -l | awk '$1>=2'`
  - **Commit**: `feat(hooks): add _shared/markdown-task-parser regex state machine`
  - _Requirements: FR-5_
  - _Design: Component Catalog → markdown-task-parser; Risk R8_

- [x] 1.17 Port stop-watcher.sh → stop-watcher.ts (largest, 362 LOC)
  - **Do**:
    1. Create `src/hooks/stop-watcher.ts`
    2. Read stdin {cwd, transcript_path, stop_hook_active}
    3. Tail-read transcript, regex-detect `\bALL_TASKS_COMPLETE\b`
    4. Use `_shared/markdown-task-parser` for task extraction
    5. Use `fs.statSync(p).mtimeMs` (cross-platform replacement for `stat -f %m` / `stat -c %Y`)
    6. Use `_shared/atomic-write` for epic state updates
    7. Output `{continue:false}` or continuation block with next-task content
    8. Add to HOOK_ENTRIES; rebuild
  - **Files**: `src/hooks/stop-watcher.ts`, `scripts/build-hooks.mjs`, `plugins/curdx-flow/hooks/scripts/stop-watcher.mjs`
  - **Done when**: All 4 hooks bundled; smoke runs against minimal fixture
  - **Verify**: `npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/{load-spec-context,quick-mode-guard,stop-watcher,update-spec-index}.mjs`
  - **Commit**: `feat(hooks): port stop-watcher.sh to TS + bundle .mjs`
  - _Requirements: FR-5, AC-3.1, AC-3.2, AC-3.3, AC-3.4_
  - _Design: Component Catalog → stop-watcher; Risk R8_

- [x] 1.18 [VERIFY] Quality checkpoint: 4 hooks bundled + typecheck
  - **Do**: `npm run typecheck && npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/*.mjs | wc -l | awk '$1>=4'`
  - **Verify**: All exit 0
  - **Done when**: 4 hook bundles exist
  - **Commit**: None

### hooks.json switch + local manual smoke

- [x] 1.19 Update hooks.json to invoke node + .mjs + shell:bash + async
  - **Do**:
    1. Edit `plugins/curdx-flow/hooks/hooks.json`
    2. Each hook command → `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"`
    3. Add `"shell": "bash"` to each hook
    4. SessionStart: add `"async": true` (Issue #34457 mitigation)
    5. Keep existing `timeout: 10` on quick-mode-guard
  - **Files**: `plugins/curdx-flow/hooks/hooks.json`
  - **Done when**: All 3 hook entries reference `.mjs` + `shell:bash`; SessionStart has `async:true`
  - **Verify**: `node -e "const h=require('./plugins/curdx-flow/hooks/hooks.json');for(const k of Object.keys(h.hooks||h)){/* ... */}" ; grep -c 'node "' plugins/curdx-flow/hooks/hooks.json | awk '$1>=3' && echo HOOKS_JSON_OK`
  - **Commit**: `feat(hooks): switch hooks.json to node .mjs + shell:bash + async`
  - _Requirements: FR-1, AC-1.1, AC-2.1, AC-3.1_
  - _Design: hooks.json 改造前后对比_

- [x] 1.20 Local manual smoke: install plugin into clean dir + spawn each hook
  - **Do**:
    1. Create temp install dir `/tmp/curdx-test-install/curdx-flow/`
    2. `cp -R plugins/curdx-flow/* /tmp/curdx-test-install/curdx-flow/`
    3. For each hook, build a synthetic stdin fixture and spawn via `bash -c 'node "$CLAUDE_PLUGIN_ROOT/hooks/scripts/<name>.mjs"'` with `CLAUDE_PLUGIN_ROOT=/tmp/curdx-test-install/curdx-flow`
    4. Assert exit 0 + valid JSON stdout
  - **Files**: (no commit — read-only validation)
  - **Done when**: All 4 bundled hooks spawn successfully via the bash-shim contract
  - **Verify**: Script exits 0 for all 4 hooks (one-liner shell loop)
  - **Commit**: None
  - _Requirements: AC-1.1, AC-2.1, AC-3.1_
  - _Design: 关键链路_

- [x] 1.21 [VERIFY] Quality checkpoint: end-to-end POC contract holds on Linux
  - **Do**: `npm run typecheck && npm run build:hooks`
  - **Verify**: Both exit 0; 4 bundled `.mjs` exist in `plugins/curdx-flow/hooks/scripts/`
  - **Done when**: Hook bundles produce valid JSON stdout
  - **Commit**: None

### Lib utilities (11 — bundle into hooks/scripts/lib/)

- [x] 1.22 [P] Create lib/merge-state.ts (jq `.field = val` replacement)
  - **Do**:
    1. Create `src/hooks/lib/merge-state.ts` — CLI: `node merge-state.mjs <state-file> <json-patch>`
    2. Read existing JSON, deep-merge patch, atomic write back
    3. Add to LIB glob (already covered by `src/hooks/lib/*.ts`)
    4. Run `npm run build:hooks`
  - **Files**: `src/hooks/lib/merge-state.ts`, `plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs`
  - **Done when**: `echo '{}' > /tmp/s.json && node plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs /tmp/s.json '{"a":1}' && grep -q '"a":1' /tmp/s.json`
  - **Verify**: `npm run build:hooks && [ -f plugins/curdx-flow/hooks/scripts/lib/merge-state.mjs ] && echo MERGE_OK`
  - **Commit**: `feat(lib): add lib/merge-state for jq state writes`
  - _Requirements: FR-10, AC-10.1, AC-10.3_
  - _Design: Lib utilities → merge-state_

- [x] 1.23 [P] Create lib/count-tasks.ts
  - **Do**:
    1. Create `src/hooks/lib/count-tasks.ts` — CLI: `node count-tasks.mjs <tasks.md>`
    2. Use `_shared/markdown-task-parser` to count task blocks + completion (`[x]` markers)
    3. Print JSON `{total, completed, pending}`
  - **Files**: `src/hooks/lib/count-tasks.ts`
  - **Done when**: Bundle produces JSON output for a sample tasks.md
  - **Verify**: `npm run build:hooks && [ -f plugins/curdx-flow/hooks/scripts/lib/count-tasks.mjs ] && echo COUNT_OK`
  - **Commit**: `feat(lib): add lib/count-tasks (markdown task counter)`
  - _Requirements: FR-10, AC-10.1_
  - _Design: Lib utilities → count-tasks_

- [x] 1.24 [P] Create lib/cleanup-files.ts
  - **Do**:
    1. Create `src/hooks/lib/cleanup-files.ts` — CLI: `node cleanup-files.mjs <pattern1> <pattern2> ...`
    2. Glob → unlink mock/scaffold/tmp files; idempotent
  - **Files**: `src/hooks/lib/cleanup-files.ts`
  - **Done when**: Bundle exists + dry-run lists patterns without erroring
  - **Verify**: `npm run build:hooks && [ -f plugins/curdx-flow/hooks/scripts/lib/cleanup-files.mjs ] && echo CLEANUP_OK`
  - **Commit**: `feat(lib): add lib/cleanup-files for cleanup phase`
  - _Requirements: FR-10_
  - _Design: Lib utilities → cleanup-files_

- [x] 1.25 [VERIFY] Quality checkpoint: 3 lib bundles + typecheck
  - **Do**: `npm run typecheck && npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/lib/*.mjs | wc -l`
  - **Verify**: Exit 0; ≥3 lib bundles
  - **Done when**: First batch of lib utilities builds clean
  - **Commit**: None

- [x] 1.26 [P] Create lib/ensure-gitignore.ts
  - **Do**:
    1. Create `src/hooks/lib/ensure-gitignore.ts` — CLI: `node ensure-gitignore.mjs <entry>`
    2. Idempotent append-if-missing to `.gitignore`
  - **Files**: `src/hooks/lib/ensure-gitignore.ts`
  - **Done when**: Bundle exists + tested twice → only one entry added
  - **Verify**: `npm run build:hooks && [ -f plugins/curdx-flow/hooks/scripts/lib/ensure-gitignore.mjs ] && echo GITIGNORE_OK`
  - **Commit**: `feat(lib): add lib/ensure-gitignore (idempotent)`
  - _Requirements: FR-10_

- [x] 1.27 [P] Create lib/search-files.ts
  - **Do**:
    1. Create `src/hooks/lib/search-files.ts` — cross-platform grep: `node search-files.mjs <pattern> <root> [--name-only]`
    2. Recursive `fs.readdir` + `RegExp` content match; respect `.gitignore` minimally (skip `node_modules`, `dist`, `.git`)
  - **Files**: `src/hooks/lib/search-files.ts`
  - **Done when**: Bundle runs + finds known sample
  - **Verify**: `npm run build:hooks && node plugins/curdx-flow/hooks/scripts/lib/search-files.mjs 'curdx-flow' package.json && echo SEARCH_OK`
  - **Commit**: `feat(lib): add lib/search-files cross-platform grep`
  - _Requirements: FR-10_

- [x] 1.28 [P] Create lib/count-mocks.ts
  - **Do**:
    1. Create `src/hooks/lib/count-mocks.ts` — CLI: count `vi.mock` / `jest.mock` / `mock.fn` occurrences in test files
    2. Output JSON `{tests, mockUsages, ratio}`
  - **Files**: `src/hooks/lib/count-mocks.ts`
  - **Done when**: Bundle runs against tests/ dir without error
  - **Verify**: `npm run build:hooks && [ -f plugins/curdx-flow/hooks/scripts/lib/count-mocks.mjs ] && echo MOCKS_OK`
  - **Commit**: `feat(lib): add lib/count-mocks for reality-verification`
  - _Requirements: FR-10_

- [x] 1.29 [VERIFY] Quality checkpoint: 6 lib bundles + typecheck
  - **Do**: `npm run typecheck && npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/lib/*.mjs | wc -l | awk '$1>=6'`
  - **Verify**: Exit 0
  - **Done when**: 6 lib utilities bundled
  - **Commit**: None

- [x] 1.30 [P] Create lib/get-default-branch.ts
  - **Do**:
    1. Create `src/hooks/lib/get-default-branch.ts` — exec `git symbolic-ref refs/remotes/origin/HEAD` cross-platform
    2. Fallback chain: origin/HEAD → main → master → first remote branch
  - **Files**: `src/hooks/lib/get-default-branch.ts`
  - **Done when**: Bundle runs + prints branch name in this repo (`main`)
  - **Verify**: `npm run build:hooks && node plugins/curdx-flow/hooks/scripts/lib/get-default-branch.mjs | grep -E '^(main|master)$' && echo BRANCH_OK`
  - **Commit**: `feat(lib): add lib/get-default-branch cross-platform`
  - _Requirements: FR-10_

- [x] 1.31 [P] Create lib/kill-port.ts
  - **Do**:
    1. Create `src/hooks/lib/kill-port.ts` — CLI: `node kill-port.mjs <port>`
    2. Linux/macOS: `lsof -ti :<port> | xargs kill`; Windows: `netstat -ano | findstr :<port>` + `taskkill /F /PID`
    3. Cross-platform branch via `process.platform`
  - **Files**: `src/hooks/lib/kill-port.ts`
  - **Done when**: Bundle exists; dry-run on unused port exits 0
  - **Verify**: `npm run build:hooks && node plugins/curdx-flow/hooks/scripts/lib/kill-port.mjs 65535 ; [ $? -eq 0 ] && echo KILLPORT_OK`
  - **Commit**: `feat(lib): add lib/kill-port cross-platform`
  - _Requirements: FR-10_

- [x] 1.32 [P] Create lib/update-modification-map.ts + lib/update-fix-task-map.ts + lib/init-execution-state.ts
  - **Do**:
    1. Create three small CLIs, each ~30-50 LOC
    2. update-modification-map: maintain `.file-modifications.json` (task → files)
    3. update-fix-task-map: maintain fixTaskMap state
    4. init-execution-state: copy `.curdx-state.template.json` → spec dir
  - **Files**: `src/hooks/lib/update-modification-map.ts`, `src/hooks/lib/update-fix-task-map.ts`, `src/hooks/lib/init-execution-state.ts`
  - **Done when**: All 3 bundles built
  - **Verify**: `npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/lib/{update-modification-map,update-fix-task-map,init-execution-state}.mjs | wc -l | grep -q 3 && echo TRIO_OK`
  - **Commit**: `feat(lib): add 3 state-tracking lib utilities`
  - _Requirements: FR-10_

- [x] 1.33 [VERIFY] Quality checkpoint: all 11 lib bundles + typecheck
  - **Do**: `npm run typecheck && npm run build:hooks && ls plugins/curdx-flow/hooks/scripts/lib/*.mjs | wc -l | awk '$1>=11'`
  - **Verify**: Exit 0
  - **Done when**: 11 lib utilities bundled
  - **Commit**: None

### Markdown sweep (79 occurrences in 3 batches)

- [x] 1.34 [P] Markdown sweep batch 1: hot files (templates/tasks.md + agents/task-planner.md + commands/implement.md, ~30 occurrences)
  - **Do**:
    1. For each `jq` instance in 3 files: pick replacement strategy
       - Single line + ≤80 char → inline `node -e '...'`
       - Complex / repeated → `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lib/<lib>.mjs" args`
    2. Replace 79 sweep classifier rules from design.md (14 inline / 45 lib / 20 prose)
    3. Sweep includes: 22 jq, 24 grep (cross-platform OK on Git Bash but normalize to lib/search-files where complex), 3 find, 2 lsof (→ lib/kill-port)
  - **Files**: `plugins/curdx-flow/templates/tasks.md`, `plugins/curdx-flow/agents/task-planner.md`, `plugins/curdx-flow/commands/implement.md`
  - **Done when**: ~30 jq/lsof references in these 3 files replaced
  - **Verify**: `grep -c '\bjq\b' plugins/curdx-flow/templates/tasks.md plugins/curdx-flow/agents/task-planner.md plugins/curdx-flow/commands/implement.md | awk -F: 'BEGIN{s=0}{s+=$2}END{print s; exit (s>0)}'`
  - **Commit**: `refactor(plugin): sweep jq/bash from hot markdown files (batch 1)`
  - _Requirements: FR-9, AC-8.1, AC-8.2, AC-8.3, AC-8.4_
  - _Design: Markdown Sweep 实现策略_

- [x] 1.35 [P] Markdown sweep batch 2: agents/research-analyst.md + references/* (~25 occurrences)
  - **Do**:
    1. Apply same classifier rules to agents/research-analyst.md and all `plugins/curdx-flow/references/*.md`
    2. Most references are inline-prose explanations → reword without executable jq token
  - **Files**: `plugins/curdx-flow/agents/research-analyst.md`, `plugins/curdx-flow/references/*.md`
  - **Done when**: jq count in these files is 0
  - **Verify**: `! grep -rn '\bjq\b' plugins/curdx-flow/agents/research-analyst.md plugins/curdx-flow/references/ && echo BATCH2_OK`
  - **Commit**: `refactor(plugin): sweep jq/bash from research-analyst + references (batch 2)`
  - _Requirements: FR-9, AC-8.1, AC-8.4_
  - _Design: Markdown Sweep 实现策略_

- [x] 1.36 [P] Markdown sweep batch 3: remaining markdown files (~24 occurrences)
  - **Do**:
    1. `grep -rln '\bjq\b' plugins/curdx-flow` → list remaining files
    2. Apply classifier per file
  - **Files**: `plugins/curdx-flow/**/*.md` (whatever remains)
  - **Done when**: `grep -rn '\bjq\b' plugins/curdx-flow` outputs 0 lines
  - **Verify**: `! grep -rn '\bjq\b' plugins/curdx-flow && echo BATCH3_OK`
  - **Commit**: `refactor(plugin): sweep jq/bash from remaining markdown (batch 3)`
  - _Requirements: FR-9, AC-8.1_
  - _Design: Markdown Sweep 实现策略_

- [x] 1.37 [VERIFY] Markdown sweep gate: zero jq references
  - **Do**: `! grep -rn '\bjq\b' plugins/curdx-flow`
  - **Verify**: Command exits 0 (no jq found anywhere)
  - **Done when**: NFR-6 verified — no jq references in plugin tree
  - **Commit**: None
  - _Requirements: NFR-6, AC-8.1_

### POC Checkpoint: alpha.0 git tag

- [x] 1.38 Update CLAUDE.md to reflect new build pipeline
  - **Do**:
    1. Edit `CLAUDE.md` line ~"bundled plugin shipped as static files — no build step"
    2. Replace with description of v7 esbuild pipeline + `build:hooks` + `check:hooks-fresh` flow
    3. Reference design.md for the architecture rationale
  - **Files**: `CLAUDE.md`
  - **Done when**: Old "no build step" sentence is gone; new build pipeline section present
  - **Verify**: `! grep -q 'shipped as static files — no build step' CLAUDE.md && grep -q 'build:hooks' CLAUDE.md && echo CLAUDE_MD_OK`
  - **Commit**: `docs(claude-md): update plugin build pipeline section for v7`
  - _Requirements: design.md "CLAUDE.md 矛盾说明"_
  - _Design: File Plan → modify CLAUDE.md_

- [x] 1.39 [VERIFY] Phase 1 POC end-to-end check (Linux baseline)
  - **Do**:
    1. `npm run typecheck && npm run build:hooks`
    2. Smoke each of 4 hooks with realistic stdin fixture
    3. `! grep -rn '\bjq\b' plugins/curdx-flow`
    4. Verify all 11 lib bundles exist
  - **Verify**: All commands exit 0
  - **Done when**: POC works end-to-end on Linux; jq fully eliminated
  - **Commit**: None

- [x] 1.40 POC Checkpoint: Bump v7.0.0-alpha.0 + push tag for early CI validation
  - **Do**:
    1. `npm run bump-version 7.0.0-alpha.0`
    2. Verify 5 fields synced via `npm run check-versions`
    3. Update `CHANGELOG.md` with placeholder `## 7.0.0-alpha.0 — YYYY-MM-DD` entry
    4. Commit + tag: `git tag v7.0.0-alpha.0 && git push origin <branch> --tags`
    5. Verify GitHub Actions CI runs on the tag (3-OS matrix is wired in Phase 4 — for now ubuntu-only is acceptable since Phase 4 will replace ci.yml)
  - **Files**: `package.json`, `package-lock.json`, `plugins/curdx-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`
  - **Done when**: 5-field gate green + tag pushed + CI status fetched via `gh run list --limit 1`
  - **Verify**: `npm run check-versions && git tag -l v7.0.0-alpha.0 | grep -q v7.0.0-alpha.0 && echo POC_TAG_OK`
  - **Commit**: `chore: release v7.0.0-alpha.0 (POC checkpoint)`
  - _Requirements: FR-15_
  - _Design: Release 节奏 → alpha.0_

---

## Phase 2: Refactoring — 15-20% of tasks

Goal: clean up structure, error handling, types, normalize cross-platform path handling.

- [x] 2.1 Extract shared HookInput / HookOutput types to _shared/types.ts
  - **Do**:
    1. Create `src/hooks/_shared/types.ts`
    2. Define `HookStdin`, `HookDecision = 'allow' | 'deny'`, `HookOutput` interfaces matching Anthropic hook spec
    3. Refactor 4 hooks to import from `_shared/types`
  - **Files**: `src/hooks/_shared/types.ts`, all 4 hook .ts files
  - **Done when**: TS compiles + duplicate inline types removed
  - **Verify**: `npm run typecheck && grep -l 'HookOutput' src/hooks/*.ts | wc -l | awk '$1>=4'`
  - **Commit**: `refactor(hooks): extract HookInput/HookOutput types to _shared/types`
  - _Requirements: NFR-10_
  - _Design: Stdin/Stdout Contract_

- [x] 2.2 Standardize global error handler across all 4 hooks
  - **Do**:
    1. Add `_shared/run-hook.ts` exporting `runHook(handler: (stdin: HookStdin) => Promise<HookOutput>)`
    2. Wraps with global try/catch → stderr log + `process.exit(0)` (NEVER exit 1, never block session)
    3. Refactor 4 hooks to use `runHook(...)` wrapper
  - **Files**: `src/hooks/_shared/run-hook.ts`, all 4 hook .ts files
  - **Done when**: All 4 hooks use unified error path
  - **Verify**: `npm run typecheck && grep -l 'runHook' src/hooks/*.ts | wc -l | awk '$1>=4'`
  - **Commit**: `refactor(hooks): unify error handling via _shared/run-hook wrapper`
  - _Requirements: design.md Failure Modes; AC-1.1, AC-2.1, AC-3.1_
  - _Design: Failure Modes & Graceful Degradation_

- [x] 2.3 [VERIFY] Quality checkpoint: typecheck + build after refactor
  - **Do**: `npm run typecheck && npm run build:hooks`
  - **Verify**: Both exit 0
  - **Done when**: Refactor preserves bundle correctness
  - **Commit**: None

- [x] 2.4 Cross-platform path normalization audit
  - **Do**:
    1. `grep -rn "path\.join" src/hooks/` → review each call site
    2. State-file path serialization → swap to `path.posix.join`
    3. fs IO calls → keep `path.join` (platform native)
    4. Document policy as comment block at top of `_shared/path-resolver.ts`
  - **Files**: `src/hooks/**/*.ts` (audit-driven edits)
  - **Done when**: Each `path.join` annotated as fs-IO or serialization
  - **Verify**: `npm run typecheck && grep -c 'path\.posix' src/hooks/_shared/path-resolver.ts | awk '$1>=1' && echo POSIX_OK`
  - **Commit**: `refactor(hooks): normalize path handling (path.posix for state, path.join for fs)`
  - _Requirements: NFR-7, AC-4.1_
  - _Design: Cross-Platform Path Handling_

- [x] 2.5 Lib catalog convergence review (11 → potentially 9-10)
  - **Do**:
    1. Read design open-q #1: candidate merges (`get-fix-attempts` → `merge-state`; `mark-task-complete` → `update-fix-task-map`)
    2. Apply jobs-to-be-done lens: each lib must have ≥2 distinct callers OR a non-trivial impl (≥30 LOC)
    3. If a lib fails the bar, merge it into a sibling and update markdown sweep callers
    4. Document final catalog count in `src/hooks/lib/README.md` (1-paragraph rationale)
  - **Files**: `src/hooks/lib/*.ts` (potentially merged), markdown call sites, `src/hooks/lib/README.md`
  - **Done when**: Final lib count ≤11 with rationale documented
  - **Verify**: `ls src/hooks/lib/*.ts | wc -l | awk '$1<=11' && [ -f src/hooks/lib/README.md ] && echo CATALOG_OK`
  - **Commit**: `refactor(lib): converge lib catalog to <final-count> with rationale`
  - _Requirements: FR-10_
  - _Design: Open for Tasks Phase #1_

- [x] 2.6 [VERIFY] Quality checkpoint: typecheck + build:hooks + grep guard
  - **Do**: `npm run typecheck && npm run build:hooks && ! grep -rn '\bjq\b' plugins/curdx-flow`
  - **Verify**: All exit 0
  - **Done when**: Refactor preserves all gates
  - **Commit**: None

- [x] 2.7 Add tsconfig.json paths for hooks subtree
  - **Do**:
    1. Edit `tsconfig.json` `include` to add `src/hooks/**/*.ts`, `tests/**/*.ts`
    2. Verify no overlap conflicts with existing `src/` tsup workspace
  - **Files**: `tsconfig.json`
  - **Done when**: `npm run typecheck` covers hooks subtree
  - **Verify**: `npm run typecheck && grep -q 'src/hooks' tsconfig.json && echo TSCONFIG_OK`
  - **Commit**: `chore(ts): include src/hooks + tests in tsconfig`
  - _Requirements: design.md File Plan → modify tsconfig.json_

- [x] 2.8 [VERIFY] Quality checkpoint: full Phase 2 wrap
  - **Do**: `npm run typecheck && npm run build:hooks && ! grep -rn '\bjq\b' plugins/curdx-flow`
  - **Verify**: All exit 0
  - **Done when**: Phase 2 refactor stable
  - **Commit**: None

---

## Phase 3: Testing — 15-20% of tasks

Goal: vitest smoke + lib unit + byte-equal regression vs v6.0.6 baseline.

- [x] 3.1 Set up vitest.config.ts + tests/hooks/ structure
  - **Do**:
    1. Create `vitest.config.ts` with `include: ['tests/hooks/**/*.test.ts']`, `pool: 'forks'`, `testTimeout: 5000`
    2. Create `tests/hooks/` and `tests/hooks/fixtures/` directories
    3. Add `npm run test:hooks` script: `vitest run tests/hooks`
  - **Files**: `vitest.config.ts`, `tests/hooks/.gitkeep`, `package.json`
  - **Done when**: `npm run test:hooks` runs (no tests yet → exits 0 with "No test files found")
  - **Verify**: `npm run test:hooks 2>&1 | grep -E 'No test files|Tests' && echo VITEST_OK`
  - **Commit**: `chore(test): set up vitest config + test:hooks script`
  - _Requirements: FR-13, AC-5.2_
  - _Design: Test Strategy → vitest.config.ts_

- [x] 3.2 Generate v6.0.6 baseline snapshots for byte-equal regression
  - **Do**:
    1. `git worktree add /tmp/v6 v6.0.6`
    2. For each of 4 hooks: feed fixed fixtures from `tests/hooks/fixtures/`; capture stdout to `tests/hooks/baselines/v6.0.6/<hook>/<fixture>.txt`
    3. `git worktree remove /tmp/v6`
    4. Commit baselines (one-time, frozen)
  - **Files**: `tests/hooks/baselines/v6.0.6/**/*.txt`
  - **Done when**: Baseline files exist for all 4 hooks × ≥2 fixtures (8+ files)
  - **Verify**: `find tests/hooks/baselines/v6.0.6 -name '*.txt' | wc -l | awk '$1>=8' && echo BASELINE_OK`
  - **Commit**: `test(hooks): freeze v6.0.6 byte-equal baselines`
  - _Requirements: NFR-7, AC-4.1_
  - _Design: Byte-equal regression test_

- [x] 3.3 [P] Smoke tests for 4 hook entrypoints (3 fixtures each)
  - **Do**:
    1. Create `tests/hooks/load-spec-context.test.ts`, `quick-mode-guard.test.ts`, `stop-watcher.test.ts`, `update-spec-index.test.ts`
    2. Each test file: 3 cases (happy / edge / error) using `runHook(bundlePath, fixture)` helper from design.md
    3. Assert exit code + parsable JSON stdout + key fields per fixture
  - **Files**: 4 `tests/hooks/<hook>.test.ts` files, `tests/hooks/_helpers.ts` (spawn helper)
  - **Done when**: 12 tests pass (4 hooks × 3 fixtures)
  - **Verify**: `npm run test:hooks 2>&1 | grep -E '12 passed|✓' && echo SMOKE_OK`
  - **Commit**: `test(hooks): add smoke tests for 4 hook entrypoints`
  - _Requirements: FR-13, AC-5.2_
  - _Design: Test Strategy_

- [x] 3.4 [P] Unit tests for 11 lib utilities (1+ test each)
  - **Do**:
    1. Create `tests/hooks/lib/<each>.test.ts` for the final lib catalog
    2. Each test: 1 happy-path case (more if non-trivial)
  - **Files**: `tests/hooks/lib/*.test.ts` (one per lib, count ≤11)
  - **Done when**: All lib unit tests pass
  - **Verify**: `npm run test:hooks && ls tests/hooks/lib/*.test.ts | wc -l | awk '$1>=9'`
  - **Commit**: `test(lib): add unit tests for lib utilities`
  - _Requirements: FR-13, AC-10.2_

- [x] 3.5 [VERIFY] Quality checkpoint: typecheck + smoke + unit
  - **Do**: `npm run typecheck && npm run build:hooks && npm run test:hooks`
  - **Verify**: All exit 0
  - **Done when**: All Phase 3 tests green
  - **Commit**: None

- [x] 3.6 Add byte-equal regression test (vs v6.0.6 baseline)
  - **Do**:
    1. Create `tests/hooks/byte-equal.test.ts`
    2. For each hook + fixture: spawn v7 bundle, normalize output (`replace(/\\/g,'/').replace(/"mtime":\d+/g,'"mtime":<NUM>')`), compare to baseline file
    3. Skip on Windows runner: `it.skipIf(process.platform === 'win32')` (path separator + mtime divergence allowed per requirements)
  - **Files**: `tests/hooks/byte-equal.test.ts`
  - **Done when**: Byte-equal test green on Linux + macOS
  - **Verify**: `npm run test:hooks -- byte-equal && echo BYTE_OK`
  - **Commit**: `test(hooks): add byte-equal regression vs v6.0.6 baseline`
  - _Requirements: NFR-7, AC-4.1_
  - _Design: Byte-equal regression test_

- [ ] 3.7 [VERIFY] Quality checkpoint: full Phase 3 wrap
  - **Do**: `npm run typecheck && npm run build:hooks && npm run test:hooks`
  - **Verify**: All exit 0
  - **Done when**: All tests including byte-equal green
  - **Commit**: None

---

## Phase 4: Quality Gates + CI Matrix — 10-15% of tasks

Goal: 6-leg CI matrix wired, prepublishOnly hardened, full local CI green, PR opened.

NEVER push directly to default branch. Verify current branch is feature branch first.

- [ ] 4.1 Add scripts/check-hooks-fresh.mjs + npm script
  - **Do**:
    1. Create `scripts/check-hooks-fresh.mjs`:
       - Run `node scripts/build-hooks.mjs`
       - Then `git diff --exit-code plugins/curdx-flow/hooks/scripts/`
       - Non-zero exit → print "source-bundle drift detected; run npm run build:hooks"
    2. Add `"check:hooks-fresh": "node scripts/check-hooks-fresh.mjs"` to package.json
    3. Add `"verify": "npm run typecheck && npm run check-versions && npm run check:hooks-fresh && npm run test:hooks"` to package.json
    4. Update `prepublishOnly` to: `node scripts/check-versions.mjs && npm run typecheck && npm run check:hooks-fresh && npm run build`
  - **Files**: `scripts/check-hooks-fresh.mjs`, `package.json`
  - **Done when**: `npm run check:hooks-fresh` exits 0 (bundle is fresh) + `npm run verify` runs full chain
  - **Verify**: `npm run check:hooks-fresh && npm run verify && echo VERIFY_OK`
  - **Commit**: `feat(build): add check:hooks-fresh + verify aggregate scripts`
  - _Requirements: FR-14, AC-6.1, AC-6.2_
  - _Design: npm scripts table_

- [ ] 4.2 Update .github/workflows/ci.yml to 6-leg matrix
  - **Do**:
    1. Replace ci.yml with 4 jobs per design.md CI 矩阵设计:
       - `typecheck` (ubuntu, node 22)
       - `check-fresh` (ubuntu, node 22)
       - `test-matrix` (matrix: ubuntu × node[20,22], macos × node 22, windows × node 22; runs build:hooks + test:hooks)
       - `all-green` (ubuntu, needs all above)
    2. `actions/checkout@v4` with `fetch-depth: 0` for byte-equal baseline access
  - **Files**: `.github/workflows/ci.yml`
  - **Done when**: CI YAML parses + 6 jobs/legs configured
  - **Verify**: `node -e "const y=require('js-yaml');console.log(Object.keys(y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')).jobs))" 2>/dev/null || npx --yes js-yaml < .github/workflows/ci.yml >/dev/null && echo CI_YAML_OK`
  - **Commit**: `ci: 3-OS x node matrix (6 legs) for cross-platform support`
  - _Requirements: FR-12, AC-5.1, AC-5.2, AC-5.3_
  - _Design: CI 矩阵设计_

- [ ] 4.3 Update .github/workflows/release.yml to workflow_run trigger
  - **Do**:
    1. Replace `on: push: tags:` with `on: workflow_run: workflows: ['CI']: types: [completed]: branches: ['main']`
    2. Job condition: `if: github.event.workflow_run.conclusion == 'success' && startsWith(github.event.workflow_run.head_branch, 'refs/tags/v')`
    3. Keep existing npm publish + GH release steps (with `NPM_TOKEN`)
  - **Files**: `.github/workflows/release.yml`
  - **Done when**: release workflow gated on CI success
  - **Verify**: `grep -q 'workflow_run' .github/workflows/release.yml && grep -q "conclusion == 'success'" .github/workflows/release.yml && echo RELEASE_OK`
  - **Commit**: `ci: gate release.yml on CI workflow_run success`
  - _Requirements: FR-19, AC-11.1, AC-11.2_
  - _Design: release.yml 触发链_

- [ ] 4.4 [VERIFY] Quality checkpoint: typecheck + verify
  - **Do**: `npm run verify`
  - **Verify**: Exit 0 (typecheck + check-versions + check:hooks-fresh + test:hooks all green)
  - **Done when**: Full local verify chain green
  - **Commit**: `chore: pass quality checkpoint` (only if fixes needed)

### Migration docs + .sh deletion

- [ ] 4.5 Draft docs/MIGRATION-V7.md
  - **Do**:
    1. Create `docs/MIGRATION-V7.md` per design.md outline
    2. Sections: TL;DR, BREAKING CHANGE list, Why, Step-by-step upgrade (v6.0.x), Custom .sh fork users, Downgrade path (`@curdx/flow@6.0.6`), FAQ, Verification checklist
  - **Files**: `docs/MIGRATION-V7.md`
  - **Done when**: All 8 sections present
  - **Verify**: `grep -c '^## ' docs/MIGRATION-V7.md | awk '$1>=7' && echo MIG_OK`
  - **Commit**: `docs: add MIGRATION-V7.md migration guide`
  - _Requirements: FR-16, AC-9.1, AC-9.2, AC-9.3_
  - _Design: Migration Documentation Outline_

- [ ] 4.6 Update CHANGELOG.md with v7.0.0 entry
  - **Do**:
    1. Prepend `## 7.0.0 — YYYY-MM-DD` section
    2. Subsections: `### Breaking` (jq removed; hooks.json format; Node 20.12+; .sh deleted), `### Added` (esbuild pipeline + lib utilities + 3-OS CI), `### Changed` (CLAUDE.md build description)
    3. Reference `docs/MIGRATION-V7.md` from the Breaking subsection
  - **Files**: `CHANGELOG.md`
  - **Done when**: v7.0.0 entry present + references MIGRATION-V7.md
  - **Verify**: `grep -q 'MIGRATION-V7' CHANGELOG.md && grep -q '^## 7.0.0' CHANGELOG.md && echo CHANGELOG_OK`
  - **Commit**: `docs(changelog): add v7.0.0 entry with breaking changes`
  - _Requirements: FR-17, AC-9.4_

- [ ] 4.7 Delete legacy .sh scripts (separate commit for revert ease)
  - **Do**:
    1. `git rm plugins/curdx-flow/hooks/scripts/{load-spec-context,path-resolver,quick-mode-guard,stop-watcher,update-spec-index}.sh`
    2. `git rm plugins/curdx-flow/hooks/scripts/{test-path-resolver,test-multi-dir-integration}.sh`
    3. Verify hooks.json no longer references any `.sh` path
  - **Files**: 7 `.sh` files (deleted)
  - **Done when**: No `.sh` files in `plugins/curdx-flow/hooks/scripts/`
  - **Verify**: `! ls plugins/curdx-flow/hooks/scripts/*.sh 2>/dev/null && echo SH_DELETED_OK`
  - **Commit**: `feat(hooks): delete legacy .sh scripts (BREAKING — git history at v6.0.6)`
  - _Requirements: FR-18_
  - _Design: File Plan → delete entries_

- [ ] 4.8 Bump v7.0.0-beta.0 + push tag
  - **Do**:
    1. `npm run bump-version 7.0.0-beta.0`
    2. `npm run check-versions` to confirm 5-field sync
    3. Commit: `chore: release v7.0.0-beta.0`; `git tag v7.0.0-beta.0`; `git push origin <branch> --tags`
    4. Verify CI 6-leg matrix runs against this tag (this is the first time Windows + macOS runners exercise the bundle)
  - **Files**: `package.json`, `package-lock.json`, plugin manifests, marketplace.json, CHANGELOG.md
  - **Done when**: 5-field gate green + tag pushed
  - **Verify**: `npm run check-versions && git tag -l v7.0.0-beta.0 | grep -q v7.0.0-beta.0 && echo BETA_OK`
  - **Commit**: `chore: release v7.0.0-beta.0`
  - _Requirements: FR-15_
  - _Design: Release 节奏 → beta.0_

- [ ] 4.9 [VERIFY] Quality checkpoint: pre-PR full verify
  - **Do**: `npm run verify && npm run build`
  - **Verify**: All exit 0
  - **Done when**: All gates green locally
  - **Commit**: None

### Final verification sequence (V4 → V5 → V6 → VE1 → VE2 → VE3)

- [ ] 4.10 V4 [VERIFY] Full local CI: typecheck + check-versions + check:hooks-fresh + test:hooks + build
  - **Do**:
    1. `npm run typecheck`
    2. `npm run check-versions`
    3. `npm run check:hooks-fresh`
    4. `npm run test:hooks`
    5. `npm run build`
    6. `! grep -rn '\bjq\b' plugins/curdx-flow`
  - **Verify**: All commands exit 0
  - **Done when**: Full local CI suite passes
  - **Commit**: `chore(spec): pass local CI` (only if fixes needed)

- [ ] 4.11 Push branch + create PR
  - **Do**:
    1. `git branch --show-current` → must NOT be `main`/`master`
    2. If on default branch: STOP and alert user
    3. `git push -u origin <branch-name>`
    4. `gh pr create --title "feat: cross-platform support v7.0.0 (Node .mjs, jq elimination)" --body "$(cat docs/MIGRATION-V7.md | head -40) ..."`
  - **Done when**: PR exists, URL printed
  - **Verify**: `gh pr view --json url -q .url`
  - **Commit**: None (PR creation, no code changes)

- [ ] 4.12 V5 [VERIFY] CI pipeline passes (3-OS matrix)
  - **Do**: `gh pr checks --watch` until all green or fail
  - **Verify**: `gh pr checks` shows all 6 legs ✓
  - **Done when**: ubuntu+macos+windows × node 20/22 matrix all green
  - **Commit**: None
  - **If CI fails**: read failures via `gh pr checks`, fix, push, re-watch

- [ ] 4.13 V6 [VERIFY] AC checklist (programmatic)
  - **Do**:
    1. AC-1.1/2.1/3.1: `gh pr checks` shows windows-latest leg green
    2. AC-1.4/4.1: byte-equal test passing on macos+linux legs
    3. AC-5.1: `grep -q 'windows-latest' .github/workflows/ci.yml`
    4. AC-6.1/6.2: `grep -q 'check:hooks-fresh' .github/workflows/ci.yml`
    5. AC-7.1: `grep -q 'Node ≥ 20.12' docs/MIGRATION-V7.md`
    6. AC-8.1: `! grep -rn '\bjq\b' plugins/curdx-flow`
    7. AC-9.1: `[ -f docs/MIGRATION-V7.md ]`
    8. AC-9.4: `grep -q '^## 7.0.0' CHANGELOG.md`
    9. AC-10.1: `ls plugins/curdx-flow/hooks/scripts/lib/{merge-state,count-tasks,cleanup-files}.mjs`
    10. AC-11.1: `grep -q 'workflow_run' .github/workflows/release.yml`
  - **Verify**: All 10 sub-checks exit 0
  - **Done when**: 11 user stories' AC's confirmed via automated grep/test
  - **Commit**: None

- [ ] VE1 [VERIFY] E2E startup: install plugin into clean dir + spawn each hook with fixture
  - **Do**:
    1. Create clean install dir: `INSTALL_DIR=/tmp/curdx-ve-$$; mkdir -p "$INSTALL_DIR/curdx-flow"`
    2. `cp -R plugins/curdx-flow/* "$INSTALL_DIR/curdx-flow/"`
    3. Record install dir to `/tmp/ve-pids.txt` (used as cleanup marker since no long-lived process here)
    4. Verify all 4 bundled `.mjs` are present: `ls "$INSTALL_DIR/curdx-flow/hooks/scripts"/*.mjs | wc -l | awk '$1>=4'`
    5. Verify all 11 lib bundles present: `ls "$INSTALL_DIR/curdx-flow/hooks/scripts/lib"/*.mjs | wc -l | awk '$1>=9'`
  - **Verify**: All `ls` checks exit 0; install dir path written to `/tmp/ve-pids.txt`
  - **Done when**: Plugin install simulated successfully
  - **Commit**: None

- [ ] VE2 [VERIFY] E2E check: spawn each hook via bash shim with realistic fixture
  - **Do**:
    1. Read INSTALL_DIR from `/tmp/ve-pids.txt`
    2. For each of 4 hooks, run via the exact hooks.json contract:
       `CLAUDE_PLUGIN_ROOT="$INSTALL_DIR/curdx-flow" bash -c 'echo "$FIXTURE" | node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.mjs"'`
    3. Use happy-path fixtures from `tests/hooks/fixtures/`
    4. Assert exit 0 + valid JSON stdout for each
    5. Run lib smoke: `node "$INSTALL_DIR/curdx-flow/hooks/scripts/lib/count-tasks.mjs" specs/cross-platform-support/tasks.md`
  - **Verify**: All 4 hooks + 1 lib smoke exit 0 with parsable JSON
  - **Done when**: Real hook contract works against installed plugin
  - **Commit**: None

- [ ] VE3 [VERIFY] E2E cleanup: remove install dir + clear PID marker
  - **Do**:
    1. INSTALL_DIR=$(cat /tmp/ve-pids.txt)
    2. `rm -rf "$INSTALL_DIR"`
    3. `rm -f /tmp/ve-pids.txt`
    4. Verify dir removed: `[ ! -d "$INSTALL_DIR" ]`
  - **Verify**: `[ ! -f /tmp/ve-pids.txt ] && echo VE3_PASS`
  - **Done when**: Install dir + PID marker removed
  - **Commit**: None

---

## Phase 5: PR Lifecycle — 5-10% of tasks

Goal: autonomous PR loop until merged + final v7.0.0 release.

- [ ] 5.1 Monitor CI 6-leg matrix; fix Windows-specific issues if any
  - **Do**:
    1. `gh pr checks --watch`
    2. If a leg fails (especially windows-latest), read logs: `gh run view <run-id> --log-failed`
    3. Common fixes:
       - Issue #267 reproduces on real Windows runner → fall back to `.cjs` (`outExtension: { '.js': '.cjs' }` + colocated `package.json` removed)
       - CRLF poison → confirm `.gitattributes` applied + `git add --renormalize .`
       - Issue #27145 (`CLAUDE_PLUGIN_ROOT` empty on SessionStart) → add 4-line bash fallback in hooks.json command
    4. Push fix; repeat
  - **Done when**: All 6 CI legs green
  - **Verify**: `gh pr checks --watch && echo CI_GREEN`
  - **Commit**: `fix(<scope>): <issue>` (per fix)

- [ ] 5.2 Address review comments
  - **Do**:
    1. `gh pr view --json reviews,comments`
    2. For each comment requiring change: implement, commit, push
    3. Reply to each comment via `gh pr comment` once addressed
  - **Done when**: All review comments resolved
  - **Verify**: `gh pr view --json reviewDecision -q .reviewDecision | grep -q 'APPROVED\|null'`
  - **Commit**: `fix(review): address <comment-summary>` (per comment)

- [ ] 5.3 Bump v7.0.0-rc.0 + push tag (docs freeze gate)
  - **Do**:
    1. Confirm MIGRATION-V7.md + CHANGELOG.md reviewed
    2. `npm run bump-version 7.0.0-rc.0`
    3. Tag + push
    4. Wait for CI green
  - **Files**: 5 version fields, CHANGELOG.md
  - **Done when**: rc.0 tag pushed + CI green + 2-week soak window declared
  - **Verify**: `git tag -l v7.0.0-rc.0 | grep -q v7.0.0-rc.0 && echo RC_OK`
  - **Commit**: `chore: release v7.0.0-rc.0`
  - _Requirements: FR-15_
  - _Design: Release 节奏 → rc.0_

- [ ] 5.4 Final v7.0.0 bump + tag + verify release.yml fires
  - **Do**:
    1. `npm run bump-version 7.0.0`
    2. Update CHANGELOG.md `## 7.0.0 — <today>`
    3. Commit + tag `v7.0.0` + push
    4. Verify release.yml triggered via `workflow_run` after CI green
    5. Verify `npm view @curdx/flow@7.0.0 version` returns `7.0.0`
  - **Files**: 5 version fields, CHANGELOG.md
  - **Done when**: npm registry + GitHub Release both show v7.0.0
  - **Verify**: `npm view @curdx/flow@7.0.0 version 2>/dev/null | grep -q '7.0.0' && gh release view v7.0.0 --json name -q .name | grep -q v7.0.0 && echo V7_RELEASED`
  - **Commit**: `chore: release v7.0.0`
  - _Requirements: FR-15, FR-19, AC-11.2_
  - _Design: Release 节奏 → final_

- [ ] 5.5 Merge gate + close spec
  - **Do**:
    1. Confirm all Phase 1-4 + 5.1-5.4 tasks marked [x]
    2. CI all green + no unresolved review comments
    3. Merge PR via `gh pr merge --squash` (only after all gates green)
  - **Done when**: PR merged into main; spec considered done
  - **Verify**: `gh pr view --json state -q .state | grep -q MERGED && echo SPEC_DONE`
  - **Commit**: None (merge only)

---

## Notes

- **POC shortcuts (Phase 1)**: minimal error messages; happy-path fixtures only; no Windows runner test until Phase 4 CI; 11 lib bundles built without unit tests until Phase 3
- **Production TODOs deferred to follow-up specs**: shellcheck/ESLint setup; cosign attestation; PowerShell native hook; doctor CLI self-check; spec.schema.json validator
- **Risk register references** (per design.md):
  - R1 (#267 .mjs MODULE_NOT_FOUND on Windows) → if fires in 5.1, fallback to .cjs is the documented mitigation
  - R3 (#27145 `CLAUDE_PLUGIN_ROOT` unset) → 4-line bash fallback ready in 5.1 if needed
  - R8 (stop-watcher awk → regex translation) → byte-equal test in Phase 3 is the safety net
- **Pre-release rhythm**: alpha.0 (1.40, end of Phase 1) → beta.0 (4.8, end of Phase 4 setup) → rc.0 (5.3) → 7.0.0 (5.4)

---

Run `/curdx-flow:implement` to start execution
