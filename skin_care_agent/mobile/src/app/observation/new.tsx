import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppScreen } from '@/components/app-screen';
import { CameraGuideOverlay } from '@/components/camera-guide-overlay';
import { CameraStartPanel } from '@/components/camera-start-panel';
import { FaceRegionMap } from '@/components/face-region-map';
import { InlineNotice } from '@/components/inline-notice';
import { ObservationActionBar } from '@/components/observation-action-bar';
import { RegionChoiceBar } from '@/components/region-choice-bar';
import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { ApiError } from '@/lib/api';
import {
  selectPhotoFromLibrary,
  shouldUseSystemCamera,
  takeCameraPhoto,
} from '@/lib/camera-capture';
import { cameraPermissionState } from '@/lib/camera-permission';
import { createClientRequestId } from '@/lib/client-request-id';
import {
  createFaceAnalysisState,
  faceAnalysisReducer,
  liveGuidanceFromQuality,
  photoRecoveryPrimaryLabel,
  regionSelectionCta,
} from '@/lib/face-analysis-flow';
import type { CaptureGuidanceStatus, FacePhotoSource } from '@/lib/face-analysis-flow';
import { buildObservationForm, createObservation } from '@/lib/observation-api';
import {
  buildObservationQualityForm,
  checkObservationPhotoQuality,
} from '@/lib/observation-quality-api';
import type {
  ObservationQuality,
  ObservationQualityIssue,
} from '@/lib/observation-quality-api';
import {
  clearObservationDraftPhoto,
  confirmRegionSelection,
  createObservationDraft,
  observationDraftToInput,
  setObservationDraftPhoto,
  setRegionEventDecision,
} from '@/lib/observation-flow';
import type { ObservationDraft } from '@/lib/observation-flow';
import { regionById } from '@/lib/region-catalog';
import type { RegionId } from '@/lib/region-catalog';
import { previewRegionEvents } from '@/lib/region-event-api';
import type { RegionEventPreview } from '@/lib/region-event-api';
import {
  choiceRequiredRegions,
  regionEventDecisionError,
} from '@/lib/region-event-flow';
import {
  loadLastRegionSelection,
  saveLastRegionSelection,
} from '@/lib/region-selection-storage';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

const CAPTURE_GUIDANCE = new Set<CaptureGuidanceStatus>([
  'camera_ready',
  'face_not_found',
  'multiple_faces',
  'face_too_far',
  'face_too_close',
  'face_off_angle',
  'poor_lighting',
  'unstable',
  'occluded',
  'ready_to_capture',
]);

function sourceSize(quality: ObservationQuality | null) {
  const width = Number(quality?.metrics.width ?? 0);
  const height = Number(quality?.metrics.height ?? 0);
  return width > 0 && height > 0 ? { width, height } : { width: 3, height: 4 };
}

function apiQualityIssue(error: unknown): ObservationQualityIssue | null {
  if (!(error instanceof ApiError) || typeof error.detail !== 'object' || !error.detail) {
    return null;
  }
  const detail = error.detail as { primary_issue?: unknown };
  if (typeof detail.primary_issue !== 'object' || !detail.primary_issue) return null;
  const issue = detail.primary_issue as Partial<ObservationQualityIssue>;
  return typeof issue.code === 'string' && typeof issue.message === 'string'
    ? (issue as ObservationQualityIssue)
    : null;
}

