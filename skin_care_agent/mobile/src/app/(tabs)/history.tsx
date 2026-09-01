import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { HistoryEventRow } from '@/components/history-event-row';
import { HistoryFaceOverview } from '@/components/history-face-overview';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import {
  buildRegionOverview,
  formatHistoryShortDate,
  hasRegionHistory,
  resolveRegionEntry,
  timepointCountForEvent,
} from '@/lib/history-flow';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { listAllObservations } from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import { listRegionEvents } from '@/lib/region-event-api';
import type { RegionEvent } from '@/lib/region-event-api';
import type { RegionId } from '@/lib/region-catalog';
import { listTimeline } from '@/lib/timeline-api';
import type { TimelineItem } from '@/lib/timeline-api';
import { useSession } from '@/providers/session-provider';

type HistoryData = {
  events: RegionEvent[];
  observations: Observation[];
  timeline: TimelineItem[];
};

const EMPTY_DATA: HistoryData = { events: [], observations: [], timeline: [] };

export default function HistoryScreen() {
  const { request } = useSession();
  const [data, setData] = useState<HistoryData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerRegionId, setPickerRegionId] = useState<RegionId | null>(null);
  const [guard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      void reloadKey;
      const generation = guard.begin();
      setLoading(true);
      setError(null);
      void Promise.all([
        listRegionEvents(request),
        listAllObservations(request),
        listTimeline(request, 100),
      ])
        .then(([events, observations, timeline]) => {
          if (guard.isCurrent(generation)) {
            setData({ events, observations, timeline });
          }
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

  const overview = useMemo(() => buildRegionOverview(data), [data]);
  const pickerRegion = pickerRegionId ? overview.byRegion[pickerRegionId] : null;
  const showPicker = pickerRegion && pickerRegion.events.length > 1;
  const hasAnyRegionHistory = hasRegionHistory(overview);

  const openRegion = (regionId: RegionId) => {
    const entry = resolveRegionEntry(overview.byRegion[regionId]);
    if (!entry) return;
    if (entry.kind === 'event_picker') {
      setPickerRegionId(regionId);
      return;
    }
    if (entry.kind === 'event') {
      router.push(`/region-event/${entry.eventId}`);
      return;
    }
    router.push(`/observation/${entry.observationId}`);
  };

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={styles.title}>历程</Text>
        <Text style={styles.description}>从你关心的区域，回看真实记录。</Text>
      </View>

      {loading && !hasAnyRegionHistory ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={styles.muted}>正在读取区域历程</Text>
        </View>
      ) : (
        <>
          <HistoryFaceOverview regions={overview.regions} onPressRegion={openRegion} />

          {showPicker ? (
            <View accessibilityLiveRegion="polite" style={styles.picker}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>{pickerRegion.label}的记录</Text>
                  <Text style={styles.sectionHint}>请选择要回看的这一段</Text>
                </View>
                <Pressable
                  accessibilityLabel="收起事件选择"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setPickerRegionId(null)}>
                  <Text style={styles.dismiss}>收起</Text>
                </Pressable>
              </View>
              {pickerRegion.events.map((event) => (
                <HistoryEventRow
                  compact
                  event={event}
                  key={event.event_id}
                  timepointCount={timepointCountForEvent(
                    pickerRegion,
                    event.event_id,
                  )}
                  onPress={() => router.push(`/region-event/${event.event_id}`)}
                />
              ))}
            </View>
          ) : null}

          {error ? (
            <View style={styles.noticeGroup}>
              <InlineNotice
                tone="error"
                message={`${error} 已保留上次读取到的内容。`}
              />
              <AppButton
                label="重新读取"
                onPress={() => setReloadKey((key) => key + 1)}
                variant="text"
              />
            </View>
          ) : null}

          {overview.currentEvents.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>正在记录</Text>
              <Text style={styles.sectionHint}>已有有效时间点的区域事件</Text>
              <View style={styles.rows}>
                {overview.currentEvents.map((event) => {
                  const region = overview.byRegion[event.region_id];
                  return (
                    <HistoryEventRow
                      event={event}
                      key={event.event_id}
                      timepointCount={timepointCountForEvent(
                        region,
                        event.event_id,
                      )}
                      onPress={() => router.push(`/region-event/${event.event_id}`)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {overview.pendingRecords.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>尚在整理的记录</Text>
              <Text style={styles.sectionHint}>
                这些记录还没有形成可回看的区域时间点
              </Text>
              <View style={styles.rows}>
                {overview.pendingRecords.map((record) => {
                  const region = overview.byRegion[record.regionId];
                  return (
                    <Pressable
                      accessibilityLabel={`${region.label}，${record.statusLabel}，${formatHistoryShortDate(
                        record.recordedLocalDate ?? record.recordedAt,
                        record.recordedLocalDate
                          ? null
                          : record.recordedTimezoneOffsetMinutes,
                      )}`}
                      accessibilityHint="查看这次观察的处理状态"
                      accessibilityRole="button"
                      key={`${record.observationId}-${record.targetId}`}
                      onPress={() => router.push(`/observation/${record.observationId}`)}
                      style={({ pressed }) => [styles.contextRow, pressed && styles.pressed]}>
                      <View
                        style={[
                          styles.pendingDot,
                          record.status === 'needs_input' && styles.pendingDotNeedsInput,
                        ]}
                      />
                      <View style={styles.rowCopy}>
                        <Text style={styles.contextTitle}>
                          {region.label} · {record.statusLabel}
                        </Text>
                        <Text style={styles.contextDetail}>
                          {formatHistoryShortDate(
                            record.recordedLocalDate ?? record.recordedAt,
                            record.recordedLocalDate
                              ? null
                              : record.recordedTimezoneOffsetMinutes,
                          )}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {overview.historicalEvents.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>已结束的区域记录</Text>
              <View style={styles.rows}>
                {overview.historicalEvents.map((event) => (
                  <HistoryEventRow
                    compact
                    event={event}
                    key={event.event_id}
                    timepointCount={timepointCountForEvent(
                      overview.byRegion[event.region_id],
                      event.event_id,
                    )}
                    onPress={() => router.push(`/region-event/${event.event_id}`)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {!loading && !error && !hasAnyRegionHistory ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>还没有区域历程</Text>
              <Text style={styles.muted}>
                完成第一次区域观察后，这里会按区域保留真实时间点。
              </Text>
              <AppButton
                label="开始一次区域观察"
                onPress={() => router.push('/observation/new')}
                variant="secondary"
              />
            </View>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: {
    color: colors.text,
    fontFamily: 'serif',
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
  },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.hero },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  picker: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  section: { marginTop: spacing.xxl },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionHeadingCopy: { flex: 1, gap: spacing.xs },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  sectionHint: { marginTop: spacing.xs, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  dismiss: { color: colors.actionPrimary, fontSize: 14, fontWeight: '700', padding: spacing.sm },
  rows: { marginTop: spacing.sm },
  noticeGroup: { marginTop: spacing.xl, gap: spacing.xs },
  contextRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  pendingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.context,
  },
  pendingDotNeedsInput: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  rowCopy: { flex: 1, gap: spacing.xs },
  contextTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  contextDetail: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  chevron: { color: colors.actionPrimary, fontSize: 26, lineHeight: 28 },
  pressed: { opacity: 0.68 },
  emptyState: {
    marginTop: spacing.xxl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
});
