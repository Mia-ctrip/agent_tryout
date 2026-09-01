import { StyleSheet, Text, View } from 'react-native';

import { FaceRegionMap } from '@/components/face-region-map';
import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import type { Observation } from '@/lib/observation-api';
import { buildObservationResultModel } from '@/lib/observation-flow';

type ObservationResultProps = {
  observation: Observation;
};

export function ObservationResult({ observation }: ObservationResultProps) {
  const model = buildObservationResultModel(observation);
  const evidenceGeometry = model.evidence.map((item) => item.geometry);
  const evidenceRegions = model.evidence.map((item) => item.regionId);
  const photo = observation.photo;
  const sourceSize = {
    width: photo?.width ?? Number(photo?.quality_meta?.metrics.width ?? 3),
    height: photo?.height ?? Number(photo?.quality_meta?.metrics.height ?? 4),
  };
  return (
    <View style={styles.root}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>本次检测区域 · {model.regionLabel}</Text>
        <Text style={styles.saved}>✓ 今日记录已自动保存</Text>
      </View>

      {model.findings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>重点发现</Text>
          <View style={styles.findings}>
            {model.findings.map((finding) => (
              <View key={`${finding.label}-${finding.value}`} style={styles.finding}>
                <View
                  style={[
                    styles.findingLine,
                    finding.tone === 'attention' && styles.findingLineAttention,
                  ]}
                />
                <View style={styles.findingCopy}>
                  <Text style={styles.findingLabel}>
                    {finding.label} · {finding.tone === 'attention' ? '建议关注' : '整体稳定'}
                  </Text>
                  <Text style={styles.findingValue}>{finding.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>详细分析</Text>
          <Text style={styles.sectionNote}>来自照片中可见事实，单张照片无法说明变化原因。</Text>
        </View>
        {model.details.map((detail) => (
          <View key={detail.regionLabel} style={styles.detailGroup}>
            <View style={styles.detailHeading}>
              <View style={styles.detailDot} />
              <Text style={styles.detailRegion}>{detail.regionLabel}</Text>
            </View>
            {detail.sections.map((section) => (
              <View key={section.label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{section.label}</Text>
                <Text style={styles.detailValue}>{section.value}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>本次检测小结</Text>
        <View style={styles.summaryPanel}>
          <Text style={styles.summaryText}>{model.summary}</Text>
        </View>
      </View>

      {photo && evidenceGeometry.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>照片证据</Text>
            <Text style={styles.sectionNote}>轮廓对应本次检测区域，不代表医学诊断位置。</Text>
          </View>
          <FaceRegionMap
            activeRegion={evidenceRegions[0] ?? null}
            disabled
            geometry={evidenceGeometry}
            onToggle={() => undefined}
            photoUri={photo.url}
            selected={evidenceRegions}
            sourceSize={sourceSize}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>趋势对比</Text>
        <View accessibilityState={{ disabled: true }} style={styles.comparison}>
          <View>
            <Text style={styles.comparisonLabel}>{model.comparison.label}</Text>
            <Text style={styles.comparisonNote}>{model.comparison.note}</Text>
          </View>
          <Text style={styles.comparisonArrow}>—</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: observationSpacing.xxl },
  intro: { gap: observationSpacing.sm },
  eyebrow: { color: observationColors.sage, fontSize: 13, fontWeight: '700' },
  saved: { color: observationColors.textMuted, fontSize: 13 },
  section: { gap: observationSpacing.lg },
  sectionHeading: { gap: observationSpacing.xs },
  sectionTitle: { color: observationColors.text, fontSize: 20, fontWeight: '700' },
  sectionNote: { color: observationColors.textMuted, fontSize: 12, lineHeight: 18 },
  findings: { gap: observationSpacing.lg },
  finding: { minHeight: 72, flexDirection: 'row', gap: observationSpacing.md },
  findingLine: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: observationColors.sage,
  },
  findingLineAttention: { backgroundColor: observationColors.amber },
  findingCopy: { flex: 1, gap: observationSpacing.xs, paddingVertical: observationSpacing.xs },
  findingLabel: { color: observationColors.textMuted, fontSize: 12, fontWeight: '700' },
  findingValue: { color: observationColors.text, fontSize: 16, lineHeight: 24 },
  detailGroup: {
    gap: observationSpacing.md,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surface,
    padding: observationSpacing.lg,
  },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: observationSpacing.sm },
  detailDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: observationColors.sage },
  detailRegion: { color: observationColors.forest, fontSize: 16, fontWeight: '700' },
  detailRow: { gap: observationSpacing.xs },
  detailLabel: { color: observationColors.textMuted, fontSize: 12, fontWeight: '600' },
  detailValue: { color: observationColors.text, fontSize: 15, lineHeight: 22 },
  summaryPanel: {
    borderLeftWidth: 3,
    borderLeftColor: observationColors.sage,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.sageSoft,
    padding: observationSpacing.lg,
  },
  summaryText: { color: observationColors.text, fontSize: 16, lineHeight: 25 },
  comparison: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surfaceMuted,
    opacity: 0.7,
    paddingHorizontal: observationSpacing.lg,
  },
  comparisonLabel: { color: observationColors.text, fontSize: 15, fontWeight: '700' },
  comparisonNote: { color: observationColors.textMuted, fontSize: 12, marginTop: 3 },
  comparisonArrow: { color: observationColors.textMuted, fontSize: 18 },
});
