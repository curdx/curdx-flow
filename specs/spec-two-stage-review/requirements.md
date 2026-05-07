---
spec: spec-two-stage-review
epic: superpowers-uplift
phase: requirements
created: 2026-05-07
---

# Requirements: spec-two-stage-review

## Goal

在 phase 边界（post-design / post-tasks）并行运行 spec-compliance + code-quality 双审查，把现有 spec-reviewer 收窄到 spec-compliance only，新增独立 `code-quality-reviewer` agent，提供 3-layer drift defense + SLSA-shape verification token + QuickMode advisory bypass。

## Success Criteria

- spec-reviewer 按 E1 audit 13-item map 收窄；spec-reviewer 输出零 [QUALITY] 字样
- 新 `code-quality-reviewer.md` 独立 prompt + 排除列表，与 spec-reviewer 域零重叠
- post-design / post-tasks 两个 phase 边界并行 dispatch 双 reviewer，coordinator 单真相源
- `verificationBlocks.<phase>.review` peer field 写入 SLSA-shape verdict
- `REVIEW_PASS` / `REVIEW_FAIL` final-line 协议字节相等保留（向后兼容）
- QuickMode 下 code-quality 降级 advisory，spec-compliance 保持 hard gate

## Glossary

- **Two-stage review** — 同一 phase 边界并行起两个独立 subagent，分别校验 spec-compliance / code-quality
- **Spec-compliance reviewer (narrowed)** — 现 `agents/spec-reviewer.md`，删除 [QUALITY] / [BOTH] 项后只保留 [COMPLIANCE]
- **Code-quality reviewer (new)** — 新 `agents/code-quality-reviewer.md`，专注 code smell / 安全 / 实现质量 / 可读性
- **3-layer drift defense** — (a) 独立 judge subagent thread / (b) isolated context（不见对方 output） / (c) 结构化 exclusion list
- **Verification token (SLSA-shape)** — `verificationBlocks.<phase>.review = {verdict, findings[], reviewerId, timestamp}`，与 spec A 的 verification block 同源
- **QuickMode bypass** — quickMode=true 时 code-quality reviewer 输出转 advisory，coordinator 不阻塞；spec-compliance 仍 block
- **Phase boundary** — research/requirements/design/tasks/execution 之间的状态机过渡点
- **Exclusion list** — reviewer prompt 内显式列出 "do NOT comment on X domain" 的禁区清单
- **REVIEW_PASS / REVIEW_FAIL** — 现有 reviewer 输出协议的最后一行字面量

## Personas

### Primary: spec workflow user (Claude in coordinator role)

需要在 design / tasks 完成后获得双视角审查信号，决定是否进入下一个 phase。希望 verdict 可机读、协议向后兼容、QuickMode 不被卡住。

### Secondary: spec author (writing artifacts that get reviewed)

写 design.md / tasks.md 的人，希望反馈来自两个独立维度（合规 + 质量），不重复、不互相合理化、给出可执行修复项。

## User Stories

### US-1: 创建 code-quality-reviewer agent

**As a** spec workflow coordinator
**I want to** invoke a dedicated code-quality-reviewer subagent with isolated prompt + exclusion list
**So that** code smell / 安全 / 实现质量审查独立于 spec-compliance，不被合理化

**Acceptance Criteria:**
- [ ] AC-1.1: 新文件 `plugins/curdx-flow/agents/code-quality-reviewer.md` 存在，front-matter 含 description / model
- [ ] AC-1.2: prompt 含 explicit exclusion list："do NOT comment on spec compliance / requirement traceability / phase artifact structure"
- [ ] AC-1.3: prompt 引用 `references/two-stage-review.md` 边界规则
- [ ] AC-1.4: 输出协议与 spec-reviewer 一致（最后一行 `REVIEW_PASS` / `REVIEW_FAIL` + markdown table）

### US-2: spec-reviewer 收窄到 spec-compliance only

