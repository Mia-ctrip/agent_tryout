import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EditorialText } from '@/components/editorial-text';
import { FaceRegionMap } from '@/components/face-region-map';
import { FullObservationPhoto } from '@/components/full-observation-photo';
import { QuietNotice } from '@/components/quiet-notice';
import { observationColors as c, observationSpacing as s, observationRadii } from '@/constants/observation-theme';
import { colors } from '@/constants/theme';
import type { Observation } from '@/lib/observation-api';
import {
  buildObservationOverviewModel,
  buildObservationResultModel,
  defaultObservationResultView,
} from '@/lib/observation-flow';
import type { ObservationResultView } from '@/lib/observation-flow';

export function ObservationResult({ observation, initialView }: { observation: Observation; initialView?: ObservationResultView }) {
  const { fontScale } = useWindowDimensions();
  const model = buildObservationResultModel(observation);
  const overview = buildObservationOverviewModel(observation);
  const [view, setView] = useState<ObservationResultView>(() => defaultObservationResultView(observation, initialView));
  const cards = model.regionCards;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const pager = useRef<ScrollView>(null);
  const tabs = useRef<ScrollView>(null);
  const tabOffsets = useRef<Record<number, number>>({});
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndex = Math.max(0, cards.findIndex(card => card.targetId === selectedId));
  const active = cards[activeIndex];
  const activeId = active?.targetId;
  const expanded = activeId === expandedId;
  const photo = observation.photo;
  // Preserve the full coordinate frame when only one region is displayed.
  const geometry = photo?.quality_meta?.regions ?? [];
  const sourceSize = {
    width: photo?.width ?? Number(photo?.quality_meta?.metrics.width ?? 3),
    height: photo?.height ?? Number(photo?.quality_meta?.metrics.height ?? 4),
  };
  useEffect(() => {
    if (view !== 'regions') return;
    const frame = requestAnimationFrame(() => pager.current?.scrollTo({ x: activeIndex * pageWidth, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, pageWidth, view]);
  useEffect(() => {
    if (activeId != null) tabs.current?.scrollTo({ x: Math.max(0, (tabOffsets.current[activeId] ?? 0) - s.lg), animated: false });
  }, [activeId, view]);
  const choose = (index: number) => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    if (!cards[index] || cards[index].targetId === activeId) return;
    setSelectedId(cards[index].targetId);
    setExpandedId(null);
  };
  const openRegion = (targetId: number) => {
    const index = cards.findIndex(card => card.targetId === targetId);
    if (index >= 0) choose(index);
    setView('regions');
  };
  useEffect(() => () => { if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current); }, []);
  return (
    <View style={styles.root} onLayout={event => { const width = event.nativeEvent.layout.width; if (width > 0) setPageWidth(width); }}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{view === 'overview' ? '本次观察概览' : '本次观察结论'}</Text>
        <Text style={styles.meta}>✓ 已自动保存 · {overview.items.length} 个目标</Text>
      </View>
      {!overview.isLegacyFullFace ? (
        <View accessibilityLabel="结果视图" accessibilityRole="tablist" style={styles.viewSwitch}>
          {([['overview', '全脸概览'], ['regions', '分区详情']] as const).map(([value, label]) => (
            <Pressable accessibilityLabel={label} accessibilityRole="tab" aria-selected={view === value} accessibilityState={{ selected: view === value }} key={value} onPress={() => setView(value)} style={[styles.viewOption, view === value && styles.viewOptionSelected]}>
              <Text style={[styles.viewOptionText, view === value && styles.viewOptionTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {view === 'overview' ? (
        <View style={styles.overviewSection}>
          {photo ? (
            <>
              <FullObservationPhoto accessibilityLabel="本次观察完整原图" photo={photo} />
              <Text style={styles.photoCaption}>完整原图 · 未裁切 · 未修饰</Text>
            </>
          ) : null}
          <View style={styles.scopeCopy}>
            <EditorialText role="sectionTitle" style={styles.sectionTitle}>{overview.scopeLabel}</EditorialText>
            <Text style={styles.meta}>只汇集当次已选区域的已有事实与真实状态。</Text>
          </View>
          <View style={styles.overviewItems}>
            {overview.items.map((item) => (
              <View key={item.targetId} style={styles.overviewItem}>
                <View style={styles.overviewItemHeading}>
                  <Text style={styles.overviewRegion}>{item.regionLabel}</Text>
                  <Text style={styles.statusLabel}>{item.statusLabel}</Text>
                </View>
                {item.sourceLabel ? <Text style={styles.sourceLabel}>{item.sourceLabel}</Text> : null}
                {item.summary ? <Text style={styles.value}>{item.summary}</Text> : (
                  <Text style={styles.meta}>{item.status === 'queued' ? '已进入队列，稍后会开始整理。' : item.status === 'processing' ? '正在整理照片中的可见事实。' : '原图已保留，可在下方重试或补充文字。'}</Text>
                )}
                {item.userNote ? <View style={styles.noteLine}><Text style={styles.label}>你的记录</Text><Text style={styles.value}>{item.userNote}</Text></View> : null}
                {item.limitations.length ? <Text style={styles.meta}>照片局限：{item.limitations.join('；')}</Text> : null}
                {cards.some(card => card.targetId === item.targetId) ? (
                  <Pressable accessibilityLabel={`查看${item.regionLabel}分区详情`} accessibilityRole="button" onPress={() => openRegion(item.targetId)} style={styles.regionLink}>
                    <Text style={styles.regionLinkText}>查看分区详情 ›</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : cards.length ? (
        <View style={styles.regionSection}>
          <ScrollView ref={tabs} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {cards.map((card, index) => (
              <Pressable accessibilityRole="tab" aria-selected={index === activeIndex} accessibilityState={{ selected: index === activeIndex }} accessibilityLabel={`查看${card.regionLabel}`} key={card.targetId}
                onLayout={event => { tabOffsets.current[card.targetId] = event.nativeEvent.layout.x; }} onPress={() => choose(index)} style={[styles.tab, index === activeIndex && styles.activeTab]}>
                <Text style={[styles.tabText, index === activeIndex && styles.activeTabText]}>{card.regionLabel}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View>
            {pageWidth > 0 ? (
              <ScrollView ref={pager} horizontal pagingEnabled directionalLockEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pages}
                scrollEventThrottle={32}
                onScroll={event => {
                  const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
                  if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
                  scrollEndTimer.current = setTimeout(() => choose(index), 120);
                }}
                onMomentumScrollEnd={event => choose(Math.round(event.nativeEvent.contentOffset.x / pageWidth))}>
                {cards.map((card, index) => (
                  <View key={card.targetId} testID="region-result-page" aria-hidden={index !== activeIndex} accessibilityElementsHidden={index !== activeIndex} importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'} style={[styles.page, { width: pageWidth }]}>
                    <View style={styles.summarySurface}>
                      <Text numberOfLines={3} style={styles.summary}>{card.summary}</Text>
                    </View>
                    <View style={[styles.evidence, fontScale > 1.2 && styles.stacked]}>
                      {photo ? (
                        <View style={[styles.photoColumn, fontScale > 1.2 && styles.stackedColumn]}>
                          <FaceRegionMap activeRegion={card.regionId} disabled contourMode="selection" geometry={geometry}
                            visibleRegions={card.regionId ? [card.regionId] : []} selected={card.regionId ? [card.regionId] : []}
                            onToggle={() => undefined} photoUri={photo.url} sourceSize={sourceSize} aspectRatio={0.86} />
                          <Text style={styles.photoCaption}>原始照片 · 未修饰</Text>
                        </View>
                      ) : null}
                      <View style={[styles.highlights, fontScale > 1.2 && styles.stackedColumn]}>
                        <EditorialText role="sectionTitle" style={styles.sectionTitle}>今天看见的</EditorialText>
                        {card.highlights.length ? card.highlights.map(item => (
                          <View style={styles.highlight} key={item.label}>
                            <Text style={styles.label}>{item.label}</Text>
                            <Text numberOfLines={3} style={styles.value}>{item.value}</Text>
                          </View>
                        )) : <Text style={styles.meta}>照片中的可用细节有限，请查看完整记录。</Text>}
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
          {cards.length > 1 ? (
            <View style={styles.pagerBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="上一个区域" disabled={activeIndex === 0} onPress={() => choose(activeIndex - 1)} style={styles.pageButton}>
                <Text style={[styles.pageButtonText, activeIndex === 0 && styles.disabled]}>‹ 上一区域</Text>
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.meta}>{activeIndex + 1} / {cards.length} · 左右滑动</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="下一个区域" disabled={activeIndex === cards.length - 1} onPress={() => choose(activeIndex + 1)} style={styles.pageButton}>
                <Text style={[styles.pageButtonText, activeIndex === cards.length - 1 && styles.disabled]}>下一区域 ›</Text>
              </Pressable>
            </View>
          ) : null}
          {active?.limitations.length ? (
            <View style={styles.limitations}><Text style={styles.label}>照片局限</Text><Text style={styles.meta}>{active.limitations.join('；')}</Text></View>
          ) : null}
          {active ? (
            <View>
              <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '查看'}${active.regionLabel}完整事实`} aria-expanded={expanded} accessibilityState={{ expanded }} onPress={() => setExpandedId(expanded ? null : active.targetId)} style={styles.disclosure}>
                <Text style={styles.disclosureText}>{expanded ? '收起' : '查看'}{active.regionLabel}完整事实</Text><Text style={styles.disclosureText}>{expanded ? '−' : '＋'}</Text>
              </Pressable>
              {expanded ? (
                <View style={styles.details}>
                  <View style={styles.detailRow}><Text style={styles.label}>完整小结</Text><Text style={styles.value}>{active.summary}</Text></View>
                  {active.sections.map(section => <View style={styles.detailRow} key={section.label}><Text style={styles.label}>{section.label}</Text><Text style={styles.value}>{section.value}</Text></View>)}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : <Text style={styles.value}>{model.summary}</Text>}
      {model.userNotes.length ? (
        <View style={styles.userSection}>
          <EditorialText role="sectionTitle" style={styles.sectionTitle}>你的记录</EditorialText>
          {model.userNotes.map(item => <View key={item.regionLabel} style={styles.detailRow}><Text style={styles.label}>{item.regionLabel}</Text><Text style={styles.value}>{item.note}</Text></View>)}
        </View>
      ) : null}
      <QuietNotice tone="medical" title="观察边界">这是影像观察，不是医学诊断；时间上的相邻也不代表产品造成了变化。</QuietNotice>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: s.lg },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: s.sm },
  eyebrow: { color: colors.earth, fontSize: 14, fontWeight: '700' },
  meta: { color: c.textMuted, fontSize: 12, lineHeight: 19 },
  viewSwitch: { flexDirection: 'row', alignSelf: 'stretch', borderBottomWidth: 1, borderBottomColor: c.border },
  viewOption: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s.sm },
  viewOptionSelected: { borderBottomWidth: 2, borderBottomColor: c.sage },
  viewOptionText: { color: c.textMuted, fontSize: 14 },
  viewOptionTextSelected: { color: c.text, fontWeight: '700' },
  overviewSection: { gap: s.lg },
  scopeCopy: { gap: s.xs },
  overviewItems: { gap: s.md },
  overviewItem: { gap: s.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: s.md },
  overviewItemHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: s.sm },
  overviewRegion: { flexShrink: 1, color: colors.earth, fontSize: 16, fontWeight: '700' },
  statusLabel: { color: c.forest, fontSize: 12, fontWeight: '700' },
  sourceLabel: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  noteLine: { gap: s.xs, backgroundColor: c.surfaceMuted, padding: s.md },
  regionLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  regionLinkText: { color: c.forest, fontSize: 13, fontWeight: '600' },
  regionSection: { gap: s.sm },
  tabs: { gap: s.sm, paddingBottom: s.sm },
  tab: { minHeight: 44, paddingHorizontal: s.lg, justifyContent: 'center', borderRadius: observationRadii.sm, borderWidth: 1, borderColor: c.border, backgroundColor: colors.paper },
  activeTab: { backgroundColor: c.sageSoft, borderColor: c.sage },
  tabText: { color: c.textMuted, fontSize: 14 },
  activeTabText: { color: c.text, fontWeight: '700' },
  pages: { alignItems: 'flex-start' },
  page: { gap: s.lg, paddingBottom: s.sm },
  summarySurface: { backgroundColor: colors.ground, padding: s.md },
  summary: { color: colors.earth, fontSize: 16, lineHeight: 25, minHeight: 50 },
  evidence: { flexDirection: 'row', gap: s.lg, alignItems: 'flex-start' },
  stacked: { flexDirection: 'column' },
  photoColumn: { flex: 1, minWidth: 0, gap: s.sm },
  stackedColumn: { flex: 0, width: '100%' },
  photoCaption: { color: c.textMuted, fontSize: 11, lineHeight: 17 },
  highlights: { flex: 1, minWidth: 0, gap: s.md },
  sectionTitle: { color: colors.ink, fontSize: 18, lineHeight: 25 },
  highlight: { gap: s.xs, paddingTop: s.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  label: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  value: { color: colors.earth, fontSize: 14, lineHeight: 22 },
  pagerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  pageButton: { minHeight: 44, justifyContent: 'center' },
  pageButtonText: { color: c.forest, fontSize: 12 },
  disabled: { opacity: .35 },
  limitations: { gap: s.xs, paddingVertical: s.sm },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  disclosureText: { color: c.forest, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  details: { gap: s.md, paddingVertical: s.md },
  detailRow: { gap: s.xs },
  userSection: { gap: s.md, paddingVertical: s.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
});
