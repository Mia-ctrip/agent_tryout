"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useFlow } from "@/lib/flow"
import { useApp } from "@/lib/store"
import { BottomSheet } from "@/components/bottom-sheet"
import { PrimaryButton, OutlineButton, SubtleButton, Tag } from "@/components/ui-bits"
import { ProductUseSheet } from "@/components/product-use-sheet"
import {
  FACE_AREAS,
  AREA_LABELS,
  CURRENT_STATE_OPTIONS,
  FEELING_OPTIONS,
  type AreaKey,
} from "@/lib/mock-data"
import { CaretLeft, Camera, Check, Circle, WarningCircle } from "@phosphor-icons/react"

export function RecordFlow() {
  const { active } = useFlow()
  if (!active) return null
  return (
    <div className="absolute inset-0 z-[60] bg-background">
      <FlowRouter />
    </div>
  )
}

function FlowRouter() {
  const { screen } = useFlow()
  switch (screen) {
    case "camera":
      return <CameraScreen />
    case "confirm-position":
      return <ConfirmPositionScreen />
    case "state-supplement":
      return <StateSupplementScreen />
    case "saving":
      return <SavingScreen />
    case "change-card":
      return <ChangeCardScreen />
  }
}

/* ============ 页面 2：模拟拍摄页 ============ */
function CameraScreen() {
  const { goTo, close } = useFlow()
  const { updateDraft, system } = useApp()
  const [processing, setProcessing] = useState(false)

  const capture = () => {
    setProcessing(true)
    // 照片处理中（结构一致的处理状态，不用无限旋转）
    setTimeout(() => {
      updateDraft({
        hasPhoto: true,
        photoQuality: system === "photo-insufficient" ? "insufficient" : "good",
      })
      goTo("confirm-position")
    }, 1100)
  }

  return (
    <div className="flex h-full flex-col bg-[#2b2833] text-white">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 pt-5">
        <button
          onClick={close}
          aria-label="返回"
          className="flex size-9 items-center justify-center rounded-full bg-white/10"
        >
          <CaretLeft size={20} />
        </button>
        <span className="text-sm text-white/70">记录现在的变化</span>
        <span className="size-9" />
      </div>

      {/* 取景区 */}
      <div className="relative mx-5 mt-4 flex-1 overflow-hidden rounded-[24px] bg-black/40">
        <Image
          src="/demo-portrait.png"
          alt="模拟取景中的中性人像演示图"
          fill
          sizes="390px"
          className="object-cover opacity-90"
          priority
        />
        {/* 面部轮廓参考 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[62%] w-[58%] rounded-[50%] border-2 border-dashed border-white/50" />
        </div>

        {processing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
            <div className="flex gap-1.5">
              <span className="size-2.5 animate-bounce rounded-full bg-white [animation-delay:-0.2s]" />
              <span className="size-2.5 animate-bounce rounded-full bg-white [animation-delay:-0.1s]" />
              <span className="size-2.5 animate-bounce rounded-full bg-white" />
            </div>
            <p className="text-sm text-white/85">照片处理中</p>
          </div>
        )}

        {/* 提示 */}
        <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1 text-center text-[13px] text-white/85">
          <span>保持光线均匀</span>
          <span>让关注区域清晰可见</span>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex flex-col items-center gap-4 px-5 pb-8 pt-6">
        <button
          onClick={capture}
          disabled={processing}
          aria-label="拍摄"
          className="flex size-[74px] items-center justify-center rounded-full border-4 border-white/80 transition-transform active:scale-95 disabled:opacity-60"
        >
          <span className="flex size-[58px] items-center justify-center rounded-full bg-white">
            <Camera size={26} weight="fill" className="text-[#2b2833]" />
          </span>
        </button>
        <button
          onClick={() => {
            updateDraft({ hasPhoto: false, photoQuality: "none" })
            goTo("state-supplement")
          }}
          className="text-sm text-white/70 underline-offset-4 hover:underline"
        >
          暂时不拍，直接记录
        </button>
      </div>
    </div>
  )
}