**As a** spec workflow maintainer
**I want to** spec-reviewer prompt 按 E1 audit 13-item map 删除 / 拆分 / 移走 quality items
**So that** 双 reviewer 域零重叠，drift 可结构化检测

**Acceptance Criteria:**
- [ ] AC-2.1: Design / Principles 整段（7 items: SOLID/DRY/KISS/YAGNI 等）从 spec-reviewer 删除
- [ ] AC-2.2: Design / Holistic Awareness 5 items 拆分：保留 "must document cross-cutting impact"，移走 "demonstrates good architectural thinking"
- [ ] AC-2.3: Tasks / Quality Gates 2 items 拆分：保留 "[VERIFY] tasks exist where required"，移走 "[VERIFY] frequency optimal"
- [ ] AC-2.4: Execution / No Hallucinations 整段（6 items）从 spec-reviewer 删除，全部移到 code-quality-reviewer
- [ ] AC-2.5: spec-reviewer.md 全文 grep 不到 "code quality" / "smell" / "security" / "readability" 关键字

### US-3: post-design 并行双 reviewer

**As a** coordinator at post-design phase boundary
**I want to** parallel-dispatch spec-reviewer + code-quality-reviewer with isolated contexts
**So that** design.md 同时获得双视角 verdict，coordinator 单源 reconcile

**Acceptance Criteria:**
- [ ] AC-3.1: `commands/design.md` review 段读取 `references/bounded-parallel-dispatch.md` 并行规则
- [ ] AC-3.2: 双 reviewer 通过 Task API 独立 subagent_type 起，不共享 thread
- [ ] AC-3.3: coordinator 收两份 verdict 后做 reconciliation（不传递 A 的 output 给 B）
- [ ] AC-3.4: 任一 reviewer `REVIEW_FAIL` → coordinator 不进入下一 phase

### US-4: post-tasks 并行双 reviewer

**As a** coordinator at post-tasks phase boundary
**I want to** parallel-dispatch 双 reviewer 同样契约
**So that** tasks.md 在进入 execution 前完成双视角审查

**Acceptance Criteria:**
- [ ] AC-4.1: `commands/tasks.md` review 段同 US-3 契约
- [ ] AC-4.2: 与 post-design 共享同一 dispatch helper / inline pattern（DRY）
- [ ] AC-4.3: 双 PASS 才允许 coordinator 进入 execution

### US-5: SLSA-shape verification token 写入

**As a** downstream consumer of `verificationBlocks`
**I want to** review verdict 写入 `verificationBlocks.<phase>.review` peer field
**So that** review 通过证据与 spec A 的 command verification 同源可机读

**Acceptance Criteria:**
- [ ] AC-5.1: 字段 shape: `{verdict: "PASS"|"FAIL", findings: string[], reviewerId: "spec-compliance"|"code-quality", timestamp: ISO8601}`
- [ ] AC-5.2: peer field（与现有 `command/exitCode/timestamp/srcMtime` 同级），不嵌套也不替换
- [ ] AC-5.3: 写入走 `merge-state.mjs` 原子合并，不裸写
- [ ] AC-5.4: 双 reviewer 各自一条 review entry（数组或 keyed by reviewerId，design phase 决定）

### US-6: 3-layer drift defense

**As a** spec maintainer
**I want to** code-quality-reviewer prompt 含 3-layer drift defense
**So that** code-quality reviewer 不会偷偷复述 spec-compliance findings

**Acceptance Criteria:**
- [ ] AC-6.1: Layer 1（独立 judge）— 通过 Task API 起新 subagent，不在 coordinator thread 内 inline
- [ ] AC-6.2: Layer 2（isolated context）— code-quality-reviewer prompt 不包含 spec-reviewer output / spec-reviewer prompt 摘要
- [ ] AC-6.3: Layer 3（exclusion list）— prompt 显式 "do NOT" 清单覆盖 ≥4 个 spec-compliance 域（traceability / phase structure / requirement coverage / artifact format）
- [ ] AC-6.4: drift 测试 fixture：mock 一个 cross-domain finding，确认被 reviewer 自己标记或 coordinator 丢弃

