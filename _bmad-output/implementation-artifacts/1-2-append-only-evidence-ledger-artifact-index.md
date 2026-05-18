# Story 1.2: 追加式 Evidence Ledger 与 Artifact Index

Status: done

完成说明：Ultimate context engine analysis completed - comprehensive developer guide created

## Story

作为执行 curdx-flow 验证的开发者，
我希望每次命令、检查、截图、trace、API 响应、日志摘要和状态变化都被追加记录为可追踪 evidence，
以便完成结论可以回溯到新鲜、可审查、不会被覆盖的证据链。

## Acceptance Criteria

1. **Append-only evidence ledger：** 新 run 写入命令执行、服务检查、浏览器检查、API 检查、数据检查或 blocker 结果时，runtime 必须追加 evidence 条目，不得覆盖已有 evidence；重跑、修复、失败和回滚必须追加新条目并保留关联关系。[Source: `_bmad-output/planning-artifacts/epics.md#Story 1.2`]
2. **Artifact index 可追踪：** evidence 关联截图、trace、日志片段、请求响应摘要或报告文件时，artifact index 必须记录 workspace-relative 路径、artifact 类型、关联 `runId`、`goalId`、`attemptId`、`evidenceId`、隐私分类和摘要。
3. **隐私与体积边界：** artifact index 和报告投影不得直接写入 token、cookie、secret、完整生产数据或巨大日志；只能保存脱敏摘要、路径、hash 或可审查短摘要。
4. **Freshness 必填：** 新 evidence 缺少 freshness 信息时，写入必须失败或返回 `degraded`；freshness 至少表达 `validatedAt`、目标上下文、命令或文件目标摘要，使 verdict 后续能判断证据是否过期。
5. **Before/after/retry lineage：** 同一失败路径修复后重跑，新 evidence 必须能通过 `relatedEvidenceIds`、`supersedes` 或等价字段关联失败前 evidence，使报告能展示 before/after/retry 链路。
6. **写入失败不损坏旧文件：** evidence ledger 或 artifact index 写入异常时，旧文件不得损坏；runtime 必须返回结构化 `blocked` 或 `degraded` result，说明证据无法可靠保存。
7. **验证覆盖：** 最小验证命令必须包含 `npm run typecheck` 和 evidence ledger 相关合同/运行时测试；测试必须覆盖 append-only、未知字段兼容、invalid JSON、atomic write 失败、敏感字段摘要、artifact 路径关联。

## Tasks / Subtasks

- [x] 固定 Story 1.2 的 runtime 边界（AC: 1, 2, 6）
  - [x] 完整读取 `src/runtime/contracts/index.ts`、`plugins/curdx-flow/schemas/evidence.schema.json`、`plugins/curdx-flow/schemas/verification-report.schema.json` 和 `tests/contracts/runtime-contracts.test.ts`。
  - [x] 保留 Story 1.1 的 contract-first 模式：跨边界数据必须有 schema、TypeScript type、runtime guard、fixture 和 test。
  - [x] 不修改 `plugins/curdx-flow/hooks/scripts/**`；本 story 不实现 hook gate，不修改 generated hook bundle。

- [x] 新增 artifact index 合同并补强 evidence freshness 合同（AC: 2, 3, 4, 7）
  - [x] 新增 `plugins/curdx-flow/schemas/artifact-index.schema.json`，定义 artifact index entry 或 index file 的 shipped schema。
  - [x] 更新 `src/runtime/contracts/index.ts`，新增 `artifactIndex` contract name、TypeScript interface、schema mapping 和 guard rules。
  - [x] 补强 evidence freshness 校验：`freshness` 不能是空对象，至少包含 `validatedAt` 和一个目标指纹或目标摘要字段，例如 `commandHash`、`targetHash`、`fileTargets`、`environmentId`、`targetSummary`。
  - [x] 更新 `tests/fixtures/contracts/**`，保证 existing valid fixtures 带 freshness 内容，invalid fixtures 覆盖 missing/empty freshness 和 invalid artifact index。

