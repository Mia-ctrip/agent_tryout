import { PropsWithChildren, useCallback, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { productColors } from '@/constants/product-theme';
import { ARCHIVE_REVEAL_WIDTH, archiveRevealTarget } from '@/lib/product-ui';

export function SwipeableProductRow({
  children,
  onArchive,
}: PropsWithChildren<{ onArchive: () => void }>) {
  const [offset] = useState(() => new Animated.Value(0));
  const [restingOffset, setRestingOffset] = useState<0 | -88>(0);

  const settle = useCallback((next: 0 | -88) => {
    setRestingOffset(next);
    Animated.spring(offset, {
      toValue: next,
      useNativeDriver: true,
      damping: 22,
      stiffness: 260,
      mass: 0.8,
    }).start();
  }, [offset]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => (
        Math.abs(gesture.dx) > 7
        && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
      ),
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(-ARCHIVE_REVEAL_WIDTH, Math.min(0, restingOffset + gesture.dx));
        offset.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => settle(archiveRevealTarget(restingOffset + gesture.dx)),
      onPanResponderTerminate: () => settle(restingOffset),
    }),
    [offset, restingOffset, settle],
  );

  return (
    <View style={styles.clip}>
      <Pressable
        accessibilityLabel="归档产品"
        accessibilityRole="button"
        onPress={() => {
          onArchive();
          settle(0);
        }}
        style={styles.archiveAction}>
        <View accessibilityElementsHidden style={styles.archiveIcon}>
          <View style={styles.archiveLid} />
          <View style={styles.archiveBox} />
        </View>
        <Text style={styles.archiveLabel}>归档</Text>
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.foreground, { transform: [{ translateX: offset }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'relative', overflow: 'hidden', borderRadius: 20 },
  foreground: { zIndex: 1, backgroundColor: productColors.background },
  archiveAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: ARCHIVE_REVEAL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: productColors.actionPrimary,
  },
  archiveIcon: { width: 22, height: 20, alignItems: 'center' },
  archiveLid: { width: 22, height: 5, borderWidth: 2, borderColor: productColors.surface, borderRadius: 2 },
  archiveBox: { width: 18, height: 13, borderWidth: 2, borderTopWidth: 0, borderColor: productColors.surface, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  archiveLabel: { color: productColors.surface, fontSize: 13, fontWeight: '700' },
});
