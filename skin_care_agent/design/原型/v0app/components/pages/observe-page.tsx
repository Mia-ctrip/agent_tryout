"use client"

import { useState } from "react"
import { useApp } from "@/lib/store"
import { useFlow } from "@/lib/flow"
import { Card, PrimaryButton, SubtleButton, Tag } from "@/components/ui-bits"
import { BottomSheet } from "@/components/bottom-sheet"
import { LIFE_CONTEXT_OPTIONS } from "@/lib/mock-data"
import { Camera, ClockCounterClockwise, PlusCircle, PencilSimpleLine, Check } from "@phosphor-icons/react"

export function ObservePage() {
  const { stage, reminder } = useApp()
  const { start } = useFlow()
  const [fullRecordOpen, setFullRecordOpen] = useState(false)

  return (
    <div className="flex flex-col gap-5 px-5 pb-6 pt-5">
      {/* 品牌 */}
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold tracking-tight text-brand">Skin Care</span>
      </div>

      {/* 主标题 + 副标题 */}
      <header className="mt-1">
        <h1 className="text-[26px] font-bold leading-tight text-foreground text-balance">
          看见变化，也看懂变化。
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground text-pretty">
          基于真实照片与使用记录，呈现可追溯的个人皮肤变化趋势。
        </p>
      </header>

      {/* 已有历史：低强调回看提示 */}
      {stage === "has-history" && reminder && (
        <div className="rounded-[14px] bg-lavender px-4 py-3 text-[13px] leading-relaxed text-[#5f57a0]">
          你选择在今天回看下巴这段变化
        </div>
      )}

      {/* 第一层：记录皮肤变化主卡（面积较大、淡薰衣草背景） */}
      <Card className="border-transparent bg-lavender p-6">
        <div className="flex size-12 items-center justify-center rounded-full bg-card text-brand">
          <Camera size={26} weight="regular" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">记录皮肤变化</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          用一张照片或简单记录，留下这次值得关注的变化
        </p>

        <PrimaryButton className="mt-5" onClick={() => start()}>
          <Camera size={20} weight="fill" />
          记录现在的变化
        </PrimaryButton>

        {/* 次级操作 */}
        <div className="mt-2 flex items-center justify-center gap-1">
          <SubtleButton onClick={() => start({ skipCamera: true })} className="flex-1">
            <ClockCounterClockwise size={17} />
            记录刚刚使用
          </SubtleButton>
          <span className="h-4 w-px bg-border" aria-hidden />
          <SubtleButton onClick={() => setFullRecordOpen(true)} className="flex-1">
            <PlusCircle size={17} />
            做一次完整记录
          </SubtleButton>
        </div>
      </Card>

      {/* 第二层：今天的生活背景卡（视觉更轻） */}
      <LifeContextCard />

      <FullRecordSheet open={fullRecordOpen} onClose={() => setFullRecordOpen(false)} />
    </div>
  )
}

function LifeContextCard() {
  const [selected, setSelected] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [noChange, setNoChange] = useState(false)

  const toggle = (opt: string) => {
    setNoChange(false)
    setSelected((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]))
  }

  const confirm = () => {
    if (selected.length > 0 || noChange) setCollapsed(true)
  }

  if (collapsed) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">今天的生活背景</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {noChange ? (
                <Tag tone="mint">今天没有特别变化</Tag>
              ) : (
                selected.map((s) => (
                  <Tag key={s} tone="apricot">
                    {s}
                  </Tag>
                ))
              )}
            </div>
          </div>
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-brand hover:bg-lavender"
          >
            <PencilSimpleLine size={14} />
            修改
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[20px] border border-border bg-card p-5">
      <p className="text-sm font-medium text-foreground">今天的生活背景</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">可选记录，帮助你以后回看当时的情况</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {LIFE_CONTEXT_OPTIONS.map((opt) => (
          <button key={opt} onClick={() => toggle(opt)}>
            <Tag tone="apricot" selected={selected.includes(opt)}>
              {selected.includes(opt) && <Check size={12} weight="bold" />}
              {opt}
            </Tag>
          </button>
        ))}
        <button
          onClick={() => {
            setNoChange((v) => !v)
            setSelected([])
          }}
        >
          <Tag tone="mint" selected={noChange}>
            {noChange && <Check size={12} weight="bold" />}
            今天没有特别变化
          </Tag>
        </button>
      </div>

      {(selected.length > 0 || noChange) && (
        <button
          onClick={confirm}
          className="mt-4 text-sm font-medium text-brand hover:underline"
        >
          收起
        </button>
      )}
    </div>
  )
}

function FullRecordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="做一次完整记录">
      <p className="text-[14px] leading-relaxed text-foreground">
        完整记录会引导你拍摄多个角度，只在你主动需要时使用。
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        本次演示不继续实现多角度流程。你可以先用“记录现在的变化”完成一次记录。
      </p>
      <PrimaryButton className="mt-6" onClick={onClose}>
        我知道了
      </PrimaryButton>
    </BottomSheet>
  )
}
