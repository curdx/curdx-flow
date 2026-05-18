import type { VerificationCommandRiskLevel } from '../discovery/command-detection.ts';
import type { DiscoveryBlocker } from '../discovery/types.ts';
import type {
  CleanupAttempt,
  ServiceBlocker,
} from '../services/types.ts';
import type {
  RuntimeBlockerCategory,
  RuntimeBlockerOwner,
  RuntimeBlockerReport,
  RuntimeReadinessCommandAttempt,
} from './types.ts';

export function blockersFromDiscovery(input: {
  blockers: DiscoveryBlocker[];
  fixtureName?: string;
}): RuntimeBlockerReport[] {
  return input.blockers.map((blocker) => ({
    id: `topology:${blocker.code}:${safeId(blocker.path)}`,
    category: 'topology',
    code: blocker.code,
    message: blocker.summary,
    reproduction: {
      fixture: input.fixtureName,
      cwd: blocker.path,
    },
    attemptedActions: ['discover runtime topology'],
    nextAction: {
      owner: blocker.severity === 'blocked' ? 'target-project' : 'user',
      summary: blocker.severity === 'blocked'
        ? 'Fix project metadata so runtime topology can be discovered, then rerun readiness.'
        : 'Provide a project root, package metadata, or explicit runtime instructions.',
    },
    owner: blocker.severity === 'blocked' ? 'target-project' : 'user',
    riskLevel: blocker.severity === 'blocked' ? 'high' : 'medium',
    evidenceRefs: [`topology:${blocker.path}`],
  }));
}

export function blockerFromCommandAttempt(attempt: RuntimeReadinessCommandAttempt): RuntimeBlockerReport | null {
  if (attempt.status !== 'failed' && attempt.status !== 'blocked') return null;
  const commandText = formatCommand(attempt.command.executable, attempt.command.argv);
  return {
    id: `dependency:${attempt.id}`,
    category: attempt.purpose === 'install' ? 'dependency' : 'command',
    code: `${attempt.purpose}-command-${attempt.status}`,
    message: attempt.summary,
    reproduction: {
      command: attempt.command.executable,
      argv: [...attempt.command.argv],
      cwd: attempt.root,
      logArtifactPath: attempt.logArtifactPath,
    },
    attemptedActions: [commandText],
    nextAction: {
      owner: 'target-project',
      summary: attempt.purpose === 'install'
        ? 'Fix dependency installation or lockfile conflicts, then rerun runtime readiness.'
        : 'Fix the failing command and rerun runtime readiness.',
    },
    owner: 'target-project',
    riskLevel: attempt.purpose === 'install' ? 'high' : 'medium',
    evidenceRefs: [`command:${attempt.id}`],
    stdoutWindow: attempt.stdoutWindow,
    stderrWindow: attempt.stderrWindow,
  };
}

export function blockersFromServiceBlockers(blockers: ServiceBlocker[]): RuntimeBlockerReport[] {
  return blockers.map((blocker) => blockerFromServiceBlocker(blocker));
}

export function blockerFromServiceBlocker(blocker: ServiceBlocker): RuntimeBlockerReport {
  const category = categoryForServiceBlocker(blocker);
  const owner = ownerForCategory(category, blocker);
  return {
    id: `${category}:${blocker.serviceId}:${blocker.code}`,
    category,
    code: blocker.code,
    message: blocker.summary,
    reproduction: {
      command: blocker.command,
      argv: [...blocker.argv],
      cwd: blocker.root,
      serviceId: blocker.serviceId,
      logArtifactPath: blocker.logArtifactPath,
    },
    attemptedActions: [formatCommand(blocker.command, blocker.argv)],
    nextAction: {
      owner,
      summary: blocker.nextAction,
    },
    owner,
    riskLevel: riskForServiceBlocker(category, blocker),
    evidenceRefs: [`service:${blocker.serviceId}`],
    stdoutWindow: blocker.stdoutWindow,
    stderrWindow: blocker.stderrWindow,
  };
}

export function blockersFromCleanup(input: {
  attempts: CleanupAttempt[];
  blockers: ServiceBlocker[];
}): RuntimeBlockerReport[] {
  const failedAttempts = input.attempts
    .filter((attempt) => attempt.result === 'failed')
    .map((attempt) => ({
      id: `cleanup:${attempt.serviceId}`,
      category: 'cleanup' as const,
      code: 'service-cleanup-failed',
      message: attempt.summary,
      reproduction: {
        serviceId: attempt.serviceId,
        logArtifactPath: attempt.logArtifactPath,
      },
      attemptedActions: [`cleanup service ${attempt.serviceId}`],
      nextAction: {
        owner: 'user' as const,
        summary: attempt.nextAction,
      },
      owner: 'user' as const,
      riskLevel: 'high' as const,
      evidenceRefs: [`service:${attempt.serviceId}`],
    }));
  return [...failedAttempts, ...blockersFromServiceBlockers(input.blockers)];
}

function categoryForServiceBlocker(blocker: ServiceBlocker): RuntimeBlockerCategory {
  if (blocker.layer === 'port' || blocker.code.startsWith('port-conflict')) return 'port';
  if (blocker.layer === 'health' || blocker.code.startsWith('health-')) return 'health';
  if (blocker.layer === 'cleanup' || blocker.code.includes('cleanup')) return 'cleanup';
  if (blocker.layer === 'readiness' || blocker.code.includes('readiness') || blocker.code === 'frontend-success-backend-failed') return 'readiness';
  if (blocker.layer === 'artifact') return 'artifact';
  return 'service';
}

function ownerForCategory(category: RuntimeBlockerCategory, blocker: ServiceBlocker): RuntimeBlockerOwner {
  if (category === 'port' && blocker.code === 'port-conflict-user-existing') return 'user';
  if (category === 'cleanup') return 'user';
  if (category === 'artifact') return 'curdx-flow';
  if (category === 'readiness') return 'target-project';
  return 'target-project';
}

function riskForServiceBlocker(category: RuntimeBlockerCategory, blocker: ServiceBlocker): VerificationCommandRiskLevel {
  if (category === 'port' && blocker.code === 'port-conflict-user-existing') return 'high';
  if (category === 'cleanup') return 'high';
  if (category === 'artifact') return 'high';
  if (category === 'readiness') return 'medium';
  return 'medium';
}

function formatCommand(command: string, argv: string[]): string {
  return [command, ...argv].join(' ');
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'root';
}
