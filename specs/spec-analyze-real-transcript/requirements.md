---
spec: spec-analyze-real-transcript
epic: observability-v2
phase: requirements
created: 2026-05-07
---

# Requirements: spec-analyze-real-transcript

## Goal

让 `npx curdx-flow analyze` 读取真实 session transcript（`~/.claude/projects/<encoded-cwd>/*.jsonl`，多 session 默认聚合），替换硬编码 fixture，使报表反映用户实际工作。

## Success Criteria

- 在任意 cwd 下运行 analyze，输出基于该 cwd 真实 transcripts 的报表
- 多 session（实测 66 个 .jsonl）默认全聚合，token/cost 求和正确
- 现有 `tests/analyze/integration.test.ts` 通过 `CURDX_TRANSCRIPT_FIXTURE` env var 不破
- State file 多 session 不累积 orphan（GC 生效）

## Glossary

- **Path-encoded cwd**: abs path 把 `/` 替换为 `-` 带 leading `-`（如 `/Users/x/foo` → `-Users-x-foo`）；无 hash，无 dot escape；原 hyphen 不再二次转义
- **Multi-session aggregation**: 单 cwd 目录下多个 `<uuid>.jsonl` 默认全部读取并合并；token/cost 求和；事件按 `ev.ts` 排序后输出
- **State file orphan**: `observability-state.json::files` 中 path key 对应文件已不存在，或 mtime > 30 天；load 时 GC
- **Composite dedup key**: filter.ts 现有 `${uuid}|${requestId}` 复合去重键（比 ccusage `messageId:requestId` 更严格）；跨文件复用
- **Friendly error format**: 2-line 警告（`warning:` + `hint:`），无堆栈 trace，明示用户下一步动作（如 `did you run \`claude\` here?`）
- **1-level glob**: `<encoded>/*.jsonl` 而非 `<encoded>/**/*.jsonl`，避免 UUID artifact 子目录污染

## Personas

### Primary: curdx-flow user — runs analyze on real session
跑过 `claude` 后想看自己的 token/cost；不关心内部 path encoding；期望 cwd 自动识别。

### Secondary: CI/test author — needs fixture override
要在 CI/sandbox 里运行确定性 fixture；不能依赖 `~/.claude/projects/`；通过 env var 锁定 fixture path。

## User Stories

### US-1: cwd → encoded path resolution
**As a** curdx-flow user **I want to** run `analyze` in any cwd **So that** transcripts auto-resolve to `~/.claude/projects/<encoded>/`
- AC-1.1: cwd `/Users/x/foo` → resolves `~/.claude/projects/-Users-x-foo/`
- AC-1.2: symlinked cwd → `realpath` 解析后再编码
- AC-1.3: 编码无 hash，无 dot escape，原 hyphen 不再二次转义

### US-2: multi-session 默认聚合 ALL
**As a** user **I want to** see aggregated metrics across all sessions in cwd **So that** reports reflect total work
- AC-2.1: glob `<encoded>/*.jsonl`（1-level，不递归）匹配所有 session 文件
- AC-2.2: token/cost 跨文件求和；事件按 `ev.ts` 排序
- AC-2.3: `uuid|requestId` 复合 dedup 跨文件生效（filter.ts 复用）

### US-3: --session <uuid> single-session view
**As a** user **I want to** flag `--session <uuid>` **So that** 我能只看某次 session
- AC-3.1: `--session abc123` 仅匹配 `<encoded>/abc123*.jsonl`
- AC-3.2: 未知 uuid → friendly error，exit ≠ 0
- AC-3.3: 默认（无 flag）= ALL aggregation

### US-4: 项目目录不存在 friendly error
**As a** user **I want to** clear hint when no transcripts exist **So that** 知道下一步动作
- AC-4.1: 目录不存在 → 输出 `warning: no transcripts found at <path>` + `hint: did you run \`claude\` here? (or pass --project)`
- AC-4.2: 无堆栈，无 panic
- AC-4.3: exit code 行为 design 阶段定（见 Open Questions Q1）

### US-5: fixture override env var (test-only)
**As a** CI author **I want to** `CURDX_TRANSCRIPT_FIXTURE=path` 锁定 fixture **So that** 整 test 不依赖 `~/.claude/`
- AC-5.1: env var 设置 → 跳过 cwd resolution，直接用该 path
- AC-5.2: env var unset → 走 real-path resolver
- AC-5.3: env var 文件不存在 → friendly error（区分于 cwd 路径不存在）

