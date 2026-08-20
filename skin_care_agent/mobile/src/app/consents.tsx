import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { ConsentType, REQUIRED_CONSENT_TYPES } from '@/lib/auth-types';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

const consentCopy: Record<ConsentType, { title: string; description: string }> = {
  terms: {
    title: '用户协议',
    description: '明确账号、服务边界与使用规则。',
  },
  privacy: {
    title: '隐私政策',
    description: '说明照片、日记和账号数据如何收集、存储与删除。',
  },
  health_disclaimer: {
    title: '健康免责声明',
    description: '结果只描述外观变化，不构成诊断，也不替代专业医疗建议。',
  },
  ai_processing: {
    title: 'AI 数据处理说明',
    description: '允许系统为生成分析结果处理你主动上传的皮肤照片。',
  },
};

function emptySelections(): Record<ConsentType, boolean> {
  return {
    terms: false,
    privacy: false,
    health_disclaimer: false,
    ai_processing: false,
  };
}

export default function ConsentsScreen() {
  const { consents, acceptRequiredConsents, signOut } = useSession();
  const [selected, setSelected] = useState(emptySelections);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allSelected = REQUIRED_CONSENT_TYPES.every((type) => selected[type]);

  async function submit() {
    if (!allSelected) {
      setError('请逐项阅读并确认四项说明。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptRequiredConsents();
    } catch (submitError) {
      setError(userFacingError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <BrandHeader
        eyebrow="BEFORE WE START"
        title="先确认数据与服务边界"
        description="皮肤照片属于敏感数据。每项确认都按当前版本单独记录，之后可以在账号设置中查看或撤回。"
      />
      <View style={styles.list}>
        {REQUIRED_CONSENT_TYPES.map((type) => {
          const copy = consentCopy[type];
          const status = consents.find((item) => item.consent_type === type);
          return (
            <Pressable
              key={type}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected[type] }}
              onPress={() => setSelected((current) => ({ ...current, [type]: !current[type] }))}
              style={({ pressed }) => [
                styles.card,
                selected[type] && styles.cardSelected,
                pressed && styles.cardPressed,
              ]}>
              <View style={[styles.checkbox, selected[type] && styles.checkboxSelected]}>
                <Text style={styles.checkmark}>{selected[type] ? '✓' : ''}</Text>
              </View>
              <View style={styles.cardCopy}>
                <View style={styles.cardHeading}>
                  <Text style={styles.cardTitle}>{copy.title}</Text>
                  <Text style={styles.version}>v{status?.version ?? '—'}</Text>
                </View>
                <Text style={styles.cardDescription}>{copy.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <AppButton
          label="同意并进入 App"
          loading={busy}
          disabled={!allSelected}
          onPress={() => void submit()}
        />
        <AppButton label="暂不同意，退出账号" variant="text" onPress={() => void signOut()} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  cardPressed: {
    opacity: 0.8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  cardCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  cardHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  version: {
    color: colors.textMuted,
    fontSize: 12,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});
