import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { EditorialText } from '@/components/editorial-text';
import { PrivacyPhotoThumbnail } from '@/components/privacy-photo-thumbnail';
import { EvidenceIcon } from '@/components/timepoint-evidence-card';
import { journeyColors as palette } from '@/constants/journey-theme';
import { radii, spacing } from '@/constants/theme';
import { formatHistoryShortDate } from '@/lib/history-flow';
import type { AuthenticatedRequest } from '@/lib/observation-api';
import type { RegionComparison as Comparison, RegionEventTimepoint } from '@/lib/region-event-api';
import { buildComparisonView, INSIGHT_BOUNDARY_TEXT } from '@/lib/region-insight-flow';

type Slot = 'earlier' | 'later';

export function RegionComparison({
  earlier, later, candidates, activeSlot, comparison, loadError, request, regionLabel,
  onActivateSlot, onPick, onRetry,
}: {
  earlier: RegionEventTimepoint;
  later: RegionEventTimepoint;
  candidates: readonly RegionEventTimepoint[];
  activeSlot: Slot;
  comparison: Comparison | null;
  loadError: string | null;
  request: AuthenticatedRequest;
  regionLabel: string;
  onActivateSlot: (slot: Slot) => void;
  onPick: (targetId: number) => void;
  onRetry: () => void;
}) {
  const [width, setWidth] = useState(350);
  const other = activeSlot === 'earlier' ? later : earlier;
  const view = comparison ? buildComparisonView(comparison) : null;
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.photos}>
      {([['earlier', earlier], ['later', later]] as const).map(([slot, point]) => {
        const active = slot === activeSlot;
        const date = formatHistoryShortDate(point.recorded_local_date);
        return <View key={slot} style={styles.photoColumn}>
          {point.photo ? <PrivacyPhotoThumbnail
            size={(width - 8) / 2} height={(width - 8) * 0.56} photo={point.photo}
            regionId={point.target.region_id} request={request} selected={active}
            onPress={() => onActivateSlot(slot)}
            accessibilityLabel={`${regionLabel}，${date}，${slot === 'earlier' ? '较早一次' : '较近一次'}，点击后在下方改选日期`} /> :
            <View style={styles.noPhoto}><Text>没有照片</Text></View>}
          <EditorialText role="sectionTitle" style={styles.date}>{date}</EditorialText>
          <Text style={[styles.caption, active && styles.captionActive]}>
            {slot === 'earlier' ? '较早一次' : '较近一次'}{active ? ' · 改选中' : ''}
          </Text>
        </View>;
      })}
      <View pointerEvents="none" style={[styles.compareMark, { top: (width - 8) * 0.28 - 20 }]}><Text style={styles.compareGlyph}>‹ ›</Text></View>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}
      accessibilityLabel={`为${activeSlot === 'earlier' ? '较早一次' : '较近一次'}选择日期`}>
      {candidates.map(point => {
        const targetId = point.target.target_id;
        const chosenSlot: Slot | null = targetId === earlier.target.target_id ? 'earlier'
          : targetId === later.target.target_id ? 'later' : null;
        const chosen = chosenSlot !== null;
        // A selected chip stays enabled: tapping it switches which slot is being edited.
        const disabled = !chosen && point.recorded_local_date === other.recorded_local_date;
        const date = formatHistoryShortDate(point.recorded_local_date);
        return <Pressable key={targetId} accessibilityRole="button" disabled={disabled}
          accessibilityLabel={`${date}${chosen ? '，已选' : ''}${disabled ? '，与另一次同一天，不能对比' : ''}`}
          accessibilityState={{ selected: chosen, disabled }}
          onPress={() => chosenSlot ? onActivateSlot(chosenSlot) : onPick(targetId)}
          style={[styles.chip, chosen && styles.chipChosen, disabled && styles.chipDisabled]}>
          <Text style={[styles.chipText, chosen && styles.chipTextChosen]}>{date}</Text>
        </Pressable>;
      })}
    </ScrollView>

    <View style={styles.card} testID="region-comparison-card">
      <View style={styles.heading}><EvidenceIcon kind="chart" /><EditorialText role="sectionTitle" style={styles.title}>对比观察</EditorialText></View>
      {loadError ? <>
        <Text style={styles.body}>{loadError}</Text>
        <AppButton label="重新对比" variant="text" onPress={onRetry} />
      </> : !view || view.kind === 'processing' ? (
        <Text style={styles.body} accessibilityLiveRegion="polite">{view?.message ?? '正在读取对比…'}</Text>
      ) : view.kind === 'failed' ? <>
        <Text style={styles.body}>{view.message}</Text>
        <AppButton label="重新对比" variant="text" onPress={onRetry} />
      </> : view.kind === 'insufficient' ? <>
        <EditorialText role="sectionTitle" style={styles.conclusion}>{view.headline}</EditorialText>
        {view.reasons.map(reason => <Text key={reason} style={styles.limit}>· {reason}</Text>)}
        <SideFacts earlier={earlier} later={later} />
      </> : <>
        <EditorialText role="sectionTitle" style={styles.conclusion}>{view.headline}</EditorialText>
        <Text style={styles.provenance}>AI 对比 · {view.reliabilityText}{comparison?.completed_at ? ' · ' + formatHistoryShortDate(comparison.completed_at) + '整理' : ''}</Text>
        <View style={styles.metrics}>
          {view.changes.map((change, index) => <View key={change.label + index} style={styles.metric}>
            <Text style={styles.metricLabel}>{change.label}</Text>
            <View style={styles.metricValues}>
              <Text style={styles.after}>{change.change}</Text>
              <Text style={styles.before}>{formatHistoryShortDate(earlier.recorded_local_date)}：{change.before || '未能判断'} → {formatHistoryShortDate(later.recorded_local_date)}：{change.after || '未能判断'}</Text>
              <Text style={styles.before}>{change.location ? change.location + ' · ' : ''}{change.strength}</Text>
            </View>
          </View>)}
        </View>
        {[...view.limits, ...view.unknowns].length ? <View style={styles.limits}>
          <Text style={styles.metricLabel}>无法判断的部分</Text>
          {[...view.limits, ...view.unknowns].map(item => <Text key={item} style={styles.limit}>· {item}</Text>)}
        </View> : null}
      </>}
    </View>
    <Text style={styles.footnote}>{INSIGHT_BOUNDARY_TEXT}</Text>
  </View>;
}