### US-6: state file orphan cleanup
**As a** maintainer **I want to** state file 不无限增长 **So that** 长跑用户无累积负担
- AC-6.1: load state 时，扫 `files` map，删除 mtime > 30 天的 entries
- AC-6.2: load state 时，删除目标文件已不存在的 entries
- AC-6.3: cleanup 失败 fail-open（warning 但不 crash）

### US-7: 5 fixturePath sites all replaced
**As a** implementer **I want to** 所有 5 个 site 替换 **So that** 无残留 fixture 引用
- AC-7.1: L23 const `POC_FIXTURE_REL` 删除
- AC-7.2: L112 `path.resolve(...)` 调用 → `resolveTranscriptSource()`
- AC-7.3: L116/L150/L203 改为多文件迭代（stat / parse / state-key 各一处）

### US-8: 9 edge cases handled
**As a** user **I want to** analyze 不在边界 case 上 crash **So that** 工具可靠
- AC-8.1: multi-session / mid-cwd / 跨机 / symlink / compaction → 正常聚合
- AC-8.2: empty .jsonl / corrupt line / unknown rotation 后缀（`.jsonl.1`） → 跳过
- AC-8.3: UUID artifact 子目录（subagents） → 1-level glob 自然跳过

### US-9: integration test backwards-compat
**As a** maintainer **I want to** 现有 `tests/analyze/integration.test.ts` 不动 **So that** 修复不引入回归
- AC-9.1: integration test 通过 `CURDX_TRANSCRIPT_FIXTURE` 跑 fixture，无源码改动
- AC-9.2: snapshot 若必须更新，diff 仅限新行不影响 metrics 数值
- AC-9.3: `npm run test:analyze` 全绿

### US-10: CHANGELOG entry
**As a** release manager **I want to** changelog 记录此修复 **So that** 用户知道升级价值
- AC-10.1: CHANGELOG.md `Fixed` section 记录 B1 真实 transcript 读取
- AC-10.2: 注明 multi-session 默认行为
- AC-10.3: 注明 `CURDX_TRANSCRIPT_FIXTURE` env var 测试边界

## Functional Requirements

### FR-Resolve: path resolver + encoding

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-R1 | `resolveTranscriptSource({ cwd, fixtureOverride, sessionFilter })` 导出 | High | API 签名匹配 plan.md |
| FR-R2 | encode: `/` → `-` + leading `-`，无 hash | High | unit test fixture 覆盖 |
| FR-R3 | symlink cwd → `realpath` 解析后编码 | High | unit test 覆盖 |
| FR-R4 | env var `CURDX_TRANSCRIPT_FIXTURE` override 短路 | High | env var test |

### FR-Multi: multi-session glob + dedup

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-M1 | glob `<encoded>/*.jsonl`（1-level，不递归） | High | UUID artifact 子目录跳过 |
| FR-M2 | 多文件结果合并；事件按 `ev.ts` 排序 | High | metrics 求和正确 |
| FR-M3 | 复用 filter.ts `uuid\|requestId` 复合 dedup | High | 重复事件跨文件合并 |
| FR-M4 | `--session <uuid>` flag 限定文件 glob 前缀 | Medium | CLI flag test |

### FR-Cleanup: state orphan GC

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-C1 | load state 时 GC mtime > 30 天 entries | High | state-cleanup test |
| FR-C2 | load state 时 GC 文件已不存在 entries | High | unit test |
| FR-C3 | GC 失败 fail-open（log warning） | Medium | error path test |

### FR-Error: friendly error UX

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-E1 | 目录不存在 → 2-line warning + hint，无堆栈 | High | snapshot test |
| FR-E2 | env var fixture 不存在 → 区分 message | High | unit test |
| FR-E3 | exit code 行为按 design 决议（见 Q1） | High | design 阶段确认 |

### FR-Test: 5 unit + integration

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-T1 | `tests/analyze/transcript-path.test.ts` 含 5 cases | High | path resolver / encoding / multi-session / missing project / fallback env var |
| FR-T2 | integration test 通过 env var 跑老 fixture | High | 现有 test 不破 |

### FR-Edge: 9 edge cases