- [x] 实现 `src/runtime/evidence/**`（AC: 1, 2, 4, 5, 6）
  - [x] 新建 `src/runtime/evidence/types.ts`，定义 `EvidenceLedgerEntry`、`ArtifactIndexEntry`、`EvidenceWriteInput`、`EvidenceWriteResult`、structured issue 类型；优先复用 `ContractIssue`/`EvidenceBlock`。
  - [x] 新建 `src/runtime/evidence/paths.ts`，集中解析 workspace-local 路径：默认 ledger 为 `.curdx/evidence/<runId>.jsonl`，默认 artifact index 为 `.curdx/artifacts/index.jsonl`；返回值必须是 workspace-relative 或 workspace 内绝对路径，不允许写入 workspace 外。
  - [x] 新建 `src/runtime/evidence/ledger.ts`，提供 `readEvidenceLedger`、`appendEvidence` 或等价 API；每条 evidence 一行 JSONL，读写时保留未知字段。
  - [x] 新建 `src/runtime/evidence/artifacts.ts`，提供 artifact index entry normalizer/append/read helper；artifact index 使用 JSONL 追加模型，避免为了更新 index 重写丢失历史。
  - [x] 新建 `src/runtime/evidence/privacy.ts`，提供最小脱敏/摘要 helper，覆盖 token/cookie/secret/API key/password 等常见敏感字段和大日志截断。
  - [x] 新建 `src/runtime/evidence/index.ts` 作为 public barrel，导出稳定 runtime API；不要让调用方直接拼路径或手写 JSONL。

- [x] 实现写入可靠性和结构化失败返回（AC: 4, 6）
  - [x] 写入前校验新 evidence 和 artifact entries；失败时返回 `{ ok: false, status: "blocked" | "degraded", issues }`，不要 throw string。
  - [x] 读取现有 ledger/index 时如果遇到 invalid JSON，返回包含文件路径、行号、schema/parse issue 的 blocker，不要继续追加到不可信链路。
  - [x] 追加写入必须保证旧文件不损坏。建议使用 same-directory temp file + copy old bytes + append line + atomic rename；测试通过注入失败点证明旧文件 byte-for-byte 保持。
  - [x] 创建 `.curdx/evidence/`、`.curdx/artifacts/` 目录时只在目标 workspace 下创建；不得向 `plugins/curdx-flow/**` 写 runtime evidence。

- [x] 实现 lineage、artifact 关联和摘要规则（AC: 2, 3, 5）
  - [x] 支持 `attemptId`、`relatedEvidenceIds`、`supersedes` 写入并保留到 ledger。
  - [x] artifact entry 必须含 `id`、`runId`、`goalId`、可选 `attemptId`、`evidenceId`、`type`、`path`、`privacy`、`summary`、`createdAt`。
  - [x] artifact `path` 必须是 workspace-relative，拒绝绝对路径、`..` 逃逸、空路径和巨大 inline body。
  - [x] 对 command/API/log artifact 只保存摘要和必要 hash；完整原始内容只能作为独立 artifact 文件路径引用，并带隐私分类。

- [x] 增加合同和运行时测试（AC: 1-7）
  - [x] 新增或扩展 `tests/contracts/runtime-contracts.test.ts`，覆盖 `artifactIndex` schema + guard、freshness 非空规则、未知字段保留。
  - [x] 新建 `tests/runtime/evidence/evidence-ledger.test.ts` 或等价路径，覆盖 append-only 顺序、重跑 lineage、artifact path 关联、invalid JSON blocker。
  - [x] 新建 atomic write failure fixture/test：模拟 temp write/rename 失败后，旧 ledger/index 文件内容不变。
  - [x] 新建 privacy summary test：输入包含 token/cookie/secret/password/长日志时，index summary 不泄露敏感值且长度受控。
  - [x] 使用 `mkdtemp` 创建临时 workspace，测试不得写真实 `.curdx/**` 到仓库根。

- [x] 更新脚本和验证记录（AC: 7）
  - [x] 如果新增 `tests/runtime/evidence/**`，建议新增 `npm run test:evidence` 并把它接入 `npm run verify`，或保证现有 `verify` 明确运行该测试。
  - [x] 运行 `npm run test:contracts`、evidence runtime 测试、`npm run typecheck`。
  - [x] 因新增 plugin-facing schema，运行 `claude plugin validate ./plugins/curdx-flow`。
  - [x] 若更新 `package.json`，同步 `package-lock.json`；不新增非 npm lockfile。

