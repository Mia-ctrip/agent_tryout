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
        <Text style={styles.caption}>{'保存使用，\n也保留每一次真实记录。'}</Text>
      </View>
    </View>
  );
}

// One continuous, transparent canvas: cropping happens only at the page edges,
// never at a product-row boundary. It scrolls with the content and cannot take taps.
export function ProductArchiveBackdrop({ showEchoes }: { showEchoes: boolean }) {
  const source = require('../../assets/brand/product-still-life-illustration-v2.png');
  return (
    <View testID="product-archive-backdrop" pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.backdrop}>
      <Image testID="product-backdrop-main" source={source} contentFit="contain" style={styles.mainMotif} />
      {showEchoes ? <>
        <Image testID="product-backdrop-echo" source={source} contentFit="contain" style={styles.leftEcho} />
        <Image testID="product-backdrop-echo" source={source} contentFit="contain" style={styles.rightEcho} />
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 184, justifyContent: 'center', marginVertical: spacing.lg },
  copy: { minWidth: 0, gap: spacing.sm },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: -20, right: -20, overflow: 'hidden' },
  // User-approved lightbox treatment: 22% main, 8% scattered echoes.
  mainMotif: { position: 'absolute', width: 320, height: 320, right: -88, top: 32, opacity: 0.22 },
  leftEcho: { position: 'absolute', width: 360, height: 360, left: -196, top: 320, opacity: overlayOpacity.whisper, transform: [{ rotate: '18deg' }] },
  rightEcho: { position: 'absolute', width: 400, height: 400, right: -224, bottom: -80, opacity: overlayOpacity.whisper, transform: [{ rotate: '-24deg' }] },
  eyebrow: { color: colors.earth, fontSize: 10, lineHeight: 16, letterSpacing: 1.3 },
  title: { color: colors.ink },
  compactTitle: { fontSize: 24, lineHeight: 34 },
  caption: { color: colors.earth, fontSize: 12, lineHeight: 20, marginTop: spacing.sm, maxWidth: 224 },
});
