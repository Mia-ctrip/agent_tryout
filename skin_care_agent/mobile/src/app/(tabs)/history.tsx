import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { FullFaceHistoryCard } from '@/components/full-face-history-card';
import { HistoryEventRow } from '@/components/history-event-row';
import { HistoryFaceOverview } from '@/components/history-face-overview';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import {
  buildFullFaceHistory,
  buildLegacyTextHistory,
  buildRegionOverview,
  formatHistoryDateTime,
  formatHistoryShortDate,
  hasRegionHistory,
  resolveRegionEntry,
  timepointCountForEvent,
} from '@/lib/history-flow';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { listAllObservations } from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import { observationDetailHref } from '@/lib/observation-navigation';
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
type HistoryView = 'full_face' | 'regions';

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { request } = useSession();
  const [data, setData] = useState<HistoryData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<{ photos: string | null; regions: string | null }>({ photos: null, regions: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [pickerRegionId, setPickerRegionId] = useState<RegionId | null>(null);
  const [historyView, setHistoryView] = useState<HistoryView>(() =>
    params.view === 'full_face' ? 'full_face' : 'regions',
  );
  const error = historyView === 'full_face' ? loadErrors.photos : loadErrors.regions;
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsets = useRef<Record<HistoryView, number>>({ full_face: 0, regions: 0 });
  const currentScrollOffset = useRef(0);
  const [guard] = useState(() => createObservationGenerationGuard());

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const nextOffset = scrollOffsets.current[historyView];
      currentScrollOffset.current = nextOffset;
      scrollViewRef.current?.scrollTo({ y: nextOffset, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [historyView]);

  useFocusEffect(
    useCallback(() => {
      void reloadKey;
      const generation = guard.begin();
      setLoading(true);
      setLoadErrors({ photos: null, regions: null });
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
            setLoadErrors({
              photos: observations.status === 'rejected' ? userFacingError(observations.reason) : null,
              regions: events.status === 'rejected' ? userFacingError(events.reason) :
                timeline.status === 'rejected' ? userFacingError(timeline.reason) :
                observations.status === 'rejected' ? userFacingError(observations.reason) : null,
            });
          }
        })
        .finally(() => {
          if (guard.isCurrent(generation)) setLoading(false);
        });
      return () => guard.invalidate();
    }, [guard, reloadKey, request]),
  );

  const overview = useMemo(() => buildRegionOverview(data), [data]);
  const fullFaceHistory = useMemo(
    () => buildFullFaceHistory(data.observations),
    [data.observations],
  );
  const legacyTextHistory = useMemo(
    () => buildLegacyTextHistory(data.observations),
    [data.observations],
  );
  const pickerRegion = pickerRegionId ? overview.byRegion[pickerRegionId] : null;
  const showPicker = pickerRegion && pickerRegion.events.length > 1;
  const hasAnyRegionHistory = hasRegionHistory(overview);

  const switchHistoryView = (nextView: HistoryView) => {
    if (nextView === historyView) return;
    scrollOffsets.current[historyView] = currentScrollOffset.current;
    setHistoryView(nextView);
    router.setParams({ view: nextView });
  };

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
    <AppScreen
      scrollViewRef={scrollViewRef}
      onScroll={(event) => {
        currentScrollOffset.current = event.nativeEvent.contentOffset.y;
      }}>
      <View style={styles.header}>
        <EditorialText role="pageTitle" style={styles.title}>历程</EditorialText>
        <Text style={styles.description}>
          {historyView === 'full_face'
            ? '按照片回看每一次真实观察。'
            : '从你关心的区域，回看真实记录。'}
        </Text>
      </View>

      <View accessibilityLabel="历程视图" accessibilityRole="tablist" style={styles.historyViewSwitch}>
        {([['full_face', '全脸'], ['regions', '分区']] as const).map(([value, label]) => (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="tab"
            aria-selected={historyView === value}
            accessibilityState={{ selected: historyView === value }}
            key={value}
            onPress={() => switchHistoryView(value)}
            style={[styles.historyViewOption, historyView === value && styles.historyViewOptionSelected]}>
            <Text style={[styles.historyViewText, historyView === value && styles.historyViewTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {historyView === 'full_face' ? (
        <>
          {loading && !fullFaceHistory.length ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.actionPrimary} />
              <Text style={styles.muted}>正在读取照片历程</Text>
            </View>
          ) : null}
          {fullFaceHistory.length ? (
            <View style={styles.fullFaceList}>
              {fullFaceHistory.map((record) => (
                <FullFaceHistoryCard
                  key={record.observationId}
                  record={record}
                  onPress={() => router.push(observationDetailHref(record.observationId, 'history_full_face') as Href)}
                />
              ))}
            </View>
          ) : null}
          {error ? (
            <View style={styles.noticeGroup}>
              <InlineNotice tone="error" message={`${error} 已保留上次读取到的照片记录。`} />
              <AppButton label="重新读取" onPress={() => setReloadKey((key) => key + 1)} variant="text" />
            </View>
          ) : null}
          {!loading && !error && !fullFaceHistory.length ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>还没有照片记录</Text>
              <Text style={styles.muted}>保存第一张观察照片后，这里会按发生时间保留完整记录。</Text>
              <AppButton label="开始一次区域观察" onPress={() => router.push('/observation/new')} variant="secondary" />
            </View>
          ) : null}
        </>
      ) : loading && !hasAnyRegionHistory ? (
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
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '400',
  },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 24, textAlign: 'center' },
  historyViewSwitch: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyViewOption: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center' },
  historyViewOptionSelected: { borderBottomWidth: 2, borderBottomColor: colors.actionPrimary },
  historyViewText: { color: colors.textMuted, fontSize: 15 },
  historyViewTextSelected: { color: colors.text, fontWeight: '700' },
  fullFaceList: { gap: 0 },
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
  sectionTitle: { color: colors.earth, fontSize: 18, fontWeight: '500' },
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
