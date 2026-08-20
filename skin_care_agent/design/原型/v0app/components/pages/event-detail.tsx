"use client"

import { useState } from "react"
import Image from "next/image"
import type { ChangeEvent } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import { useFlow } from "@/lib/flow"
import { Tag, PrimaryButton, OutlineButton } from "@/components/ui-bits"
import { BottomSheet } from "@/components/bottom-sheet"
import { ProductUseSheet } from "@/components/product-use-sheet"
import { ReminderSheet } from "@/components/record-flow"
import { CaretLeft, EyeSlash, Eye, Check } from "@phosphor-icons/react"

export function EventDetail({ event, onBack }: { event: ChangeEvent; onBack: () => void }) {
  const { start } = useFlow()
  const { setReminder } = useApp()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [photoShown, setPhotoShown] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)

  return (
    <div className="flex flex-col pb-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-5 pb-2 pt-5">
        <button
          onClick={onBack}
          aria-label="返回"
          className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <CaretLeft size={20} className="text-foreground" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">变化事件详情</span>
      </div>

      <div className="px-5">
        {/* 顶部 */}
        <h1 className="mt-2 text-2xl font-bold text-foreground">{event.title}</h1>
        <div className="mt-2 flex items-center gap-2">
          <Tag tone="brand">{event.statusLabel}</Tag>
          <span className="text-xs text-muted-foreground">开始于 {event.startDate}</span>
        </div>

        {/* 第一部分：个人结论 */}
        <Block title="个人结论">
          <p className="text-[15px] leading-relaxed text-foreground">{event.summary}</p>
        </Block>

        {/* 第二部分：为什么这样判断 */}
        <Block title="为什么这样判断">
          <ul className="flex flex-col gap-2">
            <Li>共有 {event.pointCount} 个有效时间点</Li>
            <Li>时间跨度 {event.spanDays} 天</Li>
            <Li>其中 {event.comparablePhotos} 次照片具备比较条件</Li>
            <Li>泛红范围比第一次记录小</Li>
            <Li>最近一次记录中仍出现新的可见变化</Li>
          </ul>
          <div className="mt-3">
            <Tag tone="mint">{event.evidenceLabel}</Tag>
          </div>
        </Block>

        {/* 第三部分：这次有多大参考价值 */}
        <Block title="这次有多大参考价值">
          <Kv k="相似点" v="区域和主要状态维度一致" />
          <Kv k="不同点" v="第二次记录同时使用了两种产品" />
          <Kv k="未知信息" v="有一次生活背景没有记录" />
        </Block>

        {/* 第四部分：下一步可以做什么 */}
        <Block title="下一步可以做什么">
          <ul className="flex flex-col gap-2">
            <Li>下次记录时，可以优先保持相近的角度和光线</Li>
            <Li>如果你准备咨询医生或药师，可以带上这段记录</Li>
          </ul>
        </Block>

        {/* 第五部分：这段时间发生了什么 */}
        <Block title="这段时间发生了什么">
          <ol className="relative flex flex-col gap-4 pl-5">
            <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-border" aria-hidden />
            {event.timeline?.map((node) => (
              <li key={node.date} className="relative">
                <span className="absolute -left-5 top-1 size-2 rounded-full bg-brand" aria-hidden />
                <p className="text-[13px] font-medium text-foreground">{node.date}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{node.text}</p>
              </li>
            ))}
          </ol>
        </Block>

        {/* 照片依据（默认遮盖） */}
        <div className="mt-6 overflow-hidden rounded-[20px] border border-border">
          {!photoShown ? (
            <div className="flex flex-col items-center gap-3 bg-[#ece8f2] px-6 py-10 text-center">
              <div className="flex flex-col items-center gap-1.5 text-[#9a93b3]">
                <EyeSlash size={24} />
                <span className="text-xs">照片默认遮盖</span>
              </div>
              <button
                onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-1.5 rounded-[14px] bg-card px-4 py-2.5 text-sm font-medium text-brand"
              >
                <Eye size={16} />
                查看照片依据
              </button>
            </div>
          ) : (
            <div className="relative aspect-[4/3] w-full">
              <Image src="/demo-portrait.png" alt="中性演示照片依据" fill sizes="360px" className="object-cover" />
              <button
                onClick={() => setPhotoShown(false)}
                className="absolute right-3 top-3 rounded-full bg-foreground/40 px-3 py-1 text-xs text-white"
              >
                重新遮盖
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="mt-6 flex flex-col gap-2.5 px-5">
        <PrimaryButton onClick={() => start()}>记录现在的变化</PrimaryButton>
        <div className="grid grid-cols-2 gap-2.5">
          <OutlineButton onClick={() => setProductOpen(true)}>补充实际使用</OutlineButton>
          <OutlineButton onClick={() => setReminderOpen(true)}>修改观察提醒</OutlineButton>
        </div>
        <button
          onClick={() => setStopOpen(true)}
          className="mt-1 py-2 text-center text-sm text-muted-foreground hover:underline"
        >
          停止继续记录
        </button>
      </div>

      {/* 查看照片确认 */}
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="查看照片依据">
        <p className="text-[14px] leading-relaxed text-foreground">
          照片可能让你重新看到当时的皮肤状态，是否继续查看？
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <PrimaryButton
            onClick={() => {
              setPhotoShown(true)
              setConfirmOpen(false)
            }}
          >
            继续查看
          </PrimaryButton>
          <OutlineButton onClick={() => setConfirmOpen(false)}>暂时不看</OutlineButton>
        </div>
      </BottomSheet>

      {/* 停止继续记录 */}
      <BottomSheet open={stopOpen} onClose={() => setStopOpen(false)} title="停止继续记录">
        <p className="text-[14px] leading-relaxed text-foreground">
          停止后这段记录会转为暂停追踪，只表示近期不再新增记录，不代表已经结束或痊愈。
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          你已有的记录不会被删除，之后仍可以随时继续。
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OutlineButton onClick={() => setStopOpen(false)}>
            <Check size={16} />
            暂停这段追踪
          </OutlineButton>
          <button
            onClick={() => setStopOpen(false)}
            className="py-2 text-center text-sm text-muted-foreground hover:underline"
          >
            继续观察
          </button>
        </div>
      </BottomSheet>

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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-brand">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13.5px] leading-relaxed text-foreground">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand/60" aria-hidden />
      {children}
    </li>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-border py-2 last:border-b-0">
      <span className="w-16 shrink-0 text-[13px] text-muted-foreground">{k}</span>
      <span className="text-[13.5px] leading-relaxed text-foreground">{v}</span>
    </div>
  )
}
