import { PropsWithChildren, ReactNode, RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SafeAreaViewProps } from 'react-native-safe-area-context';

import { colors, maxContentWidth, spacing } from '@/constants/theme';
import { appScreenPresentation } from '@/lib/app-shell';
import type { AppScreenVariant } from '@/lib/app-shell';

type AppScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  safeAreaEdges?: SafeAreaViewProps['edges'];
  backgroundColor?: string;
  variant?: AppScreenVariant;
  scrollViewRef?: RefObject<ScrollView | null>;
  onScroll?: ScrollViewProps['onScroll'];
}>;

export function AppScreen({
  children,
  footer,
  contentStyle,
  safeAreaEdges,
  backgroundColor,
  variant = 'paper',
  scrollViewRef,
  onScroll,
}: AppScreenProps) {
  const presentation = appScreenPresentation(variant);
  const resolvedBackground = backgroundColor ?? presentation.background;
  const { gap, rowGap, columnGap } = StyleSheet.flatten(contentStyle) ?? {};
  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.safeArea, { backgroundColor: resolvedBackground }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: presentation.horizontalPadding,
              paddingVertical: presentation.verticalPadding,
            },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}>
          <View style={[styles.content, { gap, rowGap, columnGap }, presentation.edgeToEdge && styles.edgeToEdgeContent]}>
            {children}
          </View>
        </ScrollView>
        {footer ? <View style={[styles.footer, { backgroundColor: resolvedBackground }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: maxContentWidth,
  },
  edgeToEdgeContent: { maxWidth: '100%' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
});
