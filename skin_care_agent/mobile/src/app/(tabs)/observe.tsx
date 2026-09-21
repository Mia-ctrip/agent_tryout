import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialCollage } from '@/components/editorial-collage';
import { EditorialHeader } from '@/components/editorial-header';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { SectionHeader } from '@/components/section-header';
import { colors, radii, spacing } from '@/constants/theme';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { observationCaptureHref } from '@/lib/observation-navigation';
import { userFacingError } from '@/lib/errors';
import { listRegionEvents } from '@/lib/region-event-api';
import type { RegionEvent } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';
import { useSession } from '@/providers/session-provider';

export default function ObserveScreen() {
  const { request } = useSession();
  const [events, setEvents] = useState<RegionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      const generation = guard.begin();
      setError(null);
      void listRegionEvents(request, 'current')
        .then((currentEvents) => {
          if (guard.isCurrent(generation)) {
            setEvents(currentEvents);
          }
        })
        .catch((loadError) => {
          if (guard.isCurrent(generation)) {
            setError(userFacingError(loadError));
          }
        });
      return () => guard.invalidate();
    }, [guard, request]),
  );

  return (
    <AppScreen backgroundColor={colors.paper} contentStyle={styles.screen}>
      <View style={styles.masthead}>
        <EditorialText role="sectionTitle" style={styles.brandTitle}>肌肤档案</EditorialText>
        <View style={styles.todayTag}><Text style={styles.brandMeta}>TODAY · 今天</Text></View>
      </View>
      <View style={styles.todaySection}>
      <EditorialHeader
        title={'今天，也留下一次\n真实观察'}
        description="让皮肤的变化，被温和而诚实地保存。"
      />
      <EditorialCollage
        imageDose="hero"
        assetsRegistered
        primarySource={require('../../../assets/brand/natural-light-v1.png')}
        secondarySource={require('../../../assets/brand/leaf-water-v1.png')}
        primaryAlt="自然光下的亚麻与绿枝，品牌影像"
        secondaryAlt="水面与叶影的细节，品牌影像"
      />
      <View style={styles.primaryActions}>
        <AppButton
          label="开始今天的观察"
          trailingIcon={<Image source={{ uri: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors.paperElevated}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>`)}` }} style={styles.actionIcon} />}
          onPress={() => router.push(observationCaptureHref('camera') as Href)}
          variant="primary"
        />
        <AppButton
          label="从相册导入原图"
          leadingIcon={<Image source={{ uri: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors.mossDeep}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 5-5 4 4 4-6 5 7"/></svg>`)}` }} style={styles.actionIcon} />}
          onPress={() => router.push(observationCaptureHref('library') as Href)}
          variant="secondary"
        />
      </View>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      <View style={styles.currentSection}>
        {events.length > 0 ? (
          <SectionHeader eyebrow="CURRENT" title="正在观察" titleStyle={styles.currentTitle} />
        ) : null}
        {events.length > 0 ? (
          <Pressable
            accessibilityLabel="查看正在观察的区域"
            accessibilityHint={`${events.map((event) => regionById(event.region_id).label).join('、')}，进入历程查看`}
            accessibilityRole="button"
            onPress={() => router.navigate('/(tabs)/history')}
            style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.entryIcon}>
              <Image
                source={{ uri: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors.paperElevated}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9V7a7 7 0 0 1 14 0v2m-14 0c0 7 3 12 7 12s7-5 7-12M8 10h1m6 0h1m-4 1v4h1m-4 2c2 1 4 1 6 0"/></svg>`)}` }}
                style={styles.entryIconDrawing}
              />
            </View>
            <View style={styles.rowCopy}>
              <EditorialText role="body" style={styles.rowTitle}>
                {events.map((event) => regionById(event.region_id).label).join(' · ')}
              </EditorialText>
              <EditorialText role="caption" style={styles.rowMeta}>
                {events.length} 个区域正在记录
              </EditorialText>
            </View>
            <EditorialText role="sectionTitle" accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>›</EditorialText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="记录产品使用"
          accessibilityHint="进入产品栏查看产品与使用记录"
          accessibilityRole="button"
          onPress={() => router.navigate('/(tabs)/products')}
          style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.entryIcon}>
            <Image
              source={{ uri: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors.paperElevated}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4v5h-4zM9 8h6l2 3v10H7V11zM10 1h4"/></svg>`)}` }}
              style={styles.entryIconDrawing}
            />
          </View>
          <View style={styles.rowCopy}>
            <EditorialText role="body" style={styles.rowTitle}>记录产品使用</EditorialText>
            <EditorialText role="caption" style={styles.rowMeta}>查看产品与使用记录</EditorialText>
          </View>
          <EditorialText role="sectionTitle" accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>›</EditorialText>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl, paddingTop: spacing.md, paddingHorizontal: spacing.xl },
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brandTitle: { color: colors.earth, fontSize: 19, lineHeight: 28 },
  todayTag: { backgroundColor: colors.amber, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  brandMeta: { color: colors.earth, fontSize: 10, lineHeight: 16, letterSpacing: 1 },
  todaySection: { backgroundColor: colors.paperElevated, marginHorizontal: -spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.xl, gap: spacing.xl },
  primaryActions: { gap: spacing.sm },
  actionIcon: { width: spacing.lg, height: spacing.lg },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    minHeight: spacing.ritual,
  },
  currentSection: { gap: spacing.md },
  currentTitle: { fontWeight: '700' },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.earth, fontSize: 17, fontWeight: '700' },
  rowMeta: { color: colors.textMuted },
  chevron: { color: colors.textMuted },
  entryIcon: { width: spacing.xxxl, height: spacing.xxxl, borderRadius: radii.pill, backgroundColor: colors.mossDeep, alignItems: 'center', justifyContent: 'center' },
  entryIconDrawing: { width: spacing.xl, height: spacing.xl },
  pressed: { opacity: 0.72 },
});
