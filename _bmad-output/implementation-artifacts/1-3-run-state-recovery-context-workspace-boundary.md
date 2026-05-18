# Story 1.3: Run State、恢复上下文与工作区边界

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为使用 curdx-flow 进行长任务验证的用户，
我希望每次验证 run 都有可恢复的状态、明确的工作区边界和用户改动保护，
以便会话中断、上下文压缩或验证失败后，系统能继续说明当前位置，而不会覆盖我的已有改动或混淆生成物。

## Acceptance Criteria

1. **Run state 创建：** 用户启动一次 curdx-flow 验证时，runtime 必须创建 workspace-local state，记录 `runId`、`goalId`、任务范围、模式、策略、期望用户旅程、当前阶段、verdict 状态、相关 evidence ids、artifact index 路径和下一步动作；不得写入 shipped plugin source。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.3`]
2. **恢复上下文：** 会话中断、上下文压缩或进程重启后，runtime 必须能从 state/session ledger 恢复当前 run 的关键上下文，并回答当前在做什么、已验证什么、缺什么证据、下一步谁负责。
3. **Dirty worktree baseline：** fix mode 或验证文件生成逻辑准备写入文件前，runtime 必须记录运行前已有用户改动 baseline，不得覆盖、回滚、格式化或混淆与本次 run 无关的用户改动。
4. **生成物分类：** curdx-flow 生成验证文件、临时 artifact、报告或 evidence 后，状态必须区分源码改动、生成的验证文件、临时 artifact、报告、用户既有文件和外部工具输出，使用户能看出哪些文件属于本次 run。
5. **旧状态兼容与未知字段保留：** state/session 文件来自旧版本或包含未知未来字段时，已知字段必须被安全迁移或兼容读取，未知字段必须尽量保留，不得静默丢弃用户上下文。
6. **Malformed state 阻塞恢复：** state 文件 malformed 或部分写入时，runtime 必须输出 blocker 或 recovery report，不得把无法可信恢复的状态伪装成可继续执行或已完成。
7. **验证覆盖：** 最小验证命令必须包含 `npm run typecheck`、state/session 相关合同/运行时测试；测试必须覆盖旧状态兼容、未知字段保留、malformed state、dirty worktree baseline、生成物分类和 `.curdx/**` artifact 边界。

## Tasks / Subtasks

- [x] 固定 Story 1.3 的 runtime/state 边界（AC: 1-7）
  - [x] 完整读取 `plugins/curdx-flow/schemas/state-ledger.schema.json`、`plugins/curdx-flow/schemas/session.schema.json`、`src/runtime/contracts/index.ts`。
  - [x] 完整读取 Story 1.2 的 `src/runtime/evidence/paths.ts`、`src/runtime/evidence/io.ts`、`tests/runtime/evidence/evidence-ledger.test.ts`，复用 workspace path、atomic write、structured issue 模式。
  - [x] 不修改 `src/hooks/**` 或 `plugins/curdx-flow/hooks/scripts/**`；本 story 不实现 hook 恢复注入。

- [x] 补强 state/session 合同（AC: 1, 2, 4, 5, 7）
  - [x] 如现有 `state-ledger.schema.json` / `session.schema.json` 缺少 story 必需字段，补齐 schema、TypeScript interface、runtime guard、fixtures 和合同测试。
  - [x] State 至少表达 `runId`、`goalId`、`workspaceRoot`、`scope`、`mode`、`policy`、`expectedJourney`、`phase`、`status/verdictStatus`、`evidenceIds`、`artifactIndexPath`、`nextAction`、`dirtyBaseline`、`generatedFiles`。
  - [x] Session 至少表达 `sessionId`、`runId`、`goalId`、`currentStep`、`resumeSummary`、`checkpoints`、`missingEvidence`、`nextAction`。
  - [x] Guard 保留 unknown fields；旧状态迁移不得丢弃未识别字段。

- [x] 实现 `src/runtime/state/**`（AC: 1-6）
  - [x] 新建 `src/runtime/state/types.ts`，定义 `RunStateInput`、`RunStateSnapshot`、`RuntimeSessionSnapshot`、`DirtyWorktreeBaseline`、`GeneratedFileRecord`、`StateReadResult`、`StateWriteResult`。
  - [x] 新建 `src/runtime/state/paths.ts`，集中解析 `.curdx/state/runs/<runId>.json`、`.curdx/state/sessions/<sessionId>.json`、`.curdx/state/checkpoints/` 路径，拒绝 workspace 外路径。
  - [x] 新建 `src/runtime/state/store.ts`，提供 `createRunState`、`readRunState`、`updateRunState`、`createSessionState`、`readSessionState` 或等价 API。
  - [x] 新建 `src/runtime/state/migration.ts`，处理 `schemaVersion` 旧值、缺省字段、unknown fields preservation 和 malformed state blocker。
  - [x] 新建 `src/runtime/state/workspace.ts`，记录 dirty worktree baseline 和 generated file classification；不直接执行 git，允许通过 injected provider/port 传入 dirty file 列表。
  - [x] 新建 `src/runtime/state/index.ts` 作为 public barrel。

- [x] 实现原子写入、恢复摘要和 malformed blocker（AC: 2, 5, 6）
  - [x] state/session 写入必须使用 same-directory temp file + atomic rename；失败返回结构化 blocker/degraded，不得损坏旧状态。
  - [x] `readRunState` / `readSessionState` 对 invalid JSON、schema mismatch、unsupported unrecoverable version 返回 blocker/recovery report。
  - [x] 恢复摘要必须能回答：当前在做什么、已验证 evidence ids、缺什么 evidence、下一步 owner/action。
  - [x] 读取成功时返回 normalized state，同时保留 unknown future fields。

- [x] 实现 dirty baseline 与生成物分类（AC: 3, 4）
  - [x] Dirty baseline 输入必须区分 `modified`、`staged`、`untracked`、`deleted` 等状态，记录为运行前用户既有文件。
  - [x] Generated file record 必须区分 `source-change`、`generated-verification-file`、`temporary-artifact`、`report`、`evidence`、`user-existing-file`、`external-tool-output`。
  - [x] 写入 generated file record 时不得把 user-existing baseline 文件改标为本次 run 生成物，除非显式提供同一路径变更原因。
  - [x] `.curdx/**` runtime state/evidence/report 必须归类为 generated runtime artifact，不得写入 `plugins/curdx-flow/**`。

- [x] 增加合同、运行时测试与 fixtures（AC: 1-7）
  - [x] 扩展 `tests/contracts/runtime-contracts.test.ts` 和 contract fixtures，覆盖 state/session 新字段、旧版本兼容或受控失败、unknown field preservation。
  - [x] 新建 `tests/runtime/state/state-store.test.ts`，覆盖 create/read/update state、session resume、malformed JSON blocker、atomic write failure。
  - [x] 测试 dirty worktree baseline 和 generated file classification，确认用户既有文件不会被混淆为本次生成物。
  - [x] 使用 `mkdtemp` 临时 workspace；测试不得在仓库根创建真实 `.curdx/**`。

- [x] 更新脚本、验证和 story 记录（AC: 7）
  - [x] 新增 `npm run test:state` 并接入 `npm run verify`，或确保 state runtime tests 被 release-quality gate 明确覆盖。
  - [x] 运行 `npm run test:contracts`、`npm run test:state`、`npm run typecheck`、`npm run verify`。
  - [x] 若修改 plugin-facing schema，运行 `claude plugin validate ./plugins/curdx-flow`。
  - [x] 在 Dev Agent Record 记录实现计划、验证命令、文件列表和任何未覆盖风险。

## Dev Notes

### 当前发现

- Story 1.1 已建立 `state-ledger.schema.json`、`session.schema.json` 和 runtime contract guard，但当前合同只覆盖基础字段，Story 1.3 可能需要补 `dirtyBaseline`、`generatedFiles`、`missingEvidence`、`verdictStatus` 等字段。
- Story 1.2 已新增 `src/runtime/evidence/**`，其中 `paths.ts`、`io.ts`、structured issue 和 JSONL tests 是本 story 写 state 的参考实现。
- 当前还没有 `src/runtime/state/**`。本 story 是 runtime state layer 的入口；不要把 state 写入逻辑放进 hooks、skills、registry、reports 或 evidence writer。
- 旧 hook 系统仍存在 `.curdx-state.json` 和 verification block 逻辑。本 story 不迁移旧 hook state，也不改 hook bundle；只为新 runtime 建立 `.curdx/state/**` store。
- 工作区有大量未提交 BMad/Story 1.1/1.2 产物。实现 dirty baseline 测试时必须使用临时 workspace，不得把本仓库当前 dirty state 当 fixture 写入。

### Previous Story Intelligence

- Story 1.2 review 发现路径校验需要同时覆盖 schema 和 runtime guard，尤其是 `.`、`..`、反斜杠路径和 workspace escape。Story 1.3 的 state path helper 必须复用或等价实现这些边界。
- Story 1.2 review 发现文件系统异常不能只覆盖 rename；read、mkdir、write 都必须转为结构化 issue。State store 必须覆盖同样失败面。
- Story 1.2 采用 JSONL append-only ledger；Story 1.3 的 run state 是当前快照 JSON，适合 atomic overwrite，但 checkpoint/session history 可采用 append-only 或 snapshot，必须说明取舍并测试旧文件不损坏。
- Story 1.2 的验证链路已通过 `npm run test:contracts`、`npm run test:evidence`、`npm run typecheck`、`npm run verify` 和 `claude plugin validate ./plugins/curdx-flow`。Story 1.3 不得降低这些 gate。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| Runtime Directory | 新增 `src/runtime/state/**`，必要时扩展 `src/runtime/contracts/index.ts`。 |
| Plugin Surface | 可能补强 `plugins/curdx-flow/schemas/state-ledger.schema.json` 和 `session.schema.json`。 |
| Workspace Artifacts | 默认写 `.curdx/state/runs/<runId>.json`、`.curdx/state/sessions/<sessionId>.json`、`.curdx/state/checkpoints/**`。 |
| Contract Test | 扩展 `tests/contracts/**` 覆盖 state/session 新字段、unknown fields、version/migration。 |
| Runtime Test | 新增 `tests/runtime/state/**` 覆盖 create/read/update/recover/dirty/generated classification。 |
| Fixture | 扩展 `tests/fixtures/contracts/**`，可新增 `tests/fixtures/runtime/state/**`。 |
| Report Surface | 本 story 只生成恢复摘要数据结构，不实现最终 Markdown/JSON report renderer。 |
| Failure Mode | malformed state、partial write、read/mkdir/write/rename failure、workspace escape、dirty baseline conflict 必须结构化 blocked/degraded。 |
| Verification Commands | `npm run test:contracts`、`npm run test:state`、`npm run typecheck`、`npm run verify`、必要时 `claude plugin validate ./plugins/curdx-flow`。 |

### Implementation Shape Guidance

建议 public API 形态：

```ts
createRunState({
  workspaceRoot,
  state,
  dirtyBaseline,
  generatedFiles,
}): Promise<StateWriteResult>
```

```ts
readRunState({
  workspaceRoot,
  runId,
}): Promise<StateReadResult>
```

```ts
buildResumeContext(state): {
  currentStep: string;
  verifiedEvidenceIds: string[];
  missingEvidence: unknown[];
  nextAction: Record<string, unknown>;
}
```

State 文件建议是当前快照 JSON，原因是 state 是可恢复当前位置，不是 evidence ledger。写入仍必须 atomic overwrite，避免 partial JSON。需要历史时使用 checkpoint 文件或 append-only checkpoint index，不要让当前 state 变成不可读的大数组。

Generated file record 最小结构：

```json
{
  "path": ".curdx/reports/run-1.report.md",
  "category": "report",
  "owner": "curdx-flow",
  "createdAt": "2026-05-17T00:30:42.000Z",
  "relatedRunId": "run-1",
  "relatedEvidenceIds": ["ev-command-1"]
}
```

Dirty baseline 最小结构：

```json
{
  "capturedAt": "2026-05-17T00:30:42.000Z",
  "files": [
    {
      "path": "src/app.ts",
      "status": "modified",
      "source": "user-existing"
    }
  ]
}
```

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/contracts/index.ts`
- `plugins/curdx-flow/schemas/state-ledger.schema.json`
- `plugins/curdx-flow/schemas/session.schema.json`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/fixtures/contracts/invalid/*.json`
- `package.json`

**NEW expected:**

- `src/runtime/state/index.ts`
- `src/runtime/state/types.ts`
- `src/runtime/state/paths.ts`
- `src/runtime/state/store.ts`
- `src/runtime/state/migration.ts`
- `src/runtime/state/workspace.ts`
- `tests/runtime/state/state-store.test.ts`
- Optional fixtures under `tests/fixtures/runtime/state/**`

### Architecture Guardrails

- `src/runtime/state/` owns `.curdx/**` 状态模型、会话、迁移；不得包含 plugin manifest、release publish logic。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]
- Runtime Planner 拥有计划状态，Evidence Ledger 拥有证据状态，State helper 负责 `.curdx/**` 持久化格式与迁移；planner 不直接读写 `.curdx/**` 文件。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-ARCH-002`]
- `.curdx/**` 默认是目标工作区生成物，不是 curdx-flow shipped source；tests 中样例状态放 `tests/fixtures/**`。[Source: `_bmad-output/planning-artifacts/architecture.md#Workspace Artifact Boundary`]
- 修改 schema 时必须同步 schema、TypeScript type、runtime validation helper、tests 和 fixtures。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-002`]
- 修改前必须识别已有变更；不得 revert、覆盖或格式化与当前 goal 无关的用户改动。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-DIRTY-001`]
- 不得在 `src/flows/**` 直接读写 `.curdx/**`，不得让 hooks 写 `.curdx` 复杂状态，plugin skills 不得依赖 repo-only runtime file paths。[Source: `_bmad-output/planning-artifacts/architecture.md#Structure Anti-Patterns`]

### Latest Claude Code / Library Information

- 官方 Claude Code 文档入口仍以 <https://code.claude.com/docs/llms.txt> 为准；本 story 不改 plugin manifest、hooks、skills、agents、dependencies 或 release tags。
- 若实现过程中触达 plugin-facing schema，仍需运行 `claude plugin validate ./plugins/curdx-flow`，确认新增 schema 文件没有破坏 plugin validation。
- Hook 恢复注入和 `/goal` transcript-visible resume summary 不在本 story 实现；后续 hook/surface story 可读取本 story 的 state/session API。

### Known Risks To Prevent

- 不要继续使用旧 `.curdx-state.json` 作为新 runtime state 的唯一事实源；旧 hook state 兼容属于后续迁移/bridge，不是本 story 范围。
- 不要把 dirty worktree baseline 通过真实 git 命令硬编码进 state store；用 injected provider/port，后续 git adapter 负责真实 git 调用。
- 不要让 malformed state fallback 成空 state 后继续成功；必须 blocker/recovery。
- 不要丢弃 unknown fields；migration 必须 shallow/deep preserve。
- 不要把 `.curdx/**` runtime 产物写到 `plugins/curdx-flow/**`、`src/**` 或测试仓库根。
- 不要实现 Story 1.4 completion verdict evaluator、Story 1.5 report renderer 或 Story 1.6 hook gate。

## Project Structure Notes

- Alignment: Story 1.3 接续 Story 1.1 的 state/session contracts 和 Story 1.2 的 workspace-local evidence/artifact write patterns。
- Detected conflict: legacy hook state `.curdx-state.json` 仍存在，但不能作为新 runtime state 设计的限制；保持兼容边界，避免修改 hooks。
- UX note: 用户价值是恢复摘要和文件归属清晰，不是新增可视界面。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.3`
- `_bmad-output/planning-artifacts/architecture.md#IP-ARCH-002`
- `_bmad-output/planning-artifacts/architecture.md#Workspace Artifact Boundary`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/planning-artifacts/architecture.md#IP-DIRTY-001`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-1-evidence-status-verdict-report-contract-baseline.md`
- `_bmad-output/implementation-artifacts/1-2-append-only-evidence-ledger-artifact-index.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-05-17: Loaded BMad dev-story workflow, project context, Story 1.3, sprint status, state/session schemas, contract guard, Story 1.2 evidence path/io/test patterns, and official Claude Code docs index.
- 2026-05-17: `npm run test:contracts` PASS.
- 2026-05-17: `npm run test:state` PASS.
- 2026-05-17: `npm run typecheck` PASS.
- 2026-05-17: `npm run verify` PASS.
- 2026-05-17: `claude plugin validate ./plugins/curdx-flow` PASS.
- 2026-05-17: Code review found and fixed unsupported future schemaVersion downgrade risk and mismatched state/session identity recovery risk.
- 2026-05-17: Re-ran `npm run test:contracts`, `npm run test:state`, `npm run typecheck`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow` after review fixes; all PASS.

### Implementation Plan

- Extend state/session contracts only where Story 1.3 requires concrete runtime fields.
- Implement `src/runtime/state/**` as a dependency-light local filesystem runtime module.
- Reuse Story 1.2 path and structured issue patterns for workspace boundary and atomic writes.
- Keep dirty baseline provider-injected so git adapter remains a future boundary.

### Completion Notes List

- Added workspace-local run/session state store under `.curdx/state/**` with safe path resolution, same-directory temp writes, atomic rename, structured read/write blockers, and recovery summary construction.
- Strengthened state/session contracts and runtime guards for verdict status, missing evidence, dirty baseline, generated file categories, artifact index path, unknown future fields, and legacy schema migration.
- Added dirty baseline capture and generated file classification helpers that preserve user-existing file ownership unless an explicit same-path change reason is provided.
- Added state runtime tests covering create/read/update, session resume, legacy migration, unknown-field preservation, malformed JSON blockers, read/mkdir/write/rename failures, dirty baseline, generated classification, and workspace escape boundaries.
- Added `npm run test:state` and included contracts/evidence/state runtime tests in `npm run verify`.
- Review fixes: future unsupported `schemaVersion` now blocks recovery instead of being downgraded; legacy partial dirty/generated fields are migrated safely; run/session file identity mismatches now produce recovery blockers.

### File List

- `package.json`
- `plugins/curdx-flow/schemas/session.schema.json`
- `plugins/curdx-flow/schemas/state-ledger.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/state/index.ts`
- `src/runtime/state/io.ts`
- `src/runtime/state/migration.ts`
- `src/runtime/state/paths.ts`
- `src/runtime/state/store.ts`
- `src/runtime/state/types.ts`
- `src/runtime/state/workspace.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/invalid/bad-enum.json`
- `tests/fixtures/contracts/invalid/unsupported-version.json`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/runtime/state/state-store.test.ts`

### Change Log

- 2026-05-17: Implemented run/session state runtime, strengthened state/session contracts, added state tests and verification gate coverage.
- 2026-05-17: Addressed code review findings for schemaVersion migration safety and state/session identity mismatch blockers.

## Senior Developer Review (AI)

### Review Date

2026-05-17

### Review Outcome

Approve

### Findings

- Fixed: Unsupported future `schemaVersion` values were initially treated as migratable because all non-1 versions were normalized to 1 before validation. `readRunState` and `readSessionState` now only migrate missing/0 legacy versions and return blocked recovery for unsupported future versions.
- Fixed: State/session files could be recovered even when the embedded `runId` or `sessionId` did not match the requested file identity. Reads now block with structured issues on identity mismatch.

### Verification

- `npm run test:contracts` PASS
- `npm run test:state` PASS
- `npm run typecheck` PASS
- `npm run verify` PASS
- `claude plugin validate ./plugins/curdx-flow` PASS
