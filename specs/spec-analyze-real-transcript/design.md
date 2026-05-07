---
spec: spec-analyze-real-transcript
epic: observability-v2
phase: design
created: 2026-05-07
---

# Design: spec-analyze-real-transcript

## Overview

替换 `src/analyze/index.ts` 内 5 处硬编码 fixture 路径为 `resolveTranscriptSource()` 真实 transcript 解析器（cwd → `~/.claude/projects/<encoded>/*.jsonl` 1-level glob）；新增 state file orphan GC（mtime > 30d 或 > 100 keys）；保留 `CURDX_TRANSCRIPT_FIXTURE` env var 测试边界。

## Architecture Diagram

```mermaid
graph TD
  CWD[process.cwd] --> resolver[resolveTranscriptSource]
  ENV[CURDX_TRANSCRIPT_FIXTURE] --> resolver
  CLI[--session uuid] --> resolver
  resolver --> realPath[realpath cached]
  realPath --> encode["encode: / -> -"]
  encode --> globOneLevel["glob ~/.claude/projects/encoded/*.jsonl"]
  globOneLevel --> source{TranscriptSource kind:real, paths[], cwd, realCwd}
  ENV -.short-circuit.-> sourceFixture{kind:fixture, paths[1]}
  source --> indexTs[index.ts orchestrator]
  sourceFixture --> indexTs
  indexTs --> stat[multi-file stat rotation]
  indexTs --> parse[multi-file parseTranscript]
  indexTs --> stateGC[cleanupOrphanState]
  stateGC --> writeState[writeState]
```

## Decisions

### D1: Exit code 1 on no-transcript-dir

| Option | Choice | Rationale |
|---|---|---|
| Exit 0 (ccusage UX) | rejected | dev/CI tool 需信号区分 |
| Exit 1 (epic AC3) | **chosen** | "no data" ≠ "data shows X"；CI gate 友好 |

curdx-flow analyze 是 dev/CI 工具用于驱动优化决策；ccusage 是 end-user CLI 故可静默。

### D2: State cleanup = mtime > 30d OR > 100 keys (dual heuristic)

| Option | Choice | Rationale |
|---|---|---|
| mtime 30d only | rejected | 短命项目多的用户无法 GC |
| Keep last 100 only | rejected | 长寿单项目用户可能误删 |
| Both (whichever first) | **chosen** | 30d 覆盖 session retention，100 keys 约 3 月平均 |

### D3: realpath cached at cwd entry

`realpath()` syscall 非平凡；resolver 入口解析一次，缓存到 `TranscriptSource.realCwd` 透传下游；analyze 是 one-shot 进程故缓存生命周期 = 进程生命周期。

### D4: 1-level glob `*.jsonl`, implicit subdirs skip

`*.jsonl` 不递归；UUID artifact subagent 子目录天然跳过；无黑名单维护成本；与 ccusage 实测一致。未来 Claude Code 真引入嵌套 transcript 时再处理（YAGNI）。

## Components

### Component 1: `src/analyze/transcript-path.ts` (NEW)

**Purpose**: cwd → encoded path → glob 真实 transcript 文件列表的纯函数模块。

**API**:
```typescript
export type TranscriptSource =
  | { kind: 'real'; paths: string[]; cwd: string; realCwd: string; encodedDir: string }
  | { kind: 'fixture'; paths: string[]; cwd: string };

export interface ResolveOpts {
  cwd?: string;
  fixtureOverride?: string; // CURDX_TRANSCRIPT_FIXTURE 注入
  sessionFilter?: string;   // --session <uuid>
  homedir?: string;         // test injection
}

export function resolveTranscriptSource(opts?: ResolveOpts): TranscriptSource;
export class TranscriptNotFoundError extends Error {
  constructor(public readonly path: string, public readonly hint: string);
}
```

**Encoding**:
- `cwd.replace(/\//g, '-')` 保留 leading `-`
- 无 hash, 无 dot escape, 原 hyphen 不二次转义
- POSIX-only v1（Windows 推到 future spec）

**Glob**:
- `readdirSync(encodedDir, { withFileTypes: true })`
- filter: `entry.isFile() && entry.name.endsWith('.jsonl')`
- post-filter `endsWith('.jsonl')` 排除 editor swap `.jsonl.bak`

**Realpath cache**:
- module-level `Map<string, string>` 避免重复 syscall
- broken symlink → fallback 原 cwd + warning（per R4 risk）

