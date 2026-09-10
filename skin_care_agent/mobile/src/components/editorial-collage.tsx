import type { ImageSourcePropType } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { buildEditorialCollageModel } from '@/lib/observe-home-visual';

type EditorialCollageProps = {
  primarySource?: ImageSourcePropType;
  secondarySource?: ImageSourcePropType;
  primaryAlt: string;
  secondaryAlt: string;
  imageDose: 'hero';
  assetsRegistered?: boolean;
};

export function EditorialCollage({
  primarySource,
  secondarySource,
  primaryAlt,
  secondaryAlt,
  imageDose,
  assetsRegistered = false,
}: EditorialCollageProps) {
  const model = buildEditorialCollageModel({
    primaryRegistered: assetsRegistered && Boolean(primarySource),
    secondaryRegistered: assetsRegistered && Boolean(secondarySource),
    imageDose,
  });
  return (
    <View accessibilityLabel={model.accessibilitySummary} style={styles.root}>
      <View style={styles.primaryFrame}>
        {model.licensedAssetsReady && primarySource ? (
          <Image
            accessibilityLabel={primaryAlt}
            resizeMode="cover"
            source={primarySource}
            style={styles.image}
          />
        ) : (
          <View style={[styles.placeholder, styles.primaryPlaceholder]}>
            <View style={styles.horizon} />
            <Text style={styles.placeholderLabel}>PRIVATE SKIN ARCHIVE</Text>
          </View>
        )}
      </View>
      {model.licensedAssetsReady ? (
        <Text style={styles.caption}>NATURAL LIGHT{'\n'}SLOW OBSERVATIONS</Text>
      ) : null}
      <View style={styles.secondaryFrame}>
        {model.licensedAssetsReady && secondarySource ? (
          <Image
            accessibilityLabel={secondaryAlt}
            resizeMode="cover"
            source={secondarySource}
            style={styles.image}
          />
        ) : (
          <View style={[styles.placeholder, styles.secondaryPlaceholder]}>
            <View style={styles.smallMark} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    height: 252,
  },
  primaryFrame: {
    width: '78%',
    height: 236,
    overflow: 'hidden',
    borderTopLeftRadius: 88,
    borderTopRightRadius: radii.md,
    borderBottomRightRadius: 88,
    borderBottomLeftRadius: radii.md,
    backgroundColor: colors.paperElevated,
  },
  secondaryFrame: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 112,
    height: 112,
    overflow: 'hidden',
    borderWidth: 7,
    borderColor: colors.paper,
    borderRadius: radii.pill,
    backgroundColor: colors.paperElevated,
  },
  image: { width: '100%', height: '100%' },
  caption: {
    position: 'absolute', left: spacing.lg, bottom: spacing.xxl,
    color: colors.paperElevated, fontSize: 9, lineHeight: 14, letterSpacing: 1,
  },
  placeholder: { flex: 1, overflow: 'hidden' },
  primaryPlaceholder: { justifyContent: 'flex-end', padding: spacing.lg },
  secondaryPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  horizon: {
    position: 'absolute',
    top: 34,
    right: -28,
    width: 184,
    height: 184,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radii.pill,
  },
  placeholderLabel: {
    color: colors.moss,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.8,
  },
  smallMark: {
    width: 42,
    height: 64,
    borderWidth: 1,
    borderColor: colors.moss,
    borderRadius: 22,
    transform: [{ rotate: '18deg' }],
  },
});
