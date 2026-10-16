export type ExperiencePath = 'learning' | 'trading';

/** Presentation preference only; never an authorization or competency claim. */
export function experiencePath(metadata: Record<string, unknown> | undefined): ExperiencePath | null {
  return metadata?.ursora_experience_path === 'learning' || metadata?.ursora_experience_path === 'trading' ? metadata.ursora_experience_path : null;
}
export function needsOrientation(metadata: Record<string, unknown> | undefined, accountSeen: boolean): boolean {
  return metadata?.ursora_onboarding_completed !== true && !accountSeen;
}
export function orientationMetadata(path: ExperiencePath) {
  return { ursora_experience_path: path, ursora_onboarding_completed: true, ursora_orientation_version: 3 };
}
