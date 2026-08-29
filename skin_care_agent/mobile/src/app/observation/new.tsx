import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { RegionSelector } from '@/components/region-selector';
import { colors, radii, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { cameraPermissionState } from '@/lib/camera-permission';
import { shouldUseSystemCamera, takeCameraPhoto } from '@/lib/camera-capture';
import { createClientRequestId } from '@/lib/client-request-id';
import { buildObservationForm, createObservation } from '@/lib/observation-api';
import {
  createObservationDraft,
  confirmRegionSelection,
  observationDraftError,
  observationDraftToInput,
  selectRegions,
  setObservationDraftPhoto,
  setRegionNote,
  setRegionEventDecision,
} from '@/lib/observation-flow';
import type { ObservationDraft, SavePhase } from '@/lib/observation-flow';
import { userFacingError } from '@/lib/errors';
import { regionById } from '@/lib/region-catalog';
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
import { useSession } from '@/providers/session-provider';

type ScreenMode = 'choose' | 'camera' | 'regions' | 'events' | 'confirm';

export default function NewObservationScreen() {
  const { request } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [draft, setDraft] = useState<ObservationDraft>(() =>
    createObservationDraft(createClientRequestId()),
  );
  const [mode, setMode] = useState<ScreenMode>('choose');
  const [phase, setPhase] = useState<SavePhase>('idle');
  const [focused, setFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventPreviews, setEventPreviews] = useState<RegionEventPreview[]>([]);
  const [previewingEvents, setPreviewingEvents] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const permissionState = cameraPermissionState(permission);
  const useSystemCamera = shouldUseSystemCamera({
    isDevelopment: __DEV__,
    isDevice: Device.isDevice,
  });
  const saving = phase === 'saving';

  useEffect(() => {
    void loadLastRegionSelection().then((regionIds) => {
      if (regionIds.length > 0) {
        setDraft((current) =>
          current.selectedRegions.length > 0
            ? current
            : selectRegions(current, regionIds),
        );
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

  function updateRegionNote(regionId: Parameters<typeof setRegionNote>[1], note: string) {
    setDraft((current) => setRegionNote(current, regionId, note));
    if (phase === 'save_failed') {
      setPhase('idle');
      setError(null);
    }
  }

  async function beginPhoto() {
    setError(null);
    if (permissionState === 'granted') {
      setMode('camera');
      return;
    }
    if (permissionState === 'settings') {
      setMode('camera');
      return;
    }
    if (permissionState === 'loading') {
      setError('相机权限仍在读取，请稍后再试。');
      return;
    }

    setRequestingPermission(true);
    try {
      const result = await requestPermission();
      if (result.granted) {
        setMode('camera');
      } else {
        setError('没有相机权限时，仍可以直接写下观察。');
      }
    } catch (permissionError) {
      setError(userFacingError(permissionError));
    } finally {
      setRequestingPermission(false);
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

  async function capturePhoto() {
    if (
      phase === 'capturing' ||
      (!useSystemCamera && (!cameraRef.current || !cameraReady))
    ) {
      return;
    }

    setPhase('capturing');
    setError(null);
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
      if (!photo) {
        setPhase('idle');
        return;
      }
      setDraft((current) =>
        setObservationDraftPhoto(current, photo.uri, new Date().toISOString()),
      );
      setMode('regions');
      setPhase('idle');
    } catch (captureError) {
      setError(userFacingError(captureError));
      setPhase('idle');
    }
  }

  async function saveObservation() {
    if (saving) {
      return;
    }
    const validationError = observationDraftError(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPhase('saving');
    setError(null);
    try {
      const file = draft.photoUri ? new File(draft.photoUri) : undefined;
      const form = buildObservationForm(observationDraftToInput(draft, file));
      const observation = await createObservation(request, form);
      void saveLastRegionSelection(draft.selectedRegions).catch(() => undefined);
      router.replace(`/observation/${observation.observation_id}`);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        await previewConfirmedRegions(draft, '记录分段状态已更新，请重新确认。');
        setPhase('idle');
        return;
      }
      setError(userFacingError(saveError));
      setPhase('save_failed');
    }
  }

  async function previewConfirmedRegions(
    confirmedDraft: ObservationDraft,
    notice?: string,
  ) {
    setPreviewingEvents(true);
    setError(null);
    try {
      const previews = await previewRegionEvents(request, {
        regionIds: confirmedDraft.selectedRegions,
        recordedAt: confirmedDraft.recordedAt,
        timezoneOffsetMinutes: confirmedDraft.timezoneOffsetMinutes,
      });
      setEventPreviews(previews);
      const required = new Set(choiceRequiredRegions(previews));
      setDraft((current) => ({
        ...current,
        eventDecisions: Object.fromEntries(
          Object.entries(current.eventDecisions).filter(([regionId]) =>
            required.has(regionId as Parameters<typeof regionById>[0]),
          ),
        ),
      }));
      setError(notice ?? null);
      setMode(required.size > 0 ? 'events' : 'confirm');
    } catch (previewError) {
      setError(userFacingError(previewError));
    } finally {
      setPreviewingEvents(false);
    }
  }

  if (mode === 'camera') {
    if (permissionState === 'loading') {
      return (
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.mutedText}>正在检查相机权限</Text>
        </SafeAreaView>
      );
    }
    if (permissionState !== 'granted') {
      return (
        <AppScreen>
          <View style={styles.pageHeader}>
            <Text style={styles.title}>相机权限已关闭</Text>
            <Text style={styles.description}>
              请在系统设置中允许相机权限，或者直接用文字完成这次观察。
            </Text>
          </View>
          {error ? <InlineNotice tone="error" message={error} /> : null}
          <View style={styles.actions}>
            <AppButton label="打开系统设置" onPress={() => void openSettings()} />
            <AppButton
              label="直接写下观察"
              variant="secondary"
              onPress={() => setMode('regions')}
            />
            <AppButton label="返回" variant="text" onPress={() => setMode('choose')} />
          </View>
        </AppScreen>
      );
    }

    return (
      <View style={styles.cameraScreen}>
        {!useSystemCamera && focused ? (
          <CameraView
            ref={cameraRef}
            facing="front"
            mirror={false}
            mode="picture"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setError('相机预览启动失败，请返回后重新进入。')}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <SafeAreaView pointerEvents="box-none" style={styles.cameraOverlay}>
          <View style={styles.cameraTopBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode('choose')}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Text style={styles.cameraTitle}>拍摄本次观察照片</Text>
            <View style={styles.cancelButton} />
          </View>
          <View style={styles.guideArea} pointerEvents="none">
            {!useSystemCamera ? <View style={styles.faceGuide} /> : null}
          </View>
          <View style={styles.cameraControls}>
            <Text style={styles.cameraInstruction}>
              正对镜头，让额头、两颊和下巴完整出现在画面中。
            </Text>
            {error ? <Text style={styles.cameraError}>{error}</Text> : null}
            {useSystemCamera ? (
              <AppButton
                label="打开系统相机"
                variant="secondary"
                loading={phase === 'capturing'}
                onPress={() => void capturePhoto()}
              />
            ) : (
              <Pressable
                accessibilityLabel="拍摄本次观察照片"
                accessibilityRole="button"
                disabled={!cameraReady || phase === 'capturing'}
                onPress={() => void capturePhoto()}
                style={({ pressed }) => [
                  styles.shutterOuter,
                  pressed && styles.pressed,
                  (!cameraReady || phase === 'capturing') && styles.disabled,
                ]}>
                {phase === 'capturing' ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'regions') {
    return (
      <AppScreen>
        <View style={styles.pageHeader}>
          <Text style={styles.title}>选择本次观察区域</Text>
          <Text style={styles.description}>
            左右指你本人真实左右，自拍预览是否镜像都不会改变区域含义。
          </Text>
        </View>
        {draft.photoUri ? (
          <Image
            accessibilityLabel="待保存的观察照片"
            contentFit="cover"
            source={{ uri: draft.photoUri }}
            style={styles.regionPreview}
          />
        ) : (
          <InlineNotice tone="info" message="本次使用文字记录，每个已选区域都需要填写观察。" />
        )}
        <RegionSelector
          selected={draft.selectedRegions}
          onChange={(regionIds) => {
            setDraft((current) => selectRegions(current, regionIds));
            setError(null);
          }}
        />
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={styles.actions}>
          <AppButton
            label="确认这些区域"
            loading={previewingEvents}
            onPress={() => {
              if (draft.selectedRegions.length === 0) {
                setError('请至少选择一个观察区域。');
                return;
              }
              const confirmed = confirmRegionSelection(draft);
              setDraft(confirmed);
              setError(null);
              void previewConfirmedRegions(confirmed);
            }}
          />
          {draft.photoUri ? (
            <AppButton label="重新拍摄" variant="secondary" onPress={() => setMode('camera')} />
          ) : null}
          <AppButton label="返回选择" variant="text" onPress={() => setMode('choose')} />
        </View>
      </AppScreen>
    );
  }

  if (mode === 'events') {
    const requiredRegions = choiceRequiredRegions(eventPreviews);
    return (
      <AppScreen>
        <View style={styles.pageHeader}>
          <Text style={styles.title}>确认记录分段</Text>
          <Text style={styles.description}>
            以下区域距离上一条有效记录已满 30 天。请一次确认继续原记录，或从今天开始一段新记录。
          </Text>
        </View>
        <View style={styles.confirmedList}>
          {requiredRegions.map((regionId) => {
            const region = regionById(regionId);
            const decision = draft.eventDecisions[regionId];
            return (
              <View key={regionId} style={styles.confirmedRegion}>
                <Text style={styles.confirmedRegionLabel}>{region.label}</Text>
                <Text style={styles.confirmedBoundary}>
                  这只是记录组织方式，不代表皮肤问题已结束或重新发生。
                </Text>
                <View style={styles.decisionActions}>
                  <AppButton
                    label={decision === 'continue' ? '✓ 继续这段记录' : '继续这段记录'}
                    variant={decision === 'continue' ? 'primary' : 'secondary'}
                    onPress={() =>
                      setDraft((current) =>
                        setRegionEventDecision(current, regionId, 'continue'),
                      )
                    }
                  />
                  <AppButton
                    label={decision === 'start_new' ? '✓ 开始一段新记录' : '开始一段新记录'}
                    variant={decision === 'start_new' ? 'primary' : 'secondary'}
                    onPress={() =>
                      setDraft((current) =>
                        setRegionEventDecision(current, regionId, 'start_new'),
                      )
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={styles.actions}>
          <AppButton
            label="确认分段并继续"
            onPress={() => {
              const decisionError = regionEventDecisionError(
                eventPreviews,
                draft.eventDecisions,
              );
              if (decisionError) {
                setError(decisionError);
                return;
              }
              setError(null);
              setMode('confirm');
            }}
          />
          <AppButton label="修改区域" variant="text" onPress={() => setMode('regions')} />
        </View>
      </AppScreen>
    );
  }

  if (mode === 'confirm') {
    return (
      <AppScreen>
        <View style={styles.pageHeader}>
          <Text style={styles.title}>保存前确认</Text>
          <Text style={styles.description}>
            {draft.photoUri ? '这张照片' : '这次文字记录'}将分别整理以下区域。未选择的区域只表示本次没有观察。
          </Text>
        </View>
        <View style={styles.confirmedList}>
          {draft.selectedRegions.map((regionId) => {
            const region = regionById(regionId);
            const note = draft.notes[regionId] ?? '';
            return (
              <View key={regionId} style={styles.confirmedRegion}>
                <Text style={styles.confirmedRegionLabel}>{region.label}</Text>
                <Text style={styles.confirmedBoundary}>{region.boundary}</Text>
                <TextInput
                  accessibilityLabel={`${region.label}观察文字`}
                  maxLength={500}
                  multiline
                  onChangeText={(value) => updateRegionNote(regionId, value)}
                  placeholder={draft.photoUri ? '补充文字（选填）' : '写下这个区域的真实观察'}
                  placeholderTextColor={colors.textMuted}
                  style={styles.regionTextInput}
                  textAlignVertical="top"
                  value={note}
                />
                <Text style={styles.counter}>{note.length}/500</Text>
              </View>
            );
          })}
        </View>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={styles.actions}>
          <AppButton
            label={phase === 'save_failed' ? '重新保存' : '保存这次观察'}
            loading={saving}
            onPress={() => void saveObservation()}
          />
          <AppButton
            label="修改区域"
            variant="text"
            disabled={saving}
            onPress={() => setMode('regions')}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.pageHeader}>
        <Text style={styles.title}>记录现在的变化</Text>
        <Text style={styles.description}>
          拍一张照片或直接写下观察，再选择一到六个固定区域。
        </Text>
      </View>
      <View style={styles.choicePanel}>
        <Text style={styles.choiceTitle}>单张照片</Text>
        <Text style={styles.choiceBody}>原图与记录时间会先保存，AI 整理不会阻塞离开。</Text>
        <AppButton
          label="拍一张照片"
          loading={requestingPermission}
          onPress={() => void beginPhoto()}
        />
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      <View style={styles.actions}>
        <AppButton
          label="暂时不拍，直接记录"
          variant="secondary"
          onPress={() => {
            setError(null);
            setMode('regions');
          }}
        />
        <AppButton label="取消" variant="text" onPress={() => router.back()} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  mutedText: { color: colors.textMuted, fontSize: 14 },
  pageHeader: { gap: spacing.sm, marginBottom: spacing.xxl },
  title: { color: colors.text, fontSize: 30, lineHeight: 38, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  choicePanel: {
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.lavender,
    padding: spacing.xl,
  },
  choiceTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  choiceBody: { color: colors.text, fontSize: 15, lineHeight: 23 },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 15, fontWeight: '700' },
  textInput: {
    minHeight: 136,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    padding: spacing.lg,
  },
  counter: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 12 },
  preview: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.lavender,
  },
  regionPreview: {
    width: '100%',
    height: 180,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.lavender,
  },
  confirmedList: { gap: spacing.lg },
  confirmedRegion: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  confirmedRegionLabel: { color: colors.text, fontSize: 18, fontWeight: '800' },
  confirmedBoundary: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  decisionActions: { gap: spacing.sm },
  regionTextInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: spacing.md,
  },
  cameraScreen: { flex: 1, backgroundColor: colors.text },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraTopBar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(35, 32, 40, 0.62)',
  },
  cancelButton: { width: 64, minHeight: 44, justifyContent: 'center' },
  cancelText: { color: colors.warmWhite, fontSize: 16, fontWeight: '600' },
  cameraTitle: {
    flex: 1,
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
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
    borderColor: 'rgba(255, 253, 248, 0.92)',
    borderRadius: radii.pill,
  },
  cameraControls: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: 'rgba(35, 32, 40, 0.76)',
  },
  cameraInstruction: {
    color: colors.warmWhite,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  cameraError: { color: '#FFD8D4', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  shutterOuter: {
    width: 78,
    height: 78,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.warmWhite,
    borderRadius: 39,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.warmWhite,
  },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.45 },
});
