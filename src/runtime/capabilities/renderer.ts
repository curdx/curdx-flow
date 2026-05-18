import type { CapabilityMatrix, CapabilityStatus } from './types.ts';

function overall(matrix: CapabilityMatrix): string {
  if (matrix.summary.blockers > 0) return 'blocked';
  if (matrix.summary.degraded > 0 || matrix.summary.unavailable > 0 || matrix.summary.skippedDeepChecks > 0) return 'degraded';
  return 'ready';
}

function tri(value: CapabilityStatus['configured']): string {
  return String(value);
}

function row(capability: CapabilityStatus): string {
  return [
    capability.id,
    capability.state,
    `configured=${tri(capability.configured)}`,
    `installed=${tri(capability.installed)}`,
    `callable=${tri(capability.callable)}`,
    `authorized=${tri(capability.authorized)}`,
    capability.reason,
  ].join(' | ');
}

export function renderCapabilityMatrix(matrix: CapabilityMatrix): string {
  const degraded = matrix.capabilities.filter((capability) =>
    capability.state === 'degraded' || capability.state === 'unavailable',
  );
  const impacts = degraded
    .flatMap((capability) =>
      capability.evidenceImpact.map((impact) => `- ${capability.id}: affects ${impact}`),
    );
  const nextActions = matrix.nextActions.length > 0
    ? matrix.nextActions.map((action, index) => `${index + 1}. ${action.capabilityId}: ${action.action}`)
    : ['none'];

  return [
    '# curdx-flow Doctor',
    '',
    `Overall: ${overall(matrix)}`,
    `Blockers: ${matrix.summary.blockers}`,
    `Degraded: ${matrix.summary.degraded}`,
    `Unavailable: ${matrix.summary.unavailable}`,
    `Skipped deep checks: ${matrix.summary.skippedDeepChecks}`,
    '',
    '## Capability Matrix',
    ...matrix.capabilities.map(row),
    '',
    '## Evidence Impact',
    ...(impacts.length > 0 ? impacts : ['none']),
    '',
    '## Next Actions',
    ...nextActions,
    '',
  ].join('\n');
}
