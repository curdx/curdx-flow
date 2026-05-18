import { redactReportText, sanitizeForReport } from './redaction.ts';
import type { EvidenceSummary, TranscriptSummaryInput } from './types.ts';

const DEFAULT_TRANSCRIPT_MAX_LENGTH = 900;

export function buildTranscriptSummary(input: TranscriptSummaryInput): string {
  const state = { redacted: false, truncated: false };
  const command = redactReportText(input.verifier?.command ?? 'not recorded', 180, state).text;
  const exitCode = input.verifier?.exitCode;
  const evidenceDigest = input.evidenceSummaries
    .slice(0, 5)
    .map((entry) => summarizeEvidenceDigest(entry, state))
    .join('; ') || 'none';
  const missingEvidence = summarizeMissingEvidence(input.missingEvidence, state);

  const lines = [
    `Verifier: ${command}`,
    `Exit code: ${typeof exitCode === 'number' ? exitCode : 'not recorded'}`,
    ...(input.mode === undefined ? [] : [`Mode: ${input.mode}`]),
    ...(input.reportOnly === undefined ? [] : [`Report-only: ${input.reportOnly ? 'true' : 'false'}`]),
    ...(input.sourceChanges === undefined ? [] : [`Source changes: ${input.sourceChanges.summary}`]),
    ...(input.blockingIssueCount === undefined ? [] : [`Blocking issues: ${input.blockingIssueCount}`]),
    ...(input.warningIssueCount === undefined ? [] : [`Warning issues: ${input.warningIssueCount}`]),
    ...(input.manualConfirmationCount === undefined ? [] : [`Manual confirmation required: ${input.manualConfirmationCount}`]),
    ...(input.nextActionOwner === undefined ? [] : [`Next action owner: ${input.nextActionOwner}`]),
    `Evidence: ${evidenceDigest}`,
    `Missing evidence: ${missingEvidence}`,
    `Final verdict: ${input.finalVerdict}`,
  ];

  return redactReportText(lines.join('\n'), input.maxLength ?? DEFAULT_TRANSCRIPT_MAX_LENGTH, state).text;
}

function summarizeEvidenceDigest(entry: EvidenceSummary, state: { redacted: boolean; truncated: boolean }): string {
  const summary = redactReportText(entry.summary, 120, state).text;
  return `${entry.id} ${entry.status} ${entry.trustLevel} - ${summary}`;
}

function summarizeMissingEvidence(input: unknown[], state: { redacted: boolean; truncated: boolean }): string {
  if (input.length === 0) return 'none';
  const sanitized = sanitizeForReport(input, state, 120);
  if (!Array.isArray(sanitized)) return redactReportText(String(sanitized), 180, state).text;

  return sanitized
    .slice(0, 5)
    .map((item) => {
      if (isRecord(item)) {
        const id = typeof item.id === 'string' ? item.id : undefined;
        const description = typeof item.description === 'string' ? item.description : undefined;
        const reason = typeof item.reason === 'string' ? item.reason : undefined;
        return [id, description, reason].filter(Boolean).join(' - ') || JSON.stringify(item);
      }
      return String(item);
    })
    .join('; ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
