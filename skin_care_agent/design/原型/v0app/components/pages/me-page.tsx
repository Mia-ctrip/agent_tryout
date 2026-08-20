"use client"

import { useApp } from "@/lib/store"
import type { DemoStage, SystemState } from "@/lib/mock-data"
import {
  Bell,
  ClipboardText,
  Image as ImageIcon,
  Sparkle,
  Lock,
  Database,
  Export,
  Trash,
  ShieldCheck,
  Info,
  FileText,
  ChatCircleDots,
  CaretRight,
  Check,
} from "@phosphor-icons/react"

const GROUPS = [
  {
    title: "我的记录方式",
    items: [
      { label: "观察提醒", Icon: Bell },
      { label: "完整记录偏好", Icon: ClipboardText },
    ],
  },
  {
    title: "照片与隐私",
    items: [
      { label: "照片预览", Icon: ImageIcon },
      { label: "AI 分析授权", Icon: Sparkle },
      { label: "应用锁", Icon: Lock },
      { label: "存储与删除", Icon: Database },
    ],
  },
  {
    title: "数据与账号",
    items: [
      { label: "导出我的记录", Icon: Export },
      { label: "删除数据", Icon: Trash },
      { label: "账号与安全", Icon: ShieldCheck },
    ],
  },
  {
    title: "关于与支持",
    items: [
      { label: "产品能力边界", Icon: Info },
      { label: "医疗免责说明", Icon: FileText },
      { label: "隐私说明", Icon: ShieldCheck },
      { label: "意见反馈", Icon: ChatCircleDots },
    ],
  },
]

export function MePage() {
  const { stage, system, setStage, setSystem } = useApp()

  return (
    <div className="flex flex-col gap-6 px-5 pb-6 pt-6">
      <h1 className="text-2xl font-bold text-foreground">我的</h1>

      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="px-1 text-xs font-medium text-muted-foreground">{group.title}</h2>
          <div className="mt-2 overflow-hidden rounded-[20px] border border-border bg-card">
            {group.items.map((item, i) => (
              <button
                key={item.label}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted ${
                  i !== 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-lavender text-brand">
                  <item.Icon size={17} />
                </span>
                <span className="flex-1 text-[14px] text-foreground">{item.label}</span>
                <CaretRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* 原型演示设置（低强调、仅测试工具） */}
      <section className="mt-2">
        <h2 className="px-1 text-xs font-medium text-muted-foreground">原型演示设置</h2>
        <p className="mt-1 px-1 text-[11px] leading-relaxed text-muted-foreground/80">
          仅用于原型测试，不属于正式产品入口。
        </p>

        <div className="mt-2 rounded-[20px] border border-dashed border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">演示阶段</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StageChip label="第一次使用" active={stage === "first-use"} onClick={() => setStage("first-use")} />
            <StageChip label="已有个人历史" active={stage === "has-history"} onClick={() => setStage("has-history")} />
          </div>

          <p className="mt-4 text-xs font-medium text-muted-foreground">系统状态</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <SysChip label="正常" active={system === "normal"} onClick={() => setSystem("normal")} />
            <SysChip
              label="AI 暂时不可用"
              active={system === "ai-unavailable"}
              onClick={() => setSystem("ai-unavailable")}
            />
            <SysChip
              label="照片条件不足"
              active={system === "photo-insufficient"}
              onClick={() => setSystem("photo-insufficient")}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            “AI 暂时不可用”状态下仍能完成无照片记录或用户状态记录，不会阻塞保存。
          </p>
        </div>
      </section>
    </div>
  )
}

function StageChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-[14px] border px-3 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "border-brand bg-lavender text-brand" : "border-border bg-background text-muted-foreground"
      }`}
    >
      {active && <Check size={14} weight="bold" />}
      {label}
    </button>
  )
}

function SysChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-[14px] border px-4 py-2.5 text-[13px] font-medium transition-colors ${
        active ? "border-brand bg-lavender text-brand" : "border-border bg-background text-muted-foreground"
      }`}
    >
      {label}
      {active && <Check size={14} weight="bold" />}
    </button>
  )
}
