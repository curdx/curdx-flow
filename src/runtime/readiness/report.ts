import type { RuntimeReadinessResult } from './types.ts';

export function renderRuntimeReadinessReport(result: RuntimeReadinessResult): string {
  const lines = [
    '# Runtime Readiness',
    '',
    `Runtime readiness: ${result.status}`,
    `Topology: ${result.topology.overallType} (${result.topology.status})`,
    `Commands: ${result.commandPlan.summary.selected}/${result.commandPlan.summary.total} selected`,
  ];

  if (result.services) {
    lines.push(`Services: ${Object.keys(result.services.services).length}`);
    lines.push(`Cleanup: ${result.services.cleanup.status}`);
  }

  if (result.skips.length > 0) {
    lines.push('', '## Skips');
    for (const skip of result.skips) {
      lines.push(`- ${skip.category}: ${skip.reason}`);
      if (skip.command) lines.push(`  Command: ${[skip.command, ...(skip.argv ?? [])].join(' ')}`);
    }
  }

  if (result.blockers.length > 0) {
    lines.push('', '## Blockers');
    for (const blocker of result.blockers) {
      lines.push(`- [${blocker.category}] ${blocker.code}: ${blocker.message}`);
      if (blocker.reproduction.command) {
        lines.push(`  Reproduction: ${[blocker.reproduction.command, ...(blocker.reproduction.argv ?? [])].join(' ')} (cwd: ${blocker.reproduction.cwd ?? '.'})`);
      }
      if (blocker.reproduction.logArtifactPath) {
        lines.push(`  Log: ${blocker.reproduction.logArtifactPath}`);
      }
      if (blocker.stderrWindow) {
        lines.push(`  Stderr: ${compact(blocker.stderrWindow)}`);
      }
      if (blocker.stdoutWindow) {
        lines.push(`  Stdout: ${compact(blocker.stdoutWindow)}`);
      }
      lines.push(`  Attempted: ${blocker.attemptedActions.join('; ') || 'not recorded'}`);
      lines.push(`  Evidence: ${blocker.evidenceRefs.join(', ') || 'not recorded'}`);
      lines.push(`  Next action: ${blocker.nextAction.summary}`);
      lines.push(`  Owner: ${blocker.owner}; Risk: ${blocker.riskLevel}`);
    }
  }

  if (result.evidence.evidence.length > 0) {
    lines.push('', '## Evidence');
    for (const evidence of result.evidence.evidence) {
      lines.push(`- ${evidence.id}: ${evidence.status}; trust=${evidence.trustLevel}; ${evidence.summary}`);
    }
    for (const artifact of result.evidence.artifacts) {
      lines.push(`- artifact ${artifact.id}: ${artifact.path}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 240);
}
