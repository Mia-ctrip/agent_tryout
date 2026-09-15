import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { colors, radii, spacing } from '@/constants/theme';
import { formatHistoryDateTime, formatHistoryShortDate, timepointSourceLabel } from '@/lib/history-flow';
import type { RegionEventTimepoint } from '@/lib/region-event-api';

type TimepointEvidenceCardProps = {
  timepoint: RegionEventTimepoint;
  regionLabel: string;
  onOpenObservation: () => void;
};

const iconPaths = {
  camera: '<path d="M8 6l1.5-2h5L16 6h3a2 2 0 0 1 2 2v11H3V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="12.5" r="4"/><path d="M17.5 9h.5"/>',
  note: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2v4m6-4v4M8 10h8m-8 4h8m-8 4h5"/>',
  source: '<path d="M6 2h8l4 4v16H6zM14 2v5h4M9 12h6m-6 4h6"/>',
};

function EvidenceIcon({ kind }: { kind: keyof typeof iconPaths }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.icon, kind !== 'source' && styles.iconDisc]}>
      <Image source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colors.moss}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${iconPaths[kind]}</svg>`)}` }} style={styles.iconDrawing} />
    </View>
  );
}

export function TimepointEvidenceCard({
  timepoint,
  regionLabel,
  onOpenObservation,
}: TimepointEvidenceCardProps) {
  const { target } = timepoint;
  const note = target.user_note?.trim();
  const summary = target.facts?.summary.trim();
  const photoCopy = summary || (target.status === 'queued' || target.status === 'processing'
    ? '正在整理照片。'
    : timepoint.photo ? '照片信息不足，暂无法判断。' : '这次没有照片。');

  return (
    <View accessibilityLiveRegion="polite" style={styles.card} testID="timepoint-evidence-card">
      <View style={styles.heading}>
        <EditorialText role="sectionTitle" style={styles.date}>
          {formatHistoryShortDate(timepoint.recorded_local_date)}的记录
        </EditorialText>
        <Text style={styles.time} accessibilityLabel={`${regionLabel}，${formatHistoryDateTime(timepoint.recorded_at, timepoint.recorded_timezone_offset_minutes)}`}>
          {formatHistoryDateTime(timepoint.recorded_at, timepoint.recorded_timezone_offset_minutes)}
        </Text>
      </View>

      <View style={styles.rows}>
        <View style={styles.row}>
          <EvidenceIcon kind="camera" />
          <View style={styles.bodyContainer}>
            <Text style={styles.bodyLabel}>照片中可见</Text>
            <Text style={styles.body} numberOfLines={3}>{photoCopy}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <EvidenceIcon kind="note" />
          <View style={styles.bodyContainer}>
            <Text style={styles.bodyLabel}>你的记录</Text>
            <Text style={styles.body} numberOfLines={3}>{note || '这次没有补充文字。'}</Text>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityLabel={timepoint.photo ? '查看原图与完整记录' : '查看完整记录'}
        accessibilityRole="button"
        onPress={onOpenObservation}
        style={({ pressed }) => [styles.footer, pressed && styles.pressed]}>
        <EvidenceIcon kind="source" />
        <Text style={styles.source}>来源：{timepointSourceLabel(target)}</Text>
        <Text style={styles.link}>查看详情 ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  heading: { gap: spacing.xs },
  date: { color: colors.ink, fontSize: 23, lineHeight: 32 },
  time: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bodyContainer: { flex: 1, gap: spacing.xs },
  bodyLabel: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  iconDisc: { borderRadius: radii.pill, backgroundColor: colors.brandOverlay },
  iconDrawing: { width: 20, height: 20 },
  body: { color: colors.earth, fontSize: 15, lineHeight: 25 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: spacing.md },
  source: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 19 },
  link: { color: colors.actionPrimary, fontSize: 12, lineHeight: 19 },
  pressed: { opacity: 0.72 },
});
