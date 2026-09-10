import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { FaceRegionMap } from '@/components/face-region-map';
import { QuietNotice } from '@/components/quiet-notice';
import {
  observationColors,
  observationSpacing,
} from '@/constants/observation-theme';
import type { Observation } from '@/lib/observation-api';
import { buildObservationResultModel } from '@/lib/observation-flow';

type ObservationResultProps = {
  observation: Observation;
};

export function ObservationResult({ observation }: ObservationResultProps) {
  const { width, fontScale } = useWindowDimensions();
  const stackEvidence = width < 360 || fontScale > 1.2;
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
      <View style={styles.conclusion}>
        <Text style={styles.eyebrow}>本次观察结论 · {model.regionLabel}</Text>
        <EditorialText role="display" style={styles.summary}>{model.summary}</EditorialText>
        <Text style={styles.saved}>✓ 今日记录已自动保存</Text>
      </View>

      {photo ? (
        <View style={[styles.evidenceSection, stackEvidence && styles.evidenceStacked]}>
          <View style={[styles.photoColumn, stackEvidence && styles.stackedColumn]}>
          <View style={styles.evidenceFrame}>
            <FaceRegionMap
              activeRegion={evidenceRegions[0] ?? null}
              disabled
              geometry={evidenceGeometry}
              onToggle={() => undefined}
              photoUri={photo.url}
              selected={evidenceRegions}
              sourceSize={sourceSize}
            />
            <View style={styles.rawBadge}>
              <Text style={styles.rawBadgeText}>原始照片 · 未修饰</Text>
            </View>
          </View>
          <Text style={styles.evidenceNote}>轮廓只标出本次实际检测区域。</Text>
          </View>
          {model.findings.length > 0 ? (
            <View style={[styles.findings, stackEvidence && styles.stackedColumn]}>
              <EditorialText role="sectionTitle" style={styles.sectionTitle}>今天看见的</EditorialText>
              {model.findings.slice(0, 2).map((finding) => (
                <View key={`${finding.label}-${finding.value}`} style={styles.finding}>
                  <View
                    style={[
                      styles.findingDot,
                      finding.tone === 'attention' && styles.findingDotAttention,
                    ]}
                  />
                  <View style={styles.findingCopy}>
                    <Text style={styles.findingLabel}>{finding.label}</Text>
                    <Text style={styles.findingValue}>{finding.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {model.userNotes.length > 0 ? (
        <View style={styles.userSection}>
          <View style={styles.sectionHeading}>
            <EditorialText role="sectionTitle" style={styles.sectionTitle}>你的记录</EditorialText>
            <Text style={styles.privateLabel}>仅自己可见</Text>
          </View>
          {model.userNotes.map((item) => (
            <View key={`${item.regionLabel}-${item.note}`} style={styles.userNote}>
              <Text style={styles.userRegion}>{item.regionLabel}</Text>
              <Text style={styles.userWords}>“{item.note}”</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.nextSection}>
        <Text style={styles.eyebrow}>接下来</Text>
        <EditorialText role="sectionTitle" style={styles.nextTitle}>{model.nextStep.title}</EditorialText>
        <Text style={styles.nextBody}>{model.nextStep.body}</Text>
      </View>

      <QuietNotice tone="medical" title="观察边界">
        这是影像观察，不是医学诊断；时间上的相邻也不代表产品造成了变化。
      </QuietNotice>
      {model.details.map((detail) => (
        <View key={detail.regionLabel} style={styles.detailSection}>
          <EditorialText role="sectionTitle" style={styles.sectionTitle}>{detail.regionLabel} · 详细事实</EditorialText>
          {detail.sections.map((section) => (
            <View key={section.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{section.label}</Text>
              <Text style={styles.detailValue}>{section.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: observationSpacing.lg },
  conclusion: {
    gap: observationSpacing.sm,
    paddingBottom: observationSpacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: observationColors.border,
  },
  eyebrow: {
    color: observationColors.forest,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  summary: { color: observationColors.text, fontSize: 26, lineHeight: 35 },
  saved: { color: observationColors.textMuted, fontSize: 13 },
  evidenceSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: observationSpacing.lg,
    paddingBottom: observationSpacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: observationColors.border,
  },
  evidenceStacked: { flexDirection: 'column', alignItems: 'stretch' },
  photoColumn: { flex: 1, minWidth: 0, gap: observationSpacing.sm },
  stackedColumn: { flex: 0, flexBasis: 'auto', width: '100%' },
  evidenceFrame: { position: 'relative' },
  rawBadge: {
    position: 'absolute',
    left: observationSpacing.md,
    bottom: observationSpacing.md,
    borderRadius: 999,
    backgroundColor: observationColors.statusShade,
    paddingVertical: 6,
    paddingHorizontal: observationSpacing.md,
  },
  rawBadgeText: { color: observationColors.scrimText, fontSize: 10, fontWeight: '500' },
  evidenceNote: { color: observationColors.textMuted, fontSize: 11, lineHeight: 17 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: observationSpacing.md,
  },
  sectionTitle: { color: observationColors.text, fontSize: 20, lineHeight: 27 },
  findings: { flex: 1, minWidth: 0, gap: observationSpacing.sm },
  finding: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: observationSpacing.md,
    paddingVertical: observationSpacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: observationColors.border,
  },
  findingDot: {
    width: 8,
    height: 8,
    marginTop: 7,
    borderRadius: 4,
    backgroundColor: observationColors.sage,
  },
  findingDotAttention: { backgroundColor: observationColors.amber },
  findingCopy: { flex: 1, gap: observationSpacing.xs },
  findingLabel: { color: observationColors.text, fontSize: 14, fontWeight: '700' },
  findingValue: { color: observationColors.textMuted, fontSize: 13, lineHeight: 20 },
  detailSection: { gap: observationSpacing.md, paddingTop: observationSpacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: observationColors.border },
  detailRow: { gap: observationSpacing.xs },
  detailLabel: { color: observationColors.textMuted, fontSize: 12 },
  detailValue: { color: observationColors.text, fontSize: 14, lineHeight: 22 },
  userSection: {
    gap: observationSpacing.md,
    paddingBottom: observationSpacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: observationColors.border,
  },
  privateLabel: { color: observationColors.textMuted, fontSize: 12 },
  userNote: {
    gap: observationSpacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: observationColors.sage,
    paddingLeft: observationSpacing.md,
  },
  userRegion: { color: observationColors.textMuted, fontSize: 12, fontWeight: '600' },
  userWords: { color: observationColors.text, fontSize: 15, lineHeight: 24 },
  nextSection: { gap: observationSpacing.sm },
  nextTitle: { color: observationColors.text, fontSize: 19, lineHeight: 26 },
  nextBody: { color: observationColors.textMuted, fontSize: 14, lineHeight: 22 },
});
