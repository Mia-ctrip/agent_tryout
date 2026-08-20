import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

const nextCapabilities = [
  {
    step: '03',
    title: '区域生命周期',
    description: '追踪同一区域从仍可见、暂未见到连续未见。',
  },
];

export default function HomeScreen() {
  const { user, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = user?.nickname || user?.email?.split('@')[0] || '你好';

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
    <AppScreen>
      <BrandHeader
        eyebrow="FOUNDATION READY"
        title={displayName + '，账号闭环已连通'}
        description="安全登录、Token 轮换、协议版本和用户数据隔离已经接入真实后端。"
      />
      <InlineNotice message="下一阶段将从“今日 Check-in”开始，把拍照、分析、日记与趋势接成首条完整用户路径。" />
      <View style={styles.checkIn}>
        <Text style={styles.step}>01</Text>
        <Text style={styles.checkInTitle}>今日 Check-in</Text>
        <Text style={styles.checkInDescription}>
          依次拍摄正面、左侧和右侧照片，记录今天的皮肤状态。
        </Text>
        <AppButton label="开始今日 Check-in" onPress={() => router.push('/check-in')} />
        {__DEV__ ? (
          <AppButton
            label="预览分析结果（开发）"
            variant="secondary"
            onPress={() => router.push('/analysis/9001?demo=ready')}
          />
        ) : null}
      </View>
      <View style={styles.trends}>
        <Text style={styles.step}>02</Text>
        <Text style={styles.checkInTitle}>变化趋势</Text>
        <Text style={styles.checkInDescription}>
          查看近 7、30 或 90 天的皮肤指数、外观数量变化和重点区域概览。
        </Text>
        <AppButton label="查看变化趋势" onPress={() => router.push('/trends')} />
        {__DEV__ ? (
          <AppButton
            label="预览完整趋势（开发）"
            variant="secondary"
            onPress={() => router.push('/trends?demo=ready')}
          />
        ) : null}
      </View>
      <View style={styles.list}>
        {nextCapabilities.map((item) => (
          <View key={item.step} style={styles.card}>
            <Text style={styles.step}>{item.step}</Text>
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </View>
            <Text style={styles.state}>待接入</Text>
          </View>
        ))}
      </View>
      <View style={styles.account}>
        <Text style={styles.accountLabel}>当前账号</Text>
        <Text style={styles.accountValue}>{user?.email}</Text>
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
  list: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  checkIn: {
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  checkInTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  checkInDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  trends: {
    gap: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  step: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  cardCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  state: {
    color: colors.textMuted,
    fontSize: 12,
  },
  account: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  accountLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  accountValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
