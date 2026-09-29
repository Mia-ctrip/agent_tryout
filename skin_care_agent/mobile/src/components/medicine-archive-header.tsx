import { Image } from 'expo-image';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { colors, overlayOpacity, spacing } from '@/constants/theme';

export function MedicineArchiveHeader() {
  const compact = useWindowDimensions().width < 375;
  return (
    <View style={styles.hero}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>MY PRODUCTS · 我的记录</Text>
        <EditorialText role="pageTitle" style={[styles.title, compact && styles.compactTitle]}>我的产品档案</EditorialText>
        <EditorialText role="sectionTitle" style={styles.caption}>{'保存使用，\n也保留每一次真实记录。'}</EditorialText>
      </View>
    </View>
  );
}

// The supplied photograph stays behind the entire screen, including its safe area.
export function ProductArchiveBackdrop() {
  const source = require('../../assets/brand/product-archive-background.png');
  return (
    <View testID="product-archive-backdrop" pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.backdrop}>
      <Image testID="product-backdrop-main" source={source} contentFit="cover" contentPosition="center" style={styles.photograph} />
      <View testID="product-backdrop-veil" style={styles.veil} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: spacing.xxxl, marginBottom: spacing.xxl },
  copy: { minWidth: 0, gap: spacing.sm },
  backdrop: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  photograph: { ...StyleSheet.absoluteFill, top: -spacing.hero * 2 },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: colors.ground, opacity: overlayOpacity.medium },
  eyebrow: { color: colors.moss, fontSize: 10, lineHeight: 16, letterSpacing: 1.8 },
  title: { color: colors.earth, fontSize: 36, lineHeight: 48 },
  compactTitle: { fontSize: 30, lineHeight: 40 },
  caption: { color: colors.earth, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
});
