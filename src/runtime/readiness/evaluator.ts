import { join } from 'node:path';

import {
  detectVerificationCommands,
  type VerificationCommandCandidate,
  type VerificationCommandPurpose,
} from '../discovery/command-detection.ts';
import { discoverRuntimeTopology } from '../discovery/project-topology.ts';
import {
  cleanupServices,
  createServiceStartPlanFromCandidate,
  evaluateServiceReadiness,
  startServices,
} from '../services/lifecycle.ts';
import type {
  MultiServiceLifecycleResult,
  ServiceReadinessResult,
  ServiceStartPlan,
} from '../services/types.ts';
import {
  blockerFromCommandAttempt,
  blockersFromCleanup,
  blockersFromDiscovery,
  blockersFromServiceBlockers,
} from './blockers.ts';
import { buildRuntimeEvidenceBundle, persistRuntimeEvidenceBundle } from './evidence.ts';
import { renderRuntimeReadinessReport } from './report.ts';
import type {
  RuntimeBlockerReport,
  RuntimeReadinessInput,
  RuntimeReadinessResult,
  RuntimeReadinessServiceOverride,
  RuntimeReadinessSkip,
  RuntimeReadinessStatus,
} from './types.ts';

export async function evaluateRuntimeReadiness(input: RuntimeReadinessInput): Promise<RuntimeReadinessResult> {
  const generatedAt = normalizeDate(input.generatedAt);
  const topology = await discoverRuntimeTopology({
    workspaceRoot: input.workspaceRoot,
    generatedAt,
  });
  const commandPlan = detectVerificationCommands({
    topology,
    generatedAt,
    mode: input.mode ?? 'verification',
  });
  const skips = externalToolSkips(commandPlan.commands, input);
  const blockers: RuntimeBlockerReport[] = [
    ...blockersFromDiscovery({ blockers: topology.blockers, fixtureName: input.fixtureName }),
  ];
  const dependencyBlocker = input.dependencyCheck ? blockerFromCommandAttempt(input.dependencyCheck) : null;
  if (dependencyBlocker) blockers.push(dependencyBlocker);

  const servicePlans = buildServicePlans(input, commandPlan.commands, blockers, skips);
  let services: MultiServiceLifecycleResult | undefined;
  let serviceReadiness: ServiceReadinessResult | undefined;

  if (servicePlans.length > 0) {
    services = await startServices({
      services: servicePlans,
      relations: input.relations,
      allowReuseExisting: input.allowReuseExisting,
      generatedAt,
    });
    const cleanup = await cleanupServices(services);
    blockers.push(...blockersFromServiceBlockers(services.blockers));
    blockers.push(...blockersFromCleanup({ attempts: cleanup.attempts, blockers: cleanup.blockers }));
    serviceReadiness = evaluateServiceReadiness({
      topologyType: topology.overallType,
      services: Object.values(services.services),
      requiresApiEvidence: topology.overallType === 'backend' || topology.overallType === 'full-stack',
      requiresDataEvidence: (topology.overallType === 'backend' || topology.overallType === 'full-stack')
        && topology.roots.some((root) => root.dataHints.length > 0),
    });
    blockers.push(...blockersFromServiceBlockers(serviceReadiness.blockers));
  } else if (topology.status === 'ready' && commandPlan.commands.some((command) => command.startsService)) {
    blockers.push({
      id: 'readiness:no-service-plan',
      category: 'readiness',
      code: 'service-plan-missing',
      message: 'Runtime readiness found service commands but no health-checkable service plan was provided.',
      reproduction: {
        fixture: input.fixtureName,
        cwd: input.workspaceRoot,
      },
      attemptedActions: ['detect service commands'],
      nextAction: {
        owner: 'user',
        summary: 'Provide service port and health-check hints before runtime readiness can execute services.',
      },
      owner: 'user',
      riskLevel: 'medium',
      evidenceRefs: ['command:service-detection'],
    });
    skips.push({
      category: 'no-service-plan',
      reason: 'Service command detected but no deterministic port/health override was provided.',
    });
  }

  const dedupedBlockers = dedupeBlockers(blockers);
  const status = determineStatus(dedupedBlockers, services, skips);
  let result: RuntimeReadinessResult = {
    status,
    topology,
    commandPlan,
    services,
    serviceReadiness,
    blockers: dedupedBlockers,
    skips,
    evidence: {
      evidence: [],
      artifacts: [],
    },
    report: '',
  };
  result.report = renderRuntimeReadinessReport(result);
  result.evidence = await buildRuntimeEvidenceBundle({
    status: result.status,
    input,
    topology,
    commandPlan,
    services,
    blockers: dedupedBlockers,
    report: result.report,
    generatedAt,
  });
  result = {
    ...result,
    report: renderRuntimeReadinessReport({
      ...result,
      evidence: result.evidence,
    }),
  };
  if (input.writeEvidence === true) {
    result.evidence = await persistRuntimeEvidenceBundle({
      workspaceRoot: input.workspaceRoot,
      generatedAt,
      report: result.report,
      bundle: result.evidence,
    });
  }
  return result;
}

function dedupeBlockers(blockers: RuntimeBlockerReport[]): RuntimeBlockerReport[] {
  const seen = new Set<string>();
  const deduped: RuntimeBlockerReport[] = [];
  for (const blocker of blockers) {
    const key = blocker.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(blocker);
  }
  return deduped;
}

