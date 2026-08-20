import {
  router,
  Stack,
  useLocalSearchParams,
} from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { BrandHeader } from '@/components/brand-header';
import { FormField } from '@/components/form-field';
import { InlineNotice } from '@/components/inline-notice';
import { colors, radii, spacing } from '@/constants/theme';
import { getCheckIn } from '@/lib/check-in-api';
import type { CheckIn } from '@/lib/check-in-api';
import { replaceCheckInDiary } from '@/lib/diary-api';
import {
  createDiarySaveGuard,
  createEmptyDiaryFormValues,
  createDiaryResponseGuard,
  diaryExitAction,
  diaryExitRoute,
  diaryNavigationProtection,
  diaryToFormValues,
  parseDiaryCheckInId,
  validateDiaryForm,
} from '@/lib/diary-form';
import type {
  DiaryDietTag,
  DiaryFormErrors,
  DiaryFormValues,
  DiaryMenstrualPhase,
  DiaryRating,
} from '@/lib/diary-form';
import { userFacingError } from '@/lib/errors';
import { useSession } from '@/providers/session-provider';

const ratingOptions: readonly DiaryRating[] = [1, 2, 3, 4, 5];

const menstrualOptions: readonly {
  value: DiaryMenstrualPhase | null;
  label: string;
}[] = [
  { value: null, label: '不记录' },
  { value: 'pre_period', label: '经期前' },
  { value: 'during_period', label: '经期中' },
  { value: 'post_period', label: '经期后' },
  { value: 'not_in_period', label: '不在经期' },
];

const dietOptions: readonly { value: DiaryDietTag; label: string }[] = [
  { value: 'spicy', label: '辛辣' },
  { value: 'sugary', label: '高糖' },
  { value: 'dairy', label: '乳制品' },
  { value: 'fried', label: '油炸' },
  { value: 'alcohol', label: '酒精' },
];

const skincareChangeOptions: readonly {
  value: boolean | null;
  label: string;
}[] = [
  { value: null, label: '不记录' },
  { value: false, label: '没有变化' },
  { value: true, label: '有变化' },
];

type ChoiceValue = string | number | boolean | null;

