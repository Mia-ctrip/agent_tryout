import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { colors, maxContentWidth, radii, spacing } from '@/constants/theme';
import { photoRecoveryPrimaryLabel } from '@/lib/face-analysis-flow';
import type { FacePhotoSource } from '@/lib/face-analysis-flow';
import type { ObservationQualityIssue } from '@/lib/observation-quality-api';

type PhotoQualityReviewProps = {
  state: 'checking' | 'needs_adjustment' | 'unavailable';
  photoUri: string | null;
  source: FacePhotoSource | null;
  issue?: ObservationQualityIssue | null;
  error?: string | null;
  notice?: string | null;
  choosingPhoto: boolean;
  onRetry: () => void;
  onReplace: () => void;
  onBack: () => void;
};

export function PhotoQualityReview({
  state, photoUri, source, issue, error, notice, choosingPhoto, onRetry, onReplace, onBack,
}: PhotoQualityReviewProps) {
  const { width, height } = useWindowDimensions();
  const [photoRatio, setPhotoRatio] = useState(1);
  const [previewFailed, setPreviewFailed] = useState(false);
  const checking = state === 'checking';
  const unavailable = state === 'unavailable';
  const replaceLabel = photoRecoveryPrimaryLabel(source);
  const title = checking ? '正在检查照片' : unavailable ? '暂时无法检查'
    : issue?.code === 'blurry' ? '照片有些模糊' : '照片需要调整';
  const description = checking ? '确认面部是否完整，以及光线与清晰度是否适合观察。'
    : unavailable ? (error || '连接暂时中断，请稍后重试。')
      : issue?.code === 'blurry' ? (source === 'library'
        ? '请选择一张对焦清晰、能看清面部细节的原图。'
        : '请保持手机稳定，等画面清晰后再拍一张。')
      : (issue?.message || '请让面部完整入镜，在光线均匀的地方重新拍摄。');
  const photoWidth = Math.min(width - spacing.xl * 2, maxContentWidth);
  const photoHeight = Math.min(photoWidth / photoRatio, height * 0.42);

  return (
    <AppScreen contentStyle={styles.screen} footer={checking ? undefined : (
      <View style={styles.actions}>
        <EditorialText role="caption" style={styles.saveNote}>照片尚未保存到记录</EditorialText>
        <AppButton label={unavailable ? '重新检查' : replaceLabel}
          onPress={unavailable ? onRetry : onReplace} loading={!unavailable && choosingPhoto}
          disabled={choosingPhoto} />
        <AppButton label={unavailable ? replaceLabel : '重新检查这张照片'} variant="text"
          onPress={unavailable ? onReplace : onRetry} loading={unavailable && choosingPhoto}
          disabled={choosingPhoto || (!unavailable && !photoUri)} />
      </View>
    )}>
      <View style={styles.navigation}>
        <AppButton label="返回" variant="text" onPress={onBack} disabled={choosingPhoto} style={styles.back} />
        <EditorialText role="body" style={styles.navigationTitle}>照片检查</EditorialText>
        <View style={styles.navigationSpacer} />
      </View>
      <View style={styles.result} accessibilityLiveRegion="polite">
        <View style={styles.status}>
          {checking ? <ActivityIndicator size="small" color={colors.mossDeep} /> : null}
          <EditorialText role="caption" style={checking ? styles.muted : styles.attention}>
            {checking ? '检查中' : unavailable ? '检查未完成' : '需要调整'}
          </EditorialText>
        </View>
        <EditorialText role="pageTitle" accessibilityRole="header" style={styles.title}>{title}</EditorialText>
        <EditorialText role="body" style={styles.muted}>{description}</EditorialText>
      </View>
      {photoUri ? (
        <View style={styles.preview}>
          <Image accessibilityLabel="待检查的原始照片" source={{ uri: photoUri }} contentFit="contain"
            onLoad={({ source: image }) => {
              if (image.width > 0 && image.height > 0) setPhotoRatio(image.width / image.height);
              setPreviewFailed(false);
            }}
            onError={() => setPreviewFailed(true)}
            style={[styles.photo, { height: photoHeight, width: Math.min(photoWidth, photoHeight * photoRatio) }]} />
          <EditorialText role="caption" style={styles.photoCaption}>
            {previewFailed ? '照片预览暂时无法显示，可以重新选择或拍摄。' : '原始照片 · 未修饰'}
          </EditorialText>
        </View>
      ) : null}
      {checking || unavailable ? <EditorialText role="caption" style={styles.reassurance}>
        {checking ? '检查通过后，就可以选择这次观察的区域。' : '这张照片仍在当前页面，可以直接重新检查。'}
      </EditorialText> : null}
      {notice ? <InlineNotice tone="error" message={notice} /> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  navigation: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  back: { minWidth: spacing.ritual, paddingHorizontal: spacing.sm },
  navigationTitle: { color: colors.textMuted, flex: 1, textAlign: 'center' },
  navigationSpacer: { width: spacing.ritual },
  result: { gap: spacing.sm, marginBottom: spacing.xl },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.ink },
  muted: { color: colors.textMuted },
  attention: { color: colors.clay },
  preview: { alignItems: 'center', gap: spacing.md },
  photo: { borderRadius: radii.md, backgroundColor: colors.ground },
  photoCaption: { color: colors.textMuted },
  reassurance: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  actions: { gap: spacing.sm, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  saveNote: { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs },
});
