"use client"

import { useState } from "react"
import { useApp } from "@/lib/store"
import { PRESET_EVENTS, type ChangeEvent } from "@/lib/mock-data"
import { Tag } from "@/components/ui-bits"
import { EventDetail } from "@/components/pages/event-detail"
import { EyeSlash, CaretRight, Path } from "@phosphor-icons/react"

export function JourneyPage() {
  const { stage } = useApp()
  const [openEvent, setOpenEvent] = useState<ChangeEvent | null>(null)

  if (openEvent) {
    return <EventDetail event={openEvent} onBack={() => setOpenEvent(null)} />
  }

  // 第一次使用：没有历史
  if (stage === "first-use") {
    return (
      <div className="flex flex-col px-5 pb-6 pt-6">
        <h1 className="text-2xl font-bold text-foreground">我的历程</h1>
        <div className="mt-8 flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-lavender text-brand">
            <Path size={24} />
          </div>
          <p className="text-[15px] font-medium text-foreground">还没有变化事件</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            完成第一次记录后，同一区域的多次记录会在这里汇成一段变化。未记录不等于没有发生。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-6">
      <h1 className="text-2xl font-bold text-foreground">我的历程</h1>
      <p className="-mt-2 text-[13px] leading-relaxed text-muted-foreground">
        以区域变化事件为单位，不是每日打卡。
      </p>

      {PRESET_EVENTS.map((ev) => (
        <button
          key={ev.id}
          onClick={() => ev.status === "observing" && setOpenEvent(ev)}
          className={`overflow-hidden rounded-[20px] border border-border bg-card text-left transition-shadow ${
            ev.status === "observing" ? "hover:shadow-[0_4px_18px_rgba(90,86,81,0.08)]" : ""
          }`}
        >
          {/* 遮盖封面 */}
          <div className="relative flex h-28 items-center justify-center bg-[#ece8f2]">
            <div className="flex flex-col items-center gap-1.5 text-[#9a93b3]">
              <EyeSlash size={22} />
              <span className="text-xs">照片已遮盖</span>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-foreground">{ev.title}</h2>
              {ev.status === "observing" && <CaretRight size={18} className="text-muted-foreground" />}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tag tone={ev.status === "observing" ? "brand" : "neutral"}>{ev.statusLabel}</Tag>
              <span className="text-xs text-muted-foreground">开始于 {ev.startDate}</span>
              {ev.status === "observing" && (
                <span className="text-xs text-muted-foreground">· {ev.pointCount} 个时间点</span>
              )}
            </div>

            {ev.status === "observing" ? (
              <>
                <p className="mt-3 text-[13.5px] leading-relaxed text-foreground">{ev.summary}</p>
                <div className="mt-3">
                  <Tag tone="mint">{ev.evidenceLabel}</Tag>
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{ev.pausedNote}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
