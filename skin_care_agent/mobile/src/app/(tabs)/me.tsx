import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { colors, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

export default function MeScreen() {
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (logoutError) {
      setError(userFacingError(logoutError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen variant="form">
      <View style={styles.header}>
        <EditorialText role="pageTitle" style={styles.title}>我的</EditorialText>
        <Text style={styles.description}>账号与隐私设置。</Text>
      </View>
      <View style={styles.account}>
        <Text style={styles.accountLabel}>当前账号</Text>
        <Text style={styles.accountName}>{user?.nickname || '未设置昵称'}</Text>
        <Text style={styles.accountEmail}>{user?.email || '未绑定邮箱'}</Text>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      <AppButton
        label="退出当前账号"
        variant="secondary"
        loading={busy}
        onPress={() => void logout()}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xxl },
  title: { color: colors.ink },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  account: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingVertical: spacing.xl,
    marginBottom: spacing.xl,
  },
  accountLabel: { color: colors.textMuted, fontSize: 13 },
  accountName: { color: colors.text, fontSize: 20, fontWeight: '700' },
  accountEmail: { color: colors.textMuted, fontSize: 15, lineHeight: 24, flexShrink: 1 },
});