function buildServicePlans(
  input: RuntimeReadinessInput,
  commands: VerificationCommandCandidate[],
  blockers: RuntimeBlockerReport[],
  skips: RuntimeReadinessSkip[],
): ServiceStartPlan[] {
  const overrides = input.serviceOverrides ?? [];
  const plans: ServiceStartPlan[] = [];
  const used = new Set<RuntimeReadinessServiceOverride>();

  for (const override of overrides) {
    if (override.command) {
      plans.push(explicitPlan(input, override));
      used.add(override);
    }
  }

  for (const candidate of commands.filter((command) => command.startsService && command.selected)) {
    if (plans.some((plan) => plan.root === candidate.root && plan.candidateId)) continue;
    const explicitPlanCoversCandidate = overrides.some((entry) => used.has(entry) && entry.command && entry.purpose && matchesOverride(entry, candidate));
    if (explicitPlanCoversCandidate) continue;
    const override = overrides.find((entry) => !used.has(entry) && matchesOverride(entry, candidate));
    if (!override) {
      skips.push({
        category: 'no-service-plan',
        reason: `No health-check override was provided for selected service command ${candidate.id}.`,
        command: candidate.executable,
        argv: [...candidate.argv],
        root: candidate.root,
        purpose: candidate.purpose,
      });
      continue;
    }
    plans.push(planFromCandidate(input, candidate, override));
    used.add(override);
  }

  for (const override of overrides) {
    if (!used.has(override)) {
      blockers.push({
        id: `readiness:unused-service-override:${override.id ?? override.root}`,
        category: 'readiness',
        code: 'unused-service-override',
        message: `Service override ${override.id ?? override.root} did not match a detected service command and did not include an explicit command.`,
        reproduction: {
          fixture: input.fixtureName,
          serviceId: override.id,
          cwd: override.root,
        },
        attemptedActions: ['match service override to command detection result'],
        nextAction: {
          owner: 'curdx-flow',
          summary: 'Align the service override with a candidate id/root/purpose or provide an explicit command.',
        },
        owner: 'curdx-flow',
        riskLevel: 'medium',
        evidenceRefs: ['command:service-detection'],
      });
    }
  }

  return plans;
}

function planFromCandidate(
  input: RuntimeReadinessInput,
  candidate: VerificationCommandCandidate,
  override: RuntimeReadinessServiceOverride,
): ServiceStartPlan {
  const cwd = override.cwd ?? join(input.workspaceRoot, candidate.root === '.' ? '' : candidate.root);
  return {
    ...createServiceStartPlanFromCandidate({
      candidate,
      id: override.id ?? serviceIdForCandidate(candidate),
      role: override.role,
      cwd,
      healthCheck: override.healthCheck,
      logArtifactPath: override.logArtifactPath,
      mode: input.mode,
    }),
    env: override.env,
    envSummary: override.envSummary,
    ports: override.ports,
    required: override.required,
    allowReuseExisting: override.allowReuseExisting,
    relations: override.relations,
    maxLogBytes: override.maxLogBytes,
  };
}

function explicitPlan(input: RuntimeReadinessInput, override: RuntimeReadinessServiceOverride): ServiceStartPlan {
  const command = override.command;
  if (!command) throw new Error('Explicit service plan requires command.');
  const id = override.id ?? safeId(`${override.root}-${override.role ?? 'service'}`);
  return {
    id,
    root: override.root,
    role: override.role,
    cwd: override.cwd ?? join(input.workspaceRoot, override.root === '.' ? '' : override.root),
    command,
    evidenceId: override.evidenceId ?? `ev-service-${id}`,
    logArtifactPath: override.logArtifactPath ?? `.curdx/artifacts/services/${safeId(id)}.log`,
    env: override.env,
    envSummary: override.envSummary,
    maxLogBytes: override.maxLogBytes,
    healthCheck: override.healthCheck,
    mode: input.mode,
    riskLevel: override.riskLevel,
    allowedInReportOnly: override.allowedInReportOnly,
    candidateId: override.candidateId,
    ports: override.ports,
    required: override.required,
    allowReuseExisting: override.allowReuseExisting,
    relations: override.relations,
  };
}

function matchesOverride(override: RuntimeReadinessServiceOverride, candidate: VerificationCommandCandidate): boolean {
  if (override.candidateId && override.candidateId === candidate.id) return true;
  if (override.purpose && override.purpose !== candidate.purpose) return false;
  return override.root === candidate.root;
}

function externalToolSkips(commands: VerificationCommandCandidate[], input: RuntimeReadinessInput): RuntimeReadinessSkip[] {
  if (input.executeExternalTools !== false) return [];
  return commands
    .filter((command) => command.source === 'plugin' || command.executable === 'claude')
    .map((command) => ({
      category: 'external-tool',
      reason: `Command skipped because executeExternalTools=false for deterministic readiness fixtures.`,
      command: command.executable,
      argv: [...command.argv],
      root: command.root,
      purpose: command.purpose,
    }));
}

function determineStatus(
  blockers: RuntimeBlockerReport[],
  services: MultiServiceLifecycleResult | undefined,
  skips: RuntimeReadinessSkip[],
): RuntimeReadinessStatus {
  if (blockers.length > 0 || services?.status === 'blocked') return 'blocked';
  if (services?.status === 'degraded' || skips.length > 0) return 'degraded';
  return 'ready';
}

function serviceIdForCandidate(candidate: VerificationCommandCandidate): string {
  if (candidate.purpose === 'dev' || candidate.purpose === 'start') {
    if (candidate.root === '.') return 'service';
    return safeId(candidate.root.split('/').at(-1) ?? candidate.root);
  }
  return safeId(`${candidate.root}-${candidate.purpose}`);
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-') || 'service';
}

function normalizeDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}
