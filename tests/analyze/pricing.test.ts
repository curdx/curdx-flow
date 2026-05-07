// Unit tests for src/analyze/pricing.ts (Phase 3 Task 3.1).
//
// Coverage (design.md §Test Strategy unit / AC1):
//   1. PRICING — three model × five fields verbatim against design.md table
//   2. resolveModelId('claude-haiku-4-5') → 'claude-haiku-4-5-20251001' (alias)
//   3. resolveModelId('unknown') → undefined (unknown model skip)
//   4. LAST_UPDATED — ISO date format + ≤ 90 day staleness gate (NFR-8)
//   5. SOURCE_URL — points to platform.claude.com canonical pricing page

import { describe, it, expect } from 'vitest';

import {
  PRICING,
  MODEL_ALIASES,
  LAST_UPDATED,
  SOURCE_URL,
  resolveModelId,
} from '../../src/analyze/pricing.ts';

describe('PRICING table — three model × five fields', () => {
  it('Opus 4.7 — 5 / 25 / 0.1 / 1.25 / 2', () => {
    const p = PRICING['claude-opus-4-7'];
    if (!p) throw new Error('PRICING entry missing for claude-opus-4-7');
    expect(p.inputPerMTok).toBe(5);
    expect(p.outputPerMTok).toBe(25);
    expect(p.cacheReadMul).toBe(0.1);
    expect(p.cache5mWriteMul).toBe(1.25);
    expect(p.cache1hWriteMul).toBe(2);
  });

  it('Sonnet 4.6 — 3 / 15 / 0.1 / 1.25 / 2', () => {
    const p = PRICING['claude-sonnet-4-6'];
    if (!p) throw new Error('PRICING entry missing for claude-sonnet-4-6');
    expect(p.inputPerMTok).toBe(3);
    expect(p.outputPerMTok).toBe(15);
    expect(p.cacheReadMul).toBe(0.1);
    expect(p.cache5mWriteMul).toBe(1.25);
    expect(p.cache1hWriteMul).toBe(2);
  });

  it('Haiku 4.5 — 1 / 5 / 0.1 / 1.25 / 2', () => {
    const p = PRICING['claude-haiku-4-5-20251001'];
    if (!p) throw new Error('PRICING entry missing for claude-haiku-4-5-20251001');
    expect(p.inputPerMTok).toBe(1);
    expect(p.outputPerMTok).toBe(5);
    expect(p.cacheReadMul).toBe(0.1);
    expect(p.cache5mWriteMul).toBe(1.25);
    expect(p.cache1hWriteMul).toBe(2);
  });
});

describe('resolveModelId — alias-then-direct lookup', () => {
  it('alias claude-haiku-4-5 → claude-haiku-4-5-20251001', () => {
    expect(resolveModelId('claude-haiku-4-5')).toBe('claude-haiku-4-5-20251001');
    // Sanity: alias map carries the entry (FR-PRICING-3).
    expect(MODEL_ALIASES['claude-haiku-4-5']).toBe('claude-haiku-4-5-20251001');
  });

  it('direct hits (Opus 4.7 / Sonnet 4.6 / Haiku dated) return same key', () => {
    expect(resolveModelId('claude-opus-4-7')).toBe('claude-opus-4-7');
    expect(resolveModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001');
  });

  it('unknown model → undefined (caller skips row, no throw)', () => {
    expect(resolveModelId('unknown-model')).toBeUndefined();
    expect(resolveModelId('gpt-4')).toBeUndefined();
    expect(resolveModelId('')).toBeUndefined();
    expect(resolveModelId(undefined)).toBeUndefined();
  });
});

describe('LAST_UPDATED — ISO date + ≤ 90 day staleness gate (NFR-8)', () => {
  it('matches YYYY-MM-DD ISO format', () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is parseable as a real Date (not NaN)', () => {
    const d = new Date(LAST_UPDATED);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it('is within 90 days of today (refresh cadence guard)', () => {
    const updated = new Date(LAST_UPDATED).getTime();
    const now = Date.now();
    const ageDays = (now - updated) / (1000 * 60 * 60 * 24);
    // Allow small clock skew on the lower bound; upper bound is the NFR-8 gate.
    expect(ageDays).toBeGreaterThanOrEqual(-1);
    expect(ageDays).toBeLessThanOrEqual(90);
  });
});

describe('SOURCE_URL — canonical Anthropic pricing page', () => {
  it('contains platform.claude.com host', () => {
    expect(SOURCE_URL).toContain('platform.claude.com');
  });

  it('is an https URL', () => {
    expect(SOURCE_URL.startsWith('https://')).toBe(true);
  });
});