### Review Findings

- [x] [Review][Patch] Runtime path validation allowed trailing `.`/`..` segments, creating schema/guard drift and unsafe artifact paths [src/runtime/evidence/paths.ts:28]
- [x] [Review][Patch] JSONL read and directory creation failures could throw instead of returning structured blocker/degraded results [src/runtime/evidence/io.ts:27]

## Dev Notes

### 当前发现

- Story 1.1 已完成并通过 review，建立了 `plugins/curdx-flow/schemas/**`、`src/runtime/contracts/index.ts`、`tests/contracts/runtime-contracts.test.ts` 和 `tests/fixtures/contracts/**`。
- 当前 evidence schema 已存在，但 `freshness` 只是对象，允许空对象；Story 1.2 必须把 freshness 从“字段存在”提升为“可用于过期判断的内容存在”。
- 当前还没有 `src/runtime/evidence/**`。本 story 是 runtime evidence layer 的入口，不应把 ledger 写入逻辑放到 hooks、skills、registry 或 report renderer。
- 当前还没有独立 `artifact-index.schema.json`。由于 artifact index 是 runtime、reports、release gate 共享事实面，本 story 应补齐 schema/type/guard/fixture/test。
- `package.json` 已有 `npm run test:contracts` 且 `npm run verify` 已包含合同测试。新增 evidence runtime test 后必须接入验证路径。
- 工作区已有用户/流程产物未提交。修改前后都不要回滚无关文件，尤其不要清理 `_bmad-output/**`、`.agents/**`、`AGENTS.md` 等已有状态。

### Previous Story Intelligence

- Story 1.1 的 review 发现过一个关键问题：runtime guard 没覆盖 schema-only 约束。当前 story 新增任何 schema 约束时，必须同步 runtime guard 和测试，不能只改 JSON Schema。
- Story 1.1 使用 Ajv/Ajv Formats 作为 dev-time schema test tooling，但 runtime guards 依赖本地 TypeScript 校验，不把 Ajv 变成 production runtime dependency。Story 1.2 默认沿用这个模式，除非明确决定把 schema validation 放进发布 CLI。
- Story 1.1 已证明 `validateContract` 返回 `ok/value` 或 `issues` 的结构化结果，并保留 unknown fields。Evidence writer 应复用该返回风格，避免自然语言-only failure。
- Story 1.1 的验证链路已通过 `npm run test:contracts`、`npm run typecheck`、`npm run verify` 和 `claude plugin validate ./plugins/curdx-flow`。Story 1.2 不得降低这些 gate。

### Story-to-Structure Mapping

| Field | Required Content |
|---|---|
| Runtime Directory | 新增 `src/runtime/evidence/**`，必要时扩展 `src/runtime/contracts/index.ts`。 |
| Plugin Surface | 新增 `plugins/curdx-flow/schemas/artifact-index.schema.json`，并可能补强 `evidence.schema.json` freshness 规则。 |
| Workspace Artifacts | runtime 默认写 `.curdx/evidence/<runId>.jsonl` 和 `.curdx/artifacts/index.jsonl`；这些文件是目标 workspace runtime 产物，不提交到 plugin source。 |
| Contract Test | 扩展 `tests/contracts/**`，覆盖 artifact index 和 freshness 规则。 |
| Runtime Test | 新增 `tests/runtime/evidence/**`，覆盖 append-only、atomic failure、invalid JSON、privacy、path safety、lineage。 |
| Fixture | 扩展 `tests/fixtures/contracts/**`，新增 `tests/fixtures/runtime/evidence/**` 或在 runtime test 内临时生成。 |
| Report Surface | 本 story 只维护 artifact index 数据，不实现完整 report renderer；Story 1.5 负责人类/机器报告输出。 |
| Failure Mode | invalid JSON、empty freshness、unsafe path、atomic write failure、sensitive inline content 必须结构化 blocked/degraded。 |
| Verification Commands | `npm run test:contracts`、evidence runtime test、`npm run typecheck`、`claude plugin validate ./plugins/curdx-flow`。 |

