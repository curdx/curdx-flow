import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  CONTRACTS,
  parseContractJson,
  validateContract,
  type ContractName,
} from '../../src/core/contracts/index.ts';

const contractNames = Object.keys(CONTRACTS) as ContractName[];

function readJson(pathname: string): Record<string, unknown> {
  return JSON.parse(readFileSync(pathname, 'utf8')) as Record<string, unknown>;
}

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

describe('runtime contract baseline', () => {
  it('keeps every shipped schema aligned with the runtime guard for valid fixtures', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/contracts.json');
    const ajv = createAjv();

    for (const contractName of contractNames) {
      const spec = CONTRACTS[contractName];
      const schema = readJson(spec.schemaPath);
      const validateSchema = ajv.compile(schema);
      const payload = fixtures[contractName];

      expect(validateSchema(payload), `${contractName} schema`).toBe(true);
      const result = validateContract(contractName, payload);
      expect(result, `${contractName} guard`).toMatchObject({ ok: true });
    }
  });

  it('rejects missing required fields through shipped schemas and runtime guards', () => {
    const fixtures = readJson('tests/fixtures/contracts/invalid/missing-required.json');
    const ajv = createAjv();

    for (const contractName of contractNames) {
      const spec = CONTRACTS[contractName];
      const validateSchema = ajv.compile(readJson(spec.schemaPath));
      const payload = fixtures[contractName];

      expect(validateSchema(payload), `${contractName} schema`).toBe(false);
      const result = validateContract(contractName, payload);
      expect(result.ok, `${contractName} guard`).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'missing-required')).toBe(true);
      }
    }
  });

  it('rejects invalid enum values through shipped schemas and runtime guards', () => {
    const fixtures = readJson('tests/fixtures/contracts/invalid/bad-enum.json');
    const ajv = createAjv();

    for (const contractName of contractNames) {
      const spec = CONTRACTS[contractName];
      const validateSchema = ajv.compile(readJson(spec.schemaPath));
      const payload = fixtures[contractName];

      expect(validateSchema(payload), `${contractName} schema`).toBe(false);
      const result = validateContract(contractName, payload);
      expect(result.ok, `${contractName} guard`).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'invalid-enum')).toBe(true);
      }
    }
  });

  it('rejects unsupported schema versions through shipped schemas and runtime guards', () => {
    const fixtures = readJson('tests/fixtures/contracts/invalid/unsupported-version.json');
    const ajv = createAjv();

    for (const contractName of contractNames) {
      const spec = CONTRACTS[contractName];
      const validateSchema = ajv.compile(readJson(spec.schemaPath));
      const payload = fixtures[contractName];

      expect(validateSchema(payload), `${contractName} schema`).toBe(false);
      const result = validateContract(contractName, payload);
      expect(result.ok, `${contractName} guard`).toBe(false);
      if (!result.ok) {
        expect(result.issues.some((issue) => issue.code === 'unsupported-schema-version')).toBe(true);
      }
    }
  });

  it('rejects minLength, format, pattern, and array item violations through shipped schemas and runtime guards', () => {
    const fixtures = readJson('tests/fixtures/contracts/invalid/schema-only-rules.json');
    const ajv = createAjv();
    const contractNamesWithSchemaOnlyRules: ContractName[] = ['evidence', 'artifactIndex', 'releaseVerdict', 'verificationReport', 'actionRiskPolicy'];

    for (const contractName of contractNamesWithSchemaOnlyRules) {
      const spec = CONTRACTS[contractName];
      const validateSchema = ajv.compile(readJson(spec.schemaPath));
      const payload = fixtures[contractName];

      expect(validateSchema(payload), `${contractName} schema`).toBe(false);
      const result = validateContract(contractName, payload);
      expect(result.ok, `${contractName} guard`).toBe(false);
      if (!result.ok) {
        const issueCodes = result.issues.map((issue) => issue.code);
        expect(issueCodes).toEqual(
          expect.arrayContaining(['invalid-type']),
        );
      }
    }
  });

  it('preserves unknown future fields at compatibility boundaries', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/unknown-fields.json');
    const evidenceResult = validateContract('evidence', fixtures.evidence);

    expect(evidenceResult.ok).toBe(true);
    if (evidenceResult.ok) {
      expect(evidenceResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
      });
    }

    const artifactResult = validateContract('artifactIndex', fixtures.artifactIndex);
    expect(artifactResult.ok).toBe(true);
    if (artifactResult.ok) {
      expect(artifactResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
      });
    }

    const stateResult = validateContract('stateLedger', fixtures.stateLedger);
    expect(stateResult.ok).toBe(true);
    if (stateResult.ok) {
      expect(stateResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
      });
    }

    const sessionResult = validateContract('session', fixtures.session);
    expect(sessionResult.ok).toBe(true);
    if (sessionResult.ok) {
      expect(sessionResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
      });
    }

    const reportResult = validateContract('verificationReport', fixtures.verificationReport);
    expect(reportResult.ok).toBe(true);
    if (reportResult.ok) {
      expect(reportResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
        sections: {
          futureNestedField: { kept: true },
        },
      });
    }

    const policyResult = validateContract('actionRiskPolicy', fixtures.actionRiskPolicy);
    expect(policyResult.ok).toBe(true);
    if (policyResult.ok) {
      expect(policyResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
        rules: [
          expect.objectContaining({
            futureRuleField: { kept: true },
          }),
        ],
      });
    }

    const topologyResult = validateContract('runtimeTopology', fixtures.runtimeTopology);
    expect(topologyResult.ok).toBe(true);
    if (topologyResult.ok) {
      expect(topologyResult.value).toMatchObject({
        futureTopLevelField: { kept: true },
        roots: [
          expect.objectContaining({
            futureRootField: { kept: true },
          }),
        ],
      });
    }
  });

  it('enforces verification report nested machine-readable summary fields', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/contracts.json');
    const payload = {
      ...(fixtures.verificationReport as Record<string, unknown>),
      evidenceSummaries: [
        {
          id: 'ev-command-1',
          source: 'command',
          capabilityId: 'npm-typecheck',
          status: 'passed',
          trustLevel: 'verified',
          summary: '',
          artifactRefs: [123],
          freshness: '',
          unverifiedScope: [false],
        },
      ],
      artifactSummaries: [
        {
          id: 'artifact-log-1',
          evidenceId: 'ev-command-1',
          type: 'log',
          path: '../escape.log',
          summary: '',
          privacy: {
            classification: 'public',
            containsSensitiveData: false,
            redacted: true,
          },
        },
      ],
      sections: {
        blockers: {},
        missingEvidence: [],
        manualConfirmation: [],
        nextActions: [],
        degradedCapabilities: [],
        unverifiedScope: [],
      },
      sourceChanges: {
        modifiedSource: 'no',
        summary: '',
        files: ['../src/app.ts'],
      },
      verifier: {
        command: '',
        exitCode: '0',
      },
    };
    const ajv = createAjv();
    const validateSchema = ajv.compile(readJson(CONTRACTS.verificationReport.schemaPath));

    expect(validateSchema(payload), 'verificationReport schema').toBe(false);
    const result = validateContract('verificationReport', payload);
    expect(result.ok, 'verificationReport guard').toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '$.evidenceSummaries[0].summary', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.evidenceSummaries[0].artifactRefs[0]', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.evidenceSummaries[0].freshness', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.evidenceSummaries[0].unverifiedScope[0]', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.artifactSummaries[0].path', code: 'invalid-pattern' }),
          expect.objectContaining({ path: '$.artifactSummaries[0].summary', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.sections.blockers', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.sourceChanges.modifiedSource', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.sourceChanges.summary', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.sourceChanges.files[0]', code: 'invalid-pattern' }),
          expect.objectContaining({ path: '$.verifier.command', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.verifier.exitCode', code: 'invalid-type' }),
        ]),
      );
    }
  });

  it('rejects malformed state dirty baseline and generated file classifications', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/contracts.json');
    const payload = {
      ...(fixtures.stateLedger as Record<string, unknown>),
      artifactIndexPath: '../artifacts/index.jsonl',
      dirtyBaseline: {
        capturedAt: 'not-a-date',
        files: [
          {
            path: '/tmp/app.ts',
            status: 'changed',
            source: 'tool-generated',
          },
        ],
      },
      generatedFiles: [
        {
          path: '.curdx/reports/run-1.report.md',
          category: 'unknown-category',
          owner: '',
          createdAt: 'not-a-date',
          relatedRunId: '',
          relatedEvidenceIds: [123],
        },
      ],
    };
    const ajv = createAjv();
    const validateSchema = ajv.compile(readJson(CONTRACTS.stateLedger.schemaPath));

    expect(validateSchema(payload), 'stateLedger schema').toBe(false);
    const result = validateContract('stateLedger', payload);
    expect(result.ok, 'stateLedger guard').toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '$.artifactIndexPath', code: 'invalid-pattern' }),
          expect.objectContaining({ path: '$.dirtyBaseline.capturedAt', code: 'invalid-format' }),
          expect.objectContaining({ path: '$.dirtyBaseline.files[0].path', code: 'invalid-pattern' }),
          expect.objectContaining({ path: '$.dirtyBaseline.files[0].status', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.dirtyBaseline.files[0].source', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.generatedFiles[0].category', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.generatedFiles[0].owner', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.generatedFiles[0].createdAt', code: 'invalid-format' }),
          expect.objectContaining({ path: '$.generatedFiles[0].relatedRunId', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.generatedFiles[0].relatedEvidenceIds[0]', code: 'invalid-type' }),
        ]),
      );
    }
  });

  it('enforces completion verdict confidence, evidence refs, and unverified scope shape', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/contracts.json');
    const payload = {
      ...(fixtures.completionVerdict as Record<string, unknown>),
      why: '',
      evidenceRefs: [123],
      confidence: 1.2,
      unverifiedScope: ['not-an-object'],
    };
    const ajv = createAjv();
    const validateSchema = ajv.compile(readJson(CONTRACTS.completionVerdict.schemaPath));

    expect(validateSchema(payload), 'completionVerdict schema').toBe(false);
    const result = validateContract('completionVerdict', payload);
    expect(result.ok, 'completionVerdict guard').toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '$.why', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.evidenceRefs[0]', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.confidence', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.unverifiedScope[0]', code: 'invalid-type' }),
        ]),
      );
    }
  });

  it('enforces action-risk policy rule shape and the no-false-completion invariant', () => {
    const fixtures = readJson('tests/fixtures/contracts/valid/contracts.json');
    const payload = {
      ...(fixtures.actionRiskPolicy as Record<string, unknown>),
      noFalseCompletion: false,
      allowedWriteRoots: ['src'],
      rules: [
        {
          id: '',
          actionType: 'unknown-action',
          riskLevel: 'severe',
          mutatesWorkspace: 'sometimes',
          destructive: 'no',
          requiresAuthorization: 'maybe',
          allowedModes: ['report-only', 'danger'],
          requiresReleaseStage: 'yes',
          allowedWriteRoots: ['.curdx/reports', '../escape'],
        },
      ],
    };
    const ajv = createAjv();
    const validateSchema = ajv.compile(readJson(CONTRACTS.actionRiskPolicy.schemaPath));

    expect(validateSchema(payload), 'actionRiskPolicy schema').toBe(false);
    const result = validateContract('actionRiskPolicy', payload);
    expect(result.ok, 'actionRiskPolicy guard').toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '$.noFalseCompletion', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.allowedWriteRoots[0]', code: 'invalid-pattern' }),
          expect.objectContaining({ path: '$.rules[0].id', code: 'invalid-range' }),
          expect.objectContaining({ path: '$.rules[0].actionType', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.rules[0].riskLevel', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.rules[0].mutatesWorkspace', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.rules[0].destructive', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.rules[0].requiresAuthorization', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.rules[0].allowedModes[1]', code: 'invalid-enum' }),
          expect.objectContaining({ path: '$.rules[0].requiresReleaseStage', code: 'invalid-type' }),
          expect.objectContaining({ path: '$.rules[0].allowedWriteRoots[1]', code: 'invalid-pattern' }),
        ]),
      );
    }
  });

  it('rejects evidence without verdict-usable freshness through shipped schemas and runtime guards', () => {
    const fixture = readJson('tests/fixtures/contracts/invalid/empty-freshness.json');
    const ajv = createAjv();
    const spec = CONTRACTS.evidence;
    const validateSchema = ajv.compile(readJson(spec.schemaPath));

    expect(validateSchema(fixture.evidence), 'evidence schema').toBe(false);
    const result = validateContract('evidence', fixture.evidence);
    expect(result.ok, 'evidence guard').toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '$.freshness',
          }),
        ]),
      );
    }
  });

  it('turns malformed JSON into structured parse issues', () => {
    const raw = readFileSync('tests/fixtures/contracts/invalid/not-json.json', 'utf8');
    const result = parseContractJson('evidence', raw);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        expect.objectContaining({
          schemaId: CONTRACTS.evidence.schemaId,
          path: '$',
          code: 'invalid-json',
        }),
      ]);
    }
  });
});
