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
