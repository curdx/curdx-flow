export { buildCapabilityMatrix, validateCapabilityMatrix } from './doctor.ts';
export {
  attachNativeGoalConditionLength,
  buildNativeGoalReadiness,
  evaluateNativeGoalConditionLength,
  GOAL_CONDITION_LIMIT,
  NATIVE_GOAL_REQUIRED_VERSION,
  parseClaudeCodeVersion,
  readNativeGoalSettingsSources,
} from './goal-readiness.ts';
export { probeCommand } from './probes.ts';
export { buildExternalMcpReadiness, buildPluginDependencyReadiness } from './readiness.ts';
export { renderCapabilityMatrix } from './renderer.ts';
export type { BuildCapabilityMatrixInput } from './doctor.ts';
export type {
  BuildNativeGoalReadinessInput,
  NativeGoalConditionLength,
  NativeGoalConditionLengthStatus,
  NativeGoalReadiness,
  NativeGoalReadinessState,
  NativeGoalRecommendedDriver,
  NativeGoalSettingsBlocker,
  NativeGoalSettingsSource,
} from './goal-readiness.ts';
export type {
  ExternalMcpReadinessFact,
  ExternalMcpReadinessResult,
  PluginDependencyReadinessFact,
  PluginDependencyReadinessResult,
} from './readiness.ts';
export type {
  CapabilityCategory,
  CapabilityCheckMode,
  CapabilityMatrix,
  CapabilityNextAction,
  CapabilityProvider,
  CapabilityProvisioning,
  CapabilityState,
  CapabilityStatus,
  CapabilityTriState,
  CapabilityValidationIssue,
  CapabilityValidationResult,
  CommandProbeResult,
} from './types.ts';
