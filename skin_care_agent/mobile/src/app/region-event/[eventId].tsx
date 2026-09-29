import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { PrivacyPhotoThumbnail } from '@/components/privacy-photo-thumbnail';
import { RegionTimechain } from '@/components/region-timechain';
import { RegionComparison } from '@/components/region-comparison';
import { journeyColors as palette } from '@/constants/journey-theme';
import { TimepointEvidenceCard } from '@/components/timepoint-evidence-card';
import { spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import {
  chooseDefaultTimepointId,
  formatHistoryShortDate,
} from '@/lib/history-flow';
import { lifeContextLabel } from '@/lib/life-context';
import { createObservationGenerationGuard } from '@/lib/observation-flow';
import { productUseHref } from '@/lib/observation-navigation';
import { listAllProductUses } from '@/lib/product-api';
import type { ProductUse } from '@/lib/product-api';
import { endRegionEvent, getRegionEvent } from '@/lib/region-event-api';
import type { RegionEventDetail } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';
import { useSession } from '@/providers/session-provider';

function parseEventId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function RegionEventDetailScreen() {
  const params = useLocalSearchParams<{ eventId: string; mode?: string; earlier?: string; later?: string }>();
  const eventId = parseEventId(params.eventId);
  const { request } = useSession();
  const [event, setEvent] = useState<RegionEventDetail | null>(null);
  const [productUses, setProductUses] = useState<ProductUse[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [photoWidth, setPhotoWidth] = useState(0);
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
  const productContexts = useMemo(() => productUses.filter(use => {
    if (!selectedTimepoint) return false;
    const date = new Date(Date.parse(use.used_at) + use.used_timezone_offset_minutes * 60_000);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === selectedTimepoint.recorded_local_date;
  }), [selectedTimepoint, productUses]);
  const comparing = params.mode === 'compare';
  const photos = event?.timepoints.filter(point => point.photo).slice().sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)) ?? [];
  const earlier = photos.find(point => point.target.target_id === Number(params.earlier)) ?? photos[0];
  const later = photos.find(point => point.target.target_id === Number(params.later)) ?? photos.at(-1);
  const openComparison = () => {
    if (photos.length < 2) return;
    const firstIndex = Math.floor(Math.random() * photos.length);
    const remaining = photos.filter((_, index) => index !== firstIndex);
    const pair = [photos[firstIndex], remaining[Math.floor(Math.random() * remaining.length)]]
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    router.push({ pathname: '/region-event/[eventId]', params: { eventId: String(eventId), mode: 'compare', earlier: pair[0].target.target_id, later: pair[1].target.target_id } });
  };

  return (
    <AppScreen backgroundColor={palette.background} contentStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={comparing ? '返回这一段记录' : '返回历程'} onPress={() => router.canGoBack() ? router.back() : router.replace('/history')} style={styles.back}><Text style={styles.backGlyph}>‹</Text></Pressable>
        <EditorialText role="pageTitle" style={styles.title}>{region?.label ?? '区域'} · {comparing ? '对比观察' : '这一段记录'}</EditorialText>
        <Text style={styles.meta}>{comparing ? '选择两个时间点，对比肌肤变化' : event ? formatHistoryShortDate(event.started_local_date) + '—' + formatHistoryShortDate(event.last_valid_local_date) + ' · ' + event.timepoints.length + ' 个时间点' : '正在读取区域记录'}</Text>
        {event?.status === 'ended' ? <Text style={styles.meta}>这段记录已结束</Text> : null}
      </View>
      {loading && !event ? <ActivityIndicator color={palette.moss} /> : null}
      {error ? <View><InlineNotice tone="error" message={error} /><AppButton label="重新读取" onPress={() => setReloadKey(key => key + 1)} variant="text" /></View> : null}
      {event && region ? comparing ? (
        earlier && later && earlier !== later ? <RegionComparison earlier={earlier} later={later} request={request} regionLabel={region.label} /> :
          <Text style={styles.muted}>需要两个有照片的时间点才能对比。</Text>
      ) : <>
        {event.timepoints.length ? <RegionTimechain onSelect={setSelectedTargetId} regionLabel={region.label} request={request} selectedTargetId={selectedTargetId} timepoints={event.timepoints} /> :
          <Text style={styles.muted}>这段记录还没有有效时间点。</Text>}
        {selectedTimepoint ? <View
          testID="selected-region-photo"
          onLayout={({ nativeEvent }) => setPhotoWidth(nativeEvent.layout.width)}
          style={styles.selectedPhoto}>
          <Text style={styles.photoCaption}>{formatHistoryShortDate(selectedTimepoint.recorded_local_date)} · {region.label}</Text>
          {selectedTimepoint.photo ? photoWidth > 0 && <PrivacyPhotoThumbnail
            key={`${selectedTimepoint.target.target_id}-${selectedTimepoint.photo.photo_id}-${selectedTimepoint.photo.url}`}
            accessibilityLabel={`${region.label}，${formatHistoryShortDate(selectedTimepoint.recorded_local_date)}，区域大图`}
            photo={selectedTimepoint.photo}
            regionId={selectedTimepoint.target.region_id}
            request={request}
            selected={false}
            size={photoWidth}
          /> : <Text style={styles.muted}>这一天没有照片，以下保留文字记录。</Text>}
        </View> : null}
        {photos.length >= 2 ? <Pressable accessibilityRole="button" onPress={openComparison} style={styles.compareLink}><Text style={styles.compareLinkText}>对比观察 ‹ ›</Text></Pressable> : null}
        {selectedTimepoint ? <View style={styles.evidenceSection}>
          <TimepointEvidenceCard
            onOpenObservation={() => router.push(`/observation/${selectedTimepoint.observation_id}`)}
            regionLabel={region.label} timepoint={selectedTimepoint} productUses={productContexts}
            productStatus={contextError ? 'error' : contextLoading ? 'loading' : undefined}
            onRetryProducts={() => setContextReloadKey(key => key + 1)}
          />
        </View> : null}
        <Text style={styles.contextBoundary}>相邻记录只作时间上下文，不表示关联或疗效。</Text>
        {selectedTimepoint?.life_context_completed_at && selectedTimepoint.life_context_ids.length ? <Text style={styles.muted}>生活背景 · {selectedTimepoint.life_context_ids.map(lifeContextLabel).join('、')}</Text> : null}
        {selectedTimepoint ? <AppButton label="继续记录产品使用" variant="text" onPress={() => router.push(productUseHref({ source: 'region_event', flowId: createClientRequestId(), observationId: selectedTimepoint.observation_id, eventId: event.event_id }) as Href)} /> : null}
        {event.status === 'current' ? <View style={styles.endSection}>
          {confirmEnding ? <InlineNotice tone="info" message="结束只会关闭这段记录，不代表皮肤状态已经恢复或问题已经解决。" /> : null}
          <AppButton label={confirmEnding ? '确认结束这段记录' : '结束这段记录'} loading={ending} onPress={() => confirmEnding ? void endCurrentEvent() : setConfirmEnding(true)} variant="text" />
          {confirmEnding ? <AppButton label="暂不结束" onPress={() => setConfirmEnding(false)} variant="text" /> : null}
        </View> : null}
      </> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 28 },
  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl, paddingTop: spacing.xs, paddingHorizontal: spacing.xl },
  back: { position: 'absolute', left: -8, top: -4, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  backGlyph: { color: palette.ink, fontSize: 34, lineHeight: 40 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '600', lineHeight: 34, textAlign: 'center' },
  meta: { color: palette.muted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 22, marginTop: spacing.lg },
  compareLink: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  compareLinkText: { color: palette.moss, fontSize: 12 },
  selectedPhoto: { width: '100%', marginTop: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  photoCaption: { color: palette.muted, fontSize: 13, lineHeight: 21 },
  evidenceSection: { marginTop: spacing.sm },
  contextBoundary: { color: palette.muted, fontSize: 11, lineHeight: 19, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.md },
  endSection: { marginTop: spacing.md },
});
