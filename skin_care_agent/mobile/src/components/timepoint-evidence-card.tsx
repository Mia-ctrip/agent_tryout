import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { journeyColors as palette } from '@/constants/journey-theme';
import { colors, radii, spacing } from '@/constants/theme';
import { svgDataUri } from '@/lib/face-analysis-visual';
import { formatHistoryDateTime, formatHistoryShortDate, timepointSourceLabel } from '@/lib/history-flow';
import type { ProductUse } from '@/lib/product-api';
import type { RegionEventTimepoint } from '@/lib/region-event-api';

const iconPaths = {
  camera: '<path d="M8 6l1.5-2h5L16 6h3a2 2 0 0 1 2 2v11H3V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="12.5" r="4"/>',
  note: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4m6-4v4M8 10h8m-8 4h8m-8 4h5"/>',
  product: '<path d="M9 2h6v5H9zM9 7l-4 5v10h14V12l-4-5M5 12h14"/>',
  source: '<path d="M6 2h8l4 4v16H6zM14 2v5h4M9 12h6m-6 4h6"/>',
  chart: '<path d="M2 21h20M5 18V11h3v7m3 0V4h3v14m3 0V8h3v10"/>',
  check: '<path d="M5 5l7-2 7 4 1 11-8 3-8-4zM8 11l3 3 6-6"/>',
  heart: '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-2A5 5 0 0 1 22 8c0 7-10 13-10 13z"/>',
  settings: '<path d="M9 3l1-2h4l1 2 3 2 2 1v4l-2 2 1 3-2 3h-3l-2 2-3-1-2-2-3-1-1-4 2-2V6l4-3z"/><circle cx="11.5" cy="10.5" r="3.5"/>',
};

export function EvidenceIcon({ kind }: { kind: keyof typeof iconPaths }) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + palette.moss + '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + iconPaths[kind] + '</svg>';
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.icon, kind !== 'settings' && styles.iconDisc]}>
    <Image source={{ uri: svgDataUri(svg) }} style={styles.iconDrawing} />
  </View>;
}

function EvidenceRow({ kind, label, children }: { kind: keyof typeof iconPaths; label: string; children: ReactNode }) {
  return <View style={styles.row}><EvidenceIcon kind={kind} /><View style={styles.bodyContainer}>
    <Text style={styles.bodyLabel}>{label}</Text>{children}
  </View></View>;
}

export function TimepointEvidenceCard({
  timepoint, regionLabel, onOpenObservation, productUses = [], productStatus, onRetryProducts,
}: {
  timepoint: RegionEventTimepoint;
  regionLabel: string;
  onOpenObservation: () => void;
  productUses?: readonly ProductUse[];
  productStatus?: 'loading' | 'error';
  onRetryProducts?: () => void;
}) {
  const { target } = timepoint;
  const photoCopy = target.facts?.summary.trim() || (
    target.status === 'queued' || target.status === 'processing' ? '正在整理照片。' :
      timepoint.photo ? '照片信息不足，暂无法判断。' : '这次没有照片。');
  return <View accessibilityLiveRegion="polite" style={styles.card} testID="timepoint-evidence-card">
    <EditorialText role="sectionTitle" style={styles.date} accessibilityLabel={regionLabel + '，' + formatHistoryDateTime(timepoint.recorded_at, timepoint.recorded_timezone_offset_minutes)}>
      {formatHistoryShortDate(timepoint.recorded_local_date)}的记录
    </EditorialText>
    <EvidenceRow kind="camera" label="照片中可见">
      <Text style={styles.body}>{photoCopy}</Text>
      {target.facts?.unknowns.map((item, index) => <Text key={index} style={styles.detail}>{item}</Text>)}
    </EvidenceRow>
    <EvidenceRow kind="note" label="你的记录">
      <Text style={styles.body}>{target.user_note?.trim() || '这次没有补充文字。'}</Text>
    </EvidenceRow>
    <EvidenceRow kind="product" label="产品使用记录">
      {productUses.map(use => <View key={use.product_use_id}>
        {use.products.length ? use.products.map(product => <Pressable key={product.product_id} accessibilityRole="button" accessibilityLabel={'查看产品：' + product.name} onPress={() => router.push(`/product/${product.product_id}`)} style={styles.productLink}>
          <Text style={[styles.body, styles.productCopy]}>使用了 <Text style={styles.productName}>{product.name}</Text></Text><Text style={styles.chevron}>›</Text>
        </Pressable>) : <Text style={styles.body}>使用过产品，未注明名称。</Text>}
        {use.note ? <Text style={styles.detail}>{use.note}</Text> : null}
      </View>)}
      {productStatus === 'error' ? <Pressable accessibilityRole="button" onPress={onRetryProducts}><Text style={styles.body}>产品使用暂未加载 · 点按重试</Text></Pressable> :
        productStatus === 'loading' ? <Text style={styles.body}>正在读取产品使用记录。</Text> :
          !productUses.length ? <Text style={styles.body}>当天没有产品使用记录。</Text> : null}
    </EvidenceRow>
    <EvidenceRow kind="source" label="来源">
      <Pressable accessibilityLabel={timepoint.photo ? '查看原图与完整记录' : '查看完整记录'} accessibilityRole="button" onPress={onOpenObservation} style={styles.sourceLink}>
        <Text style={styles.body}>{timepointSourceLabel(target)}</Text>
      </Pressable>
    </EvidenceRow>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: palette.line, borderRadius: radii.md, backgroundColor: palette.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  date: { color: palette.ink, fontSize: 23, fontWeight: '600', lineHeight: 34, paddingBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.line, paddingVertical: spacing.md },
  bodyContainer: { flex: 1, gap: spacing.xs },
  bodyLabel: { color: palette.ink, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  iconDisc: { borderRadius: radii.pill, backgroundColor: palette.disc },
  iconDrawing: { width: 22, height: 22 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 23 },
  detail: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  productLink: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  productCopy: { flex: 1 },
  productName: { color: palette.moss },
  chevron: { color: palette.muted, fontSize: 23 },
  sourceLink: { minHeight: 28, justifyContent: 'center' },
});
