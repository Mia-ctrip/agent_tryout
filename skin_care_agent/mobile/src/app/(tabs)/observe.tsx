import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { CameraStartPanel } from '@/components/camera-start-panel';
import { InlineNotice } from '@/components/inline-notice';
import { ObservationListItem } from '@/components/observation-list-item';
import { RegionEventCard } from '@/components/region-event-card';
import { colors, spacing } from '@/constants/theme';
import { listObservations } from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { observationCaptureHref } from '@/lib/observation-navigation';
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
    <AppScreen>
      <View style={styles.header}>
        <Text style={styles.title}>观察</Text>
        <Text style={styles.description}>留下一张照片，记录此刻真实可见的变化。</Text>
      </View>
      <CameraStartPanel
        compact
        embedded
        onChoosePhoto={() => router.push(observationCaptureHref('library') as Href)}
        onOpenCamera={() => router.push(observationCaptureHref('camera') as Href)}
      />
      <View style={styles.productUseAction}>
        <AppButton
          label="记录产品使用"
          onPress={() => router.push('/product-use/new')}
          variant="text"
        />
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {events.length > 0 ? (
        <View style={styles.latestSection}>
          <Text style={styles.latestTitle}>正在记录的区域</Text>
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
        <View style={styles.latestSection}>
          <Text style={styles.latestTitle}>最近记录</Text>
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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xxl },
  title: { color: colors.text, fontSize: 32, lineHeight: 40, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  productUseAction: { marginTop: spacing.xs },
  latestSection: { gap: spacing.md, marginTop: spacing.xxl },
  latestTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  latestList: { gap: spacing.md },
});