| ID | Requirement | Priority | Acceptance |
|----|-------------|----------|------------|
| FR-X1 | E1-E5 边界（multi/mid-cwd/跨机/symlink/compaction） 正常聚合 | High | edge test 覆盖 |
| FR-X2 | E6-E9 边界（empty/corrupt/rotation/UUID artifact） 跳过不 crash | High | edge test 覆盖 |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Backwards-compat | 老 integration test 改动 | 0 行（仅 env var 启动） |
| NFR-2 | Cross-platform | CI matrix 通过率 | 4-leg（mac/linux × node 18/20）100% |
| NFR-3 | Performance | glob 深度 / realpath 调用 | 1-level glob，realpath 单次 cache |
| NFR-4 | Fail-open | edge case 触发 crash 数 | 0（全部 graceful） |

## Out of Scope

- 递归 `**/*.jsonl` glob（避免 UUID artifact subagents 子目录污染）
- ccusage 的 2-path scan（仅扫 `~/.claude/projects/`，不扫 `~/.config/claude/projects/`）
- Cost / token 计算逻辑（OB-3 责任）
- Event-level 过滤增强（OB-2 责任）
- 跨机 session merge（per-machine namespace 自然隔离）
- Windows path encoding 落地（仅 R1 文档化，落地不在本 spec）

## Dependencies

### Internal
- 无 — 本 spec 是 observability-v2 epic 的 foundation

### External
- 无新依赖；复用现有 `filter.ts` / `parser.ts` / state util

## Open Questions for Design

1. **Exit code on no-transcript-dir** (BIGGEST)
   - epic AC3 ≠ 0 vs ccusage 0 — 直接冲突
   - 推荐 ≠ 0：dev tool 需明确"有数据"vs"无数据"信号；CI gate 友好
   - 反方：ccusage UX 更软，empty report 是合法输出非 failure
2. **State file cleanup 阈值**
   - 30 天 mtime vs N session 上限（如 keep last 100）
   - 推荐 30 天 mtime（简单可测，常量化）
3. **realpath 解析时机**
   - cwd 入参时 vs path resolve 时
   - 推荐 cwd 时（一次性 cache，避免每次 resolve 都 syscall）
4. **UUID artifact 子目录策略**
   - 1-level glob 跳过 vs 显式 blacklist 已知子目录名
   - 推荐 1-level glob（无需维护黑名单，自然安全）

## Risks

- **R1**: state file 30 天 GC 阈值过激进，误删活跃 dormant session entries
  - mitigation: warning log 列被删 keys；30 天对 dev session 充足；阈值常量化便于调
- **R2**: integration test snapshot 数值轻微变化（dedup key 跨文件后）
  - mitigation: 接受可解释 diff，snapshot 更新一次；保留 BEFORE/AFTER 对照
- **R3**: 长 cwd path 编码后超 macOS 文件名 255 字符限制
  - mitigation: 实测 < 100 char 安全；NFR-2 矩阵覆盖；超长场景在 future spec 处理
- **R4**: realpath 在 broken symlink 下抛错
  - mitigation: try/catch fail-open，fallback 原 cwd；warning 提示用户
- **R5**: `--session <uuid>` 与 `--since` 同时使用产生空集
  - mitigation: friendly 提示 "session in window has 0 events"，非 error

## Validation Strategy

- **BEFORE/AFTER fixture env var 兜底测**
  - `CURDX_TRANSCRIPT_FIXTURE=tests/analyze/fixtures/sample.jsonl npx curdx-flow analyze` 输出与原版一致
  - 现有 integration snapshot 不动或仅添加可解释字段
- **真 path 验证**
  - unset env var → `npx curdx-flow analyze --json | jq '.transcripts | length'` ≥ 1
  - 在 `~/.claude/projects/-Users-wdx-opc-curdx-flow/` 实测 66 个 .jsonl 全部进入聚合
- **项目目录不存在**
  - cwd 切到无 transcript 的随机目录 → 输出 friendly warning + exit 行为按 Q1 决议
- **State GC 验证**
  - 人造 31 天前 mtime entry → load state 后该 entry 消失，warning 列出 GC keys
  - 人造已删除文件 entry → load state 后该 entry 消失
- **Edge case 测试**：9 cases 各自单测覆盖
  - E1 multi-session / E2 mid-cwd / E3 跨机 / E4 symlink / E5 compaction
  - E6 empty .jsonl / E7 corrupt line / E8 unknown rotation 后缀 / E9 UUID artifact 子目录

## Next Steps

1. 进入 design 阶段，4 个 Open Questions 决议
2. 设计 `resolveTranscriptSource()` 接口与错误类型
3. 规划 5 site 替换 diff 与 state GC 实现位置
4. 落 tasks.md（5-7 任务）
