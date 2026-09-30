import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { FormField } from '@/components/form-field';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import type { ConsentType } from '@/lib/auth-types';
import { REQUIRED_CONSENT_TYPES } from '@/lib/auth-types';
import { consentCopy } from '@/lib/consent-copy';
import { saveDataExportFile } from '@/lib/data-export-file';
import { userFacingError } from '@/lib/errors';
import { fetchDataExport, summarizeDataExport } from '@/lib/export-api.ts';
import { formatHistoryDateTime } from '@/lib/history-flow';
import { useSession } from '@/providers/session-provider';

export default function MeScreen() {
  const { user, consents, signOut, refreshConsents, updateConsent, deleteAccount, request } =
    useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [consentBusyType, setConsentBusyType] = useState<ConsentType | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [showConsents, setShowConsents] = useState(false);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<ConsentType | null>(null);
  const [showExport, setShowExport] = useState(false);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void refreshConsents()
      .catch((loadError) => { if (active) setConsentError(userFacingError(loadError)); })
      .finally(() => { if (active) setConsentLoading(false); });
    return () => { active = false; };
  }, [refreshConsents]);

  const actionBusy = busy || exportBusy || deleteBusy || consentBusyType !== null;
  const acceptedCount = REQUIRED_CONSENT_TYPES.filter((type) =>
    consents.some((item) => item.consent_type === type && item.accepted),
  ).length;
  const consentSummary = consentLoading ? '正在读取授权状态' : consentError ? '授权状态暂不可用'
    : acceptedCount === REQUIRED_CONSENT_TYPES.length ? '已完成全部授权'
      : `${acceptedCount} / ${REQUIRED_CONSENT_TYPES.length} 项已同意`;

  async function reloadConsents() {
    setConsentLoading(true);
    setConsentError(null);
    try {
      await refreshConsents();
    } catch (loadError) {
      setConsentError(userFacingError(loadError));
    } finally {
      setConsentLoading(false);
    }
  }

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

  async function toggleConsent(consentType: ConsentType, currentlyAccepted: boolean) {
    setConsentBusyType(consentType);
    setConsentError(null);
    try {
      await updateConsent(consentType, !currentlyAccepted);
      setPendingWithdrawal(null);
    } catch (toggleError) {
      setConsentError(userFacingError(toggleError));
    } finally {
      setConsentBusyType(null);
    }
  }

  async function exportData() {
    setExportBusy(true);
    setExportError(null);
    setExportResult(null);
    try {
      const payload = await fetchDataExport(request);
      const savedTo = await saveDataExportFile(payload);
      setExportResult(`已导出 ${summarizeDataExport(payload)}。保存位置：${savedTo}`);
    } catch (exportErr) {
      setExportError(userFacingError(exportErr));
    } finally {
      setExportBusy(false);
    }
  }

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteError(null);
    setDeletePassword('');
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteError(null);
    setDeletePassword('');
  }

  async function confirmDelete() {
    if (!deletePassword) {
      setDeleteError('请输入密码以确认注销。');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (deleteErr) {
      setDeleteError(userFacingError(deleteErr));
      setDeleteBusy(false);
    }
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.header}>
        <EditorialText role="pageTitle" accessibilityRole="header" style={styles.title}>我的</EditorialText>
        <EditorialText role="body" style={styles.hint}>管理账号与个人数据</EditorialText>
      </View>
      <View style={styles.account}>
        <View style={styles.monogram} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <EditorialText role="sectionTitle" style={styles.monogramText}>
            {Array.from(user?.nickname?.trim() || user?.email || '我')[0].toLocaleUpperCase()}
          </EditorialText>
        </View>
        <View style={styles.accountCopy}>
          <EditorialText role="sectionTitle" style={styles.title}>{user?.nickname || '我的账号'}</EditorialText>
          <EditorialText role="caption" selectable style={styles.hint}>{user?.email || '未绑定邮箱'}</EditorialText>
        </View>
      </View>

      <EditorialText role="caption" accessibilityRole="header" style={styles.groupLabel}>隐私与数据</EditorialText>
      <View style={styles.settings}>
        <SettingsRow title="协议与授权" description={consentSummary} expanded={showConsents}
          disabled={actionBusy} onPress={() => { setShowConsents(!showConsents); setPendingWithdrawal(null); }} />
        {showConsents ? <View style={styles.details}>
          <EditorialText role="caption" style={styles.hint}>
            撤回任意一项会暂停记录功能，需要重新确认后才能继续使用。
          </EditorialText>
          {REQUIRED_CONSENT_TYPES.map((type) => {
            const copy = consentCopy[type];
            const status = consents.find((item) => item.consent_type === type);
            const accepted = status?.accepted ?? false;
            return (
              <View key={type} style={styles.consentRow}>
                <View style={styles.consentHeading}>
                  <EditorialText role="body" style={styles.consentTitle}>{copy.title}</EditorialText>
                  <EditorialText role="caption" style={styles.status}>
                    {!status ? '待获取' : accepted ? '已同意' : '未同意'}
                  </EditorialText>
                </View>
                <EditorialText role="caption" style={styles.hint}>{copy.description}</EditorialText>
                {status ? <EditorialText role="caption" style={styles.hint}>
                  版本 {status.version}{accepted && status.accepted_at ? ` · ${formatHistoryDateTime(status.accepted_at)}` : ''}
                </EditorialText> : null}
                {pendingWithdrawal === type ? <View style={styles.confirmation}>
                  <EditorialText role="caption" style={styles.hint}>撤回后将返回协议确认页，重新同意后才能继续记录。</EditorialText>
                  <AppButton label="确认撤回" variant="danger" loading={consentBusyType === type}
                    disabled={actionBusy} onPress={() => void toggleConsent(type, true)} />
                  <AppButton label="保留授权" variant="text" disabled={actionBusy} onPress={() => setPendingWithdrawal(null)} />
                </View> :
                <AppButton
                  label={accepted ? '撤回授权' : '同意此项'}
                  variant="text"
                  loading={consentBusyType === type}
                  disabled={!status || actionBusy || consentLoading || !!consentError}
                  onPress={() => accepted ? setPendingWithdrawal(type) : void toggleConsent(type, false)}
                  style={styles.consentAction}
                />}
              </View>
            );
          })}
          {consentError ? <>
            <InlineNotice tone="error" message={consentError} />
            <AppButton label="重新获取授权状态" variant="text" loading={consentLoading} disabled={actionBusy} onPress={() => void reloadConsents()} />
          </> : null}
        </View> : null}
        <View style={styles.divider} />
        <SettingsRow title="数据导出" description="保存一份自己的记录" expanded={showExport}
          disabled={actionBusy} onPress={() => setShowExport(!showExport)} />
        {showExport ? <View style={styles.details}>
        <EditorialText role="caption" style={styles.hint}>
          导出观察、区域事件、个人产品与产品使用记录的结构化数据；不包含原始照片文件。
        </EditorialText>
        <AppButton
          label="导出我的数据"
          variant="secondary"
          loading={exportBusy}
          disabled={actionBusy}
          onPress={() => void exportData()}
        />
        {exportResult ? <InlineNotice tone="info" message={exportResult} /> : null}
        {exportError ? <InlineNotice tone="error" message={exportError} /> : null}
        </View> : null}
      </View>

      <View style={styles.accountActions}>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <AppButton label="退出当前账号" variant="secondary" loading={busy} disabled={actionBusy}
          onPress={() => void logout()} />
        <SettingsRow title="注销账号" description="永久删除账号与记录" expanded={confirmingDelete}
          disabled={actionBusy} onPress={confirmingDelete ? cancelDelete : startDelete} />
        {confirmingDelete ? <View style={styles.deleteConfirm}>
            <EditorialText role="caption" style={styles.hint}>
              注销后账号、照片、产品与使用记录会被永久删除，且无法恢复。需要保留记录，可先在上方导出数据。
            </EditorialText>
            <FormField
              label="输入密码以确认"
              placeholder="当前账号密码"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoComplete="current-password"
              editable={!deleteBusy}
            />
            {deleteError ? <InlineNotice tone="error" message={deleteError} /> : null}
            <AppButton
              label="确认永久注销账号"
              variant="danger"
              loading={deleteBusy}
              disabled={actionBusy || !deletePassword}
              onPress={() => void confirmDelete()}
            />
            <AppButton label="取消" variant="text" onPress={cancelDelete} disabled={deleteBusy} />
          </View> : null}
      </View>
    </AppScreen>
  );
}