/* ============ 页面 3：确认关注位置 ============ */
function ConfirmPositionScreen() {
  const { goTo } = useFlow()
  const { updateDraft } = useApp()
  const [point, setPoint] = useState<{ key: AreaKey; label: string } | null>(null)
  const [qualityOpen, setQualityOpen] = useState(false)
  const { draft } = useApp()

  const suggested = point?.key ?? null

  return (
    <div className="flex h-full flex-col">
      <FlowHeader title="确认关注位置" />

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <h1 className="text-xl font-semibold text-foreground">这次你最关注哪里？</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          点一下照片中的位置即可，我们会以你的关注为准。
        </p>

        {/* 演示照片 + 可点击热区 */}
        <div className="relative mx-auto mt-5 aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-muted">
          <Image src="/demo-portrait.png" alt="刚才拍摄的演示照片" fill sizes="360px" className="object-cover" />
          {FACE_AREAS.map((a) => {
            const on = point?.key === a.key
            return (
              <button
                key={a.key}
                aria-label={a.label}
                onClick={() => setPoint({ key: a.key, label: a.label })}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${a.cx}%`, top: `${a.cy}%` }}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full border-2 transition-all ${
                    on
                      ? "border-brand bg-brand/30 shadow-[0_0_0_6px_rgba(143,133,206,0.25)]"
                      : "border-white/80 bg-white/25"
                  }`}
                >
                  {on && <span className="size-2.5 rounded-full bg-brand" />}
                </span>
              </button>
            )
          })}
        </div>

        {point && (
          <div className="mt-4 rounded-[14px] bg-lavender px-4 py-3">
            <p className="text-sm text-[#5f57a0]">
              建议区域：<span className="font-semibold">{AREA_LABELS[point.key]}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">你可以直接点其他位置来修改区域。</p>
          </div>
        )}

        {/* 低强调演示入口 */}
        <button
          onClick={() => setQualityOpen(true)}
          className="mt-5 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          模拟照片条件不足
        </button>
      </div>

      <div className="border-t border-border px-5 py-4">
        <PrimaryButton
          disabled={!point}
          onClick={() => {
            if (!point) return
            updateDraft({ focusPoint: point, area: point.key })
            goTo("state-supplement")
          }}
        >
          确认这个位置
        </PrimaryButton>
      </div>

      {/* 照片质量提示（不使用红色警告样式，不标记失败） */}
      <BottomSheet open={qualityOpen} onClose={() => setQualityOpen(false)} title="这张照片暂时不适合连续比较">
        <p className="text-[14px] leading-relaxed text-foreground">
          光线偏暗，但你仍然可以保存这次记录，并补充当前状态。
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OutlineButton onClick={() => setQualityOpen(false)}>重新拍摄</OutlineButton>
          <PrimaryButton
            onClick={() => {
              updateDraft({ photoQuality: "insufficient" })
              setQualityOpen(false)
              goTo("state-supplement")
            }}
          >
            继续记录
          </PrimaryButton>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {draft.hasPhoto ? "照片已保存，不会被标记为失败。" : ""}
        </p>
      </BottomSheet>
    </div>
  )
}