### US-7: QuickMode bypass — code-quality advisory only

**As a** user running quick mode
**I want to** code-quality reviewer 降级为 advisory，spec-compliance 仍 block
**So that** 快路径 spec 不被双审查阻塞，但合规仍硬保

**Acceptance Criteria:**
- [ ] AC-7.1: `quickMode: true` 状态下 code-quality `REVIEW_FAIL` 不阻塞 coordinator
- [ ] AC-7.2: code-quality findings 以 `advisory` 标签写入 verificationBlocks
- [ ] AC-7.3: spec-compliance reviewer `REVIEW_FAIL` 在 quickMode 下仍硬阻塞
- [ ] AC-7.4: bypass 机制由 coordinator 分支实现（不引入新 env var；design 决定 state 字段还是分支）

### US-8: REVIEW_PASS / REVIEW_FAIL 协议向后兼容

**As a** existing parser of reviewer output
**I want to** final-line literal 字节级保留
**So that** 已有解析逻辑（commands / 测试）零改动

**Acceptance Criteria:**
- [ ] AC-8.1: spec-reviewer 输出最后一行 byte-equal 现状（trailing newline / 大小写一致）
- [ ] AC-8.2: code-quality-reviewer 输出最后一行同协议
- [ ] AC-8.3: 测试 assert byte-equal（不接受 normalize / trim 后等价）

### US-9: Walkthrough 文档展示双 reviewer verdict

**As a** spec author 阅读 walkthrough output
**I want to** 看到双 reviewer 各自的 verdict + findings
**So that** 知道 fail 来自哪个域，修复定位

**Acceptance Criteria:**
- [ ] AC-9.1: post-design / post-tasks walkthrough 节展示 spec-compliance + code-quality 两块结果
- [ ] AC-9.2: 任一 FAIL 在 walkthrough 顶部高亮 reviewerId
- [ ] AC-9.3: PASS 也展示（不静默），便于审计

### US-10: drift detection test

**As a** maintainer
**I want to** automated test 验证 drift defense 真有效
**So that** prompt 漂移在 CI 被截停

**Acceptance Criteria:**
- [ ] AC-10.1: `tests/runner/two-stage-review.test.ts` 存在
- [ ] AC-10.2: 测试 grep code-quality-reviewer.md 含 ≥4 个 exclusion 关键字
- [ ] AC-10.3: 测试 grep spec-reviewer.md 不含 quality 关键字（reverse assertion）
- [ ] AC-10.4: 测试 assert REVIEW_PASS / REVIEW_FAIL byte-equal protocol

### US-11: CHANGELOG entry

**As a** release reader
**I want to** v 升级时看到双审查变更记录
**So that** 升级影响可见

**Acceptance Criteria:**
- [ ] AC-11.1: `CHANGELOG.md` 顶部新条目按 Added/Changed 分类
- [ ] AC-11.2: 列出 new agent / narrowed agent / new reference / verificationBlocks peer field
- [ ] AC-11.3: 标注 "backwards compatible — REVIEW_PASS/FAIL protocol unchanged"

### US-12: two-stage-review reference doc

**As a** commands author / future maintainer
**I want to** 单一 reference 文档定义边界 / anti-rationalization 规则
**So that** prompt 与 commands 不重复 inline 同样规则

**Acceptance Criteria:**
- [ ] AC-12.1: 新文件 `plugins/curdx-flow/references/two-stage-review.md`
- [ ] AC-12.2: 含 spec-compliance vs code-quality 域边界表
- [ ] AC-12.3: 含 anti-rationalization 规则（reviewer 不得为对方 finding 找借口）
- [ ] AC-12.4: 被 code-quality-reviewer.md / spec-reviewer.md / commands/design.md / commands/tasks.md 显式 link

