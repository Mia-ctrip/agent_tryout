import assert from 'node:assert/strict';
import test from 'node:test';

const captureModule = await import('../src/lib/camera-capture.ts').catch(
  () => ({}),
);

test('development emulator uses the Android system camera', async () => {
  assert.equal(typeof captureModule.takeCheckInPhoto, 'function');

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