function SettingsRow({ title, description, expanded, disabled, onPress }: {
  title: string; description: string; expanded: boolean; disabled: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}，${description}`}
    accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}>
    <View style={styles.settingCopy}>
      <EditorialText role="body" style={styles.rowTitle}>{title}</EditorialText>
      <EditorialText role="caption" style={styles.hint}>{description}</EditorialText>
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <EditorialText role="sectionTitle" style={[styles.chevron, expanded && styles.chevronOpen]}>›</EditorialText>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, marginBottom: spacing.xxl },
  title: { color: colors.ink },
  hint: { color: colors.textMuted, flexShrink: 1 },
  account: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    paddingVertical: spacing.lg, marginBottom: spacing.xxxl,
  },
  monogram: {
    width: spacing.ritual, height: spacing.ritual, borderRadius: radii.pill,
    backgroundColor: colors.sageSoft, alignItems: 'center', justifyContent: 'center',
  },
  monogramText: { color: colors.mossDeep },
  accountCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  groupLabel: { color: colors.textMuted, marginBottom: spacing.md },
  settings: { borderRadius: radii.md, backgroundColor: colors.paperElevated },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg, borderRadius: radii.md },
  settingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { color: colors.ink, fontWeight: '500' },
  chevron: { color: colors.moss },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  pressed: { backgroundColor: colors.brandOverlay },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairlineSoft, marginHorizontal: spacing.lg },
  details: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  consentRow: {
    gap: spacing.sm, paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineSoft,
  },
  consentHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm },
  consentTitle: { color: colors.ink, flexShrink: 1 },
  status: { color: colors.mossDeep },
  consentAction: { alignSelf: 'flex-start', paddingHorizontal: spacing.md },
  confirmation: { gap: spacing.sm },
  accountActions: { marginTop: spacing.xxxl, gap: spacing.sm },
  deleteConfirm: { gap: spacing.lg, paddingHorizontal: spacing.lg },
});
