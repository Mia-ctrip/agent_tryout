"use client"

import { cn } from "@/lib/utils"
import { X } from "@phosphor-icons/react"
import { useEffect, type ReactNode } from "react"

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "absolute inset-0 z-50 flex flex-col justify-end",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* 遮罩 */}
      <button
        aria-label="关闭"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-foreground/25 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      {/* 面板 */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative max-h-[86%] overflow-y-auto rounded-t-[24px] bg-card px-5 pb-8 pt-3 transition-transform duration-200 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground text-balance">{title}</h2>
          <button
            aria-label="关闭"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
