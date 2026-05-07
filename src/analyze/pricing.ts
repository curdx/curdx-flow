// Static pricing table for OB-3 cost analytics (Task 1.2).
//
// Pure module — zero npm runtime deps, zero side effects on import (NFR-3).
// Anthropic three-source verified (research.md §Pricing): platform docs +
// pricing API + ccusage public table all agree on per-MTok USD and the
// cache multipliers (cache_read = 0.1× input, cache_5m_write = 1.25× input,
// cache_1h_write = 2× input).
//
// `LAST_UPDATED` is the human refresh marker; README ships a 3-step refresh
// flow (NFR-8: ≤ 90 days drift). `SOURCE_URL` lets a maintainer one-click
// re-verify without grepping git log.
//
// `MODEL_ALIASES` covers short-name → canonical-id (e.g. the unversioned
// `claude-haiku-4-5` short form transcripts sometimes carry vs. the dated
// `claude-haiku-4-5-20251001` PRICING key).
//
// `resolveModelId` is alias-then-direct so unversioned names map first; an
// unknown model returns `undefined` and the cost.ts caller skips that row +
// logs an `analyze_internal_error` event (Error Handling table, design.md).

/**
 * ModelPrice — per-MTok USD + cache write/read multipliers.
 *
 * The base `inputPerMTok` is the unit; cache-read / cache-write tokens are
 * priced as `inputPerMTok × <mul>` per Anthropic's pricing schema (research
 * §Pricing three-source verified).
 */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadMul: number;
  cache5mWriteMul: number;
  cache1hWriteMul: number;
}

export const PRICING: Record<string, ModelPrice> = {
  'claude-opus-4-7': {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadMul: 0.1,
    cache5mWriteMul: 1.25,
    cache1hWriteMul: 2,
  },
  'claude-sonnet-4-6': {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheReadMul: 0.1,
    cache5mWriteMul: 1.25,
    cache1hWriteMul: 2,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheReadMul: 0.1,
    cache5mWriteMul: 1.25,
    cache1hWriteMul: 2,
  },
};

export const MODEL_ALIASES: Record<string, string> = {
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

/** ISO date — last manual refresh of PRICING vs Anthropic source-of-truth. */
export const LAST_UPDATED = '2026-05-07';

/** Canonical Anthropic pricing page; README refresh flow points here. */
export const SOURCE_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';

/**
 * Resolve a transcript model string to a canonical PRICING key.
 *
 * Lookup order:
 *   1. MODEL_ALIASES (short-name → dated id)
 *   2. PRICING direct hit
 *   3. `undefined` (caller skips the row; cost.ts logs the unknown model)
 */
export function resolveModelId(modelStr: string | undefined): string | undefined {
  if (!modelStr) return undefined;
  const aliased = MODEL_ALIASES[modelStr];
  if (aliased && aliased in PRICING) return aliased;
  if (modelStr in PRICING) return modelStr;
  return undefined;
}
