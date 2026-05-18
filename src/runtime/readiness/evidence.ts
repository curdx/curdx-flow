import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { EvidenceBlock } from '../contracts/index.ts';
import { appendEvidence } from '../evidence/ledger.ts';
import { resolveWorkspacePath } from '../evidence/paths.ts';
import type { ArtifactIndexInput } from '../evidence/types.ts';
import type { RuntimeEvidenceBundle, RuntimeReadinessFactsForEvidence } from './types.ts';

export async function buildRuntimeEvidenceBundle(input: RuntimeReadinessFactsForEvidence): Promise<RuntimeEvidenceBundle> {
  const evidence = createRuntimeEvidence(input);
  const artifacts = createRuntimeArtifacts(input, evidence);
  const reportArtifactPath = `.curdx/artifacts/readiness/${safeId(input.input.runId)}.md`;
  return {
    evidence: [evidence],
    artifacts,
    reportArtifactPath,
  };
}

export async function persistRuntimeEvidenceBundle(input: {
  workspaceRoot: string;
  generatedAt: string;
  report: string;
  bundle: RuntimeEvidenceBundle;
}): Promise<RuntimeEvidenceBundle> {
  if (input.bundle.reportArtifactPath) {
    await writeReportArtifact(input.workspaceRoot, input.bundle.reportArtifactPath, input.report);
  }
  const evidence = input.bundle.evidence[0];
  if (!evidence) return input.bundle;
  return {
    ...input.bundle,
    writeResult: await appendEvidence({
      workspaceRoot: input.workspaceRoot,
      evidence,
      artifacts: input.bundle.artifacts,
      now: input.generatedAt,
    }),
  };
}

function createRuntimeEvidence(input: RuntimeReadinessFactsForEvidence): EvidenceBlock {
  const status = input.status === 'ready' ? 'passed' : input.status;
  const verified = input.status === 'ready' && input.blockers.length === 0 && allHealthVerified(input);
  const artifactRefs = createArtifactRefs(input);
  return {
    schemaVersion: 1,
    id: `ev-runtime-readiness-${safeId(input.input.runId)}`,
    runId: input.input.runId,
    goalId: input.input.goalId,
    source: 'service',
    capabilityId: 'runtime-readiness',
    trustLevel: verified ? 'verified' : 'degraded',
    status,
    summary: input.status === 'ready'
      ? `Runtime readiness passed for ${input.topology.overallType} project.`
      : `Runtime readiness is ${input.status} with ${input.blockers.length} blocker(s).`,
    artifacts: artifactRefs,
    startedAt: input.generatedAt,
    completedAt: input.generatedAt,
    freshness: {
      validatedAt: input.generatedAt,
      targetSummary: `${input.topology.overallType} runtime readiness`,
      commandHash: `commands:${input.commandPlan.summary.total}:${input.commandPlan.summary.selected}`,
      environmentId: `node-${process.version}`,
    },
    privacy: {
      classification: 'local-only',
      containsSecrets: false,
    },
    redactions: [],
    serviceStates: input.services
      ? Object.values(input.services.services).map((service) => ({
        id: service.record.id,
        status: service.status,
        startupMode: service.record.startupMode,
        ownership: service.record.ownership,
        cleanupStatus: service.record.cleanupStatus,
        healthStatus: service.health?.status,
        logArtifactPath: service.record.logArtifactPath,
      }))
      : [],
    commandSummary: input.commandPlan.summary,
    blockerRefs: input.blockers.map((blocker) => blocker.id),
  };
}

function createRuntimeArtifacts(input: RuntimeReadinessFactsForEvidence, evidence: EvidenceBlock): ArtifactIndexInput[] {
  const artifacts: ArtifactIndexInput[] = [
    {
      id: `artifact-runtime-readiness-report-${safeId(input.input.runId)}`,
      evidenceId: evidence.id,
      type: 'report',
      path: `.curdx/artifacts/readiness/${safeId(input.input.runId)}.md`,
      summary: `Runtime readiness report for ${input.topology.overallType}: ${input.status}.`,
      privacy: {
        classification: 'local-only',
        containsSensitiveData: false,
        redacted: false,
      },
    },
  ];

  for (const service of Object.values(input.services?.services ?? {})) {
    if (!service.record.logArtifactPath) continue;
    artifacts.push({
      id: `artifact-runtime-readiness-service-${safeId(service.record.id)}`,
      evidenceId: evidence.id,
      type: 'log',
      path: service.record.logArtifactPath,
      summary: `Bounded log artifact for service ${service.record.id}; status=${service.status}; health=${service.health?.status ?? 'not-recorded'}.`,
      privacy: {
        classification: 'local-only',
        containsSensitiveData: false,
        redacted: service.log.truncated,
      },
    });
  }

  return artifacts;
}

function createArtifactRefs(input: RuntimeReadinessFactsForEvidence): Array<Record<string, string>> {
  const refs: Array<Record<string, string>> = [
    {
      id: `artifact-runtime-readiness-report-${safeId(input.input.runId)}`,
      path: `.curdx/artifacts/readiness/${safeId(input.input.runId)}.md`,
      type: 'report',
    },
  ];
  for (const service of Object.values(input.services?.services ?? {})) {
    if (!service.record.logArtifactPath) continue;
    refs.push({
      id: `artifact-runtime-readiness-service-${safeId(service.record.id)}`,
      path: service.record.logArtifactPath,
      type: 'log',
    });
  }
  return refs;
}

async function writeReportArtifact(workspaceRoot: string, reportArtifactPath: string, report: string): Promise<void> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, reportArtifactPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(resolve(absolutePath), report, 'utf8');
}

function allHealthVerified(input: RuntimeReadinessFactsForEvidence): boolean {
  const services = Object.values(input.services?.services ?? {});
  if (services.length === 0) return false;
  return services.every((service) => service.record.startupMode === 'cold-started'
    && service.health?.status === 'passed'
    && service.health.trustLevel === 'verified');
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-') || 'run';
}
