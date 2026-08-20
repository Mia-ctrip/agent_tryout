"use client"

import type { ReactNode } from "react"

// 桌面预览时将 App 居中显示在约 390px 宽的手机容器内；
// 手机屏幕上使用完整宽度和 min-height: 100dvh。
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[#efeae2] sm:py-6">
      <div className="relative flex min-h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden bg-background shadow-[0_10px_40px_rgba(90,86,81,0.14)] sm:min-h-[820px] sm:rounded-[40px]">
        {children}
      </div>
    </div>
  )
}