/* ============ 页面 4：状态补充 ============ */
function StateSupplementScreen() {
  const { goTo } = useFlow()
  const { draft, updateDraft, system } = useApp()
  const areaChoices: AreaKey[] = ["chin", "leftCheek", "rightCheek", "forehead", "nose", "unsure"]
  const [area, setArea] = useState<AreaKey | null>(draft.area)
  const [current, setCurrent] = useState<string | null>(null)
  const [feeling, setFeeling] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <FlowHeader title="补充当前状态" />
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {system === "ai-unavailable" && (
          <div className="mb-4 flex items-start gap-2 rounded-[14px] bg-muted px-4 py-3">
            <WarningCircle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              AI 暂时不可用，但你仍然可以完成这次记录，保存不会被阻塞。
            </p>
          </div>
        )}

        <h1 className="text-xl font-semibold text-foreground">现在这个区域是什么感觉？</h1>

        {/* 区域选择 */}
        <p className="mt-5 text-sm font-medium text-foreground">关注区域</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {areaChoices.map((a) => (
            <button key={a} onClick={() => setArea(a)}>
              <Tag tone="neutral" selected={area === a}>
                {AREA_LABELS[a]}
              </Tag>
            </button>
          ))}
        </div>

        {/* 当前状态（固定选项） */}
        <p className="mt-6 text-sm font-medium text-foreground">当前状态</p>
        <div className="mt-2 flex flex-col gap-2">
          {CURRENT_STATE_OPTIONS.map((opt) => {
            const on = current === opt
            return (
              <button
                key={opt}
                onClick={() => setCurrent(opt)}
                className={`flex items-center justify-between rounded-[14px] border px-4 py-3 text-left text-sm transition-colors ${
                  on ? "border-brand bg-lavender text-foreground" : "border-border bg-card"
                }`}
              >
                {opt}
                {on ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check size={13} weight="bold" />
                  </span>
                ) : (
                  <Circle size={20} className="text-border" />
                )}
              </button>
            )
          })}
        </div>

        {/* 个人感受（可选） */}
        <p className="mt-6 text-sm font-medium text-foreground">
          个人感受 <span className="font-normal text-muted-foreground">可选</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FEELING_OPTIONS.map((opt) => (
            <button key={opt} onClick={() => setFeeling(feeling === opt ? null : opt)}>
              <Tag tone="mint" selected={feeling === opt}>
                {opt}
              </Tag>
            </button>
          ))}
        </div>

        <p className="mt-6 rounded-[14px] bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {draft.hasPhoto
            ? "照片和你补充的当前状态，会共同进入同一条个人趋势。"
            : "没有照片也可以形成一条完整记录，并进入同一条个人趋势。"}
        </p>
      </div>

      <div className="border-t border-border px-5 py-4">
        <PrimaryButton
          disabled={!area || !current}
          onClick={() => {
            updateDraft({ area, currentState: current, feeling })
            goTo("saving")
          }}
        >
          保存这次记录
        </PrimaryButton>
        <p className="mt-2 text-center text-xs text-muted-foreground">今天只记录到这里也可以</p>
      </div>
    </div>
  )
}

/* ============ 保存处理中 / 失败 / 成功 ============ */
function SavingScreen() {
  const { goTo } = useFlow()
  const { markSaved } = useApp()
  const [status, setStatus] = useState<"saving" | "failed">("saving")

  useEffect(() => {
    if (status !== "saving") return
    const t = setTimeout(() => {
      // 演示：偶发一次失败，让三种状态都真实存在
      if (Math.random() < 0.28) {
        setStatus("failed")
      } else {
        markSaved()
        goTo("change-card")
      }
    }, 1200)
    return () => clearTimeout(t)
  }, [status, goTo, markSaved])

  const retry = () => setStatus("saving")

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      {status === "saving" ? (
        <>
          <div className="flex gap-1.5">
            <span className="size-3 animate-bounce rounded-full bg-brand [animation-delay:-0.2s]" />
            <span className="size-3 animate-bounce rounded-full bg-brand [animation-delay:-0.1s]" />
            <span className="size-3 animate-bounce rounded-full bg-brand" />
          </div>
          <p className="text-[15px] font-medium text-foreground">保存处理中</p>
          <p className="text-[13px] text-muted-foreground">正在整理这次记录</p>
        </>
      ) : (
        <>
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <WarningCircle size={30} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-[15px] font-medium text-foreground">这次保存没有成功</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              你的记录还在，没有丢失。可以重新尝试保存。
            </p>
          </div>
          <div className="w-full max-w-[240px]">
            <PrimaryButton onClick={retry}>重新尝试</PrimaryButton>
          </div>
        </>
      )}
    </div>
  )
}

