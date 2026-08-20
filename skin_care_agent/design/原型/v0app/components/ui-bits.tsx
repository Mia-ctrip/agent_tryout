"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

// 圆角胶囊标签（中性分类 / 生活贴纸）
export function Tag({
  children,
  tone = "neutral",
  selected = false,
  className,
}: {
  children: ReactNode
  tone?: "neutral" | "brand" | "mint" | "apricot"
  selected?: boolean
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground border-transparent",
    brand: "bg-lavender text-[#5f57a0] border-transparent",
    mint: "bg-mint/50 text-mint-foreground border-transparent",
    apricot: "bg-apricot/40 text-apricot-foreground border-transparent",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium leading-5",
        selected ? "bg-brand text-brand-foreground" : tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// 统一 20px 圆角卡片，阴影极轻
export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode
  className?: string
  as?: any
}) {
  return (
    <As
      className={cn(
        "rounded-[20px] border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      {children}
    </As>
  )
}

// 主 CTA 按钮（深紫 + 白字，14px 圆角，大触控区）
export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-all duration-200 active:translate-y-px active:brightness-95 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// 次级 / 低强调按钮
export function SubtleButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-[14px] px-4 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted active:translate-y-px",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// 带边框的次级按钮
export function OutlineButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-card px-5 text-[15px] font-medium text-foreground transition-colors duration-200 hover:bg-muted active:translate-y-px",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
