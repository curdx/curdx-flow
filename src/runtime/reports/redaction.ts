import { redactSensitiveText } from '../evidence/index.ts';
import type { RedactionState } from './types.ts';

const DEFAULT_MAX_STRING_LENGTH = 240;
const sensitiveKeyPattern = /authorization|cookie|set-cookie|token|api[_-]?key|secret|password|session/i;

export interface RedactedString {
  text: string;
  redacted: boolean;
  truncated: boolean;
}

export function redactReportText(
  value: string,
  maxLength = DEFAULT_MAX_STRING_LENGTH,
  state?: RedactionState,
): RedactedString {
  const compact = value.replace(/\s+/g, ' ').trim();
  const redacted = redactSensitiveText(compact);
  const truncated = redacted.text.length > maxLength;
  const text = truncated ? `${redacted.text.slice(0, Math.max(0, maxLength - 3))}...` : redacted.text;

  if (state !== undefined) {
    state.redacted = state.redacted || redacted.redacted;
    state.truncated = state.truncated || truncated;
  }

  return {
    text,
    redacted: redacted.redacted,
    truncated,
  };
}

export function sanitizeForReport<T>(
  value: T,
  state: RedactionState,
  maxStringLength = DEFAULT_MAX_STRING_LENGTH,
): T {
  return sanitizeValue(value, state, maxStringLength) as T;
}

function sanitizeValue(value: unknown, state: RedactionState, maxStringLength: number, key?: string): unknown {
  if (typeof key === 'string' && sensitiveKeyPattern.test(key)) {
    state.redacted = true;
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactReportText(value, maxStringLength, state).text;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, state, maxStringLength));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = sanitizeValue(entryValue, state, maxStringLength, entryKey);
    }
    return output;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
