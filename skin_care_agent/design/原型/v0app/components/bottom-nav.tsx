"use client"

import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { Eye, Path, Flask, User } from "@phosphor-icons/react"

const ITEMS = [
  { key: "observe", label: "观察", Icon: Eye },
  { key: "journey", label: "历程", Icon: Path },
  { key: "products", label: "产品", Icon: Flask },
  { key: "me", label: "我的", Icon: User },
] as const

export function BottomNav() {
  const { tab, setTab } = useApp()

  return (
    <nav
      aria-label="主导航"
      className="absolute inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-16 items-stretch">
        {ITEMS.map(({ key, label, Icon }) => {
          const active = tab === key
          return (
            <li key={key} className="flex-1">
              <button
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className="flex h-full w-full flex-col items-center justify-center gap-1 transition-colors"
              >
                <Icon
                  size={24}
                  weight={active ? "fill" : "regular"}
                  className={cn(active ? "text-brand" : "text-muted-foreground")}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
