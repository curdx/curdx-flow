import { describe, expect, test } from 'vitest';
import { renderBlock, type ManagedItem } from '../../src/runner/claudeMd.ts';
import { setLang } from '../../src/i18n/index.ts';

const items: ManagedItem[] = [
  { id: 'curdx-flow', name: 'curdx-flow', type: 'plugin' },
  { id: 'claude-mem', name: 'claude-mem', type: 'plugin' },
  { id: 'context7', name: 'context7', type: 'mcp' },
];

describe('renderBlock language policy', () => {
  test('injects the language policy for zh', () => {
    setLang('zh');
    const block = renderBlock(items);

    expect(block).toContain('## Language Policy（语言规则）');
    expect(block).toContain('Tool and model interaction must be in English.');
    expect(block).toContain('All user-facing responses must be in Simplified Chinese.');
    expect(block).toContain('/claude-mem:mem-search');
    expect(block).toContain('/claude-mem:make-plan');
    expect(block).toContain('使用 Context7 MCP');
  });

  test('renders an english block without the zh-only language policy', () => {
    setLang('en');
    const block = renderBlock(items);

    expect(block).not.toContain('## Language Policy（语言规则）');
    expect(block).not.toContain('Tool and model interaction must be in English.');
    expect(block).not.toContain('All user-facing responses must be in Simplified Chinese.');
    expect(block).toContain('## Tool Combination Patterns');
    expect(block).toContain('Start with `/claude-mem:mem-search`');
    expect(block).toContain('use the Context7 MCP');
    expect(block).toContain('Run `npx @curdx/flow` to install / update / uninstall.');
  });
});
