import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { InlineNotice } from '@/components/inline-notice';
import { colors, spacing } from '@/constants/theme';
import { cameraPermissionState } from '@/lib/camera-permission';
import {
  buildPhotoUploadForm,
  completeCheckIn,
  createStandardCheckIn,
  getCheckIn,
  listCheckIns,
  uploadCheckInPhoto,
} from '@/lib/check-in-api';
import type { CheckIn } from '@/lib/check-in-api';
import {
  shouldUseSystemCamera,
  takeCheckInPhoto,
} from '@/lib/camera-capture';
import {
  capturedCheckInViews,
  CHECK_IN_VIEWS,
  createClientRequestId,
  localObservedOn,
  nextIncompleteView,
  selectTodayStandardCheckIn,
  qualityFailureMessages,
} from '@/lib/check-in-flow';
import type { CheckInViewType } from '@/lib/check-in-flow';
import { ApiError } from '@/lib/api';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

type PendingCapture = {
  uri: string;
  takenAt: string;
  viewType: CheckInViewType;
  clientRequestId: string;
};

type Operation = 'idle' | 'capturing' | 'uploading' | 'completing';

export default function CheckInScreen() {
  const { request } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [operation, setOperation] = useState<Operation>('idle');
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(
    null,
  );
  const [qualityMessages, setQualityMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const checkInRequestId = useRef(createClientRequestId());
  const permissionState = cameraPermissionState(permission);
  const capturedViews = useMemo(
    () => capturedCheckInViews(checkIn?.photos ?? []),
    [checkIn?.photos],
  );
  const nextViewType = nextIncompleteView(capturedViews);
  const currentView =
    CHECK_IN_VIEWS.find((view) => view.type === nextViewType) ?? null;
  const currentStep = currentView
    ? CHECK_IN_VIEWS.findIndex((view) => view.type === currentView.type) + 1
    : CHECK_IN_VIEWS.length;
  const busy = operation !== 'idle';
  const useSystemCamera = shouldUseSystemCamera({
    isDevelopment: __DEV__,
    isDevice: Device.isDevice,
  });

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setCameraReady(false);
      };
    }, []),
  );

  const loadTodayCheckIn = useCallback(async () => {
    setInitializing(true);
    setError(null);
    setQualityMessages([]);
    setPendingCapture(null);
    try {
      const observedOn = localObservedOn();
      const recent = await listCheckIns(request);
      const existing = selectTodayStandardCheckIn(recent, observedOn);
      const todayCheckIn =
        existing ??
        (await createStandardCheckIn(request, {
          observedOn,
          clientRequestId: checkInRequestId.current,
        }));
      setCheckIn(todayCheckIn);
    } catch (loadError) {
      setError(userFacingError(loadError));
    } finally {
      setInitializing(false);
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      if (permissionState === 'granted') {
        void loadTodayCheckIn();
      }
    }, [loadTodayCheckIn, permissionState]),
  );

  async function askForPermission() {
    setRequesting(true);
    setError(null);
    try {
      await requestPermission();
    } catch (requestError) {
      setError(userFacingError(requestError));
    } finally {
      setRequesting(false);
    }
  }

  async function openSettings() {
    setError(null);
    try {
      await Linking.openSettings();
    } catch (settingsError) {
      setError(userFacingError(settingsError));
    }
  }

  async function uploadCapture(capture: PendingCapture) {
    if (!checkIn) {
      return;
    }
    setOperation('uploading');
    setError(null);
    setQualityMessages([]);
    try {
      const form = buildPhotoUploadForm({
        file: new File(capture.uri),
        takenAt: capture.takenAt,
        checkInId: checkIn.check_in_id,
        viewType: capture.viewType,
        clientRequestId: capture.clientRequestId,
      });
      await uploadCheckInPhoto(request, form);
      const refreshed = await getCheckIn(request, checkIn.check_in_id);
      setCheckIn(refreshed);
      setPendingCapture(null);
      if (
        refreshed.status === 'draft' &&
        nextIncompleteView(capturedCheckInViews(refreshed.photos)) === null
      ) {
        setOperation('completing');
        const completed = await completeCheckIn(request, refreshed.check_in_id);
        setCheckIn(completed);
        router.replace(`/analysis/${completed.check_in_id}`);
      }
    } catch (uploadError) {
      const feedback =
        uploadError instanceof ApiError && uploadError.status === 422
          ? qualityFailureMessages(uploadError.detail)
          : [];
      if (feedback.length > 0) {
        setQualityMessages(feedback);
        setPendingCapture(null);
      } else {
        setError(userFacingError(uploadError));
      }
    } finally {
      setOperation('idle');
    }
  }

  async function finishCheckIn() {
    if (!checkIn || busy) {
      return;
    }
    setOperation('completing');
    setError(null);
    try {
      const completed = await completeCheckIn(request, checkIn.check_in_id);
      setCheckIn(completed);
      router.replace(`/analysis/${completed.check_in_id}`);
    } catch (completeError) {
      setError(userFacingError(completeError));
    } finally {
      setOperation('idle');
    }
  }

  async function takePhoto() {
    if (
      (!useSystemCamera && (!cameraRef.current || !cameraReady)) ||
      !checkIn ||
      !currentView ||
      busy
    ) {
      return;
    }
    setOperation('capturing');
    setError(null);
    setQualityMessages([]);
    try {
      const picture = await takeCheckInPhoto({
        camera: cameraRef.current,
        launchSystemCamera: () =>
          ImagePicker.launchCameraAsync({
            allowsEditing: false,
            cameraType: ImagePicker.CameraType.front,
            mediaTypes: ['images'],
            quality: 1,
          }),
        useSystemCamera,
      });
      if (!picture) {
        setOperation('idle');
        return;
      }
      const capture: PendingCapture = {
        uri: picture.uri,
        takenAt: new Date().toISOString(),
        viewType: currentView.type,
        clientRequestId: createClientRequestId(),
      };
      setPendingCapture(capture);
      await uploadCapture(capture);
    } catch (captureError) {
      setError(userFacingError(captureError));
      setOperation('idle');
    }
  }

  if (permissionState === 'loading') {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>正在检查相机权限</Text>
      </SafeAreaView>
    );
  }

  if (permissionState !== 'granted') {
    const needsSettings = permissionState === 'settings';
    return (
      <AppScreen>
        <BrandHeader
          eyebrow="TODAY CHECK-IN"
          title={needsSettings ? '相机权限已关闭' : '允许使用相机'}
          description={
            needsSettings
              ? '请在系统设置中允许相机权限，然后返回继续今日 Check-in。'
              : '需要相机权限拍摄正面、左侧和右侧皮肤照片。'
          }
        />
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={styles.permissionActions}>
          <AppButton
            label={needsSettings ? '打开系统设置' : '允许使用相机'}
            loading={requesting}
            onPress={() =>
              void (needsSettings ? openSettings() : askForPermission())
            }
          />
          <AppButton label="返回首页" variant="text" onPress={() => router.back()} />
        </View>
      </AppScreen>
    );
  }

  if (checkIn?.status === 'complete') {
    return (
      <AppScreen>
        <BrandHeader
          eyebrow="TODAY COMPLETE"
          title="今日 Check-in 已完成"
          description="正面、左侧和右侧照片已通过质量检查并保存。"
        />
        <View style={styles.completedViews}>
          {CHECK_IN_VIEWS.map((view) => (
            <View key={view.type} style={styles.completedView}>
              <Text style={styles.completedViewLabel}>{view.label}</Text>
              <Text style={styles.completedViewState}>已保存</Text>
            </View>
          ))}
        </View>
        <View style={styles.completedActions}>
          <AppButton
            label="查看分析结果"
            onPress={() =>
              router.replace(`/analysis/${checkIn.check_in_id}`)
            }
          />
          <AppButton
            label="返回首页"
            variant="text"
            onPress={() => router.back()}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      {focused ? (
        <CameraView
          ref={cameraRef}
          facing="front"
          mirror={false}
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          onMountError={() =>
            setError('相机预览启动失败，请返回后重新进入。')
          }
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <SafeAreaView pointerEvents="box-none" style={styles.cameraOverlay}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="返回首页"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.overlayPressed,
            ]}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.progressCopy}>
            <Text style={styles.progressLabel}>今日 Check-in</Text>
            <Text style={styles.progressValue}>
              {currentView
                ? `${currentStep} / 3 · ${currentView.label}`
                : '3 / 3 · 已拍摄'}
            </Text>
          </View>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.guideArea} pointerEvents="none">
          <View style={styles.faceGuide} />
        </View>

        <View style={styles.instruction}>
          {initializing ? (
            <View style={styles.operationRow}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.operationText}>正在恢复今日进度</Text>
            </View>
          ) : !checkIn ? (
            <>
              <Text style={styles.captureError}>
                {error ?? '无法读取今日 Check-in。'}
              </Text>
              <AppButton
                label="重新加载"
                variant="secondary"
                onPress={() => void loadTodayCheckIn()}
              />
            </>
          ) : currentView ? (
            <>
              <Text style={styles.instructionTitle}>{currentView.label}</Text>
              <Text style={styles.instructionText}>
                {currentView.instruction}
              </Text>
              {qualityMessages.map((message) => (
                <Text key={message} style={styles.captureError}>
                  {message}
                </Text>
              ))}
              {error ? <Text style={styles.captureError}>{error}</Text> : null}
              {pendingCapture && error ? (
                <View style={styles.retryRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void uploadCapture(pendingCapture)}
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed && styles.overlayPressed,
                    ]}>
                    <Text style={styles.retryLabel}>重试上传</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      setPendingCapture(null);
                      setError(null);
                      setQualityMessages([]);
                    }}
                    style={({ pressed }) => [
                      styles.retakeButton,
                      pressed && styles.overlayPressed,
                    ]}>
                    <Text style={styles.retakeLabel}>重新拍摄</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityLabel={`拍摄${currentView.label}照片`}
                  accessibilityRole="button"
                  disabled={
                    !cameraReady || !checkIn || busy || Boolean(pendingCapture)
                  }
                  onPress={() => void takePhoto()}
                  style={({ pressed }) => [
                    styles.shutterOuter,
                    pressed && styles.overlayPressed,
                    (!cameraReady || !checkIn || busy) &&
                      styles.shutterDisabled,
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <View style={styles.shutterInner} />
                  )}
                </Pressable>
              )}
              {operation === 'capturing' ? (
                <Text style={styles.operationText}>正在拍摄</Text>
              ) : null}
              {operation === 'uploading' ? (
                <Text style={styles.operationText}>正在上传并检查照片</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.instructionTitle}>三视角照片已上传</Text>
              <Text style={styles.instructionText}>
                正面、左侧和右侧照片均已保存。
              </Text>
              {error ? <Text style={styles.captureError}>{error}</Text> : null}
              <AppButton
                label="完成今日 Check-in"
                variant="secondary"
                loading={operation === 'completing'}
                onPress={() => void finishCheckIn()}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  permissionActions: {
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  completedViews: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completedView: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  completedViewLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  completedViewState: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  completedActions: {
    gap: spacing.sm,
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: colors.text,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(20, 24, 21, 0.58)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: colors.white,
    fontSize: 40,
    lineHeight: 42,
  },
  overlayPressed: {
    opacity: 0.7,
  },
  progressCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  progressLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  progressValue: {
    color: '#E6ECE8',
    fontSize: 12,
  },
  topSpacer: {
    width: 44,
  },
  guideArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  faceGuide: {
    width: '82%',
    maxWidth: 330,
    aspectRatio: 0.72,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 999,
  },
  instruction: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'rgba(20, 24, 21, 0.72)',
  },
  instructionTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  instructionText: {
    color: '#F1F4F2',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  operationRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  operationText: {
    color: '#E6ECE8',
    fontSize: 13,
    textAlign: 'center',
  },
  captureError: {
    color: '#FFD4D0',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
    borderRadius: 39,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.white,
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  retryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  retryButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  retryLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  retakeButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.white,
  },
  retakeLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
