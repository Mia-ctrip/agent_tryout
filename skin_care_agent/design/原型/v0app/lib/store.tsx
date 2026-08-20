"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { AreaKey, DemoStage, SystemState } from "@/lib/mock-data"

// 一次记录的草稿（在流程中逐步填充）
export type RecordDraft = {
  hasPhoto: boolean
  photoQuality: "good" | "insufficient" | "none"
  focusPoint: { area: AreaKey; label: string } | null
  area: AreaKey | null
  currentState: string | null
  feeling: string | null
}

const emptyDraft: RecordDraft = {
  hasPhoto: false,
  photoQuality: "none",
  focusPoint: null,
  area: null,
  currentState: null,
  feeling: null,
}

type Tab = "observe" | "journey" | "products" | "me"

type AppState = {
  // 演示状态
  stage: DemoStage
  system: SystemState
  setStage: (s: DemoStage) => void
  setSystem: (s: SystemState) => void

  // 底部导航
  tab: Tab
  setTab: (t: Tab) => void

  // 记录草稿
  draft: RecordDraft
  updateDraft: (patch: Partial<RecordDraft>) => void
  resetDraft: () => void

  // 首次记录后是否已生成一张事实卡（用于首页微妙提示）
  savedThisSession: boolean
  markSaved: () => void

  // 观察提醒
  reminder: string | null
  setReminder: (r: string | null) => void
}

const AppCtx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // 刷新页面后始终从默认演示状态开始（不持久化）
  const [stage, setStage] = useState<DemoStage>("first-use")
  const [system, setSystem] = useState<SystemState>("normal")
  const [tab, setTab] = useState<Tab>("observe")
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft)
  const [savedThisSession, setSavedThisSession] = useState(false)
  const [reminder, setReminder] = useState<string | null>(null)

  const updateDraft = useCallback((patch: Partial<RecordDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const resetDraft = useCallback(() => setDraft(emptyDraft), [])
  const markSaved = useCallback(() => setSavedThisSession(true), [])

  return (
    <AppCtx.Provider
      value={{
        stage,
        system,
        setStage,
        setSystem,
        tab,
        setTab,
        draft,
        updateDraft,
        resetDraft,
        savedThisSession,
        markSaved,
        reminder,
        setReminder,
      }}
    >
      {children}
    </AppCtx.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
