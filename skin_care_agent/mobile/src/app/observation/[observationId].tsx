import { Image } from 'expo-image';
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

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { LifeContextSelector } from '@/components/life-context-selector';
import { colors, radii, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { lifeContextLabel, updateObservationLifeContexts } from '@/lib/life-context';
import type { LifeContextId } from '@/lib/life-context';
import { getObservation, updateObservationNote } from '@/lib/observation-api';
import type { Observation } from '@/lib/observation-api';
import {
  createObservationGenerationGuard,
  nextObservationPollDelay,
  presentObservation,
  shouldPollObservation,
} from '@/lib/observation-flow';
import { observationDetailBackTarget } from '@/lib/observation-navigation';
import { userFacingError } from '@/lib/errors';
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
          if (!guard.isCurrent(generation)) {
            return;
          }
          setObservation(nextObservation);
          setSelectedContexts(nextObservation.life_context_ids);
          setLoading(false);
          setError(null);
          if (nextObservation.targets.some((target) => shouldPollObservation(target.status))) {
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
        if (timer) {
          clearTimeout(timer);
        }
      };
    }, [guard, observationId, reloadKey, request]),
  );

  async function saveNote(targetId: number) {
    if (!observationId || savingTargetId !== null) {
      return;
    }
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

  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          animation: 'default',
          gestureEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.irisStrong,
          title: '观察详情',
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
                      name={{
                        ios: 'chevron.left',
                        android: 'arrow_back',
                        web: 'arrow_back',
                      }}
                      size={23}
                      tintColor={colors.irisStrong}
                      weight="semibold"
                    />
                  </Pressable>
                ),
              }),
        }}
      />
      {loading && !observation ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
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
          {observation.photo ? (
            <Image
              accessibilityLabel="这次观察保存的原始照片"
              contentFit="cover"
              source={{ uri: observation.photo.url }}
              style={styles.photo}
            />
          ) : null}
          <View style={styles.targets}>
            {observation.targets.map((target) => {
              const presentation = presentObservation(observation, target);
              const targetLabel =
                target.scope_type === 'region' && target.region_id
                  ? regionById(target.region_id).label
                  : '历史全脸观察';
              const note = notes[target.target_id] ?? '';
              return (
                <View key={target.target_id} style={styles.targetCard}>
                  <Text style={styles.targetLabel}>{targetLabel}</Text>
                  {presentation.kind === 'queued' || presentation.kind === 'processing' ? (
                    <View style={styles.statusPanel}>
                      <Text style={styles.statusTitle}>{presentation.title}</Text>
                      <Text style={styles.statusBody}>{presentation.body}</Text>
                    </View>
                  ) : null}
                  {presentation.kind === 'photo' ? (
                    <View style={styles.resultSection}>
                      <Text style={styles.resultTitle}>{presentation.title}</Text>
                      <Text style={styles.source}>{presentation.sourceLabel}</Text>
                      <View style={styles.factPanel}>
                        {presentation.sections.map((section) => (
                          <View key={section.label} style={styles.factRow}>
                            <Text style={styles.factLabel}>{section.label}</Text>
                            <Text style={styles.factValue}>{section.value}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {presentation.kind === 'user' ? (
                    <View style={styles.resultSection}>
                      <Text style={styles.resultTitle}>{presentation.title}</Text>
                      <Text style={styles.source}>{presentation.sourceLabel}</Text>
                      <Text style={styles.userNote}>{presentation.note}</Text>
                    </View>
                  ) : null}
                  {presentation.kind === 'needs_input' ? (
                    <View style={styles.resultSection}>
                      <View style={styles.statusPanel}>
                        <Text style={styles.statusTitle}>{presentation.title}</Text>
                        <Text style={styles.statusBody}>{presentation.body}</Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>补充{targetLabel}的观察</Text>
                        <TextInput
                          accessibilityLabel={`补充${targetLabel}观察文字`}
                          maxLength={500}
                          multiline
                          onChangeText={(value) => {
                            setNotes((current) => ({
                              ...current,
                              [target.target_id]: value,
                            }));
                            setError(null);
                          }}
                          placeholder="只写此刻真实看到的变化"
                          placeholderTextColor={colors.textMuted}
                          style={styles.textInput}
                          textAlignVertical="top"
                          value={note}
                        />
                        <Text style={styles.counter}>{note.length}/500</Text>
                      </View>
                      <AppButton
                        label="保存我的观察"
                        loading={savingTargetId === target.target_id}
                        onPress={() => void saveNote(target.target_id)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          {observation.targets.every((target) => target.status === 'completed') ? (
            <View style={styles.contextSection}>
              <Text style={styles.contextTitle}>当时的生活背景</Text>
              <Text style={styles.contextBody}>
                只保存原始背景，不进入 AI、趋势或关联判断。
              </Text>
              {observation.life_context_completed_at ? (
                observation.life_context_ids.length ? (
                  <View style={styles.savedContexts}>
                    {observation.life_context_ids.map((contextId) => (
                      <View key={contextId} style={styles.savedContext}>
                        <Text style={styles.savedContextLabel}>
                          {lifeContextLabel(contextId)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.contextBody}>这次已跳过生活背景贴纸。</Text>
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
  fallbackBack: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  muted: { color: colors.textMuted, fontSize: 14 },
  time: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.md },
  photo: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: radii.lg,
    backgroundColor: colors.lavender,
    marginBottom: spacing.xl,
  },
  statusPanel: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.lavender,
    padding: spacing.xl,
  },
  statusTitle: { color: colors.irisStrong, fontSize: 20, fontWeight: '700' },
  statusBody: { color: colors.text, fontSize: 15, lineHeight: 23 },
  targets: { gap: spacing.xl },
  targetCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  targetLabel: { color: colors.irisStrong, fontSize: 19, fontWeight: '800' },
  resultSection: { gap: spacing.md },
  resultTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  source: { color: colors.irisStrong, fontSize: 13, fontWeight: '600' },
  factPanel: {
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  factRow: { gap: spacing.xs },
  factLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  factValue: { color: colors.text, fontSize: 15, lineHeight: 22 },
  userNote: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    borderRadius: radii.lg,
    backgroundColor: colors.sage,
    padding: spacing.xl,
  },
  field: { gap: spacing.sm, marginTop: spacing.md },
  fieldLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  textInput: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    padding: spacing.lg,
  },
  counter: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 12 },
  contextSection: {
    gap: spacing.md,
    marginTop: spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xl,
  },
  contextTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  contextBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  savedContexts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  savedContext: {
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  savedContextLabel: { color: colors.irisStrong, fontSize: 14, fontWeight: '700' },
});
