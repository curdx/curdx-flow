const MAX_SUMMARY_LENGTH = 500;

const sensitivePatterns: Array<[RegExp, string]> = [
  [/\b(Authorization|Cookie|Set-Cookie)\s*:\s*[^\n\r]+/gi, '$1: [REDACTED]'],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]'],
  [/\b(token|api[_-]?key|secret|password|session|cookie)\s*[:=]\s*["']?[^"'\s;,]+/gi, '$1=[REDACTED]'],
];

export interface SummaryResult {
  summary: string;
  redacted: boolean;
  truncated: boolean;
}

export function summarizeArtifactText(value: string, maxLength = MAX_SUMMARY_LENGTH): SummaryResult {
  const compact = value.replace(/\s+/g, ' ').trim();
  const redacted = redactSensitiveText(compact);
  const truncated = redacted.text.length > maxLength;
  const summary = truncated ? `${redacted.text.slice(0, Math.max(0, maxLength - 3))}...` : redacted.text;

  return {
    summary,
    redacted: redacted.redacted,
    truncated,
  };
}

export function redactSensitiveText(value: string): { text: string; redacted: boolean } {
  let next = value;
  let redacted = false;

  for (const [pattern, replacement] of sensitivePatterns) {
    const replaced = next.replace(pattern, replacement);
    if (replaced !== next) {
      redacted = true;
      next = replaced;
    }
  }

  return { text: next, redacted };
}