function SideFacts({ earlier, later }: { earlier: RegionEventTimepoint; later: RegionEventTimepoint }) {
  const rows = [
    ['可见外观', earlier.target.facts?.daily_appearance.join('、'), later.target.facts?.daily_appearance.join('、')],
    ['分布状态', earlier.target.facts?.distribution, later.target.facts?.distribution],
    ['可见范围', earlier.target.facts?.coverage, later.target.facts?.coverage],
  ];
  return <View style={styles.metrics}>
    <Text style={styles.provenance}>以下为两次各自的照片记录，按时间并列</Text>
    {rows.map(([label, before, after]) => <View key={label} style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValues}>
        <Text style={styles.before}>{formatHistoryShortDate(earlier.recorded_local_date)}：{before || '未能判断'}</Text>
        <Text style={styles.after}>{formatHistoryShortDate(later.recorded_local_date)}：{after || '未能判断'}</Text>
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  photos: { flexDirection: 'row', gap: spacing.sm, position: 'relative' },
  photoColumn: { flex: 1, alignItems: 'center' },
  noPhoto: { height: 160, justifyContent: 'center' },
  date: { marginTop: spacing.sm, color: palette.ink, fontSize: 18, lineHeight: 26 },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  captionActive: { color: palette.moss },
  compareMark: { position: 'absolute', left: '50%', marginLeft: -22, width: 44, height: 40, borderRadius: radii.pill, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' },
  compareGlyph: { fontSize: 25, color: palette.ink },
  chips: { gap: spacing.sm, paddingVertical: spacing.md },
  chip: { minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface },
  chipChosen: { borderColor: palette.moss, backgroundColor: palette.disc },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: palette.muted, fontSize: 13 },
  chipTextChosen: { color: palette.moss, fontWeight: '600' },
  card: { marginTop: spacing.md, padding: spacing.xl, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: palette.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: palette.ink, fontSize: 24, fontWeight: '600' },
  body: { color: palette.ink, fontSize: 14, lineHeight: 22, marginTop: spacing.lg },
  conclusion: { color: palette.ink, fontSize: 21, fontWeight: '600', lineHeight: 32, marginTop: spacing.xl },
  provenance: { color: palette.muted, fontSize: 11, marginTop: spacing.sm },
  metrics: { borderTopWidth: 1, borderStyle: 'dotted', borderColor: palette.line, marginTop: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  metric: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44 },
  metricLabel: { color: palette.muted, fontSize: 13, width: 62, lineHeight: 20 },
  metricValues: { flex: 1, gap: spacing.xs },
  before: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  after: { color: palette.ink, fontSize: 13, lineHeight: 20 },
  limits: { marginTop: spacing.md, gap: spacing.xs },
  limit: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: spacing.lg },
});
