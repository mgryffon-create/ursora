export const UPDATE_EVENT = 'ursora:update-available';
export const PREPARE_UPDATE_EVENT = 'ursora:prepare-update';
export const PENDING_BUILD_KEY = 'ursora_pending_build';
export function announceDeployment(buildId: string) {
 try { window.sessionStorage.setItem(PENDING_BUILD_KEY, buildId); } catch { /* Notification still works without storage. */ }
 window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: buildId }));
}
