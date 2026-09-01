import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { formatHistoryDateTime, timepointSourceLabel } from '@/lib/history-flow';
import type { RegionEventTimepoint } from '@/lib/region-event-api';

type TimepointEvidenceCardProps = {
  timepoint: RegionEventTimepoint;
  regionLabel: string;
  onOpenObservation: () => void;
};

function statusCopy(status: RegionEventTimepoint['target']['status']): string | null {
  if (status === 'queued') return '这次记录正在排队，暂不生成可见事实。';
  if (status === 'processing') return '这次记录正在整理，暂不生成可见事实。';
  if (status === 'needs_input') return '照片信息不足，需要补充文字后才能继续整理。';
  return null;
}

export function TimepointEvidenceCard({
  timepoint,
  regionLabel,
  onOpenObservation,
}: TimepointEvidenceCardProps) {
  const { target } = timepoint;
  const note = target.user_note?.trim();
  const summary = target.facts?.summary.trim();
  const stateCopy = statusCopy(target.status);
  const hasEvidence = Boolean(note || summary);

  return (
    <View accessibilityLiveRegion="polite" style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>当天观察记录</Text>
        <Text style={styles.date}>
          {formatHistoryDateTime(
            timepoint.recorded_at,
            timepoint.recorded_timezone_offset_minutes,
          )}
        </Text>
      </View>

      {note ? (
        <View style={styles.section}>
          <Text style={styles.label}>你的记录</Text>
          <Text style={styles.body}>{note}</Text>
        </View>
      ) : null}

      {summary ? (
        <View style={styles.section}>
          <Text style={styles.label}>照片中可见</Text>
          <Text style={styles.body}>{summary}</Text>
        </View>
      ) : null}

      {stateCopy ? <InlineNotice message={stateCopy} /> : null}
      {!hasEvidence && !stateCopy ? (
        <InlineNotice message="信息不足，暂无法整理更多可见状态。" />
      ) : null}

      {target.facts?.unknowns.length ? (
        <View style={styles.unknowns}>
          <Text style={styles.label}>暂无法判断</Text>
          <Text style={styles.muted}>{target.facts.unknowns.join('；')}</Text>
        </View>
      ) : null}

      <Text style={styles.source}>来源：{timepointSourceLabel(target)}</Text>
      <Text style={styles.boundary}>
        这里只整理{regionLabel}在当天留下的照片与原文，不推断变化、原因或疗效。
      </Text>
      <AppButton
        label={timepoint.photo ? '查看原图与完整记录' : '查看完整记录'}
        onPress={onOpenObservation}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  heading: { gap: spacing.xs },
  eyebrow: { color: colors.actionPrimary, fontSize: 12, fontWeight: '800' },
  date: { color: colors.text, fontSize: 19, fontWeight: '700' },
  section: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 23 },
  unknowns: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: spacing.md },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  source: { color: colors.actionPrimary, fontSize: 13, fontWeight: '700' },
  boundary: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
});
