"use client"

import { useState } from "react"
import { BottomSheet } from "@/components/bottom-sheet"
import { PrimaryButton, Tag } from "@/components/ui-bits"
import { PRESET_PRODUCTS, AREA_LABELS, type AreaKey } from "@/lib/mock-data"
import { Check } from "@phosphor-icons/react"

const AREA_CHOICES: (AreaKey | "skip")[] = ["chin", "leftCheek", "rightCheek", "forehead", "nose", "skip"]

export function ProductUseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [area, setArea] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [saved, setSaved] = useState(false)

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const reset = () => {
    setSelected([])
    setArea(null)
    setNote("")
    setSaved(false)
  }

  const handleClose = () => {
    onClose()
    // 关闭后重置，方便下次演示
    setTimeout(reset, 250)
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={saved ? "使用记录已保存" : "记录刚刚使用"}>
      {saved ? (
        <div>
          <p className="text-[14px] leading-relaxed text-foreground">
            使用记录已保存。时间上的先后不会被直接解释为产品效果。
          </p>
          <PrimaryButton className="mt-6" onClick={handleClose}>
            完成
          </PrimaryButton>
        </div>
      ) : (
        <div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">只记录已经发生的使用。</p>

          <div className="mt-4">
            <p className="text-sm font-medium text-foreground">使用的产品（可多选）</p>
            <div className="mt-2.5 flex flex-col gap-2">
              {PRESET_PRODUCTS.map((p) => {
                const on = selected.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center justify-between rounded-[14px] border px-4 py-3 text-left text-sm transition-colors ${
                      on ? "border-brand bg-lavender text-foreground" : "border-border bg-card text-foreground"
                    }`}
                  >
                    {p.name}
                    <span
                      className={`flex size-5 items-center justify-center rounded-full border ${
                        on ? "border-brand bg-brand text-brand-foreground" : "border-border"
                      }`}
                    >
                      {on && <Check size={13} weight="bold" />}
                    </span>
                  </button>
                )
              })}
            </div>
            {selected.length > 1 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                多个产品会作为一个组合记录保存。
              </p>
            )}
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">使用时间</p>
            <div className="mt-2">
              <Tag tone="brand" selected>
                刚刚
              </Tag>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">
              使用区域 <span className="font-normal text-muted-foreground">可选，可跳过</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AREA_CHOICES.map((a) => {
                const label = a === "skip" ? "跳过" : AREA_LABELS[a as AreaKey]
                return (
                  <button key={a} onClick={() => setArea(area === a ? null : a)}>
                    <Tag tone="neutral" selected={area === a}>
                      {label}
                    </Tag>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">
              个人备注 <span className="font-normal text-muted-foreground">可选</span>
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="例如：只涂了局部"
              className="mt-2 w-full resize-none rounded-[14px] border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring"
            />
          </div>

          <PrimaryButton
            className="mt-6"
            disabled={selected.length === 0}
            onClick={() => setSaved(true)}
          >
            保存使用记录
          </PrimaryButton>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            即使没有活跃变化事件，也可以保存。
          </p>
        </div>
      )}
    </BottomSheet>
  )
}
