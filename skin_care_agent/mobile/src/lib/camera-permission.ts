export type CameraPermissionState = 'loading' | 'granted' | 'request' | 'settings';

type CameraPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
};

export function cameraPermissionState(
  permission: CameraPermissionSnapshot | null,
): CameraPermissionState {
  if (!permission) {
    return 'loading';
  }
  if (permission.granted) {
    return 'granted';
  }
  return permission.canAskAgain ? 'request' : 'settings';
}
