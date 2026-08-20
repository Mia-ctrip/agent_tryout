import { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, maxContentWidth, spacing } from '@/constants/theme';

type AppScreenProps = PropsWithChildren<{
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function AppScreen({ children, footer, contentStyle }: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
});
