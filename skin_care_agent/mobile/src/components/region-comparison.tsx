import { StyleSheet, Text, View } from 'react-native';
import { EditorialText } from '@/components/editorial-text';
import { PrivacyPhotoThumbnail } from '@/components/privacy-photo-thumbnail';
import { EvidenceIcon } from '@/components/timepoint-evidence-card';
import { journeyColors as palette } from '@/constants/journey-theme';
import { radii, spacing } from '@/constants/theme';
import { formatHistoryShortDate } from '@/lib/history-flow';
import type { AuthenticatedRequest } from '@/lib/observation-api';
import type { RegionEventTimepoint } from '@/lib/region-event-api';
import { useState } from 'react';

export function RegionComparison({ earlier, later, request, regionLabel }: {
  earlier: RegionEventTimepoint; later: RegionEventTimepoint;
  request: AuthenticatedRequest; regionLabel: string;
}) {
  const [width, setWidth] = useState(350);
  const rows = [
    ['可见外观', earlier.target.facts?.daily_appearance.join('、'), later.target.facts?.daily_appearance.join('、')],
    ['分布状态', earlier.target.facts?.distribution, later.target.facts?.distribution],
    ['可见范围', earlier.target.facts?.coverage, later.target.facts?.coverage],
  ];
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.photos}>
      {[earlier, later].map((point, index) => <View key={point.target.target_id} style={styles.photoColumn}>
        {point.photo ? <PrivacyPhotoThumbnail size={(width - 8) / 2} height={(width - 8) * 0.56} photo={point.photo} regionId={point.target.region_id} request={request} selected={false} accessibilityLabel={regionLabel + '，' + formatHistoryShortDate(point.recorded_local_date)} /> : <View style={styles.noPhoto}><Text>没有照片</Text></View>}
        <EditorialText role="sectionTitle" style={styles.date}>{formatHistoryShortDate(point.recorded_local_date)}</EditorialText>
        <Text style={styles.caption}>{index === 0 ? '记录时的状态' : '较近一次的状态'}</Text>
      </View>)}
      <View pointerEvents="none" style={[styles.compareMark, { top: (width - 8) * 0.28 - 20 }]}><Text style={styles.compareGlyph}>‹ ›</Text></View>
    </View>
    <View style={styles.card}>
      <View style={styles.heading}><EvidenceIcon kind="chart" /><EditorialText role="sectionTitle" style={styles.title}>对比观察</EditorialText></View>
      <EditorialText role="sectionTitle" style={styles.conclusion}>{later.target.facts?.summary || '结合两个时间点的照片，回看可见变化。'}</EditorialText>
      <Text style={styles.provenance}>较近一次的照片记录 · {formatHistoryShortDate(later.recorded_local_date)}</Text>
      <View style={styles.metrics}>
        {rows.map(([label, before, after], index) => <View key={label} style={styles.metric}>
          <EvidenceIcon kind={index === 2 ? 'heart' : 'check'} />
          <Text style={styles.metricLabel}>{label}</Text>
          <View style={styles.metricValues}><Text style={styles.before}>{before || '未能判断'}</Text><Text style={styles.after}>{after || '未能判断'}</Text></View>
        </View>)}
      </View>
    </View>
    <Text style={styles.footnote}>按时间并列原始记录，拍摄光线与角度可能不同。</Text>
  </View>;
}

const styles = StyleSheet.create({
  photos: { flexDirection: 'row', gap: spacing.sm, position: 'relative' },
  photoColumn: { flex: 1, alignItems: 'center' },
  noPhoto: { height: 160, justifyContent: 'center' },
  date: { marginTop: spacing.sm, color: palette.ink, fontSize: 18, lineHeight: 26 },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 22 },
  compareMark: { position: 'absolute', left: '50%', marginLeft: -22, width: 44, height: 40, borderRadius: radii.pill, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' },
  compareGlyph: { fontSize: 25, color: palette.ink },
  card: { marginTop: spacing.xl, padding: spacing.xl, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: palette.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: palette.ink, fontSize: 24, fontWeight: '600' },
  conclusion: { color: palette.ink, fontSize: 21, fontWeight: '600', lineHeight: 32, marginTop: spacing.xl },
  provenance: { color: palette.muted, fontSize: 11, marginTop: spacing.sm },
  metrics: { borderTopWidth: 1, borderStyle: 'dotted', borderColor: palette.line, marginTop: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  metric: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  metricLabel: { color: palette.muted, fontSize: 13, width: 62 },
  metricValues: { flex: 1, gap: spacing.xs },
  before: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  after: { color: palette.ink, fontSize: 13, lineHeight: 20 },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: spacing.lg },
});
