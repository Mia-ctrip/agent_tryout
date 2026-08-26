import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { TimelineItemCard } from '@/components/timeline-item-card';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { listTimeline } from '@/lib/timeline-api';
import type { TimelineItem } from '@/lib/timeline-api';
import { timelineItemTarget } from '@/lib/timeline-flow';
import { useSession } from '@/providers/session-provider';

export default function HistoryScreen() {
  const { request } = useSession();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [guard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      void reloadKey;
      const generation = guard.begin();
      setLoading(true);
      setError(null);
      void listTimeline(request)
        .then((nextItems) => {
          if (guard.isCurrent(generation)) setItems(nextItems);
        })
        .catch((loadError) => {
          if (guard.isCurrent(generation)) setError(userFacingError(loadError));
        })
        .finally(() => {
          if (guard.isCurrent(generation)) setLoading(false);
        });
      return () => guard.invalidate();
    }, [guard, reloadKey, request]),
  );

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={styles.title}>历程</Text>
        <Text style={styles.description}>
          按真实发生时间整理区域记录、历史全脸观察和产品使用。
        </Text>
        <Text style={styles.boundary}>
          各类记录仅并列回看，不代表产品疗效或生活因素关联。
        </Text>
      </View>
      {loading && items.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.emptyBody}>正在读取历程</Text>
        </View>
      ) : null}
      {error ? (
        <InlineNotice tone="error" message={`${error} 可以点击下方按钮重新读取。`} />
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>还没有历程记录</Text>
          <Text style={styles.emptyBody}>
            完成第一次区域观察或产品使用记录后，它会出现在这里。
          </Text>
        </View>
      ) : null}
      {items.length ? (
        <View style={styles.list}>
          {items.map((item) => {
            const target = timelineItemTarget(item);
            return (
              <TimelineItemCard
                item={item}
                key={item.timeline_id}
                onPress={target ? () => router.push(target as Href) : undefined}
              />
            );
          })}
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="button"
          onPress={() => setReloadKey((key) => key + 1)}
          style={styles.retry}>
          重新读取
        </Text>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xxl },
  title: { color: colors.text, fontSize: 32, lineHeight: 40, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  boundary: { color: colors.irisStrong, fontSize: 13, lineHeight: 20 },
  emptyState: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  list: { gap: spacing.md },
  retry: {
    color: colors.irisStrong,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
});
