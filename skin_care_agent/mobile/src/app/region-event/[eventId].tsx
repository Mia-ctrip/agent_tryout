import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { lifeContextLabel } from '@/lib/life-context';
import { endRegionEvent, getRegionEvent } from '@/lib/region-event-api';
import type { RegionEventDetail } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

function parseEventId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function RegionEventDetailScreen() {
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = parseEventId(params.eventId);
  const { request } = useSession();
  const [event, setEvent] = useState<RegionEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnding, setConfirmEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!eventId) {
        setLoading(false);
        setError('区域记录编号无效。');
        return () => undefined;
      }
      setLoading(true);
      void getRegionEvent(request, eventId)
        .then((nextEvent) => {
          if (active) setEvent(nextEvent);
        })
        .catch((loadError) => {
          if (active) setError(userFacingError(loadError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [eventId, request]),
  );

  async function endCurrentEvent() {
    if (!eventId || ending) return;
    setEnding(true);
    setError(null);
    try {
      await endRegionEvent(request, eventId);
      setEvent(await getRegionEvent(request, eventId));
      setConfirmEnding(false);
    } catch (endError) {
      setError(userFacingError(endError));
    } finally {
      setEnding(false);
    }
  }

  const region = event ? regionById(event.region_id) : null;
  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.irisStrong,
          title: region?.label ?? '区域记录',
        }}
      />
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>正在读取区域记录</Text>
        </View>
      ) : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {event && region ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{region.label}</Text>
            <Text style={styles.meta}>
              {event.started_local_date} 至 {event.last_valid_local_date} ·{' '}
              {event.status === 'current' ? '记录中' : '已结束'}
            </Text>
            <Text style={styles.boundary}>
              以下仅按时间整理原始证据和来源，不代表趋势、疗效、严重度或医学结论。
            </Text>
          </View>
          <View style={styles.timeline}>
            {event.timepoints.map((timepoint) => (
              <View key={timepoint.target.target_id} style={styles.timepoint}>
                <Text style={styles.date}>{timepoint.recorded_local_date}</Text>
                {timepoint.photo ? (
                  <Image
                    accessibilityLabel={`${region.label}时间点原始照片`}
                    contentFit="cover"
                    source={{ uri: timepoint.photo.url }}
                    style={styles.photo}
                  />
                ) : null}
                <Text style={styles.source}>
                  来源：
                  {timepoint.target.result_source === 'photo_analysis'
                    ? '照片 AI 整理'
                    : '用户原文'}
                </Text>
                {timepoint.target.facts ? (
                  <Text style={styles.summary}>{timepoint.target.facts.summary}</Text>
                ) : null}
                {timepoint.target.user_note ? (
                  <Text style={styles.summary}>{timepoint.target.user_note}</Text>
                ) : null}
                {timepoint.life_context_completed_at ? (
                  timepoint.life_context_ids.length ? (
                    <View style={styles.contexts}>
                      <Text style={styles.contextHeading}>当时背景</Text>
                      <View style={styles.contextLabels}>
                        {timepoint.life_context_ids.map((contextId) => (
                          <Text key={contextId} style={styles.contextLabel}>
                            {lifeContextLabel(contextId)}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.contextSkipped}>生活背景：已跳过</Text>
                  )
                ) : null}
              </View>
            ))}
          </View>
          {event.status === 'current' ? (
            <View style={styles.endSection}>
              {confirmEnding ? (
                <InlineNotice
                  tone="info"
                  message="结束只会关闭这段记录，不代表皮肤状态已经恢复或问题已经解决。"
                />
              ) : null}
              <AppButton
                label={confirmEnding ? '确认结束这段记录' : '结束这段记录'}
                loading={ending}
                variant="secondary"
                onPress={() =>
                  confirmEnding ? void endCurrentEvent() : setConfirmEnding(true)
                }
              />
              {confirmEnding ? (
                <AppButton label="暂不结束" variant="text" onPress={() => setConfirmEnding(false)} />
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  muted: { color: colors.textMuted, fontSize: 14 },
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  meta: { color: colors.irisStrong, fontSize: 14, fontWeight: '700' },
  boundary: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  timeline: { gap: spacing.lg },
  timepoint: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  date: { color: colors.text, fontSize: 17, fontWeight: '800' },
  photo: { width: '100%', height: 220, borderRadius: radii.md },
  source: { color: colors.irisStrong, fontSize: 13, fontWeight: '700' },
  summary: { color: colors.text, fontSize: 15, lineHeight: 23 },
  contexts: { gap: spacing.xs, marginTop: spacing.sm },
  contextHeading: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  contextLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contextLabel: {
    color: colors.irisStrong,
    fontSize: 13,
    fontWeight: '700',
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  contextSkipped: { color: colors.textMuted, fontSize: 12 },
  endSection: { gap: spacing.sm, marginTop: spacing.xxl },
});
