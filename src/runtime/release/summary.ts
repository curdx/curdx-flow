import { redactReportText } from '../reports/redaction.ts';
import type { ReleaseDryRunVerdict } from './types.ts';

export function renderReleaseDryRunSummary(verdict: ReleaseDryRunVerdict): string {
  const lines = [
    `# Release Dry-Run: ${verdict.summary.headline}`,
    `Published: ${verdict.published ? 'true' : 'false'}`,
    `Version: ${verdict.version}`,
    `npm tag: ${verdict.npmTag}`,
    `Claude plugin tag: ${verdict.claudePluginTag}`,
    `Verdict: ${verdict.verdict}`,
    `Checks: ${countByStatus(verdict.checks, 'passed')} passed / ${verdict.checks.length} total`,
    `Missing evidence: ${verdict.missingEvidence.length}`,
    `Blockers: ${verdict.blockers.length}`,
    `Risk: ${verdict.riskLevel}`,
    `Next action: ${verdict.nextAction.summary}`,
  ];

  if (verdict.blockers.length > 0) {
    lines.push('Top blockers:');
    for (const blocker of verdict.blockers.slice(0, 5)) {
      lines.push(`- ${blocker.checkId}: ${blocker.reason}`);
    }
  }

  return redactReportText(lines.join('\n'), 1800).text;
}

function countByStatus(
  checks: ReleaseDryRunVerdict['checks'],
  status: ReleaseDryRunVerdict['checks'][number]['status'],
): number {
  return checks.filter((check) => check.status === status).length;
}
