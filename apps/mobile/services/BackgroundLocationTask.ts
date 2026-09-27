/**
 * DEPRECATED: This module is deprecated.
 * Background location logic has been consolidated into `services/location.ts`.
 */
export const LOCATION_TASK_NAME = 'BACKGROUND_LOCATION_TASK';

export async function startAdaptiveTracking(runId: string) {
  console.warn('startAdaptiveTracking is deprecated, use locationService.startTracking instead');
}

export async function stopAdaptiveTracking() {
  console.warn('stopAdaptiveTracking is deprecated, use locationService.stopTracking instead');
}
