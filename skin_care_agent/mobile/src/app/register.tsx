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

export default function RegisterScreen() {
  const { register } = useSession();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.includes('@')) {
      setError('请输入有效邮箱。');
      return;
    }
    if (password.length < 10) {
      setError('密码至少需要 10 个字符。');
      return;
    }
    if (password !== confirmation) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ email, password, nickname });
      router.replace('/');
    } catch (submitError) {
      setError(userFacingError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <BrandHeader
        eyebrow="PRIVATE BETA"
        title="建立你的私密皮肤档案"
        description="账号只用于隔离并同步你自己的照片、记录与趋势。"
      />
      <View style={styles.form}>
        <InlineNotice message="当前为小范围内测账号；邮箱验证与找回密码将在公开测试前接入。" />
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <FormField
          label="昵称（可选）"
          placeholder="怎么称呼你"
          value={nickname}
          onChangeText={setNickname}
          autoComplete="name"
          returnKeyType="next"
        />
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
          hint="至少 10 个字符；不要复用其他网站的密码。"
          placeholder="设置密码"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <FormField
          ref={confirmRef}
          label="确认密码"
          placeholder="再次输入密码"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        <AppButton label="创建账号并继续" loading={busy} onPress={() => void submit()} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchText}>已经有账号？</Text>
        <AppButton label="返回登录" variant="text" onPress={() => router.back()} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
