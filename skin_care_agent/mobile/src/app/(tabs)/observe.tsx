import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialCollage } from '@/components/editorial-collage';
import { EditorialHeader } from '@/components/editorial-header';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { ObservationListItem } from '@/components/observation-list-item';
import { RegionEventCard } from '@/components/region-event-card';
import { SectionHeader } from '@/components/section-header';
import { colors, radii, spacing } from '@/constants/theme';
import { listObservations } from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { createClientRequestId } from '@/lib/client-request-id';
import { observationCaptureHref, productUseHref } from '@/lib/observation-navigation';
import { userFacingError } from '@/lib/errors';
import { listRegionEvents } from '@/lib/region-event-api';
import type { RegionEvent } from '@/lib/region-event-api';
import { useSession } from '@/providers/session-provider';

export default function ObserveScreen() {
  const { request } = useSession();
  const [latest, setLatest] = useState<Observation[]>([]);
  const [events, setEvents] = useState<RegionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      const generation = guard.begin();
      setError(null);
      void Promise.all([
        listObservations(request, { limit: 3 }),
        listRegionEvents(request, 'current'),
      ])
        .then(([observations, currentEvents]) => {
          if (guard.isCurrent(generation)) {
            setLatest(observations);
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
          onPress={() => router.push(observationCaptureHref('camera') as Href)}
          variant="primary"
        />
        <AppButton
          label="从相册选择原图"
          onPress={() => router.push(observationCaptureHref('library') as Href)}
          variant="text"
        />
      </View>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {events.length > 0 ? (
        <View style={styles.archiveSection}>
          <SectionHeader eyebrow="CURRENT ARCHIVE" title="正在记录的区域" />
          <View style={styles.latestList}>
            {events.map((event) => (
              <RegionEventCard
                event={event}
                key={event.event_id}
                onPress={() =>
                  router.push(`/region-event/${event.event_id}` as Href)
                }
              />
            ))}
          </View>
        </View>
      ) : null}
      {latest.length > 0 ? (
        <View style={styles.archiveSection}>
          <SectionHeader eyebrow="RECENT" title="最近记录" />
          <View style={styles.latestList}>
            {latest.map((observation) => (
              <ObservationListItem
                key={observation.observation_id}
                observation={observation}
                onPress={() => router.push(`/observation/${observation.observation_id}`)}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.productUseAction}>
        <Text style={styles.contextCopy}>也可以只记录一次真实发生的产品使用。</Text>
        <AppButton
          label="记录产品使用"
          onPress={() =>
            router.push(
              productUseHref({
                source: 'observe',
                flowId: createClientRequestId(),
              }) as Href,
            )
          }
          variant="text"
        />
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
  primaryActions: { gap: spacing.xs },
  productUseAction: {
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: spacing.xl,
  },
  contextCopy: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  archiveSection: { gap: spacing.md },
  latestList: { gap: spacing.md },
});
