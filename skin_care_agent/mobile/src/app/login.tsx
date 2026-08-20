import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { FormField } from '@/components/form-field';
import { InlineNotice } from '@/components/inline-notice';
import { colors, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

export default function LoginScreen() {
  const { signIn } = useSession();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn({ email, password });
      router.replace('/');
    } catch (submitError) {
      setError(userFacingError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <BrandHeader
        title="继续记录你的变化"
        description="每天一组可对比的照片，让短期波动沉淀为真正可看的趋势。"
      />
      <View style={styles.form}>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <FormField
          label="邮箱"
          placeholder="name@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <FormField
          ref={passwordRef}
          label="密码"
          placeholder="输入密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        <AppButton label="登录" loading={busy} onPress={() => void submit()} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>还没有账号？</Text>
        <AppButton label="创建内测账号" variant="text" onPress={() => router.push('/register')} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  switchRow: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  switchText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