**Error**:
- `kind='real'` + 目录不存在 → throw `TranscriptNotFoundError(path, hint)`
- `fixtureOverride` 文件不存在 → throw 区分 message（"fixture not found at <path>"）

### Component 2: `src/analyze/index.ts` 5-site replacement (EDIT)

| Line | Before | After |
|---|---|---|
| L23 | `const POC_FIXTURE_REL = 'tests/.../sample.jsonl'` | DELETE |
| L112 | `path.resolve(cwd, POC_FIXTURE_REL)` | `const source = resolveTranscriptSource({ cwd, fixtureOverride: process.env.CURDX_TRANSCRIPT_FIXTURE, sessionFilter: args.session })` |
| L116 | `statSync(fixturePath)` | `for (const p of source.paths) statSync(p)` 收集 max mtime |
| L150 | `parseTranscript(fixturePath, ...)` | `for (const p of source.paths) parseTranscript(p, ...)`，事件按 `ev.ts` merge-sort |
| L203 | `state.files[fixturePath] = ...` | `for (const p of source.paths) state.files[p] = ...` |

### Component 3: State GC (EDIT in index.ts)

```typescript
function cleanupOrphanState(state: State, currentPaths: string[]): State {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const KEEP_MAX = 100;
  const dropped: string[] = [];

  // Pass 1: drop mtime > 30d OR file gone
  for (const [key, entry] of Object.entries(state.files)) {
    const stale = now - entry.lastModifiedMs > THIRTY_DAYS;
    const gone = !existsSync(key);
    if (stale || gone) { delete state.files[key]; dropped.push(key); }
  }

  // Pass 2: if still > 100, drop oldest by lastModifiedMs
  const entries = Object.entries(state.files);
  if (entries.length > KEEP_MAX) {
    entries.sort((a, b) => a[1].lastModifiedMs - b[1].lastModifiedMs);
    for (const [key] of entries.slice(0, entries.length - KEEP_MAX)) {
      delete state.files[key]; dropped.push(key);
    }
  }

  if (dropped.length) console.warn(`state: GC dropped ${dropped.length} orphan entries`);
  return state;
}
```

调用位置：`finally` 块 `writeState()` 之前；wrap try/catch fail-open（FR-C3）。

### Component 4: CLI `--session <uuid>` flag (EDIT in index.ts)

citty `defineCommand` args 增加 `session: { type: 'string', description: 'Filter to single session UUID' }`；穿透到 `resolveTranscriptSource({ sessionFilter })`。

resolver 内 sessionFilter 时 `paths.filter(p => path.basename(p).startsWith(sessionFilter))`；空集 → `TranscriptNotFoundError`（"unknown session"）。

### Component 5: Friendly error format (in transcript-path.ts)

```
warning: no transcripts found at /Users/x/.claude/projects/-Users-x-foo/
hint: did you run `claude` here? (or pass CURDX_TRANSCRIPT_FIXTURE for tests)
```

`index.ts` 顶层 catch `TranscriptNotFoundError` → 双行 stderr + `process.exit(1)`（D1）；其他 error 仍上抛保 stack。

### Component 6: 9 edge cases (handled in resolver)

| # | Case | Handling |
|---|---|---|
| E1 | multi-session | glob 自动聚合 paths[] |
| E2 | mid-cwd | irrelevant — runtime 解析 |
| E3 | cross-machine | `~/.claude/projects/` per-machine namespace |
| E4 | symlink | `realpath()` cached |
| E5 | compaction forks | 多文件即 E1 |
| E6 | empty .jsonl | parser.ts 已跳过 |
| E7 | corrupt line | parser.ts per-line skip |
| E8 | rotation `.jsonl.1` | `endsWith('.jsonl')` 不匹配 |
| E9 | UUID artifact subdirs | 1-level glob (D4) |

### Component 7: Tests

**`tests/analyze/transcript-path.test.ts` (NEW, 5 cases)**:
1. encoding: `/Users/x/foo` → `-Users-x-foo`
2. multi-session glob: 3 fixture .jsonl → paths.length === 3
3. missing project dir → `TranscriptNotFoundError` + path/hint 字段
4. fixture override env var → `kind: 'fixture'` 短路
5. `--session abc` 过滤 → 单文件结果

**`tests/analyze/integration.test.ts` (EDIT)**:
- 启动前 `process.env.CURDX_TRANSCRIPT_FIXTURE = path.resolve('tests/analyze/fixtures/sample.jsonl')`
- 现 snapshot 内容不变（FR-T2 / NFR-1）

