import type {
  CameraCapturedPicture,
  CameraPictureOptions,
} from 'expo-camera';
import type { ImagePickerResult } from 'expo-image-picker';

type EmbeddedCamera = {
  takePictureAsync(
    options: CameraPictureOptions,
  ): Promise<CameraCapturedPicture | undefined>;
};

type SystemCameraLauncher = () => Promise<ImagePickerResult>;

type TakeCheckInPhotoOptions = {
  camera: EmbeddedCamera | null;
  launchSystemCamera: SystemCameraLauncher;
  useSystemCamera: boolean;
};

type CheckInPhoto = {
  uri: string;
};

export function shouldUseSystemCamera({
  isDevelopment,
  isDevice,
}: {
  isDevelopment: boolean;
  isDevice: boolean;
}) {
  return isDevelopment && !isDevice;
}

export async function takeCheckInPhoto({
  camera,
  launchSystemCamera,
  useSystemCamera,
}: TakeCheckInPhotoOptions): Promise<CheckInPhoto | null> {
  if (useSystemCamera) {
    const result = await launchSystemCamera();
    if (result.canceled) {
      return null;
    }
    const uri = result.assets[0]?.uri;
    if (!uri) {
      throw new Error('System camera did not return a photo');
    }
    return { uri };
  }

  if (!camera) {
    throw new Error('Camera is not ready');
  }
  const picture = await camera.takePictureAsync({
    quality: 0.9,
    skipProcessing: false,
  });
  if (!picture?.uri) {
    throw new Error('Camera did not return a photo');
  }
  return { uri: picture.uri };
}
