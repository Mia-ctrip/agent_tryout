import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';

type CameraStartPanelProps = {
  onOpenCamera: () => void;
  onChoosePhoto: () => void;
  permissionDenied?: boolean;
  compact?: boolean;
  busy?: boolean;
  choosingPhoto?: boolean;
  embedded?: boolean;
};

export function CameraStartPanel({
  onOpenCamera,
  onChoosePhoto,
  permissionDenied = false,
  compact = false,
  busy = false,
  choosingPhoto = false,
  embedded = false,
}: CameraStartPanelProps) {
  return (
    <View style={[styles.root, embedded && styles.rootEmbedded]}>
      <View style={[styles.preview, embedded && styles.previewEmbedded]}>
        <View style={styles.cornerTopLeft} />
        <View style={styles.cornerTopRight} />
        <View style={styles.cornerBottomLeft} />
        <View style={styles.cornerBottomRight} />
        <View style={styles.silhouetteShoulders} />
        <View style={styles.silhouetteNeck} />
        <View style={styles.silhouetteHead} />
        <View style={styles.faceGuide}>
          <View style={[styles.guideTick, styles.guideTickTop]} />
          <View style={[styles.guideTick, styles.guideTickRight]} />
          <View style={[styles.guideTick, styles.guideTickBottom]} />
          <View style={[styles.guideTick, styles.guideTickLeft]} />
        </View>
        <View style={styles.previewCaption}>
          <View style={styles.statusDot} />
          <Text style={styles.previewLabel}>正脸 · 自然光 · 保持清晰</Text>
        </View>
      </View>

      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, embedded && styles.titleEmbedded]}>
          记录今天的皮肤状态
        </Text>
        <Text style={styles.body}>
          {permissionDenied
            ? '需要相机权限才能直接拍摄；你也可以从相册选择一张清晰的正脸照片。'
            : compact || embedded
              ? '拍一张清晰正脸，或选择手机原图；之后会进行相同的质量检查。'
              : '你可以直接拍摄，或从相册选择手机原图。获取照片后会执行相同的质量检查；确认后，原图会随今日记录保存，并用于所选区域的 AI 分析。'}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint={permissionDenied ? '再次请求系统相机权限' : '进入实时拍摄引导'}
          accessibilityLabel={permissionDenied ? '重新授权相机' : '拍摄正脸照片'}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onOpenCamera}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <View style={styles.smallCameraIcon}>
            <View style={styles.smallLens} />
          </View>
          <Text style={styles.buttonLabel}>
            {permissionDenied ? '重新授权相机' : '拍摄正脸'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityHint="选择手机拍摄的清晰正脸原图并进入质量检查"
          accessibilityLabel="从相册选择照片"
          accessibilityRole="button"
          accessibilityState={{ busy: choosingPhoto, disabled: busy }}
          disabled={busy}
          onPress={onChoosePhoto}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <Text style={styles.secondaryButtonLabel}>
            {choosingPhoto ? '正在打开相册…' : '从相册选择'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: observationSpacing.lg,
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.lg,
    backgroundColor: observationColors.surface,
    padding: observationSpacing.lg,
  },
  rootEmbedded: { marginBottom: observationSpacing.sm },
  preview: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: observationRadii.camera,
    backgroundColor: observationColors.surfaceMuted,
    overflow: 'hidden',
  },
  previewEmbedded: { minHeight: 196 },
  silhouetteShoulders: {
    position: 'absolute',
    bottom: -60,
    width: 250,
    height: 132,
    borderRadius: 120,
    backgroundColor: observationColors.portraitSoft,
    opacity: 0.72,
  },
  silhouetteNeck: {
    position: 'absolute',
    bottom: 42,
    width: 54,
    height: 64,
    borderRadius: 24,
    backgroundColor: observationColors.portrait,
    opacity: 0.8,
  },
  silhouetteHead: {
    width: 94,
    height: 126,
    borderRadius: 48,
    backgroundColor: observationColors.portrait,
    opacity: 0.82,
  },
  faceGuide: {
    position: 'absolute',
    width: 142,
    height: 184,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: observationColors.cameraPanelBorder,
    borderRadius: 72,
  },
  guideTick: { position: 'absolute', backgroundColor: observationColors.surface },
  guideTickTop: { top: -3, width: 2, height: 12 },
  guideTickBottom: { bottom: -3, width: 2, height: 12 },
  guideTickLeft: { left: -3, width: 12, height: 2 },
  guideTickRight: { right: -3, width: 12, height: 2 },
  cornerTopLeft: {
    position: 'absolute', top: 18, left: 18, width: 18, height: 18,
    borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: observationColors.sage,
  },
  cornerTopRight: {
    position: 'absolute', top: 18, right: 18, width: 18, height: 18,
    borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: observationColors.sage,
  },
  cornerBottomLeft: {
    position: 'absolute', bottom: 18, left: 18, width: 18, height: 18,
    borderBottomWidth: 1.5, borderLeftWidth: 1.5, borderColor: observationColors.sage,
  },
  cornerBottomRight: {
    position: 'absolute', right: 18, bottom: 18, width: 18, height: 18,
    borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: observationColors.sage,
  },
  previewCaption: {
    position: 'absolute',
    right: observationSpacing.lg,
    bottom: observationSpacing.md,
    left: observationSpacing.lg,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.sm,
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.overlaySurface,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: observationColors.sage },
  previewLabel: { color: observationColors.text, fontSize: 12, fontWeight: '600' },
  copy: { gap: observationSpacing.sm },
  actions: { gap: observationSpacing.sm },
  title: {
    color: observationColors.text,
    fontFamily: 'serif',
    fontSize: 26,
    lineHeight: 34,
  },
  titleEmbedded: { fontSize: 23, lineHeight: 30 },
  body: { color: observationColors.textMuted, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.sm,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.action,
    paddingHorizontal: observationSpacing.xl,
  },
  smallCameraIcon: {
    width: 22,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: observationColors.scrimText,
    borderRadius: 4,
  },
  smallLens: {
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: observationColors.scrimText,
    borderRadius: 4,
  },
  buttonLabel: { color: observationColors.scrimText, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surfaceMuted,
    paddingHorizontal: observationSpacing.xl,
  },
  secondaryButtonLabel: { color: observationColors.action, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.48 },
});