export default function NewObservationScreen() {
  const { request } = useSession();
  const { entry } = useLocalSearchParams<{ entry?: string | string[] }>();
  const [permission, requestPermission] = useCameraPermissions();
  const requestIdRef = useRef(createClientRequestId());
  const [flow, dispatch] = useReducer(
    faceAnalysisReducer,
    requestIdRef.current,
    createFaceAnalysisState,
  );
  const [draft, setDraft] = useState<ObservationDraft>(() =>
    createObservationDraft(requestIdRef.current),
  );
  const [focused, setFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const [eventPreviews, setEventPreviews] = useState<RegionEventPreview[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const captureGuard = useRef(false);
  const liveSampleGuard = useRef(false);
  const submitGuard = useRef(false);
  const entryHandled = useRef(false);
  const permissionState = cameraPermissionState(permission);
  const useSystemCamera = shouldUseSystemCamera({
    isDevelopment: __DEV__,
    isDevice: Device.isDevice,
  });

  useEffect(() => {
    void loadLastRegionSelection().then((regionIds) => {
      if (regionIds.length > 0) {
        dispatch({ type: 'regions_suggested', regionIds });
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setCameraReady(false);
      };
    }, []),
  );

  useEffect(() => {
    if (
      useSystemCamera ||
      !focused ||
      !cameraReady ||
      flow.photoUri !== null
    ) {
      return;
    }
    let stopped = false;
    const sample = async () => {
      if (stopped || captureGuard.current || liveSampleGuard.current || !cameraRef.current) {
        return;
      }
      liveSampleGuard.current = true;
      let sampleFile: File | null = null;
      try {
        const picture = await cameraRef.current.takePictureAsync({
          quality: 0.45,
          shutterSound: false,
          skipProcessing: false,
        });
        if (!picture?.uri || stopped) return;
        sampleFile = new File(picture.uri);
        const quality = await checkObservationPhotoQuality(
          request,
          buildObservationQualityForm(sampleFile),
        );
        if (!stopped) {
          dispatch({
            type: 'guidance_changed',
            status: liveGuidanceFromQuality(quality),
          });
        }
      } catch {
        // Live guidance is progressive enhancement; final capture still has mandatory checks.
      } finally {
        try {
          sampleFile?.delete();
        } catch {
          // Expo may already have cleared a temporary camera file.
        }
        liveSampleGuard.current = false;
      }
    };
    const timer = setInterval(() => void sample(), 2400);
    void sample();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [cameraReady, flow.photoUri, focused, request, useSystemCamera]);

  async function openSettings() {
    setNotice(null);
    try {
      await Linking.openSettings();
    } catch (error) {
      setNotice(userFacingError(error));
    }
  }

  async function beginCamera() {
    setNotice(null);
    if (permissionState === 'settings') {
      await openSettings();
      return;
    }
    if (permissionState === 'loading') {
      setNotice('相机权限仍在读取，请稍后再试。');
      return;
    }
    if (permissionState === 'granted') {
      dispatch({ type: 'permission_granted' });
      return;
    }
    setRequestingPermission(true);
    try {
      const result = await requestPermission();
      if (result.granted) {
        dispatch({ type: 'permission_granted' });
      } else {
        dispatch({ type: 'permission_required' });
        setNotice('需要相机权限才能拍摄。你可以重新授权，或稍后再试。');
      }
    } catch (error) {
      setNotice(userFacingError(error));
    } finally {
      setRequestingPermission(false);
    }
  }

  async function runQualityCheck(photoUri: string) {
    dispatch({ type: 'quality_check_started' });
    setNotice(null);
    try {
      const file = new File(photoUri);
      const quality = await checkObservationPhotoQuality(
        request,
        buildObservationQualityForm(file),
      );
      if (quality.status === 'failed' || quality.regions.length === 0) {
        dispatch({
          type: 'quality_failed',
          issue:
            quality.primary_issue ??
            ({
              code: 'face_not_found',
              message: '没有完整定位到面部区域，请调整后重拍',
            } satisfies ObservationQualityIssue),
        });
        return;
      }
      dispatch({ type: 'quality_passed', quality });
    } catch (error) {
      dispatch({ type: 'analysis_failed', message: userFacingError(error) });
    }
  }

  async function acceptPhoto(photoUri: string, source: FacePhotoSource) {
    if (flow.photoUri !== null) {
      dispatch({ type: 'retake' });
    }
    const takenAt = new Date().toISOString();
    setDraft((current) => setObservationDraftPhoto(current, photoUri, takenAt));
    dispatch({ type: 'photo_captured', photoUri, source });
    await runQualityCheck(photoUri);
  }

  async function choosePhotoFromLibrary() {
    if (captureGuard.current || submitGuard.current) return;
    captureGuard.current = true;
    setChoosingPhoto(true);
    setNotice(null);
    try {
      const photo = await selectPhotoFromLibrary(() =>
        ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          mediaTypes: ['images'],
          quality: 1,
        }),
      );
      if (!photo) return;
      await acceptPhoto(photo.uri, 'library');
    } catch (error) {
      setNotice(userFacingError(error));
    } finally {
      captureGuard.current = false;
      setChoosingPhoto(false);
    }
  }

  async function capturePhoto() {
    if (
      captureGuard.current ||
      liveSampleGuard.current ||
      (!useSystemCamera && (!cameraRef.current || !cameraReady))
    ) {
      return;
    }
    captureGuard.current = true;
    setNotice(null);
    try {
      const photo = await takeCameraPhoto({
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
      if (!photo) return;
      await acceptPhoto(photo.uri, 'camera');
    } catch (error) {
      setNotice(userFacingError(error));
    } finally {
      captureGuard.current = false;
    }
  }

  function retake() {
    captureGuard.current = false;
    submitGuard.current = false;
    setNotice(null);
    setEventPreviews([]);
    setDraft((current) => clearObservationDraftPhoto(current));
    dispatch({ type: 'retake' });
  }

  async function persistObservation(confirmedDraft: ObservationDraft) {
    try {
      const file = confirmedDraft.photoUri ? new File(confirmedDraft.photoUri) : undefined;
      const form = buildObservationForm(observationDraftToInput(confirmedDraft, file));
      const observation = await createObservation(request, form);
      void saveLastRegionSelection(confirmedDraft.selectedRegions).catch(() => undefined);
      router.replace(`/observation/${observation.observation_id}`);
    } catch (error) {
      const issue = apiQualityIssue(error);
      if (issue) {
        dispatch({ type: 'quality_failed', issue });
      } else if (error instanceof ApiError && error.status === 409) {
        submitGuard.current = false;
        await prepareAnalysis(confirmedDraft, '记录分段状态已更新，请重新确认。');
        return;
      } else {
        dispatch({ type: 'analysis_failed', message: userFacingError(error) });
      }
      submitGuard.current = false;
    }
  }

  async function prepareAnalysis(
    draftToSubmit: ObservationDraft,
    nextNotice?: string,
  ) {
    if (submitGuard.current) return;
    submitGuard.current = true;
    dispatch({ type: 'analysis_started' });
    setNotice(null);
    try {
      const previews = await previewRegionEvents(request, {
        regionIds: draftToSubmit.selectedRegions,
        recordedAt: draftToSubmit.recordedAt,
        timezoneOffsetMinutes: draftToSubmit.timezoneOffsetMinutes,
      });
      setEventPreviews(previews);
      const choiceRegions = choiceRequiredRegions(previews);
      if (choiceRegions.length > 0) {
        const required = new Set(choiceRegions);
        setDraft((current) => ({
          ...draftToSubmit,
          eventDecisions: Object.fromEntries(
            Object.entries(current.eventDecisions).filter(([regionId]) =>
              required.has(regionId as RegionId),
            ),
          ),
        }));
        setNotice(nextNotice ?? null);
        submitGuard.current = false;
        dispatch({ type: 'event_confirmation_required' });
        return;
      }
      await persistObservation(draftToSubmit);
    } catch (error) {
      submitGuard.current = false;
      dispatch({ type: 'analysis_failed', message: userFacingError(error) });
    }
  }

  function startAnalysis() {
    if (flow.selectedRegions.length === 0 || !draft.photoUri) return;
    const confirmed = confirmRegionSelection({
      ...draft,
      selectedRegions: [...flow.selectedRegions],
    });
    setDraft(confirmed);
    void prepareAnalysis(confirmed);
  }

  function confirmEventsAndAnalyze() {
    const decisionError = regionEventDecisionError(eventPreviews, draft.eventDecisions);
    if (decisionError) {
      setNotice(decisionError);
      return;
    }
    if (submitGuard.current) return;
    submitGuard.current = true;
    dispatch({ type: 'analysis_started' });
    setNotice(null);
    void persistObservation(draft);
  }

  useEffect(() => {
    const requestedEntry = Array.isArray(entry) ? entry[0] : entry;
    if (
      entryHandled.current ||
      flow.status !== 'permission_required' ||
      (requestedEntry === 'camera' && permissionState === 'loading')
    ) {
      return;
    }
    if (requestedEntry === 'camera') {
      entryHandled.current = true;
      const timer = setTimeout(() => void beginCamera(), 0);
      return () => clearTimeout(timer);
    } else if (requestedEntry === 'library') {
      entryHandled.current = true;
      const timer = setTimeout(() => void choosePhotoFromLibrary(), 0);
      return () => clearTimeout(timer);
    }
    // Entry intents are consumed once; recovery remains on this state machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, flow.status, permissionState]);

  if (flow.status === 'permission_required') {
    return (
      <AppScreen backgroundColor={observationColors.background}>
        <CameraStartPanel
          busy={requestingPermission || choosingPhoto}
          choosingPhoto={choosingPhoto}
          compact={permissionState === 'granted'}
          onChoosePhoto={() => void choosePhotoFromLibrary()}
          onOpenCamera={() => void beginCamera()}
          permissionDenied={permissionState === 'settings'}
        />
        {requestingPermission ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={observationColors.action} />
            <Text style={styles.muted}>正在请求相机权限</Text>
          </View>
        ) : null}
        {notice ? <InlineNotice tone="error" message={notice} /> : null}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancelLink}>
          <Text style={styles.cancelLinkLabel}>取消</Text>
        </Pressable>
      </AppScreen>
    );
  }

  if (
    flow.status === 'camera_starting' ||
    CAPTURE_GUIDANCE.has(flow.status as CaptureGuidanceStatus)
  ) {
    const guidanceStatus = CAPTURE_GUIDANCE.has(flow.status as CaptureGuidanceStatus)
      ? (flow.status as CaptureGuidanceStatus)
      : 'camera_ready';
    return (
      <View style={styles.cameraScreen}>
        {!useSystemCamera && focused ? (
          <CameraView
            facing="front"
            mirror={false}
            mode="picture"
            onCameraReady={() => {
              setCameraReady(true);
              dispatch({ type: 'camera_started' });
            }}
            onMountError={() => setNotice('相机预览启动失败，请返回后重新进入。')}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.systemCameraBackdrop]} />
        )}
        <CameraGuideOverlay status={guidanceStatus} />
        <SafeAreaView pointerEvents="box-none" style={styles.cameraSafeArea}>
          <View style={styles.cameraTopBar}>
            <Pressable
              accessibilityLabel="退出拍摄"
              accessibilityRole="button"
              onPress={() => dispatch({ type: 'permission_required' })}
              style={styles.topButton}>
              <Text style={styles.topButtonLabel}>取消</Text>
            </Pressable>
            <Text style={styles.cameraTitle}>拍摄正脸照片</Text>
            <View style={styles.topButton} />
          </View>
          <View style={styles.cameraBottom}>
            {notice ? <Text style={styles.cameraError}>{notice}</Text> : null}
            <Pressable
              accessibilityLabel={useSystemCamera ? '打开系统相机拍摄' : '拍摄'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !useSystemCamera && !cameraReady }}
              disabled={!useSystemCamera && !cameraReady}
              onPress={() => void capturePhoto()}
              style={({ pressed }) => [
                styles.captureButton,
                pressed && styles.pressed,
                !useSystemCamera && !cameraReady && styles.disabled,
              ]}>
              <Text style={styles.captureButtonLabel}>
                {useSystemCamera ? '打开系统相机' : '拍摄'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (flow.status === 'photo_captured' || flow.status === 'quality_checking') {
    return (
      <AppScreen backgroundColor={observationColors.background}>
        <View style={styles.pageHeader}>
          <Text accessibilityRole="header" style={styles.title}>正在检查照片</Text>
          <Text style={styles.description}>会先确认脸部完整、距离、角度、光线和清晰度。</Text>
        </View>
        {flow.photoUri ? (
          <Image contentFit="cover" source={{ uri: flow.photoUri }} style={styles.qualityPhoto} />
        ) : null}
        <View accessibilityLiveRegion="polite" style={styles.progressBar}>
          <ActivityIndicator color={observationColors.sage} />
          <Text style={styles.progressText}>正在检查照片质量</Text>
        </View>
      </AppScreen>
    );
  }

  if (flow.status === 'quality_failed') {
    return (
      <AppScreen
        backgroundColor={observationColors.background}
        footer={
          <ObservationActionBar
            onPrimaryPress={
              flow.photoSource === 'library'
                ? () => void choosePhotoFromLibrary()
                : retake
            }
            onSecondaryPress={() => flow.photoUri && void runQualityCheck(flow.photoUri)}
            primaryLabel={photoRecoveryPrimaryLabel(flow.photoSource)}
            secondaryLabel="重新检查这张照片"
          />
        }>
        <View style={styles.pageHeader}>
          <Text accessibilityRole="header" style={styles.title}>这张照片需要调整</Text>
          <Text style={styles.description}>
            照片尚未保存，你可以按提示重新获取，或再次检查这张照片。
          </Text>
        </View>
        {flow.photoUri ? (
          <Image contentFit="cover" source={{ uri: flow.photoUri }} style={styles.qualityPhoto} />
        ) : null}
        <InlineNotice
          tone="error"
          message={flow.qualityIssue?.message ?? '照片质量未达到分析要求，请重新拍摄。'}
        />
      </AppScreen>
    );
  }

  if (flow.status === 'selecting_regions' && flow.photoUri && flow.quality) {
    return (
      <AppScreen
        backgroundColor={observationColors.background}
        footer={
          <ObservationActionBar
            onPrimaryPress={startAnalysis}
            onSecondaryPress={retake}
            primaryDisabled={flow.selectedRegions.length === 0}
            primaryLabel={regionSelectionCta(flow.selectedRegions)}
            secondaryLabel="重新拍摄"
          />
        }>
        <View style={styles.pageHeader}>
          <Text accessibilityRole="header" style={styles.title}>这次想重点看看哪里？</Text>
          <Text style={styles.description}>
            系统建议的位置会预先选中，你还可以选择任意需要关注的区域。
          </Text>
        </View>
        <FaceRegionMap
          activeRegion={flow.activeRegion}
          calloutMode="all"
          geometry={flow.quality.regions}
          onToggle={(regionId) => dispatch({ type: 'region_toggled', regionId })}
          photoUri={flow.photoUri}
          required={flow.requiredRegions}
          selected={flow.selectedRegions}
          sourceSize={sourceSize(flow.quality)}
        />
        <View style={styles.regionChoices}>
          <RegionChoiceBar
            onToggle={(regionId) => dispatch({ type: 'region_toggled', regionId })}
            required={flow.requiredRegions}
            selected={flow.selectedRegions}
          />
          <Text style={styles.directionNote}>左右均指你本人真实左右，与自拍预览是否镜像无关。</Text>
        </View>
      </AppScreen>
    );
  }

  if (flow.status === 'confirming_events') {
    const requiredRegions = choiceRequiredRegions(eventPreviews);
    return (
      <AppScreen
        backgroundColor={observationColors.background}
        footer={
          <ObservationActionBar
            onPrimaryPress={confirmEventsAndAnalyze}
            onSecondaryPress={() => dispatch({ type: 'event_confirmation_cancelled' })}
            primaryLabel="确认分段并开始分析"
            secondaryLabel="修改检测区域"
          />
        }>
        <View style={styles.pageHeader}>
          <Text accessibilityRole="header" style={styles.title}>确认记录分段</Text>
          <Text style={styles.description}>
            这些区域距离上一条有效记录已满 30 天。请选择继续原记录，或从今天开始新一段。
          </Text>
        </View>
        <View style={styles.eventList}>
          {requiredRegions.map((regionId) => {
            const decision = draft.eventDecisions[regionId];
            return (
              <View key={regionId} style={styles.eventSection}>
                <Text style={styles.eventTitle}>{regionById(regionId).label}</Text>
                <Text style={styles.directionNote}>这只影响记录组织，不代表皮肤问题结束或重新发生。</Text>
                <View style={styles.decisionRow}>
                  {(['continue', 'start_new'] as const).map((value) => {
                    const selected = decision === value;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        key={value}
                        onPress={() =>
                          setDraft((current) =>
                            setRegionEventDecision(current, regionId, value),
                          )
                        }
                        style={[styles.decision, selected && styles.decisionSelected]}>
                        <Text style={styles.decisionLabel}>
                          {selected ? '✓ ' : ''}{value === 'continue' ? '继续这段记录' : '开始新记录'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
        {notice ? <InlineNotice tone="error" message={notice} /> : null}
      </AppScreen>
    );
  }

  if (flow.status === 'error') {
    const retryQuality = flow.quality === null;
    return (
      <AppScreen
        backgroundColor={observationColors.background}
        footer={
          <ObservationActionBar
            onPrimaryPress={() => {
              if (retryQuality && flow.photoUri) {
                void runQualityCheck(flow.photoUri);
              } else {
                startAnalysis();
              }
            }}
            onSecondaryPress={retake}
            primaryLabel={retryQuality ? '重试照片检查' : '重试 AI 分析'}
            secondaryLabel="重新拍摄"
          />
        }>
        <View style={styles.pageHeader}>
          <Text accessibilityRole="header" style={styles.title}>暂时没能继续</Text>
          <Text style={styles.description}>照片和已选区域都还在，不需要从头开始。</Text>
        </View>
        {flow.photoUri ? (
          <Image contentFit="cover" source={{ uri: flow.photoUri }} style={styles.qualityPhoto} />
        ) : null}
        <InlineNotice tone="error" message={flow.errorMessage ?? '网络异常，请稍后重试。'} />
      </AppScreen>
    );
  }

  return (
    <SafeAreaView style={styles.centered}>
      <ActivityIndicator color={observationColors.action} size="large" />
      <Text accessibilityLiveRegion="polite" style={styles.muted}>
        正在准备分析并保存今日记录
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.lg,
    backgroundColor: observationColors.background,
  },
  muted: { color: observationColors.textMuted, fontSize: 14 },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: observationSpacing.sm,
    marginTop: observationSpacing.lg,
  },
  cancelLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelLinkLabel: { color: observationColors.action, fontSize: 15, fontWeight: '600' },
  pageHeader: { gap: observationSpacing.sm, marginBottom: observationSpacing.xl },
  title: {
    color: observationColors.text,
    fontFamily: 'serif',
    fontSize: 30,
    lineHeight: 38,
  },
  description: { color: observationColors.textMuted, fontSize: 15, lineHeight: 23 },
  cameraScreen: { flex: 1, backgroundColor: observationColors.forest },
  systemCameraBackdrop: { backgroundColor: observationColors.forest },
  cameraSafeArea: { flex: 1, justifyContent: 'space-between' },
  cameraTopBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: observationSpacing.lg,
    backgroundColor: observationColors.cameraTopBar,
  },
  topButton: { width: 64, minHeight: 44, justifyContent: 'center' },
  topButtonLabel: { color: observationColors.scrimText, fontSize: 15, fontWeight: '600' },
  cameraTitle: {
    flex: 1,
    color: observationColors.scrimText,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  cameraBottom: {
    alignItems: 'center',
    gap: observationSpacing.md,
    paddingHorizontal: observationSpacing.lg,
    paddingBottom: observationSpacing.xl,
  },
  cameraError: {
    color: observationColors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  captureButton: {
    minWidth: 156,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surface,
    paddingHorizontal: observationSpacing.xl,
  },
  captureButtonLabel: { color: observationColors.forest, fontSize: 16, fontWeight: '800' },
  qualityPhoto: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: observationRadii.camera,
    backgroundColor: observationColors.forest,
  },
  progressBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.sm,
    marginTop: observationSpacing.lg,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surfaceMuted,
    paddingHorizontal: observationSpacing.lg,
  },
  progressText: { color: observationColors.text, fontSize: 14, fontWeight: '600' },
  regionChoices: { gap: observationSpacing.md, marginTop: observationSpacing.lg },
  directionNote: { color: observationColors.textMuted, fontSize: 12, lineHeight: 18 },
  eventList: { gap: observationSpacing.lg },
  eventSection: {
    gap: observationSpacing.md,
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.lg,
    backgroundColor: observationColors.surface,
    padding: observationSpacing.lg,
  },
  eventTitle: { color: observationColors.text, fontSize: 18, fontWeight: '700' },
  decisionRow: { gap: observationSpacing.sm },
  decision: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.sm,
    paddingHorizontal: observationSpacing.md,
  },
  decisionSelected: {
    borderColor: observationColors.sage,
    backgroundColor: observationColors.sageSoft,
  },
  decisionLabel: { color: observationColors.text, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.44 },
});
