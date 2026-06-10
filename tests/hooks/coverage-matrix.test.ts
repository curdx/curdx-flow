import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCoverageReport,
  parseRequirementIds,
  parseTaskRequirementRefs,
  renderCoverageReport,
} from '../../src/hooks/lib/coverage-matrix.ts';

const REQUIREMENTS_FIXTURE = `# Requirements: demo

## User Stories

### US-1: Add todos

**Acceptance Criteria:**
- AC-1.1: Pressing enter adds a todo
- AC-1.2: Empty input is rejected

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Add todo | High | enter adds row |
| FR-2 | Delete todo | Medium | delete removes row |

## Non-Functional Requirements

| ID | Requirement | Metric | Target |
|----|-------------|--------|--------|
| NFR-1 | Performance | p95 | <100ms |

## Success Criteria

- SC-1: User can add and delete todos end-to-end
- SC-2: No console errors during the critical flow
`;

const FULL_COVERAGE_TASKS = `# Tasks: demo

## Phase 1

- [ ] 1.1 Add todo input
  - **Verify**: npm test
  - _Requirements: FR-1, AC-1.1, AC-1.2, US-1_

- [ ] 1.2 Delete button
  - **Verify**: npm test
  - _Requirements: FR-2, NFR-1_

- [ ] 1.3 POC Checkpoint
  - **Verify**: npm run test:e2e
  - _Requirements: SC-1, SC-2_
`;

const UNCOVERED_FR_TASKS = `# Tasks: demo

- [ ] 1.1 Add todo input
  - _Requirements: FR-1, SC-1, SC-2, AC-1.1_
`;

const ORPHAN_REF_TASKS = `# Tasks: demo

- [ ] 1.1 Add todo input
  - _Requirements: FR-1, FR-9_

- [ ] 1.2 Delete button
  - _Requirements: FR-2, SC-1, SC-2_
`;

const FREEFORM_REQUIREMENTS = `# Requirements: demo

The system should let users add todos quickly.

Goals:
- fast entry
- no empty submissions
`;

describe('parseRequirementIds', () => {
  it('extracts FR/NFR table rows, US headings, and AC/SC bullets', () => {
    const defs = parseRequirementIds(REQUIREMENTS_FIXTURE);
    expect(defs.map((d) => d.id)).toEqual([
      'US-1',
      'AC-1.1',
      'AC-1.2',
      'FR-1',
      'FR-2',
      'NFR-1',
      'SC-1',
      'SC-2',
    ]);
    expect(defs.find((d) => d.id === 'SC-1')?.kind).toBe('SC');
    expect(defs.find((d) => d.id === 'AC-1.2')?.kind).toBe('AC');
  });

  it('ignores prose mentions without definition shape and dedupes ids', () => {
    const defs = parseRequirementIds('See FR-1 for details.\n- FR-1: defined here\n- FR-1: duplicate\n');
    expect(defs).toHaveLength(1);
    expect(defs[0]?.id).toBe('FR-1');
  });

  it('accepts table rows indented up to 3 spaces but not 4-space code blocks', () => {
    const defs = parseRequirementIds(
      '   | FR-1 | indented table | High | ok |\n    | FR-2 | code block | High | no |\n',
    );
    expect(defs.map((d) => d.id)).toEqual(['FR-1']);
  });

  it('returns no ids for freeform requirements', () => {
    expect(parseRequirementIds(FREEFORM_REQUIREMENTS)).toEqual([]);
  });
});

describe('parseTaskRequirementRefs', () => {
  it('collects footnote ids per task', () => {
    const refs = parseTaskRequirementRefs(FULL_COVERAGE_TASKS);
    expect(refs).toHaveLength(3);
    expect(refs[0]?.taskId).toBe('1.1');
    expect(refs[0]?.refs).toEqual(['FR-1', 'AC-1.1', 'AC-1.2', 'US-1']);
    expect(refs[2]?.refs).toEqual(['SC-1', 'SC-2']);
  });

  it('returns empty refs for tasks without footnotes', () => {
    const refs = parseTaskRequirementRefs('- [ ] 1.1 No refs here\n  - **Verify**: true\n');
    expect(refs[0]?.refs).toEqual([]);
  });
});

