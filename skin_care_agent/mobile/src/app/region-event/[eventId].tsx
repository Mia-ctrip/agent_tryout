import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { RegionTimechain } from '@/components/region-timechain';
import { TimepointEvidenceCard } from '@/components/timepoint-evidence-card';
import { colors, radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import {
  chooseDefaultTimepointId,
  formatHistoryShortDate,
  productContextsForEvent,
} from '@/lib/history-flow';
import { lifeContextLabel } from '@/lib/life-context';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { productUseHref } from '@/lib/observation-navigation';
import { listAllProductUses } from '@/lib/product-api';
import type { ProductUse } from '@/lib/product-api';
import { formatProductUseDate } from '@/lib/product-ui';
import { endRegionEvent, getRegionEvent } from '@/lib/region-event-api';
import type { RegionEventDetail } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';
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
  const [productUses, setProductUses] = useState<ProductUse[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnding, setConfirmEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextError, setContextError] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [contextReloadKey, setContextReloadKey] = useState(0);
  const [eventGuard] = useState(() => createObservationGenerationGuard());
  const [contextGuard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      void reloadKey;
      const generation = eventGuard.begin();
      if (!eventId) {
        setLoading(false);
        setError('区域记录编号无效。');
        return () => eventGuard.invalidate();
      }
      setLoading(true);
      setError(null);
      void getRegionEvent(request, eventId)
        .then((nextEvent) => {
          if (!eventGuard.isCurrent(generation)) return;
          setEvent(nextEvent);
          setSelectedTargetId((current) =>
            chooseDefaultTimepointId(nextEvent.timepoints, current),
          );
        })
        .catch((loadError) => {
          if (eventGuard.isCurrent(generation)) {
            setError(userFacingError(loadError));
          }
        })
        .finally(() => {
          if (eventGuard.isCurrent(generation)) setLoading(false);
        });
      return () => eventGuard.invalidate();
    }, [eventGuard, eventId, reloadKey, request]),
  );

  useFocusEffect(
    useCallback(() => {
      void contextReloadKey;
      const generation = contextGuard.begin();
      setContextLoading(true);
      setContextError(false);
      void listAllProductUses(request)
        .then((uses) => {
          if (contextGuard.isCurrent(generation)) setProductUses(uses);
        })
        .catch(() => {
          if (contextGuard.isCurrent(generation)) setContextError(true);
        })
        .finally(() => {
          if (contextGuard.isCurrent(generation)) setContextLoading(false);
        });
      return () => contextGuard.invalidate();
    }, [contextGuard, contextReloadKey, request]),
  );

  async function endCurrentEvent() {
    if (!eventId || ending) return;
    setEnding(true);
    setError(null);
    try {
      await endRegionEvent(request, eventId);
      const nextEvent = await getRegionEvent(request, eventId);
      setEvent(nextEvent);
      setSelectedTargetId((current) =>
        chooseDefaultTimepointId(nextEvent.timepoints, current),
      );
      setConfirmEnding(false);
    } catch (endError) {
      setError(userFacingError(endError));
    } finally {
      setEnding(false);
    }
  }

  const region = event ? regionById(event.region_id) : null;
  const selectedTimepoint = useMemo(
    () =>
      event?.timepoints.find(
        ({ target }) => target.target_id === selectedTargetId,
      ) ?? null,
    [event, selectedTargetId],
  );
  const productContexts = useMemo(
    () => (event ? productContextsForEvent(event.timepoints, productUses) : []),
    [event, productUses],
  );

  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.actionPrimary,
          title: region?.label ?? '区域记录',
        }}
      />

      {loading && !event ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.actionPrimary} />
          <Text style={styles.muted}>正在读取区域时间链</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.noticeGroup}>
          <InlineNotice tone="error" message={error} />
          <AppButton
            label="重新读取"
            onPress={() => setReloadKey((key) => key + 1)}
            variant="text"
          />
        </View>
      ) : null}

      {event && region ? (
        <>
          <View style={styles.header}>
            <EditorialText role="pageTitle" style={styles.title}>{region.label} · 这一段记录</EditorialText>
            <Text style={styles.meta}>
              {formatHistoryShortDate(event.started_local_date)}—
              {formatHistoryShortDate(event.last_valid_local_date)} · {event.timepoints.length} 个时间点
            </Text>
            {event.status === 'ended' ? <Text style={styles.status}>这段记录已结束</Text> : null}
          </View>

          {event.timepoints.length ? (
            <View style={styles.timelineSection}>
              <RegionTimechain
                onSelect={setSelectedTargetId}
                regionLabel={region.label}
                request={request}
                selectedTargetId={selectedTargetId}
                timepoints={event.timepoints}
              />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>这段记录还没有有效时间点</Text>
              <Text style={styles.muted}>
                处理中或需要补充文字的观察不会提前成为区域证据。
              </Text>
            </View>
          )}

          {productContexts.length || selectedTimepoint?.life_context_completed_at ? (
            <View style={styles.contextSection}>
              <View style={styles.contextRows}>
                {productContexts.map((use) => (
                  <View key={use.product_use_id} style={styles.contextRow}>
                    <Text style={styles.contextLabel}>
                      产品使用 ·{' '}
                      {use.products.length
                        ? use.products.map(({ name }) => name).join('、')
                        : '未注明产品'}
                    </Text>
                    <Text style={styles.contextDate}>
                      {formatProductUseDate(
                        use.used_at,
                        use.used_timezone_offset_minutes,
                      )}
                    </Text>
                  </View>
                ))}
                {selectedTimepoint?.life_context_completed_at ? (
                  selectedTimepoint.life_context_ids.length ? (
                    selectedTimepoint.life_context_ids.map((contextId) => (
                      <View key={contextId} style={styles.contextRow}>
                        <Text style={styles.contextLabel}>
                          生活背景 · {lifeContextLabel(contextId)}
                        </Text>
                        <Text style={styles.contextDate}>
                          {formatHistoryShortDate(selectedTimepoint.recorded_local_date)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.contextSkipped}>生活背景 · 当天已跳过</Text>
                  )
                ) : null}
              </View>
            </View>
          ) : null}

          {contextLoading && !productUses.length ? (
            <Text style={styles.contextUnavailable}>正在读取产品使用上下文。</Text>
          ) : null}
          {contextError ? (
            <View style={styles.contextErrorRow}>
              <Text style={styles.contextUnavailable}>
                产品使用上下文暂未加载。已保留上次读取到的内容。
              </Text>
              <AppButton
                label="重新读取时间上下文"
                onPress={() => setContextReloadKey((key) => key + 1)}
                variant="text"
              />
            </View>
          ) : null}
          {selectedTimepoint ? (
            <View style={styles.evidenceSection}>
              <TimepointEvidenceCard
                onOpenObservation={() =>
                  router.push(`/observation/${selectedTimepoint.observation_id}`)
                }
                regionLabel={region.label}
                timepoint={selectedTimepoint}
              />
              <AppButton
                label="继续记录产品使用"
                onPress={() =>
                  router.push(
                    productUseHref({
                      source: 'region_event',
                      flowId: createClientRequestId(),
                      observationId: selectedTimepoint.observation_id,
                      eventId: event.event_id,
                    }) as Href,
                  )
                }
                variant="secondary"
              />
            </View>
          ) : null}

          <Text style={styles.contextBoundary}>
            相邻记录只作时间上下文，不表示关联或疗效。
          </Text>

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
                onPress={() =>
                  confirmEnding ? void endCurrentEvent() : setConfirmEnding(true)
                }
                variant="text"
              />
              {confirmEnding ? (
                <AppButton
                  label="暂不结束"
                  onPress={() => setConfirmEnding(false)}
                  variant="text"
                />
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
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  noticeGroup: { gap: spacing.xs },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 36,
    fontWeight: '400',
    textAlign: 'center',
  },
  meta: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  status: { color: colors.actionPrimary, fontSize: 12, fontWeight: '500' },
  timelineSection: { gap: spacing.xs },
  emptyState: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  contextSection: { gap: spacing.sm, marginTop: spacing.xl },
  contextRows: { gap: spacing.xs },
  contextRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  contextLabel: { flex: 1, color: colors.moss, fontSize: 14, lineHeight: 22 },
  contextDate: { flexShrink: 1, maxWidth: '40%', color: colors.textMuted, fontSize: 11, lineHeight: 18 },
  contextSkipped: { color: colors.textMuted, fontSize: 12, paddingVertical: spacing.sm },
  contextUnavailable: { marginTop: spacing.md, color: colors.textMuted, fontSize: 12 },
  contextErrorRow: { alignItems: 'flex-start', gap: spacing.xs },
  contextBoundary: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  evidenceSection: { gap: spacing.md, marginTop: spacing.xl },
  endSection: { gap: spacing.sm, marginTop: spacing.xxl },
});
