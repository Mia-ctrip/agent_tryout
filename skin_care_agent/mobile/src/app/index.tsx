import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/providers/session-provider';

export default function IndexScreen() {
  const { phase, hasRequiredConsents } = useSession();
  if (phase === 'anonymous') {
    return <Redirect href="/login" />;
  }
  if (phase === 'authenticated' && !hasRequiredConsents) {
    return <Redirect href="/consents" />;
  }
  if (phase === 'authenticated') {
    return <Redirect href="/home" />;
  }
  return (
    <View style={styles.container}>
      <View style={styles.mark} />
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>正在恢复安全会话…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  text: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