### Implementation Shape Guidance

Evidence ledger 建议使用 JSONL，而不是一个可变 JSON array。每行是一条已通过 contract/runtime guard 的 evidence block。逻辑 append-only 意味着旧 evidence id 和旧行永远保留；即使实现使用 temp file + atomic rename，也只能在末尾增加新 JSON line。

Artifact index 同样建议使用 JSONL entry 模型。这样截图、trace、日志、请求响应摘要、报告文件都可以一条 artifact entry 一行追加，后续 report/release gate 可按 `runId`、`goalId`、`attemptId`、`evidenceId` 过滤。

建议的 public API 形态：

```ts
appendEvidence({
  workspaceRoot,
  evidence,
  artifacts,
  now,
}): Promise<EvidenceWriteResult>
```

`EvidenceWriteResult` 至少包含：

- `ok: boolean`
- `status: "passed" | "blocked" | "degraded"`
- `evidenceId`
- `ledgerPath`
- `artifactIndexPath`
- `artifactIds`
- `issues`

Freshness 最小可接受结构：

```json
{
  "validatedAt": "2026-05-16T23:57:15.000Z",
  "targetSummary": "npm run typecheck in workspace root",
  "commandHash": "sha256:...",
  "environmentId": "node-20-linux-or-darwin"
}
```

Artifact index entry 最小可接受结构：

```json
{
  "schemaVersion": 1,
  "id": "artifact_...",
  "runId": "run_...",
  "goalId": "goal_...",
  "attemptId": "attempt_...",
  "evidenceId": "ev_...",
  "type": "log",
  "path": ".curdx/artifacts/logs/typecheck-2026-05-16.log",
  "summary": "typecheck passed; 0 TypeScript errors",
  "privacy": {
    "classification": "internal",
    "containsSensitiveData": false,
    "redacted": true
  },
  "createdAt": "2026-05-16T23:57:15.000Z"
}
```

### Files To Read Before Editing

**UPDATE candidates:**

- `src/runtime/contracts/index.ts`: add `artifactIndex` contract and freshness guard alignment.
- `plugins/curdx-flow/schemas/evidence.schema.json`: tighten freshness only if fixtures/tests are updated together.
- `plugins/curdx-flow/schemas/verification-report.schema.json`: read only; do not make report renderer changes unless needed for artifact index reference compatibility.
- `tests/contracts/runtime-contracts.test.ts`: extend contract table and schema-only drift tests.
- `tests/fixtures/contracts/valid/contracts.json`: add artifact index fixture and non-empty freshness.
- `tests/fixtures/contracts/valid/unknown-fields.json`: preserve unknown field compatibility for evidence/artifact index.
- `tests/fixtures/contracts/invalid/*.json`: add invalid artifact index and freshness cases.
- `package.json` / `package-lock.json`: update only if adding a test script or dependency. Avoid new runtime dependency unless justified.

**NEW expected:**

- `plugins/curdx-flow/schemas/artifact-index.schema.json`
- `src/runtime/evidence/index.ts`
- `src/runtime/evidence/types.ts`
- `src/runtime/evidence/paths.ts`
- `src/runtime/evidence/ledger.ts`
- `src/runtime/evidence/artifacts.ts`
- `src/runtime/evidence/privacy.ts`
- `tests/runtime/evidence/evidence-ledger.test.ts`
- Optional fixtures under `tests/fixtures/runtime/evidence/**`

### Architecture Guardrails

