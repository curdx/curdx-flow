import { describe, expect, it } from 'vitest';

import {
  buildPlatformFloorReadiness,
  OPTION_C_REQUIRED_VERSION,
} from '../../../src/core/capabilities/index.ts';

describe('platform floor (OPTION_C)', () => {
  it('pins the supported Claude Code floor at 2.1.154', () => {
    expect(OPTION_C_REQUIRED_VERSION).toBe('2.1.154');
  });

  it('flags a version below the floor', () => {
    const readiness = buildPlatformFloorReadiness('2.1.150');
    expect(readiness).toMatchObject({
      requiredVersion: '2.1.154',
      detectedVersion: '2.1.150',
      meetsFloor: false,
    });
    expect(readiness.reason).toContain('below');
  });

  it('accepts the floor version and newer', () => {
    expect(buildPlatformFloorReadiness('2.1.154').meetsFloor).toBe(true);
    expect(buildPlatformFloorReadiness('2.1.160').meetsFloor).toBe(true);
  });

  it('reports unknown when the version could not be detected', () => {
    const readiness = buildPlatformFloorReadiness(null);
    expect(readiness.meetsFloor).toBeNull();
    expect(readiness.detectedVersion).toBeNull();
    expect(readiness.requiredVersion).toBe('2.1.154');
  });
});
