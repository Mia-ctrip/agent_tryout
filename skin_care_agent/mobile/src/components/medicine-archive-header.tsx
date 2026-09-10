import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { colors, overlayOpacity, radii, spacing } from '@/constants/theme';
import { svgDataUri } from '@/lib/face-analysis-visual';

// Original, code-drawn still life. Decorative only; never contains product data.
const lightbox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 250"><defs><radialGradient id="light"><stop stop-color="${colors.paperElevated}"/><stop offset="1" stop-color="${colors.amber}" stop-opacity=".1"/></radialGradient><linearGradient id="glass" x2="1" y2="1"><stop stop-color="${colors.paperElevated}" stop-opacity=".8"/><stop offset="1" stop-color="${colors.sage}" stop-opacity=".2"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="360" height="250" fill="url(#light)"/><g transform="rotate(-13 262 105)" fill="url(#glass)" stroke="${colors.moss}" stroke-width=".6"><rect x="237" y="29" width="65" height="146" rx="15"/><rect x="257" y="13" width="25" height="20" rx="5"/><path d="M239 95h60M240 105h58"/></g><path d="M180 178l101-10 7 74-110 4z" fill="${colors.paperElevated}"/><g filter="url(#soft)" fill="${colors.moss}"><ellipse cx="331" cy="71" rx="17" ry="43" transform="rotate(24 331 71)"/><ellipse cx="344" cy="157" rx="18" ry="42" transform="rotate(-28 344 157)"/></g><path d="M348 12q-32 118-13 216" stroke="${colors.moss}" fill="none"/></svg>`;

export function MedicineArchiveHeader() {
  return (
    <View style={styles.hero}>
      <Image
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        contentFit="fill"
        source={{ uri: svgDataUri(lightbox) }}
        style={styles.atmosphere}
      />
      <Text style={styles.eyebrow}>MY PRODUCTS · 我的记录</Text>
      <EditorialText role="pageTitle" style={styles.title}>我的产品档案</EditorialText>
      <Text style={styles.subtitle}>Kept in time, not judged.</Text>
      <Text style={styles.caption}>保存使用，也保留每一次真实记录。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 224, justifyContent: 'center', gap: spacing.sm, borderRadius: radii.lg, overflow: 'hidden', padding: spacing.lg, marginVertical: spacing.lg },
  atmosphere: { position: 'absolute', inset: 0, opacity: overlayOpacity.soft },
  eyebrow: { color: colors.textMuted, fontSize: 10, lineHeight: 16, letterSpacing: 1.3 },
  title: { color: colors.ink },
  subtitle: { color: colors.mossDeep, fontFamily: 'serif', fontStyle: 'italic', fontSize: 15, lineHeight: 24 },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 20, marginTop: spacing.sm },
});
