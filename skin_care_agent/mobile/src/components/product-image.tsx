import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

export function ProductImage({
  uri,
  category,
  accessibilityLabel,
  size = 72,
  radius = radii.md,
}: {
  uri: string | null;
  category: string | null;
  accessibilityLabel: string;
  size?: number;
  radius?: number;
}) {
  const frame = { width: size, height: size, borderRadius: radius };
  if (!uri) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={[styles.placeholder, frame]}>
        <Text style={styles.placeholderText}>{category || '产品'}</Text>
      </View>
    );
  }
  return <Image accessibilityLabel={accessibilityLabel} resizeMode="contain" source={{ uri }} style={[styles.image, frame]} />;
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceMuted },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
    padding: 6,
  },
  placeholderText: { color: colors.irisStrong, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
