import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderBlock, type ManagedItem } from '../../src/runner/claudeMd.ts';
import { setLang } from '../../src/i18n/index.ts';

const items: ManagedItem[] = [
  { id: 'curdx-flow', name: 'curdx-flow', type: 'plugin' },
  { id: 'claude-mem', name: 'claude-mem', type: 'plugin' },
  { id: 'context7', name: 'context7', type: 'mcp' },
];

describe('renderBlock', () => {
  test('block is always English; injects Language Policy for zh', () => {
    setLang('zh');
    const block = renderBlock(items);

    expect(block).toContain('## Language Policy');
    expect(block).toContain('Tool and model interaction must be in English.');
    expect(block).toContain('All user-facing responses must be in Simplified Chinese.');
    expect(block).toContain('## Tool Combination Patterns');
    expect(block).toContain('use the Context7 MCP');
    expect(block).toContain('/claude-mem:mem-search');
    expect(block).toContain('/claude-mem:make-plan');
    // Body must be English even in zh mode (block is for the model, not the user).
    expect(block).not.toMatch(/[一-鿿]/);
  });

  test('en mode omits Language Policy section; body identical to zh body', () => {
    setLang('en');
    const block = renderBlock(items);

    expect(block).not.toContain('## Language Policy');
    expect(block).not.toContain('Tool and model interaction must be in English.');
    expect(block).not.toContain('All user-facing responses must be in Simplified Chinese.');
    expect(block).toContain('## Tool Combination Patterns');
    expect(block).toContain('Start with `/claude-mem:mem-search`');
    expect(block).toContain('use the Context7 MCP');
    expect(block).not.toContain('Run `npx @curdx/flow` to install / update / uninstall.');
  });
});

describe('skill alias resolution: reality-verification → verification-before-completion', () => {
  const skillsRoot = join(process.cwd(), 'plugins/curdx-flow/skills');
  const oldSkillDir = join(skillsRoot, 'reality-verification');
  const newSkillDir = join(skillsRoot, 'verification-before-completion');

  test('reality-verification/SKILL.md exists and contains DEPRECATED ALIAS marker', () => {
    const skillPath = join(oldSkillDir, 'SKILL.md');
    const stat = statSync(skillPath);
    expect(stat.isFile()).toBe(true);

    const body = readFileSync(skillPath, 'utf8');
    expect(body).toContain('DEPRECATED ALIAS');
  });

  test('verification-before-completion/SKILL.md exists with name field in frontmatter', () => {
    const skillPath = join(newSkillDir, 'SKILL.md');
    const stat = statSync(skillPath);
    expect(stat.isFile()).toBe(true);

    const body = readFileSync(skillPath, 'utf8');
    // Must be in YAML frontmatter (between leading --- markers).
    const frontmatterMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch![1];
    expect(frontmatter).toMatch(/^name:\s*verification-before-completion\s*$/m);
  });

  test('both skill directories exist and new skill has references/ subdirectory', () => {
    expect(statSync(oldSkillDir).isDirectory()).toBe(true);
    expect(statSync(newSkillDir).isDirectory()).toBe(true);

    const newSkillEntries = readdirSync(newSkillDir, { withFileTypes: true });
    const referencesEntry = newSkillEntries.find((e) => e.name === 'references');
    expect(referencesEntry).toBeDefined();
    expect(referencesEntry!.isDirectory()).toBe(true);
  });
});
