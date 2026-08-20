import { router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import {
  getCheckInAnalysisSummary,
} from '@/lib/analysis-api';
import type { CheckInAnalysisSummary } from '@/lib/analysis-api';
import {
  developmentAnalysisFixture,
  developmentAnalysisMode,
} from '@/lib/analysis-fixtures';
import type { DevelopmentAnalysisMode } from '@/lib/analysis-fixtures';
import {
  analysisRecoveryAction,
  buildAnalysisViewStates,
  completedAnalysisCount,
  createAnalysisGenerationGuard,
  runMissingViewAnalyses,
} from '@/lib/analysis-flow';
import type {
  AnalysisGenerationGuard,
  AnalysisViewState,
} from '@/lib/analysis-flow';
import {
  analysisFailureMessage,
  analysisViewLabel,
  analysisViewStatusLabel,
  severityLabel,
} from '@/lib/analysis-presenter';
import { getCheckIn } from '@/lib/check-in-api';
import { useSession } from '@/providers/session-provider';

const doctorMessage =
  '当前外观变化较明显，建议尽快咨询皮肤科专业人员。本结果仅用于状态记录，不提供诊断或药品建议。';

const demoOptions: readonly {
  mode: DevelopmentAnalysisMode;
  label: string;
}[] = [
  { mode: 'ready', label: '完整结果' },
  { mode: 'partial', label: '分析中' },
  { mode: 'failed', label: '部分失败' },
  { mode: 'doctor', label: '就医提示' },
];

export default function AnalysisScreen() {
  const params = useLocalSearchParams<{
    checkInId?: string | string[];
    demo?: string | string[];
  }>();
  const { request } = useSession();
  const parsedCheckInId =
    typeof params.checkInId === 'string'
      ? Number(params.checkInId)
      : Number.NaN;
  const demoMode = developmentAnalysisMode(__DEV__, params.demo);
  const [summary, setSummary] = useState<CheckInAnalysisSummary | null>(null);
  const [states, setStates] = useState<AnalysisViewState[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [summaryRefreshFailed, setSummaryRefreshFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);
  const runningGenerationRef = useRef<number | null>(null);
  const statesRef = useRef<AnalysisViewState[]>([]);
  const [generationGuard] = useState<AnalysisGenerationGuard>(() =>
    createAnalysisGenerationGuard(),
  );

  const commitStates = useCallback((nextStates: AnalysisViewState[]) => {
    statesRef.current = nextStates;
    if (mountedRef.current) {
      setStates(nextStates);
    }
  }, []);

  const runAnalyses = useCallback(
    async (
      sourceStates?: readonly AnalysisViewState[],
      existingGeneration?: number,
    ) => {
      const generation = existingGeneration ?? generationGuard.begin();
      const isCurrent = () =>
        mountedRef.current && generationGuard.isCurrent(generation);
      if (runningGenerationRef.current === generation) {
        return;
      }
      if (demoMode) {
        const fixture = developmentAnalysisFixture('ready');
        if (isCurrent()) {
          commitStates(fixture.states);
          setSummary(fixture.summary);
          setSummaryRefreshFailed(false);
          setError(null);
        }
        return;
      }
      if (!Number.isSafeInteger(parsedCheckInId) || parsedCheckInId <= 0) {
        if (isCurrent()) {
          setError('Check-in 编号无效。');
        }
        return;
      }

      runningGenerationRef.current = generation;
      if (isCurrent()) {
        setRunning(true);
        setSummaryRefreshFailed(false);
        setError(null);
      }
      try {
        const completedStates = await runMissingViewAnalyses(
          request,
          sourceStates ?? statesRef.current,
          (nextStates) => {
            if (isCurrent()) {
              commitStates([...nextStates]);
            }
          },
        );
        if (!isCurrent()) {
          return;
        }
        commitStates(completedStates);
        try {
          const refreshedSummary = await getCheckInAnalysisSummary(
            request,
            parsedCheckInId,
          );
          if (isCurrent()) {
            setSummary(refreshedSummary);
            setSummaryRefreshFailed(false);
          }
        } catch (summaryError) {
          if (isCurrent()) {
            setSummaryRefreshFailed(
              completedStates.length > 0 &&
                completedStates.every((state) => state.status === 'success'),
            );
            setError(analysisFailureMessage(summaryError));
          }
        }
      } catch (analysisError) {
        if (isCurrent()) {
          setError(analysisFailureMessage(analysisError));
        }
      } finally {
        if (runningGenerationRef.current === generation) {
          runningGenerationRef.current = null;
        }
        if (isCurrent()) {
          setRunning(false);
        }
      }
    },
    [
      commitStates,
      demoMode,
      generationGuard,
      parsedCheckInId,
      request,
    ],
  );

  const refreshSummary = useCallback(async () => {
    if (!Number.isSafeInteger(parsedCheckInId) || parsedCheckInId <= 0) {
      setError('Check-in 编号无效。');
      return;
    }
    const generation = generationGuard.begin();
    const isCurrent = () =>
      mountedRef.current && generationGuard.isCurrent(generation);
    setRefreshingSummary(true);
    setError(null);
    try {
      const refreshedSummary = await getCheckInAnalysisSummary(
        request,
        parsedCheckInId,
      );
      if (isCurrent()) {
        setSummary(refreshedSummary);
        setSummaryRefreshFailed(false);
      }
    } catch (summaryError) {
      if (isCurrent()) {
        setSummaryRefreshFailed(true);
        setError(analysisFailureMessage(summaryError));
      }
    } finally {
      if (isCurrent()) {
        setRefreshingSummary(false);
      }
    }
  }, [generationGuard, parsedCheckInId, request]);

  useEffect(() => {
    mountedRef.current = true;
    const generation = generationGuard.begin();
    const isCurrent = () =>
      mountedRef.current && generationGuard.isCurrent(generation);

    async function load() {
      setLoading(true);
      setRunning(false);
      setRefreshingSummary(false);
      setSummaryRefreshFailed(false);
      setSummary(null);
      commitStates([]);
      setError(null);

      if (demoMode) {
        const fixture = developmentAnalysisFixture(demoMode);
        if (isCurrent()) {
          setSummary(fixture.summary);
          commitStates(fixture.states);
          setLoading(false);
        }
        return;
      }

      if (!Number.isSafeInteger(parsedCheckInId) || parsedCheckInId <= 0) {
        if (isCurrent()) {
          setError('Check-in 编号无效。');
          setLoading(false);
        }
        return;
      }

      try {
        const [checkIn, currentSummary] = await Promise.all([
          getCheckIn(request, parsedCheckInId),
          getCheckInAnalysisSummary(request, parsedCheckInId),
        ]);
        if (!isCurrent()) {
          return;
        }
        if (checkIn.status !== 'complete') {
          setError('请先完成三视角 Check-in，再开始分析。');
          return;
        }
        const initialStates = buildAnalysisViewStates(
          checkIn.photos,
          currentSummary,
        );
        setSummary(currentSummary);
        commitStates(initialStates);
        if (
          currentSummary.aggregation_status !== 'ready' &&
          initialStates.length === 3
        ) {
          void runAnalyses(initialStates, generation);
        } else if (initialStates.length !== 3) {
          setError('三视角照片不完整，暂时无法开始分析。');
        }
      } catch (loadError) {
        if (isCurrent()) {
          setError(analysisFailureMessage(loadError));
        }
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      mountedRef.current = false;
      generationGuard.invalidate();
    };
  }, [
    commitStates,
    demoMode,
    generationGuard,
    parsedCheckInId,
    reloadKey,
    request,
    runAnalyses,
  ]);

  const completedCount = completedAnalysisCount(states);
  const recoveryAction = useMemo(
    () => analysisRecoveryAction(states, summaryRefreshFailed),
    [states, summaryRefreshFailed],
  );
  const ready = summary?.aggregation_status === 'ready';

  if (loading) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>正在恢复分析进度</Text>
      </AppScreen>
    );
  }

  if (!summary) {
    return (
      <AppScreen>
        <BrandHeader
          eyebrow="AI ANALYSIS"
          title="暂时无法加载分析"
          description="照片和已有分析结果均会保留，可以稍后重试。"
        />
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <View style={styles.actions}>
          <AppButton
            label="重新加载"
            onPress={() => setReloadKey((value) => value + 1)}
          />
          <AppButton
            label="返回首页"
            variant="text"
            onPress={() => router.replace('/home')}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <BrandHeader
        eyebrow={ready ? 'TODAY RESULT' : 'AI ANALYSIS'}
        title={ready ? '今日皮肤状态' : '正在分析三视角'}
        description={
          ready
            ? '以下内容只描述照片中的外观状态，用于长期记录和变化对比。'
            : '按视角保存进度；单个视角失败不会重复分析已经成功的照片。'
        }
      />

      {demoMode ? (
        <View style={styles.demoPanel}>
          <Text style={styles.demoTitle}>开发预览</Text>
          <View style={styles.demoActions}>
            {demoOptions.map((option) => (
              <AppButton
                key={option.mode}
                label={option.label}
                variant={option.mode === demoMode ? 'secondary' : 'text'}
                onPress={() =>
                  router.replace(`/analysis/9001?demo=${option.mode}`)
                }
                style={styles.demoButton}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!ready ? (
        <>
          <View style={styles.progressCard}>
            <Text style={styles.progressValue}>{completedCount} / 3</Text>
            <Text style={styles.progressLabel}>视角分析完成</Text>
          </View>
          <View style={styles.viewList}>
            {states.map((state) => (
              <View key={state.viewType} style={styles.viewRow}>
                <View style={styles.viewCopy}>
                  <Text style={styles.viewTitle}>
                    {analysisViewLabel(state.viewType)}
                  </Text>
                  {state.status === 'failed' ? (
                    <Text style={styles.viewError}>
                      {analysisFailureMessage(state.error)}
                    </Text>
                  ) : null}
                </View>
                {state.status === 'analyzing' ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.viewStatus,
                      state.status === 'failed' && styles.viewStatusFailed,
                    ]}>
                    {analysisViewStatusLabel(state.status)}
                  </Text>
                )}
              </View>
            ))}
          </View>
          {error ? <InlineNotice tone="error" message={error} /> : null}
          <View style={styles.actions}>
            {recoveryAction === 'retry_views' ? (
              <AppButton
                label={demoMode ? '模拟完成剩余分析' : '重试缺失分析'}
                loading={running}
                onPress={() => void runAnalyses()}
              />
            ) : null}
            {recoveryAction === 'refresh_summary' ? (
              <AppButton
                label="重新加载汇总结果"
                loading={refreshingSummary}
                onPress={() => void refreshSummary()}
              />
            ) : null}
            <AppButton
              label="暂时退出"
              variant="text"
              onPress={() => router.replace('/home')}
            />
          </View>
        </>
      ) : (
        <>
          {summary.needs_doctor ? (
            <View style={styles.doctorNotice}>
              <Text style={styles.doctorTitle}>建议寻求专业帮助</Text>
              <Text style={styles.doctorText}>{doctorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.metrics}>
            <View style={styles.primaryMetric}>
              <Text style={styles.primaryMetricLabel}>皮肤指数</Text>
              <Text style={styles.primaryMetricValue}>
                {summary.skin_health_index ?? '—'}
              </Text>
              <Text style={styles.metricUnit}>满分 100</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>外观程度</Text>
              <Text style={styles.metricValue}>
                {severityLabel(summary.overall_severity)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>估算总数</Text>
              <Text style={styles.metricValue}>
                {summary.total_estimated_count}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>三视角结果</Text>
          <View style={styles.resultList}>
            {summary.view_summaries.map((view) => (
              <View key={view.view_type} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultTitle}>
                    {analysisViewLabel(view.view_type)}
                  </Text>
                  <Text style={styles.resultCount}>
                    约 {view.total_estimated_count} 处
                  </Text>
                </View>
                <View style={styles.resultDetails}>
                  <Text style={styles.resultDetail}>
                    皮肤指数 {view.skin_health_index ?? '—'}
                  </Text>
                  <Text style={styles.resultDetail}>
                    外观程度 {severityLabel(view.overall_severity)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              结果可能受光线、角度和清晰度影响，仅用于日常状态追踪。
            </Text>
          </View>
          <View style={styles.actions}>
            {!demoMode &&
            Number.isSafeInteger(parsedCheckInId) &&
            parsedCheckInId > 0 ? (
              <AppButton
                label={summary.diary ? '编辑今日记录' : '记录今天的情况'}
                onPress={() =>
                  router.push(`/diary/${parsedCheckInId}` as Href)
                }
              />
            ) : null}
            <AppButton
              label="返回首页"
              variant={
                !demoMode &&
                Number.isSafeInteger(parsedCheckInId) &&
                parsedCheckInId > 0
                  ? 'secondary'
                  : 'primary'
              }
              onPress={() => router.replace('/home')}
            />
          </View>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  demoPanel: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  demoTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  demoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  demoButton: {
    minHeight: 40,
  },
  progressCard: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
    padding: spacing.xxl,
  },
  progressValue: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: '800',
  },
  progressLabel: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: 14,
  },
  viewList: {
    marginBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  viewRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  viewTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  viewError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  viewStatus: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  viewStatusFailed: {
    color: colors.danger,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  doctorNotice: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.lg,
  },
  doctorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  doctorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  primaryMetric: {
    width: '100%',
    alignItems: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    padding: spacing.xl,
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
  metricUnit: {
    color: '#E6ECE8',
    fontSize: 12,
  },
  metricValue: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  resultList: {
    gap: spacing.md,
  },
  resultCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  resultCount: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  resultDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  resultDetail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  disclaimer: {
    marginTop: spacing.xl,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  disclaimerText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
