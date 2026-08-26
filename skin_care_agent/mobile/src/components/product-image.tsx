import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/constants/theme';

export function ProductImage({
  uri,
  category,
  accessibilityLabel,
}: {
  uri: string | null;
  category: string | null;
  accessibilityLabel: string;
}) {
  if (!uri) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={styles.placeholder}>
        <Text style={styles.placeholderText}>{category || '产品'}</Text>
      </View>
    );
  }
  return <Image accessibilityLabel={accessibilityLabel} source={{ uri }} style={styles.image} />;
}

const styles = StyleSheet.create({
  image: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
  placeholder: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
    padding: 6,
  },
  placeholderText: { color: colors.irisStrong, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
