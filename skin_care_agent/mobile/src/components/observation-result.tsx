import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EditorialText } from '@/components/editorial-text';
import { FaceRegionMap } from '@/components/face-region-map';
import { QuietNotice } from '@/components/quiet-notice';
import { observationColors as c, observationSpacing as s, observationRadii } from '@/constants/observation-theme';
import { colors } from '@/constants/theme';
import type { Observation } from '@/lib/observation-api';
import { buildObservationResultModel } from '@/lib/observation-flow';

export function ObservationResult({ observation }: { observation: Observation }) {
  const { fontScale } = useWindowDimensions();
  const model = buildObservationResultModel(observation);
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
  useEffect(() => { pager.current?.scrollTo({ x: activeIndex * pageWidth, animated: false }); }, [activeIndex, pageWidth]);
  useEffect(() => {
    if (activeId != null) tabs.current?.scrollTo({ x: Math.max(0, (tabOffsets.current[activeId] ?? 0) - s.lg), animated: false });
  }, [activeId]);
  const choose = (index: number) => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    if (!cards[index] || cards[index].targetId === activeId) return;
    setSelectedId(cards[index].targetId);
    setExpandedId(null);
  };
  useEffect(() => () => { if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current); }, []);
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>本次观察结论</Text>
        <Text style={styles.meta}>✓ 已自动保存{cards.length ? ` · ${cards.length} 个区域` : ''}</Text>
      </View>
      {cards.length ? (
        <View style={styles.regionSection}>
          <ScrollView ref={tabs} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {cards.map((card, index) => (
              <Pressable accessibilityRole="tab" aria-selected={index === activeIndex} accessibilityState={{ selected: index === activeIndex }} accessibilityLabel={`查看${card.regionLabel}`} key={card.targetId}
                onLayout={event => { tabOffsets.current[card.targetId] = event.nativeEvent.layout.x; }} onPress={() => choose(index)} style={[styles.tab, index === activeIndex && styles.activeTab]}>
                <Text style={[styles.tabText, index === activeIndex && styles.activeTabText]}>{card.regionLabel}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View onLayout={event => setPageWidth(event.nativeEvent.layout.width)}>
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
