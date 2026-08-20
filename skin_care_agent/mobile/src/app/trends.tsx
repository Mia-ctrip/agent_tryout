import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { severityLabel } from '@/lib/analysis-presenter';
import {
  getTrendSummary,
  TREND_RANGE_OPTIONS,
} from '@/lib/trend-api';
import type { TrendRangeDays, TrendSummary } from '@/lib/trend-api';
import {
  developmentTrendFixture,
  developmentTrendMode,
} from '@/lib/trend-fixtures';
import {
  createTrendGenerationGuard,
  DEFAULT_TREND_RANGE_DAYS,
  loadCurrentTrend,
  trendScreenState,
} from '@/lib/trend-flow';
import {
  formatTrendDay,
  latestRecordedTrendPoint,
  recordedTrendPoints,
  selectTrendOverviewRegions,
  trendPointBarPercent,
  trendRegionTitle,
} from '@/lib/trend-presenter';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

function RangeSelector({
  value,
  onChange,
}: {
  value: TrendRangeDays;
  onChange: (value: TrendRangeDays) => void;
}) {
  return (
    <View style={styles.rangeSelector}>
      {TREND_RANGE_OPTIONS.map((days) => {
        const selected = value === days;
        return (
          <Pressable
            key={days}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(days)}
            style={({ pressed }) => [
              styles.rangeOption,
              selected && styles.rangeOptionSelected,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[
                styles.rangeOptionText,
                selected && styles.rangeOptionTextSelected,
              ]}>
              {days} 天
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TrendsScreen() {
  const params = useLocalSearchParams<{
    demo?: string | string[];
  }>();
  const { request } = useSession();
  const demoMode = developmentTrendMode(__DEV__, params.demo);
  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(
    DEFAULT_TREND_RANGE_DAYS,
  );
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);
  const [generationGuard] = useState(() => createTrendGenerationGuard());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationGuard.invalidate();
    };
  }, [generationGuard]);

  useEffect(() => {
    async function loadTrend() {
      setLoading(true);
      setError(null);
      setSummary(null);
      await loadCurrentTrend({
        guard: generationGuard,
        isActive: () => mountedRef.current,
        load: async () =>
          demoMode
            ? developmentTrendFixture(rangeDays)
            : await getTrendSummary(request, rangeDays),
        onSuccess: setSummary,
        onError: (loadError) => setError(userFacingError(loadError)),
        onSettled: () => setLoading(false),
      });
    }

    void loadTrend();
  }, [demoMode, generationGuard, rangeDays, reloadKey, request]);

  const points = useMemo(
    () => recordedTrendPoints(summary?.daily_points ?? []),
    [summary?.daily_points],
  );
  const latestPoint = useMemo(
    () => latestRecordedTrendPoint(summary?.daily_points ?? []),
    [summary?.daily_points],
  );
  const hasOverview =
    points.length > 0 || (summary?.region_summaries.length ?? 0) > 0;
  const screenState = trendScreenState(
    loading,
    error,
    summary !== null,
    hasOverview,
  );
  const overviewRegions = useMemo(
    () => selectTrendOverviewRegions(summary?.region_summaries ?? [], 6),
    [summary?.region_summaries],
  );

  return (
    <AppScreen>
      <BrandHeader
        eyebrow="SKIN TREND"
        title="变化趋势"
        description="每天只保留一个主要数据点，帮助你观察长期变化而不是短期波动。"
      />

      <RangeSelector value={rangeDays} onChange={setRangeDays} />

      {demoMode ? (
        <View style={styles.demoNotice}>
          <Text style={styles.demoNoticeText}>
            当前展示仅限开发环境的完整趋势数据，不会写入后端。
          </Text>
          <AppButton
            label="查看真实数据"
            variant="text"
            onPress={() => router.replace('/trends')}
          />
        </View>
      ) : null}

      {screenState === 'loading' ? (
        <View
          accessibilityLiveRegion="polite"
          style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>正在读取 {rangeDays} 天趋势</Text>
        </View>
      ) : screenState === 'error' || !summary ? (
        <View
          accessibilityLiveRegion="assertive"
          style={styles.stateBlock}>
          <InlineNotice
            tone="error"
            message={error ?? '暂时无法读取趋势数据。'}
          />
          <AppButton
            label="重新加载"
            onPress={() => setReloadKey((current) => current + 1)}
          />
          <AppButton
            label="返回首页"
            variant="text"
            onPress={() => router.replace('/home')}
          />
        </View>
      ) : screenState === 'empty' ? (
        <View style={styles.stateBlock}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>还没有可展示的趋势</Text>
            <Text style={styles.emptyText}>
              {summary.highlights[0] ??
                '完成 Check-in 和分析后，这里会出现每日皮肤状态。'}
            </Text>
          </View>
          {summary.incomplete_check_ins > 0 ? (
            <View accessibilityLiveRegion="polite">
              <InlineNotice
                message={`${summary.incomplete_check_ins} 次 Check-in 尚未完成分析，因此没有计入趋势。`}
              />
            </View>
          ) : null}
          <AppButton
            label="开始今日 Check-in"
            onPress={() => router.push('/check-in')}
          />
          <AppButton
            label="返回首页"
            variant="text"
            onPress={() => router.replace('/home')}
          />
        </View>
      ) : (
        <>
          {summary.incomplete_check_ins > 0 ? (
            <View accessibilityLiveRegion="polite">
              <InlineNotice
                message={`${summary.incomplete_check_ins} 次 Check-in 尚未完成分析，当前趋势只使用完整结果。`}
              />
            </View>
          ) : null}

          <View style={styles.metrics}>
            <View style={styles.primaryMetric}>
              <Text style={styles.primaryMetricLabel}>最新皮肤指数</Text>
              <Text style={styles.primaryMetricValue}>
                {latestPoint?.skin_health_index ?? '—'}
              </Text>
              <Text style={styles.primaryMetricUnit}>满分 100</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>有效记录</Text>
              <Text style={styles.metricValue}>{points.length}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>当前活跃</Text>
              <Text style={styles.metricValue}>
                {summary.total_active_lineages}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>范围内新增</Text>
              <Text style={styles.metricValue}>
                {summary.total_new_lineages_in_range}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>范围内已消退</Text>
              <Text style={styles.metricValue}>
                {summary.total_healed_lineages_in_range}
              </Text>
            </View>
          </View>

          {points.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>每日状态</Text>
              <View style={styles.pointList}>
                {points.map((point) => {
                  const barWidth =
                    `${trendPointBarPercent(point.skin_health_index)}%` as `${number}%`;
                  return (
                    <View key={point.day} style={styles.pointCard}>
                      <View style={styles.pointHeader}>
                        <View>
                          <Text style={styles.pointDay}>
                            {formatTrendDay(point.day)}
                          </Text>
                          <Text style={styles.pointSource}>
                            {point.source === 'check_in'
                              ? '三视角 Check-in'
                              : '旧版记录'}
                          </Text>
                        </View>
                        <Text style={styles.pointIndex}>
                          {point.skin_health_index ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: barWidth }]} />
                      </View>
                      <View style={styles.pointDetails}>
                        <Text style={styles.pointDetail}>
                          外观程度 {severityLabel(point.overall_severity)}
                        </Text>
                        <Text style={styles.pointDetail}>
                          估算总数 {point.total_estimated_count}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>本期摘要</Text>
            <View style={styles.highlightList}>
              {summary.highlights.map((highlight) => (
                <View key={highlight} style={styles.highlight}>
                  <Text style={styles.highlightMark}>•</Text>
                  <Text style={styles.highlightText}>{highlight}</Text>
                </View>
              ))}
            </View>
          </View>

          {overviewRegions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>重点区域概览</Text>
              <View style={styles.regionList}>
                {overviewRegions.map((region) => (
                  <View
                    key={`${region.view_type}-${region.region}`}
                    style={styles.regionCard}>
                    <Text style={styles.regionTitle}>
                      {trendRegionTitle(region.view_type, region.region)}
                    </Text>
                    <View style={styles.regionCounts}>
                      <Text style={styles.regionCount}>
                        活跃 {region.active_lineage_count}
                      </Text>
                      <Text style={styles.regionCount}>
                        暂未见 {region.dormant_lineage_count}
                      </Text>
                      <Text style={styles.regionCount}>
                        已消退 {region.healed_lineage_count}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.dataNote}>
            <Text style={styles.dataNoteText}>
              同一天只保留一个主要结果；不完整分析不会进入趋势。
              {summary.superseded_check_ins > 0
                ? ` 本范围有 ${summary.superseded_check_ins} 条同日结果已按规则去重。`
                : ''}
            </Text>
          </View>
          <AppButton
            label="返回首页"
            variant="text"
            onPress={() => router.replace('/home')}
          />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  rangeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xs,
  },
  rangeOption: {
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  rangeOptionSelected: {
    backgroundColor: colors.primary,
  },
  rangeOptionText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  rangeOptionTextSelected: {
    color: colors.white,
  },
  pressed: {
    opacity: 0.75,
  },
  demoNotice: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  demoNoticeText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  loading: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 14,
  },
  stateBlock: {
    gap: spacing.md,
  },
  emptyCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  primaryMetric: {
    width: '100%',
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    padding: spacing.xl,
  },
  primaryMetricLabel: {
    color: '#E6ECE8',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryMetricValue: {
    marginTop: spacing.xs,
    color: colors.white,
    fontSize: 52,
    fontWeight: '800',
  },
  primaryMetricUnit: {
    color: '#E6ECE8',
    fontSize: 12,
  },
  metric: {
    minWidth: 140,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  pointList: {
    gap: spacing.md,
  },
  pointCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  pointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointDay: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pointSource: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 12,
  },
  pointIndex: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '800',
  },
  barTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  pointDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  pointDetail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  highlightList: {
    gap: spacing.sm,
  },
  highlight: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  highlightMark: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 21,
  },
  highlightText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  regionList: {
    gap: spacing.md,
  },
  regionCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  regionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  regionCounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  regionCount: {
    color: colors.textMuted,
    fontSize: 13,
  },
  dataNote: {
    marginBottom: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  dataNoteText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
