import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
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
import { EditorialText } from '@/components/editorial-text';
import { HistoryEventRow } from '@/components/history-event-row';
import { HistoryFaceOverview } from '@/components/history-face-overview';
import { InlineNotice } from '@/components/inline-notice';
import { EvidenceIcon } from '@/components/timepoint-evidence-card';
import { journeyColors } from '@/constants/journey-theme';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import {
  buildLegacyTextHistory,
  buildRegionOverview,
  formatHistoryDateTime,
  formatHistoryShortDate,
  hasRegionHistory,
  resolveRegionEntry,
  timepointCountForEvent,
} from '@/lib/history-flow';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { observationCaptureHref } from '@/lib/observation-navigation';
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
      void Promise.allSettled([
        listRegionEvents(request),
        listAllObservations(request),
        listTimeline(request, 100),
      ])
        .then(([events, observations, timeline]) => {
          if (guard.isCurrent(generation)) {
            setData(previous => ({
              events: events.status === 'fulfilled' ? events.value : previous.events,
              observations: observations.status === 'fulfilled' ? observations.value : previous.observations,
              timeline: timeline.status === 'fulfilled' ? timeline.value : previous.timeline,
            }));
            setError(
              events.status === 'rejected' ? userFacingError(events.reason) :
                timeline.status === 'rejected' ? userFacingError(timeline.reason) :
                observations.status === 'rejected' ? userFacingError(observations.reason) : null,
            );
          }
        })
        .finally(() => {
          if (guard.isCurrent(generation)) setLoading(false);
        });
      return () => guard.invalidate();
    }, [guard, reloadKey, request]),
  );

  const overview = useMemo(() => buildRegionOverview(data), [data]);
  const legacyTextHistory = useMemo(
    () => buildLegacyTextHistory(data.observations),
    [data.observations],
  );
  const pickerRegion = pickerRegionId ? overview.byRegion[pickerRegionId] : null;
  const showPicker = pickerRegion && pickerRegion.events.length > 1;
  const emptyRegion = pickerRegion && !resolveRegionEntry(pickerRegion) ? pickerRegion : null;
  const hasAnyRegionHistory = hasRegionHistory(overview);

  const openRegion = (regionId: RegionId) => {
    setPickerRegionId(regionId);
    const entry = resolveRegionEntry(overview.byRegion[regionId]);
    if (!entry) return;
    if (entry.kind === 'event_picker') {
      return;
    }
    if (entry.kind === 'event') {
      router.push(`/region-event/${entry.eventId}`);
      return;
    }
    router.push(`/observation/${entry.observationId}`);
  };

  return (
    <AppScreen
      backgroundColor={journeyColors.background}
      contentStyle={{ paddingHorizontal: 20, paddingTop: 24 }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={() => router.push('/me')} style={styles.settings}>
          <EvidenceIcon kind="settings" />
        </Pressable>
        <EditorialText role="pageTitle" style={styles.title}>历程</EditorialText>
        <Text style={styles.description}>从你关心的区域，回看真实记录。</Text>
      </View>

      {loading && !hasAnyRegionHistory ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={styles.muted}>正在读取区域历程</Text>
        </View>
      ) : (
        <>
          <HistoryFaceOverview regions={overview.regions} onPressRegion={openRegion} selectedRegionId={pickerRegionId} />

          {emptyRegion && hasAnyRegionHistory ? (
            <View accessibilityLiveRegion="polite" style={styles.regionEmpty}>
              <Text style={styles.sectionHint}>{emptyRegion.label}还没有记录</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(observationCaptureHref('camera') as Href)}
                style={styles.emptyCta}>
                <Text style={styles.emptyCtaLabel}>开始一次观察 →</Text>
              </Pressable>
            </View>
          ) : null}

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
            <View style={styles.trackingCard}>
              <EditorialText role="sectionTitle" style={styles.sectionTitle}>正在记录</EditorialText>
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
            <View accessibilityLiveRegion="polite" style={styles.emptyState}>
              <EditorialText role="sectionTitle" style={styles.emptyTitle}>{emptyRegion ? `${emptyRegion.label}还没有记录` : '还没有历程'}</EditorialText>
              <Text style={styles.emptyDescription}>
                第一次观察完成后，{'\n'}你的时间点会从这里开始积累。
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="去记录第一次观察"
                hitSlop={8}
                onPress={() => router.push(observationCaptureHref('camera') as Href)}
                style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}>
                <Text style={styles.emptyCtaLabel}>去记录第一次观察 →</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
      {legacyTextHistory.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>历史文字记录</Text>
          <Text style={styles.sectionHint}>旧版全脸记录 · 没有照片 · 保留原文与来源</Text>
          {legacyTextHistory.map((record) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看历史全脸文字记录，${formatHistoryDateTime(record.recorded_at, record.recorded_timezone_offset_minutes)}`}
              key={record.observation_id}
              onPress={() => router.push(`/observation/${record.observation_id}?view=overview` as Href)}
              style={({ pressed }) => [styles.contextRow, pressed && styles.pressed]}>
              <View style={styles.rowCopy}>
                <Text style={styles.contextTitle}>{formatHistoryDateTime(record.recorded_at, record.recorded_timezone_offset_minutes)}</Text>
                {record.targets.map(target => (
                  <Text key={target.target_id} numberOfLines={3} style={styles.contextDetail}>
                    {target.user_note ? '你的记录' : target.facts ? '历史照片整理' : '原记录状态'}：{target.user_note || target.facts?.summary || '查看原记录状态'}
                  </Text>
                ))}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.sm, paddingHorizontal: spacing.sm },
  settings: { position: 'absolute', right: 0, top: 0, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  trackingCard: { marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: journeyColors.line, backgroundColor: journeyColors.surface },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '400',
  },
  description: { color: journeyColors.muted, fontSize: 13, lineHeight: 22 },
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
  sectionTitle: { color: colors.earth, fontSize: 20, fontWeight: '600' },
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
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  regionEmpty: { alignItems: 'center', marginTop: spacing.md },
  emptyTitle: { color: journeyColors.ink, fontSize: 20, lineHeight: 28, textAlign: 'center' },
  emptyDescription: {
    color: journeyColors.muted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyCta: { minHeight: 44, justifyContent: 'center', marginTop: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  emptyCtaLabel: {
    color: journeyColors.moss,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