/* ============ 页面 5：这次变化卡 ============ */
function ChangeCardScreen() {
  const { close } = useFlow()
  const { draft, stage, setTab, setReminder } = useApp()
  const [productOpen, setProductOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)

  const focusLabel = draft.focusPoint?.label ?? (draft.area ? AREA_LABELS[draft.area] : "—")
  const areaLabel = draft.area ? AREA_LABELS[draft.area] : "—"

  const photoBasis =
    draft.photoQuality === "good"
      ? "可作为后续比较起点"
      : "本次主要依据你的记录"

  const photoFact =
    draft.hasPhoto && draft.photoQuality === "good"
      ? "照片保留了当前区域的可见状态，可以作为后续比较的个人起点。"
      : draft.hasPhoto && draft.photoQuality === "insufficient"
        ? "照片已保存，但拍摄条件暂不支持连续照片比较。"
        : "这次没有照片依据。"

  const done = () => {
    close()
    setTab("journey")
  }

  return (
    <div className="flex h-full flex-col">
      <FlowHeader title="这次变化卡" onBack={close} />
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="flex items-center gap-2 rounded-[14px] bg-mint/40 px-4 py-3">
          <span className="flex size-6 items-center justify-center rounded-full bg-mint text-mint-foreground">
            <Check size={14} weight="bold" />
          </span>
          <p className="text-sm font-medium text-mint-foreground">这次记录已保存</p>
        </div>

        <div className="mt-4 rounded-[20px] border border-border bg-card p-5">
          {/* 元信息 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span>记录时间：今天 21:30</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag tone="brand">主要区域：{areaLabel}</Tag>
            <Tag tone="neutral">关注位置：{focusLabel}</Tag>
          </div>
          <div className="mt-2">
            <Tag tone="neutral">照片依据：{photoBasis}</Tag>
          </div>

          {/* 四区块 */}
          <Section title="我注意到的">
            你最关注{focusLabel}，并记录了“{draft.currentState ?? "当前状态"}”。
            {draft.feeling && draft.feeling !== "暂时不记录" && draft.feeling !== "没有特别感受"
              ? ` 同时记录到${draft.feeling}。`
              : ""}
          </Section>

          <Section title="照片留下的事实">{photoFact}</Section>

          <Section title="目前知道的">
            {draft.hasPhoto ? "当前记录来自照片和你的补充。" : "当前记录来自你的补充。"}
          </Section>

          <Section title="目前还不知道的">
            {stage === "first-use"
              ? "现在还没有足够历史判断这段变化的方向，也没有产品使用记录。"
              : "这次记录会进入个人趋势，但单次记录还不能判断这段变化的方向。"}
          </Section>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        <PrimaryButton onClick={done}>完成</PrimaryButton>
        <div className="mt-2 flex items-center justify-center gap-1">
          <SubtleButton className="flex-1" onClick={() => setProductOpen(true)}>
            记录刚刚使用
          </SubtleButton>
          <span className="h-4 w-px bg-border" aria-hidden />
          <SubtleButton className="flex-1" onClick={() => setReminderOpen(true)}>
            设置观察提醒
          </SubtleButton>
        </div>
      </div>

      <ProductUseSheet open={productOpen} onClose={() => setProductOpen(false)} />
      <ReminderSheet
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        onPick={(r) => {
          setReminder(r === "不提醒" ? null : r)
          setReminderOpen(false)
        }}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-border pt-4 first:border-t-0">
      <p className="text-[13px] font-semibold text-brand">{title}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">{children}</p>
    </div>
  )
}

export function ReminderSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (r: string) => void
}) {
  const options = ["明天", "3 天后", "7 天后", "自定义", "不提醒"]
  return (
    <BottomSheet open={open} onClose={onClose} title="设置观察提醒">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        由你决定是否回看，我们不会默认提醒你。
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            className="flex items-center justify-between rounded-[14px] border border-border bg-card px-4 py-3.5 text-left text-sm text-foreground hover:bg-muted"
          >
            {o}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

function FlowHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { close } = useFlow()
  return (
    <div className="flex items-center gap-3 px-5 pb-3 pt-5">
      <button
        onClick={onBack ?? close}
        aria-label="返回"
        className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
      >
        <CaretLeft size={20} className="text-foreground" />
      </button>
      <span className="text-sm font-medium text-muted-foreground">{title}</span>
    </div>
  )
}