- `src/runtime/evidence/` owns evidence ledger、artifact index、trust level、freshness；verdict evaluator 不在本 story 实现。[Source: `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`]
- Evidence Ledger 拥有证据状态；Skill/agent 只能协调、展示、提交 claim/marker，不得直接写 completion state。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-ARCH-002`]
- Evidence block 至少包含 `schemaVersion`、`id`、`runId`、`goalId`、`source`、`capabilityId`、`trustLevel`、`status`、`summary`、`artifacts`、时间、`freshness`、`privacy`、`redactions`。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-001`]
- Evidence Ledger 必须追加式写入；修复、重跑、回滚通过 `supersedes`、`relatedEvidenceIds` 或等价字段关联旧证据。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-002`]
- `.curdx/**` 中每个 artifact 必须能追溯到 session、goal、run、attempt 和 evidence id；`.curdx/**` 不得作为 shipped plugin state 提交。[Source: `_bmad-output/planning-artifacts/architecture.md#Workspace Artifact Boundary`]
- 修改 schema 时必须同步 `plugins/curdx-flow/schemas/**`、`src/runtime/**/types.ts`、runtime validation helpers、`tests/contracts/**` 和相关 fixtures。[Source: `_bmad-output/planning-artifacts/architecture.md#IP-SCHEMA-002`]
- 不得在 `plugins/curdx-flow/skills/**` 写复杂业务流程替代 runtime，不得在 `src/hooks/**` 放 browser/API/full-stack 验证，不得让 reports 自己判断 completion/release 是否通过。[Source: `_bmad-output/planning-artifacts/architecture.md#Structure Anti-Patterns`]

### Latest Claude Code / Library Information

- 官方文档索引已通过 `https://code.claude.com/docs/llms.txt` 重新核对；相关页面包括 plugins reference、hooks reference、plugin dependencies 和 goal。
- Claude Code plugin 是由 skills、agents、hooks、MCP servers 等 components 组成的 self-contained directory；新增 shipped schema 不应破坏 plugin component layout，变更后必须运行 `claude plugin validate ./plugins/curdx-flow`。Source: <https://code.claude.com/docs/en/plugins-reference>
- Plugin hooks 使用与用户 hooks 相同的 lifecycle events；command hook 通过 stdin 接收 JSON，stdout 只应输出协议结果。Story 1.2 不写 hook，但 evidence runtime 后续被 hook 调用时必须保持 stdout/stderr 协议干净。Source: <https://code.claude.com/docs/en/hooks>
- 官方 hook events 已包含 `TaskCompleted`、`PostToolBatch`、`Stop`、`StopFailure` 等生命周期点；Story 1.2 只做 ledger/index，Story 1.6 才负责 hook gate 边界测试。Source: <https://code.claude.com/docs/en/hooks>
- Plugin dependency tag/version parity 属于 Epic 6 release gate；不要把 release 判定混进 evidence writer。Source: <https://code.claude.com/docs/en/plugin-dependencies>

### Known Risks To Prevent

- 不要把 artifact index 当作 report 的附属数组藏在 `verification-report.schema.json` 里；它是独立事实面，应有自己的 schema/type/test。
- 不要只用 `fs.appendFile` 并宣称 atomic safety。测试必须能模拟写入失败并证明旧文件未损坏。
- 不要让 invalid JSON ledger 继续追加新 evidence。链路不可信时应返回 blocker/degraded，让上层报告缺失可靠 evidence。
- 不要把绝对路径、`..` 路径、完整 secret、完整 cookie、完整生产响应或大日志写进 index summary。
- 不要把 mock evidence 伪装成 verified evidence；mock/degraded 必须体现在 `trustLevel`、`status` 或 `privacy/degradation` 字段中。
- 不要把 Story 1.3 的 session/run state、Story 1.4 的 completion verdict、Story 1.5 的 report renderer 或 Story 1.6 的 hook gate 一并实现。

## Project Structure Notes

- Alignment: Story 1.2 填充架构中已经预留的 `src/runtime/evidence` 模块，并复用 Story 1.1 的 contract baseline。
- Detected conflict: 旧 hook/runtime helpers 中存在 `.curdx-state.json` 和 verification block 逻辑，但它们不是新的 evidence ledger。不要为了迁移旧状态去改 hook bundle；本 story 只建立新的 evidence/artifact 写入面。
- UX note: 无独立 UX 文档；本 story 的用户可见价值是后续报告能引用可审查 artifact，而不是新增 UI。

## References

- `_bmad-output/planning-artifacts/epics.md#Story 1.2`
- `_bmad-output/planning-artifacts/epics.md#FR Coverage Map`
- `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-001`
- `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-002`
- `_bmad-output/planning-artifacts/architecture.md#IP-EVIDENCE-003`
- `_bmad-output/planning-artifacts/architecture.md#Target Directory Contract`
- `_bmad-output/planning-artifacts/architecture.md#Workspace Artifact Boundary`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/1-1-evidence-status-verdict-report-contract-baseline.md`
- Claude Code docs index: <https://code.claude.com/docs/llms.txt>
- Claude Code plugins reference: <https://code.claude.com/docs/en/plugins-reference>
- Claude Code hooks reference: <https://code.claude.com/docs/en/hooks>
- Claude Code plugin dependencies: <https://code.claude.com/docs/en/plugin-dependencies>

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run test:contracts` red phase failed before implementation because `artifactIndex` was missing and evidence freshness schema allowed insufficient freshness.
- `npm run test:evidence` red phase failed before implementation because `src/runtime/evidence/index.ts` did not exist.
- `npm run test:contracts` passed after adding `artifact-index.schema.json`, artifact index guards, and freshness schema/guard alignment.
- `npm run test:evidence` passed after implementing append-only JSONL evidence ledger and artifact index runtime.
- `npm run typecheck`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow` passed.
- Code review patch validation passed after hardening path segments and read/write exception handling: `npm run test:contracts`, `npm run test:evidence`, `npm run typecheck`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow`.

### Implementation Plan

- Extend contracts first: artifact index schema/type/guard/fixtures and evidence freshness rules.
- Implement runtime evidence as a small, testable module with no dependency on hooks, skills, registry, reports, or verdict evaluator.
- Use workspace-local path helpers and JSONL files for append-only facts.
- Prove failure safety with runtime tests before claiming completion.

### Completion Notes List

- Added shipped `artifact-index` schema and `ArtifactIndexEntry` runtime contract.
- Tightened evidence freshness so fresh evidence needs `validatedAt` plus target context such as `commandHash`, `targetHash`, `fileTargets`, `environmentId`, or `targetSummary`.
- Implemented `src/runtime/evidence/**` with workspace-local paths, JSONL append-only ledger/index readers, artifact normalization, privacy redaction/summarization, and temp-file atomic append.
- Added structured blocker/degraded results for invalid contracts, invalid JSONL files, unsafe artifact paths, and atomic write failures.
- Added contract fixtures/tests and runtime tests for append-only writes, unknown field preservation, before/after lineage, artifact path association, invalid JSON blockers, privacy redaction, bounded summaries, and atomic failure preservation.
- Added `npm run test:evidence` and wired it into `npm run verify`.
- Resolved review findings by rejecting all `.`/`..` path segments in schema and runtime guards, normalizing artifact index default paths through path helpers, and converting JSONL read/mkdir/write failures into structured issues.
- Verification passed: `npm run test:contracts`, `npm run test:evidence`, `npm run typecheck`, `npm run verify`, and `claude plugin validate ./plugins/curdx-flow`.

### Change Log

- 2026-05-17: Implemented append-only evidence ledger and artifact index runtime for Story 1.2.
- 2026-05-17: Addressed code review findings and marked Story 1.2 done.

### File List

- `_bmad-output/implementation-artifacts/1-2-append-only-evidence-ledger-artifact-index.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package.json`
- `plugins/curdx-flow/schemas/artifact-index.schema.json`
- `plugins/curdx-flow/schemas/evidence.schema.json`
- `src/runtime/contracts/index.ts`
- `src/runtime/evidence/artifacts.ts`
- `src/runtime/evidence/index.ts`
- `src/runtime/evidence/io.ts`
- `src/runtime/evidence/ledger.ts`
- `src/runtime/evidence/paths.ts`
- `src/runtime/evidence/privacy.ts`
- `src/runtime/evidence/types.ts`
- `tests/contracts/runtime-contracts.test.ts`
- `tests/fixtures/contracts/invalid/bad-enum.json`
- `tests/fixtures/contracts/invalid/empty-freshness.json`
- `tests/fixtures/contracts/invalid/missing-required.json`
- `tests/fixtures/contracts/invalid/schema-only-rules.json`
- `tests/fixtures/contracts/invalid/unsupported-version.json`
- `tests/fixtures/contracts/valid/contracts.json`
- `tests/fixtures/contracts/valid/unknown-fields.json`
- `tests/runtime/evidence/evidence-ledger.test.ts`