function ChoiceGroup<T extends ChoiceValue>({
  label,
  hint,
  value,
  options,
  onChange,
  error,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={styles.choiceList}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={`${typeof option.value}-${String(option.value)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                disabled && styles.choiceDisabled,
                pressed && styles.choicePressed,
              ]}>
              <Text
                style={[
                  styles.choiceLabel,
                  selected && styles.choiceLabelSelected,
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function DiaryScreen() {
  const params = useLocalSearchParams<{
    checkInId?: string | string[];
  }>();
  const { request } = useSession();
  const checkInId = parseDiaryCheckInId(params.checkInId);
  const saveGuard = useRef(createDiarySaveGuard()).current;
  const responseGuard = useMemo(
    () => createDiaryResponseGuard(checkInId),
    [checkInId],
  );
  const [values, setValues] = useState<DiaryFormValues>(
    createEmptyDiaryFormValues,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DiaryFormErrors>({});
  const [saved, setSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkInStatus, setCheckInStatus] =
    useState<CheckIn['status']>('draft');
  const navigationProtection = diaryNavigationProtection(saving);
  usePreventRemove(navigationProtection.preventRemove, () => {});

  useEffect(
    () => () => {
      responseGuard.invalidate();
    },
    [responseGuard],
  );

  useEffect(() => {
    let active = true;

    async function loadDiary() {
      if (checkInId === null) {
        setLoadError('Check-in 编号无效。');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const checkIn = await getCheckIn(request, checkInId);
        if (active) {
          setValues(diaryToFormValues(checkIn.diary));
          setCheckInStatus(checkIn.status);
          setSaved(false);
        }
      } catch (error) {
        if (active) {
          setLoadError(userFacingError(error));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDiary();
    return () => {
      active = false;
    };
  }, [checkInId, reloadKey, request]);

  function updateField<Key extends keyof DiaryFormValues>(
    key: Key,
    value: DiaryFormValues[Key],
  ) {
    if (saving) {
      return;
    }
    responseGuard.markChanged();
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSaveError(null);
    setSaved(false);
  }

  function toggleDietTag(tag: DiaryDietTag) {
    const selected = values.dietTags.includes(tag);
    updateField(
      'dietTags',
      selected
        ? values.dietTags.filter((item) => item !== tag)
        : [...values.dietTags, tag],
    );
  }

  async function saveDiary() {
    if (checkInId === null || !saveGuard.tryBegin()) {
      return;
    }
    const result = validateDiaryForm(values);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setSaveError('请先修正标记的内容。');
      saveGuard.finish();
      return;
    }

    const submittedRevision = responseGuard.snapshot();
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const checkIn = await replaceCheckInDiary(
        request,
        checkInId,
        result.diary,
      );
      if (!responseGuard.isActive()) {
        return;
      }
      setCheckInStatus(checkIn.status);
      if (
        responseGuard.canApply(
          submittedRevision,
          checkIn.check_in_id,
        )
      ) {
        setValues(diaryToFormValues(checkIn.diary));
        setSaved(true);
      } else {
        setSaved(false);
        setSaveError('提交时的内容已保存，刚才的新修改仍需再次保存。');
      }
    } catch (error) {
      if (responseGuard.isActive()) {
        setSaveError(userFacingError(error));
      }
    } finally {
      saveGuard.finish();
      if (responseGuard.isActive()) {
        setSaving(false);
      }
    }
  }

  function exitDiary() {
    if (checkInId === null) {
      router.replace('/home');
      return;
    }
    router.replace(diaryExitRoute(checkInId, checkInStatus));
  }

  if (loading) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>正在恢复日记</Text>
      </AppScreen>
    );
  }

  if (loadError) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <BrandHeader
          eyebrow="DAILY DIARY"
          title="暂时无法打开日记"
          description="你的原有记录没有被修改，可以重新加载后继续。"
        />
        <InlineNotice tone="error" message={loadError} />
        <View style={styles.actions}>
          {checkInId !== null ? (
            <AppButton
              label="重新加载"
              onPress={() => setReloadKey((current) => current + 1)}
            />
          ) : null}
          <AppButton
            label="返回上一页"
            variant="text"
            onPress={() => router.back()}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ gestureEnabled: navigationProtection.gestureEnabled }}
      />
      <AppScreen>
      <BrandHeader
        eyebrow="DAILY DIARY"
        title={saved ? '今日记录已保存' : '记录今天的情况'}
        description="所有项目均为可选，仅用于帮助你回看皮肤状态与生活变化。"
      />

      <View style={styles.form}>
        {saved ? (
          <InlineNotice message="内容已同步到你的 Check-in，可以继续修改并再次保存。" />
        ) : null}
        {saveError ? <InlineNotice tone="error" message={saveError} /> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>睡眠与压力</Text>
          <FormField
            label="睡眠时长（小时）"
            hint="可填写 0–24，例如 7.5。"
            keyboardType="decimal-pad"
            editable={!saving}
            value={values.sleepHours}
            onChangeText={(value) => updateField('sleepHours', value)}
          />
          {fieldErrors.sleepHours ? (
            <Text style={styles.fieldError}>{fieldErrors.sleepHours}</Text>
          ) : null}
          <ChoiceGroup
            label="睡眠质量"
            hint="1 表示很差，5 表示很好。"
            value={values.sleepQuality}
            options={[
              { value: null, label: '不记录' },
              ...ratingOptions.map((value) => ({
                value,
                label: String(value),
              })),
            ]}
            onChange={(value) => updateField('sleepQuality', value)}
            error={fieldErrors.sleepQuality}
            disabled={saving}
          />
          <ChoiceGroup
            label="压力程度"
            hint="1 表示很低，5 表示很高。"
            value={values.stressLevel}
            options={[
              { value: null, label: '不记录' },
              ...ratingOptions.map((value) => ({
                value,
                label: String(value),
              })),
            ]}
            onChange={(value) => updateField('stressLevel', value)}
            error={fieldErrors.stressLevel}
            disabled={saving}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>周期与饮食</Text>
          <ChoiceGroup
            label="生理周期阶段"
            value={values.menstrualPhase}
            options={menstrualOptions}
            onChange={(value) => updateField('menstrualPhase', value)}
            disabled={saving}
          />
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>今日饮食标签</Text>
            <Text style={styles.fieldHint}>可多选，也可以全部不选。</Text>
            <View style={styles.choiceList}>
              {dietOptions.map((option) => {
                const selected = values.dietTags.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={saving}
                    onPress={() => toggleDietTag(option.value)}
                    style={({ pressed }) => [
                      styles.choice,
                      selected && styles.choiceSelected,
                      saving && styles.choiceDisabled,
                      pressed && styles.choicePressed,
                    ]}>
                    <Text
                      style={[
                        styles.choiceLabel,
                        selected && styles.choiceLabelSelected,
                      ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>护肤与外用记录</Text>
          <ChoiceGroup
            label="今天的护肤方案是否有变化"
            value={values.skincareChanged}
            options={skincareChangeOptions}
            onChange={(value) => updateField('skincareChanged', value)}
            disabled={saving}
          />
          <FormField
            label="新使用的护肤产品"
            hint="多个名称请用逗号分隔，最多 10 个。"
            placeholder="例如：温和面霜，修护精华"
            editable={!saving}
            value={values.newSkincareProducts}
            onChangeText={(value) =>
              updateField('newSkincareProducts', value)
            }
          />
          {fieldErrors.newSkincareProducts ? (
            <Text style={styles.fieldError}>
              {fieldErrors.newSkincareProducts}
            </Text>
          ) : null}
          <FormField
            label="主动使用的外用产品或药品"
            hint="这里只记录你填写的名称，不代表系统推荐。"
            placeholder="多个名称请用逗号分隔"
            editable={!saving}
            value={values.topicalProducts}
            onChangeText={(value) => updateField('topicalProducts', value)}
          />
          {fieldErrors.topicalProducts ? (
            <Text style={styles.fieldError}>
              {fieldErrors.topicalProducts}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>备注</Text>
          <FormField
            label="今天还发生了什么"
            hint={`${values.notes.length} / 500`}
            multiline
            numberOfLines={5}
            placeholder="例如：外出时间较长、睡眠不足或皮肤有短期波动"
            editable={!saving}
            textAlignVertical="top"
            value={values.notes}
            onChangeText={(value) => updateField('notes', value)}
            style={styles.notesInput}
          />
          {fieldErrors.notes ? (
            <Text style={styles.fieldError}>{fieldErrors.notes}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <AppButton
            label={saved ? '再次保存修改' : '保存今日记录'}
            loading={saving}
            onPress={() => void saveDiary()}
          />
          <AppButton
            label={
              checkInId === null
                ? '返回首页'
                : diaryExitAction(checkInId, checkInStatus).label
            }
            variant="text"
            disabled={saving}
            onPress={exitDiary}
          />
        </View>
      </View>
      </AppScreen>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  choiceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    minHeight: 40,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  choiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  choiceDisabled: {
    opacity: 0.5,
  },
  choicePressed: {
    opacity: 0.75,
  },
  choiceLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  choiceLabelSelected: {
    color: colors.primary,
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  notesInput: {
    minHeight: 120,
    paddingTop: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
