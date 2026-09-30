import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { EditorialText } from '@/components/editorial-text';
import { EvidenceIcon } from '@/components/timepoint-evidence-card';
import { journeyColors as palette } from '@/constants/journey-theme';
import { radii, spacing } from '@/constants/theme';
import type { RegionInsights } from '@/lib/region-event-api';
import { buildTrendView, INSIGHT_BOUNDARY_TEXT } from '@/lib/region-insight-flow';

export function RegionTrendCard({ insights, loadError, onRetry, onSelectTimepoint }: {
  insights: RegionInsights | null;
  loadError: string | null;
  onRetry: () => void;
  onSelectTimepoint: (targetId: number) => void;
}) {
  if (!insights && !loadError) return null;
  const view = insights ? buildTrendView(insights) : null;
  return <View style={styles.card} testID="region-trend-card">
    <View style={styles.heading}>
      <EvidenceIcon kind="chart" />
      <EditorialText role="sectionTitle" style={styles.title}>阶段趋势</EditorialText>
    </View>
    {loadError || !view ? <>
      <Text style={styles.body}>{loadError ?? '暂时无法读取阶段趋势。'}</Text>
      <AppButton label="重新读取" variant="text" onPress={onRetry} />
    </> : view.kind === 'locked' ? (
      <Text style={styles.body}>{view.message}</Text>
    ) : view.kind === 'processing' ? (
      <Text style={styles.body} accessibilityLiveRegion="polite">{view.message}</Text>
    ) : view.kind === 'failed' ? <>
      <Text style={styles.body}>{view.message}</Text>
      <AppButton label="重新整理" variant="text" onPress={onRetry} />
    </> : <>
      {view.updating ? <Text style={styles.updating} accessibilityLiveRegion="polite">有新的记录，正在更新</Text> : null}
      <EditorialText role="sectionTitle" style={styles.conclusion}>{view.headline}</EditorialText>
      {view.kind === 'insufficient' ? view.reasons.map(reason => <Text key={reason} style={styles.limit}>· {reason}</Text>) : <>
        <Text style={styles.provenance}>AI 整理 · 最近 30 天 · {view.reliabilityText}</Text>
        <View style={styles.rows}>
          {view.dimensions.map(dimension => <View key={dimension.label} style={styles.row}>
            <Text style={styles.label}>{dimension.label}</Text>
            <View style={styles.values}>
              <Text style={styles.value}>{dimension.trend}</Text>
              {dimension.evidence.map(line => <Text key={line} style={styles.evidence}>{line}</Text>)}
            </View>
          </View>)}
        </View>
        {view.phases.length ? <View style={styles.group}>
          <Text style={styles.label}>阶段</Text>
          {view.phases.map(phase => <Text key={phase} style={styles.evidence}>{phase}</Text>)}
        </View> : null}
        {view.notable.length ? <View style={styles.group}>
          <Text style={styles.label}>值得回看</Text>
          <View style={styles.notable}>
            {view.notable.map(item => <Pressable key={item.targetId} accessibilityRole="button"
              accessibilityLabel={`回看${item.label}：${item.reason}`}
              onPress={() => onSelectTimepoint(item.targetId)} style={styles.chip}>
              <Text style={styles.chipText}>{item.label} · {item.reason}</Text>
            </Pressable>)}
          </View>
        </View> : null}
        {view.unknowns.length ? <View style={styles.group}>
          <Text style={styles.label}>无法判断的部分</Text>
          {view.unknowns.map(item => <Text key={item} style={styles.limit}>· {item}</Text>)}
        </View> : null}
      </>}
    </>}
    <Text style={styles.footnote}>{INSIGHT_BOUNDARY_TEXT}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg, padding: spacing.xl, borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: palette.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: palette.ink, fontSize: 22, fontWeight: '600' },
  body: { color: palette.ink, fontSize: 14, lineHeight: 22, marginTop: spacing.md },
  updating: { color: palette.moss, fontSize: 12, marginTop: spacing.md },
  conclusion: { color: palette.ink, fontSize: 20, fontWeight: '600', lineHeight: 30, marginTop: spacing.md },
  provenance: { color: palette.muted, fontSize: 11, marginTop: spacing.sm },
  rows: { borderTopWidth: 1, borderStyle: 'dotted', borderColor: palette.line, marginTop: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  label: { color: palette.muted, fontSize: 13, width: 72, lineHeight: 20 },
  values: { flex: 1, gap: 2 },
  value: { color: palette.ink, fontSize: 13, lineHeight: 20 },
  evidence: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  group: { marginTop: spacing.md, gap: spacing.xs },
  notable: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.line, justifyContent: 'center' },
  chipText: { color: palette.moss, fontSize: 12 },
  limit: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  footnote: { color: palette.muted, fontSize: 11, lineHeight: 18, marginTop: spacing.lg },
});