describe('buildCoverageReport', () => {
  it('passes with full coverage', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: FULL_COVERAGE_TASKS,
    });
    expect(report.ok).toBe(true);
    expect(report.uncovered).toEqual([]);
    expect(report.orphans).toEqual([]);
    expect(report.covered.find((e) => e.id === 'FR-2')?.tasks).toEqual(['1.2']);
    expect(report.referencingTaskCount).toBe(3);
  });

  it('fails on an uncovered FR and keeps NFR/AC advisory', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: UNCOVERED_FR_TASKS,
    });
    expect(report.ok).toBe(false);
    expect(report.criticalGaps).toEqual(['FR-2']);
    const advisory = report.uncovered.filter((e) => !e.critical).map((e) => e.id);
    expect(advisory).toEqual(['US-1', 'AC-1.2', 'NFR-1']);
  });

  it('fails on an uncovered SC', () => {
    const report = buildCoverageReport({
      requirementsText: '## Success Criteria\n\n- SC-1: outcome\n',
      tasksText: '- [ ] 1.1 Task\n  - _Requirements: FR-1_\n',
    });
    expect(report.ok).toBe(false);
    expect(report.criticalGaps).toEqual(['SC-1']);
  });

  it('reports orphan footnote references without failing the gate', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: ORPHAN_REF_TASKS,
    });
    expect(report.orphans).toEqual([
      { ref: 'FR-9', taskId: '1.1', taskTitle: 'Add todo input' },
    ]);
    expect(report.criticalGaps).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('does not pass vacuously when requirements yield zero parseable ids', () => {
    const report = buildCoverageReport({
      requirementsText: FREEFORM_REQUIREMENTS,
      tasksText: FULL_COVERAGE_TASKS,
    });
    expect(report.evaluable).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.requirements).toEqual([]);
    expect(report.orphans.length).toBeGreaterThan(0);
  });

  it('marks evaluable reports as evaluable', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: FULL_COVERAGE_TASKS,
    });
    expect(report.evaluable).toBe(true);
  });
});

describe('renderCoverageReport', () => {
  it('renders PASS with the matrix', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: FULL_COVERAGE_TASKS,
    });
    const text = renderCoverageReport(report, 'demo');
    expect(text).toContain('coverage: demo');
    expect(text).toContain('FR-1 <- 1.1');
    expect(text).toContain('RESULT: PASS');
  });

  it('renders CRITICAL lines and FAIL verdict', () => {
    const report = buildCoverageReport({
      requirementsText: REQUIREMENTS_FIXTURE,
      tasksText: UNCOVERED_FR_TASKS,
    });
    const text = renderCoverageReport(report, 'demo');
    expect(text).toContain('CRITICAL FR-2');
    expect(text).toContain('RESULT: FAIL — 1 critical gap(s): FR-2');
  });

  it('renders CANNOT EVALUATE when no requirement ids were parsed', () => {
    const report = buildCoverageReport({
      requirementsText: FREEFORM_REQUIREMENTS,
      tasksText: FULL_COVERAGE_TASKS,
    });
    const text = renderCoverageReport(report, 'demo');
    expect(text).toContain('RESULT: CANNOT EVALUATE');
    expect(text).toContain('FR-#/NFR-#/SC-#/AC-#.#/US-#');
    expect(text).not.toContain('RESULT: PASS');
  });
});

describe('runtime-cli coverage verb', () => {
  const workspaces: string[] = [];
  const cli = join(
    process.cwd(),
    'plugins',
    'curdx-flow',
    'hooks',
    'scripts',
    'lib',
    'runtime-cli.mjs',
  );

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function specWorkspace(
    tasksText: string,
    requirementsText: string = REQUIREMENTS_FIXTURE,
  ): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'curdx-coverage-'));
    workspaces.push(dir);
    const specDir = join(dir, 'specs', 'demo');
    await mkdir(specDir, { recursive: true });
    await writeFile(join(dir, 'specs', '.current-spec'), 'demo\n');
    await writeFile(join(specDir, 'requirements.md'), requirementsText);
    await writeFile(join(specDir, 'tasks.md'), tasksText);
    return dir;
  }

  it('exits 0 and prints PASS on full coverage', async () => {
    const cwd = await specWorkspace(FULL_COVERAGE_TASKS);
    const result = spawnSync(process.execPath, [cli, 'coverage', '--cwd', cwd], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RESULT: PASS');
  });

  it('exits 1 on a CRITICAL gap and exposes it via --json', async () => {
    const cwd = await specWorkspace(UNCOVERED_FR_TASKS);
    const result = spawnSync(process.execPath, [cli, 'coverage', '--cwd', cwd, '--json'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; criticalGaps: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.criticalGaps).toEqual(['FR-2']);
  });

  it('exits 2 when requirements.md yields zero parseable ids even though tasks cite ids', async () => {
    const cwd = await specWorkspace(FULL_COVERAGE_TASKS, FREEFORM_REQUIREMENTS);
    const result = spawnSync(process.execPath, [cli, 'coverage', '--cwd', cwd], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no stable requirement IDs');
    expect(result.stderr).toContain('templates/requirements.md');
    expect(result.stdout).not.toContain('RESULT: PASS');
  });

  it('exits 2 when no active spec exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'curdx-coverage-empty-'));
    workspaces.push(dir);
    const result = spawnSync(process.execPath, [cli, 'coverage', '--cwd', dir], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('no active spec');
  });
});
