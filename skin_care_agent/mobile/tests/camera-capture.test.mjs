import assert from 'node:assert/strict';
import test from 'node:test';

const captureModule = await import('../src/lib/camera-capture.ts').catch(
  () => ({}),
);

test('development emulator uses the Android system camera', async () => {
  assert.equal(typeof captureModule.takeCheckInPhoto, 'function');
  assert.equal(typeof captureModule.takeCameraPhoto, 'function');
  assert.equal(captureModule.takeCheckInPhoto, captureModule.takeCameraPhoto);

  let embeddedCameraCalled = false;
  const picture = await captureModule.takeCheckInPhoto({
    camera: {
      async takePictureAsync() {
        embeddedCameraCalled = true;
        return { uri: 'file:///embedded.jpg' };
      },
    },
    launchSystemCamera: async () => ({
      canceled: false,
      assets: [
        {
          assetId: null,
          base64: null,
          duration: null,
          exif: null,
          file: null,
          fileName: 'system.jpg',
          fileSize: 130937,
          height: 1280,
          mimeType: 'image/jpeg',
          pairedVideoAsset: null,
          type: 'image',
          uri: 'file:///system.jpg',
          width: 960,
        },
      ],
    }),
    useSystemCamera: true,
  });

  assert.equal(embeddedCameraCalled, false);
  assert.deepEqual(picture, { uri: 'file:///system.jpg' });
});

test('physical device keeps the embedded Expo camera path', async () => {
  assert.equal(typeof captureModule.takeCheckInPhoto, 'function');

  let systemCameraCalled = false;
  let receivedOptions;
  const picture = await captureModule.takeCheckInPhoto({
    camera: {
      async takePictureAsync(options) {
        receivedOptions = options;
        return { uri: 'file:///embedded.jpg' };
      },
    },
    launchSystemCamera: async () => {
      systemCameraCalled = true;
      return { canceled: true, assets: null };
    },
    useSystemCamera: false,
  });

  assert.equal(systemCameraCalled, false);
  assert.deepEqual(receivedOptions, {
    quality: 0.9,
    skipProcessing: false,
  });
  assert.deepEqual(picture, { uri: 'file:///embedded.jpg' });
});

test('canceling the Android system camera produces no capture', async () => {
  assert.equal(typeof captureModule.takeCheckInPhoto, 'function');

  const picture = await captureModule.takeCheckInPhoto({
    camera: null,
    launchSystemCamera: async () => ({ canceled: true, assets: null }),
    useSystemCamera: true,
  });

  assert.equal(picture, null);
});

test('photo library selection preserves the original asset uri and handles cancellation', async () => {
  assert.equal(typeof captureModule.selectPhotoFromLibrary, 'function');

  const selected = await captureModule.selectPhotoFromLibrary(async () => ({
    canceled: false,
    assets: [
      {
        assetId: 'phone-photo',
        base64: null,
        duration: null,
        exif: null,
        file: null,
        fileName: 'face-original.jpg',
        fileSize: 2480137,
        height: 4032,
        mimeType: 'image/jpeg',
        pairedVideoAsset: null,
        type: 'image',
        uri: 'file:///phone-face-original.jpg',
        width: 3024,
      },
    ],
  }));
  const canceled = await captureModule.selectPhotoFromLibrary(async () => ({
    canceled: true,
    assets: null,
  }));

  assert.deepEqual(selected, { uri: 'file:///phone-face-original.jpg' });
  assert.equal(canceled, null);
});

test('system camera is limited to development emulators', () => {
  assert.equal(typeof captureModule.shouldUseSystemCamera, 'function');

  assert.equal(
    captureModule.shouldUseSystemCamera({
      isDevelopment: true,
      isDevice: false,
    }),
    true,
  );
  assert.equal(
    captureModule.shouldUseSystemCamera({
      isDevelopment: false,
      isDevice: false,
    }),
    false,
  );
  assert.equal(
    captureModule.shouldUseSystemCamera({
      isDevelopment: true,
      isDevice: true,
    }),
    false,
  );
});