## Functional Requirements

### FR-Agent (code-quality-reviewer 创建)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-A1 | 新建 `agents/code-quality-reviewer.md` 含 front-matter (description / model) | High | 文件存在，YAML 解析通过 |
| FR-A2 | prompt 含 ≥4 项 exclusion list，覆盖 spec-compliance 域 | High | grep 关键字命中 |
| FR-A3 | prompt 引用 `references/two-stage-review.md` 边界 | High | grep link 命中 |
| FR-A4 | 输出协议复用 REVIEW_PASS/REVIEW_FAIL final-line | High | 测试 assert byte-equal |

### FR-Narrow (spec-reviewer 收窄)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-N1 | 删除 Design / Principles 7 items（SOLID/DRY/KISS/YAGNI 等） | High | grep 不命中 |
| FR-N2 | 拆分 Design / Holistic Awareness 5 items，保留 compliance side | High | 行数对比 + grep |
| FR-N3 | 拆分 Tasks / Quality Gates 2 items | High | grep |
| FR-N4 | 移除 Execution / No Hallucinations 6 items | High | grep |
| FR-N5 | 全文移除 "code quality / smell / security / readability" 字样 | High | reverse-grep CI gate |

### FR-Dispatch (并行 dispatch)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-D1 | `commands/design.md` review 段并行 dispatch 双 reviewer | High | 文档 grep + 测试 |
| FR-D2 | `commands/tasks.md` review 段并行 dispatch 双 reviewer | High | 文档 grep + 测试 |
| FR-D3 | 两个 commands 显式 link `references/bounded-parallel-dispatch.md` | High | grep |
| FR-D4 | coordinator 不传 reviewer A 的 output 给 reviewer B（独立 context） | High | dispatch pattern 验证 |

### FR-Token (verificationBlocks peer field)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-T1 | `verificationBlocks.<phase>.review` peer field shape 定义 | High | TS interface + JSON schema 对齐 |
| FR-T2 | 双 reviewer verdict 各自一条 entry，含 reviewerId | High | state 文件 inspect |
| FR-T3 | 写入走 `merge-state.mjs` 原子合并 | Medium | 代码 review |

### FR-Mode (QuickMode bypass)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-M1 | quickMode=true 时 code-quality FAIL 不阻塞 | High | fixture 测试 |
| FR-M2 | quickMode 下 spec-compliance FAIL 仍阻塞 | High | fixture 测试 |

### FR-Test (drift + protocol 测试)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-X1 | `tests/runner/two-stage-review.test.ts` 覆盖 file-existence + exclusion-grep | High | npm run test:hooks 绿 |
| FR-X2 | drift fixture：cross-domain finding 被丢弃 | Medium | fixture 测试 |
| FR-X3 | byte-equal protocol assertion | High | test 通过 |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | 向后兼容 | REVIEW_PASS/FAIL final-line byte-equal | 100% |
| NFR-2 | Prompt 隔离 | code-quality-reviewer 不读 spec-reviewer output | 0 leak |
| NFR-3 | 成本 | review 触发频率 | per-phase-boundary（非 per-task） |
| NFR-4 | 跨平台 | CI matrix（Ubuntu / macOS / Windows） | 全绿 |
| NFR-5 | 文档质量 | code-quality rubric 可追溯到 E1 audit 13-item map | 100% mapping |
| NFR-6 | 性能 | 双 reviewer 并行而非串行总耗时 | ≤ 单 reviewer 耗时 × 1.3 |
| NFR-7 | Drift 抗性 | 3-layer defense 全部存在 | 缺一即 CI fail |

## Out of Scope