**state GC test (in transcript-path.test.ts or new state-gc.test.ts)**:
- 注入 31d-old entry → load 后被 drop
- 注入 101 entries → 最旧 1 个被 drop
- 注入 file-gone entry → drop

## File Structure

| Path | Action | Purpose |
|---|---|---|
| `src/analyze/transcript-path.ts` | NEW | resolver + encoding + glob + realpath cache + error class |
| `src/analyze/index.ts` | EDIT | 5-site replace + GC call + `--session` arg + exit 1 on TranscriptNotFoundError |
| `tests/analyze/transcript-path.test.ts` | NEW | 5 unit cases + state GC cases |
| `tests/analyze/integration.test.ts` | EDIT | env var setup; no source change beyond 1-2 lines |
| `CHANGELOG.md` | EDIT | OB-1 entry under `Fixed` |

(5 files: 2 NEW + 3 EDIT)

## Test Strategy

| Test | What | Trace |
|---|---|---|
| path resolver encoding | `/` → `-` + leading `-` | FR-R2 / AC-1.1, 1.3 |
| symlink realpath | symlinked cwd resolves correct dir | FR-R3 / AC-1.2 |
| multi-session glob | aggregate ALL `.jsonl` 1-level | FR-M1, M2 / AC-2.1 |
| `--session <uuid>` filter | single-session view | FR-M4 / AC-3.1 |
| missing project | exit 1 + 2-line friendly | FR-E1, E3 / AC-4.1, 4.2 |
| fallback env var | `CURDX_TRANSCRIPT_FIXTURE` 短路 | FR-R4 / AC-5.1 |
| state GC mtime | drop 31d-old | FR-C1 / AC-6.1 |
| state GC missing file | drop file-gone | FR-C2 / AC-6.2 |
| state GC fail-open | exception → warn no crash | FR-C3 / AC-6.3 |
| integration | 现 fixture 不破 via env var | FR-T2 / AC-9.1 |

## Performance Budget

- realpath cached → 1 syscall per analyze run (NFR-3)
- 1-level glob → `readdir` not walk (NFR-3)
- State GC → O(N log N) sort by mtime, N typically ≤ 100
- 65 文件聚合 < 200ms (parser.ts streaming, fs.readFile per-file)

## Cross-Platform

- v1: POSIX only（macOS/Linux CI matrix 覆盖 NFR-2）
- Windows path encoding（backslash + drive letter）→ future spec（research R1 已文档化，本 spec out-of-scope）
- 用 `path.posix` 处理 path operation 即便 Windows 入参，避免 backslash 污染编码

## Out-of-Scope (carried from requirements)

- 递归 `**/*.jsonl` glob
- ccusage 2-path scan（`~/.config/claude/projects/`）
- Cost/token 计算（OB-3）
- Event-level 过滤增强（OB-2）
- 跨机 session merge
- Windows path encoding 落地

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | realpath 物理路径 ≠ user cwd → state key 用 realpath 但 error 用原 cwd | error 同时显示两者，避免 user 困惑 |
| 2 | State GC race（并行 analyze 进程） | 罕见；现有 state writer 已 atomic write；GC 读时快照 |
| 3 | `*.jsonl` 匹配 `.jsonl.bak` editor swap | post-filter 显式 `endsWith('.jsonl')` |
| 4 | broken symlink realpath 抛错 | try/catch fail-open，fallback 原 cwd + warning |
| 5 | 30d GC 误删活跃 dormant entry | warning 列被删 keys，用户可手动恢复（state 仍可重建） |

## Open Questions for tasks-phase

(None — 4 design decisions all settled. Implementation 步骤已明确。)

## Implementation Steps

1. Create `src/analyze/transcript-path.ts` with `TranscriptSource` type, `resolveTranscriptSource()`, `TranscriptNotFoundError`, realpath cache
2. Add `cleanupOrphanState()` helper in `src/analyze/index.ts` (or shared `state.ts` if existing)
3. Replace 5 sites L23/L112/L116/L150/L203 in `src/analyze/index.ts`; wire `--session` citty arg; wrap top-level catch for `TranscriptNotFoundError` → exit 1
4. Add `tests/analyze/transcript-path.test.ts` with 5 resolver cases + 3 state GC cases
5. Edit `tests/analyze/integration.test.ts`: set `CURDX_TRANSCRIPT_FIXTURE` env var in beforeAll
6. Update `CHANGELOG.md` under `### Fixed` with OB-1 entry (multi-session default + env var test boundary)
7. Run `npm run typecheck && npm run test:analyze && npm run verify`
