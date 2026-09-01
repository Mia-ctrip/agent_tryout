import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnalysisScanner } from '@/components/analysis-scanner';
import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { LifeContextSelector } from '@/components/life-context-selector';
import { ObservationActionBar } from '@/components/observation-action-bar';
import { ObservationResult } from '@/components/observation-result';
import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { ApiError } from '@/lib/api';
import { userFacingError } from '@/lib/errors';
import { lifeContextLabel, updateObservationLifeContexts } from '@/lib/life-context';
import type { LifeContextId } from '@/lib/life-context';
import {
  getObservation,
  retryObservationTarget,
  updateObservationNote,
} from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import {
  createObservationGenerationGuard,
  nextObservationPollDelay,
  presentObservation,
  shouldPollObservationTargets,
} from '@/lib/observation-flow';
import { observationDetailBackTarget } from '@/lib/observation-navigation';
import { regionById } from '@/lib/region-catalog';
import { useSession } from '@/providers/session-provider';

function parseObservationId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function recordedAtLabel(recordedAt: string): string {
  return new Date(recordedAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ObservationDetailScreen() {
  const params = useLocalSearchParams<{ observationId: string }>();
  const navigation = useNavigation();
  const backTarget = observationDetailBackTarget(navigation.canGoBack());
  const observationId = parseObservationId(params.observationId);
  const { request } = useSession();
  const [observation, setObservation] = useState<Observation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [savingTargetId, setSavingTargetId] = useState<number | null>(null);
  const [retryingTargetId, setRetryingTargetId] = useState<number | null>(null);
  const [selectedContexts, setSelectedContexts] = useState<LifeContextId[]>([]);
  const [savingContexts, setSavingContexts] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [guard] = useState(() => createObservationGenerationGuard());

  useFocusEffect(
    useCallback(() => {
      void reloadKey;
      if (!observationId) {
        setLoading(false);
        setError('观察记录编号无效。');
        return () => guard.invalidate();
      }
      const generation = guard.begin();
      let timer: ReturnType<typeof setTimeout> | null = null;
      setLoading(true);
      setError(null);
      const load = async (attempt: number) => {
        try {
          const nextObservation = await getObservation(request, observationId);
          if (!guard.isCurrent(generation)) return;
          setObservation(nextObservation);
          setSelectedContexts(nextObservation.life_context_ids);
          setLoading(false);
          setError(null);
          if (shouldPollObservationTargets(nextObservation.targets)) {
            timer = setTimeout(
              () => void load(attempt + 1),
              nextObservationPollDelay(attempt),
            );
          }
        } catch (loadError) {
          if (guard.isCurrent(generation)) {
            setLoading(false);
            setError(userFacingError(loadError));
          }
        }
      };
      void load(0);
      return () => {
        guard.invalidate();
        if (timer) clearTimeout(timer);
      };
    }, [guard, observationId, reloadKey, request]),
  );

  async function saveNote(targetId: number) {
    if (!observationId || savingTargetId !== null) return;
    const note = notes[targetId] ?? '';
    if (!note.trim()) {
      setError('请写下此刻看到的变化。');
      return;
    }
    setSavingTargetId(targetId);
    setError(null);
    try {
      const updated = await updateObservationNote(request, observationId, targetId, note);
      setObservation(updated);
      setNotes((current) => ({ ...current, [targetId]: '' }));
    } catch (noteError) {
      setError(
        noteError instanceof ApiError && noteError.status === 409
          ? '这次记录的状态已经变化，请重新读取后再试。'
          : userFacingError(noteError),
      );
    } finally {
      setSavingTargetId(null);
    }
  }

  async function saveLifeContexts(contextIds: LifeContextId[]) {
    if (!observationId || savingContexts) return;
    setSavingContexts(true);
    setError(null);
    try {
      const updated = await updateObservationLifeContexts(
        request,
        observationId,
        contextIds,
      );
      setObservation(updated);
      setSelectedContexts(updated.life_context_ids);
    } catch (contextError) {
      setError(userFacingError(contextError));
    } finally {
      setSavingContexts(false);
    }
  }

  async function retryTarget(targetId: number) {
    if (!observationId || retryingTargetId !== null) return;
    setRetryingTargetId(targetId);
    setError(null);
    try {
      const updated = await retryObservationTarget(
        request,
        observationId,
        targetId,
      );
      setObservation(updated);
      setReloadKey((key) => key + 1);
    } catch (retryError) {
      setError(userFacingError(retryError));
    } finally {
      setRetryingTargetId(null);
    }
  }

  const analyzing = observation ? shouldPollObservationTargets(observation.targets) : false;
  const completedPhotoResults = observation?.targets.some(
    (target) =>
      target.status === 'completed' &&
      target.result_source === 'photo_analysis' &&
      target.facts,
  ) ?? false;
  const showResultActions = Boolean(observation && !analyzing && completedPhotoResults);
  const complete = () => {
    if (backTarget === 'native') router.back();
    else router.replace(backTarget);
  };

  return (
    <AppScreen
      backgroundColor={observationColors.background}
      footer={
        showResultActions ? (
          <ObservationActionBar
            onPrimaryPress={complete}
            onSecondaryPress={() => router.push('/observation/new')}
            primaryLabel="完成"
            secondaryLabel="重新拍摄"
          />
        ) : undefined
      }
      safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          animation: 'fade_from_bottom',
          gestureEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerShown: true,
          headerStyle: { backgroundColor: observationColors.background },
          headerTintColor: observationColors.action,
          title: analyzing ? 'AI 分析中' : '分析结果',
          ...(backTarget === 'native'
            ? {}
            : {
                headerLeft: () => (
                  <Pressable
                    accessibilityLabel="返回历程"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => router.replace(backTarget)}
                    style={styles.fallbackBack}>
                    <SymbolView
                      name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                      size={23}
                      tintColor={observationColors.action}
                      weight="semibold"
                    />
                  </Pressable>
                ),
              }),
        }}
      />
      {loading && !observation ? (
        <View style={styles.loading}>
          <ActivityIndicator color={observationColors.action} />
          <Text style={styles.muted}>正在读取最新状态</Text>
        </View>
      ) : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {error ? (
        <AppButton
          label="重新读取"
          variant="secondary"
          onPress={() => setReloadKey((key) => key + 1)}
        />
      ) : null}
      {observation ? (
        <>
          <Text style={styles.time}>{recordedAtLabel(observation.recorded_at)}</Text>
          {analyzing && observation.photo ? (
            <>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={styles.title}>正在分析今天的照片</Text>
                <Text style={styles.body}>扫描阶段来自各检测区域的真实任务状态，不显示虚假百分比。</Text>
              </View>
              <AnalysisScanner photo={observation.photo} targets={observation.targets} />
            </>
          ) : null}

          {!analyzing && completedPhotoResults ? (
            <ObservationResult observation={observation} />
          ) : null}

          {!analyzing ? (
            <View style={styles.fallbacks}>
              {observation.targets.map((target) => {
                const presentation = presentObservation(observation, target);
                const targetLabel = target.region_id
                  ? regionById(target.region_id).label
                  : '历史全脸观察';
                const note = notes[target.target_id] ?? '';
                if (presentation.kind === 'user') {
                  return (
                    <View key={target.target_id} style={styles.manualResult}>
                      <Text style={styles.fallbackTitle}>{targetLabel} · 你的观察</Text>
                      <Text style={styles.manualText}>{presentation.note}</Text>
                    </View>
                  );
                }
                if (presentation.kind !== 'needs_input') return null;
                return (
                  <View key={target.target_id} style={styles.needsInput}>
                    <Text style={styles.fallbackTitle}>{targetLabel}暂时无法完成分析</Text>
                    <Text style={styles.body}>其他已完成区域仍会保留。你可以补充自己的真实观察。</Text>
                    {observation.photo ? (
                      <AppButton
                        label="重试 AI 分析"
                        loading={retryingTargetId === target.target_id}
                        variant="secondary"
                        onPress={() => void retryTarget(target.target_id)}
                      />
                    ) : null}
                    <TextInput
                      accessibilityLabel={`补充${targetLabel}观察文字`}
                      maxLength={500}
                      multiline
                      onChangeText={(value) => {
                        setNotes((current) => ({ ...current, [target.target_id]: value }));
                        setError(null);
                      }}
                      placeholder="只写此刻真实看到的变化"
                      placeholderTextColor={observationColors.textMuted}
                      style={styles.textInput}
                      textAlignVertical="top"
                      value={note}
                    />
                    <Text style={styles.counter}>{note.length}/500</Text>
                    <AppButton
                      label="保存我的观察"
                      loading={savingTargetId === target.target_id}
                      variant="secondary"
                      onPress={() => void saveNote(target.target_id)}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}

          {!analyzing && observation.targets.every((target) => target.status === 'completed') ? (
            <View style={styles.contextSection}>
              <Text style={styles.contextTitle}>当时的生活背景</Text>
              <Text style={styles.body}>只保存原始背景，不进入 AI、趋势或关联判断。</Text>
              {observation.life_context_completed_at ? (
                observation.life_context_ids.length ? (
                  <View style={styles.savedContexts}>
                    {observation.life_context_ids.map((contextId) => (
                      <View key={contextId} style={styles.savedContext}>
                        <Text style={styles.savedContextLabel}>{lifeContextLabel(contextId)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.body}>这次已跳过生活背景贴纸。</Text>
                )
              ) : (
                <>
                  <LifeContextSelector
                    disabled={savingContexts}
                    onChange={setSelectedContexts}
                    selected={selectedContexts}
                  />
                  <AppButton
                    label="保存生活背景"
                    loading={savingContexts}
                    variant="secondary"
                    onPress={() => void saveLifeContexts(selectedContexts)}
                  />
                  <AppButton
                    disabled={savingContexts}
                    label="全部跳过"
                    variant="text"
                    onPress={() => void saveLifeContexts([])}
                  />
                </>
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  fallbackBack: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { alignItems: 'center', gap: observationSpacing.md, paddingVertical: 32 },
  muted: { color: observationColors.textMuted, fontSize: 14 },
  time: { color: observationColors.textMuted, fontSize: 12, marginBottom: observationSpacing.lg },
  headerCopy: { gap: observationSpacing.sm, marginBottom: observationSpacing.xl },
  title: {
    color: observationColors.text,
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 36,
  },
  body: { color: observationColors.textMuted, fontSize: 14, lineHeight: 21 },
  fallbacks: { gap: observationSpacing.lg, marginTop: observationSpacing.xxl },
  needsInput: {
    gap: observationSpacing.md,
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.lg,
    backgroundColor: observationColors.surface,
    padding: observationSpacing.lg,
  },
  fallbackTitle: { color: observationColors.text, fontSize: 17, fontWeight: '700' },
  textInput: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.background,
    color: observationColors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: observationSpacing.md,
  },
  counter: { alignSelf: 'flex-end', color: observationColors.textMuted, fontSize: 12 },
  manualResult: { gap: observationSpacing.sm },
  manualText: {
    color: observationColors.text,
    fontSize: 16,
    lineHeight: 24,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.surfaceMuted,
    padding: observationSpacing.lg,
  },
  contextSection: {
    gap: observationSpacing.md,
    marginTop: observationSpacing.xxl,
    borderTopWidth: 1,
    borderTopColor: observationColors.border,
    paddingTop: observationSpacing.xl,
  },
  contextTitle: { color: observationColors.text, fontSize: 18, fontWeight: '700' },
  savedContexts: { flexDirection: 'row', flexWrap: 'wrap', gap: observationSpacing.sm },
  savedContext: {
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.sageSoft,
    paddingHorizontal: observationSpacing.md,
    paddingVertical: observationSpacing.sm,
  },
  savedContextLabel: { color: observationColors.forest, fontSize: 13, fontWeight: '700' },
});
