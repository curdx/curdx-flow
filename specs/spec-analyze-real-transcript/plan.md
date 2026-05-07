---
spec: spec-analyze-real-transcript
epic: observability-v2
phase: triage
created: 2026-05-07
---

# Plan: spec-analyze-real-transcript

> Epic: [`specs/_epics/observability-v2/epic.md`](../_epics/observability-v2/epic.md)
> Foundation spec — 修 plugin-observability 的 critical bug B1。

## Goal

作为 curdx-flow 用户，运行 `npx curdx-flow analyze` 时读取**真实 session transcript**（`~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`），不再读测试 fixture，使报表反映自己的工作。

## Acceptance Criteria

- AC1: `npx curdx-flow analyze` 在 cwd `/Users/x/foo/bar` 下解析路径为 `~/.claude/projects/-Users-x-foo-bar/`
- AC2: 同目录多 session-uuid.jsonl 时**默认聚合所有 session**（token/cost 求和）；CLI 加 `--session <uuid>` flag 提供 single-session view
- AC3: 项目目录不存在 → 友好错误 + exit code ≠ 0
- AC4: 老 fixture path 仍走 `CURDX_TRANSCRIPT_FIXTURE=…` env var（test-only）
- AC5: 5 新单测全过（path resolver / encoding / multi-session / missing project / fallback env var）
- AC6: 现有 `tests/analyze/integration.test.ts` 不破

## Size

S（5-7 任务，≤8 cap）

## Dependencies

- **none** — 最底层 critical bug fix

## Interface Contract

```typescript
// New file: src/analyze/transcript-path.ts
export interface TranscriptSource {
  kind: 'real' | 'fixture';
  paths: string[];       // 绝对路径数组（多 session 聚合）
  cwd: string;
}

export function resolveTranscriptSource(opts: {
  cwd?: string;                    // default = process.cwd()
  fixtureOverride?: string;        // CURDX_TRANSCRIPT_FIXTURE env var
  sessionFilter?: 'latest' | 'all'; // default 'all'
}): TranscriptSource;

export class TranscriptNotFoundError extends Error {}
```

## Owner Files

- MODIFY `src/analyze/index.ts` — **4 个 fixturePath 引用全替换** (L23 / L116 / L150 / L203)
- NEW `src/analyze/transcript-path.ts`
- NEW `tests/analyze/transcript-path.test.ts`（5 cases）

## Validation Hint

- BEFORE/AFTER 比对：`CURDX_TRANSCRIPT_FIXTURE=tests/analyze/fixtures/sample.jsonl npx curdx-flow analyze` 输出应与原版一致（fixture fallback 不破）
- Real path：unset env var → `npx curdx-flow analyze --json | jq '.transcripts | length'` 应 ≥ 1
- 项目目录不存在场景：cwd 切到无 transcript 的随机目录 → 干净失败 + exit ≠ 0

## Notes from Triage

- 修 B1 是 OB-2/OB-3 的解锁前提（弱依赖：integration test only）
- Open Question multi-session 聚合策略**已在 epic 阶段定**（默认 all）—— OB-1 design 不再 deliberate

## Related Research

- `specs/_epics/observability-v2/research.md` §Codebase Analysis (E1) §Transcript schema (R1)