- Per-task review（deferred — opt-in v2，研究 Q3 已给 10× 成本证据）
- Pre-commit / execution phase 双审查（HIGH difficulty per E2；v2）
- JSON schema validation 作为硬 gate（v1 advisory only；design 可选择是否提升）
- 重新评估已纳入 narrowed spec-reviewer 的 compliance items（假定 E1 audit 正确）
- post-research / post-requirements 阶段双审查（LOWER value，content not yet code）
- 新增 skill（避免 skill bloat 触顶）
- 改 `.curdx-state.json` schema 顶层结构（peer field 走现有 verificationBlocks 命名空间）

## Dependencies

### Internal

- **spec-verification-iron-law (✅ DONE)** — 提供 `verificationBlocks` state field；本 spec 在其 phase entry 上加 `review` peer field
- **spec-bounded-parallel-dispatch (✅ DONE, hard dep)** — 提供 `references/bounded-parallel-dispatch.md`；review 域规则 + 3 项独立性自检 + anti-pattern 列表

### External

- 无运行期 npm dep（保持本地优先约束）

## Open Questions for Design

1. Code-quality-reviewer prompt — 全新写 OR 从现 spec-reviewer [QUALITY] items 改写复用？
2. Drift defense JSON schema — v1 hard gate 还是 advisory？（research 倾向 advisory，design 可挑战）
3. Review verdict 存储 — `verificationBlocks.<phase>.review` peer field（推荐）还是顶层 `reviews` field？
4. Narrowed spec-reviewer — 保留全 5 phases 还是只 design / tasks（双审查实际作用面）？
5. QuickMode bypass 机制 — env var / state field / coordinator 分支？（research 倾向 coordinator 分支）
6. 双 reviewer 的 review entry — array of {reviewerId, ...} 还是 keyed object `{specCompliance: ..., codeQuality: ...}`？
7. drift fixture 测试形态 — mock subagent output 还是 prompt grep + manual fixture？

## Risks

1. **Prompt drift 后期回潮** — 收窄 spec-reviewer 后未来贡献者补充 quality items 倒灌；mitigation: NFR-7 reverse-grep CI gate
2. **双 reviewer 总耗时翻倍** — 串行实现等于 2× 成本；mitigation: NFR-6 强制并行 + bounded-parallel-dispatch 自检清单
3. **QuickMode bypass 错误降级 spec-compliance** — 实现 bug 把 compliance 也变 advisory；mitigation: FR-M2 显式 fixture 测试
4. **verificationBlocks peer field 与 spec A schema 冲突** — A 已 ship，加 peer field 不动 schema 顶层；mitigation: 用 additive approach + merge-state.mjs 原子写
5. **REVIEW_PASS/FAIL 协议被无意 normalize** — markdown linter / formatter 触碰 trailing newline；mitigation: byte-equal assertion + .editorconfig 锁定

## Validation Strategy

- **drift test** — `tests/runner/two-stage-review.test.ts` 验证 spec-reviewer.md 不含 quality 关键字 + code-quality-reviewer.md 含 ≥4 exclusion 关键字
- **fixture drift defense** — mock cross-domain finding，确认 coordinator 丢弃或 reviewer 自标记
- **byte-equal protocol** — assert REVIEW_PASS / REVIEW_FAIL final line 与现状字节相等
- **QuickMode fixture** — 跑 quickMode=true 的 fixture spec，code-quality FAIL 不阻塞，spec-compliance FAIL 仍阻塞
- **`npm run verify` 全绿** — typecheck + test:hooks + check:hooks-fresh 三关
- **walkthrough manual check** — design / tasks phase 跑一次完整流程，肉眼确认双 reviewer verdict 都呈现

## Next Steps

1. Run `/curdx-flow:design` to settle the 7 open questions（特别是 verdict storage shape + QuickMode 机制 + drift JSON schema 是否硬 gate）
2. Design phase enumerates exact `commands/*.md` edit list（plan.md 已暗示是 design.md / tasks.md，design 定稿）
3. Design 决定 prompt 复用 vs 重写策略（Q1）
4. Design 输出后进入 `/curdx-flow:tasks` 拆分实施任务（预计 10-15 tasks for M-size）
