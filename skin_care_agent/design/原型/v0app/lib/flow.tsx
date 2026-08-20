"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

// 记录流程的各个屏幕
export type FlowScreen =
  | "camera"
  | "confirm-position"
  | "state-supplement"
  | "saving"
  | "change-card"

type FlowState = {
  active: boolean
  screen: FlowScreen
  // 起始入口：完整流程从相机开始；"直接记录"从状态补充开始
  start: (opts?: { skipCamera?: boolean }) => void
  goTo: (s: FlowScreen) => void
  close: () => void
}

const FlowCtx = createContext<FlowState | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [screen, setScreen] = useState<FlowScreen>("camera")

  const start = useCallback((opts?: { skipCamera?: boolean }) => {
    setScreen(opts?.skipCamera ? "state-supplement" : "camera")
    setActive(true)
  }, [])

  const goTo = useCallback((s: FlowScreen) => setScreen(s), [])
  const close = useCallback(() => setActive(false), [])

  return (
    <FlowCtx.Provider value={{ active, screen, start, goTo, close }}>
      {children}
    </FlowCtx.Provider>
  )
}

export function useFlow() {
  const ctx = useContext(FlowCtx)
  if (!ctx) throw new Error("useFlow must be used within FlowProvider")
  return ctx
}
