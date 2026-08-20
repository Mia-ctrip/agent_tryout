"use client"

import { AppProvider, useApp } from "@/lib/store"
import { FlowProvider } from "@/lib/flow"
import { PhoneShell } from "@/components/phone-shell"
import { BottomNav } from "@/components/bottom-nav"
import { RecordFlow } from "@/components/record-flow"
import { ObservePage } from "@/components/pages/observe-page"
import { JourneyPage } from "@/components/pages/journey-page"
import { ProductsPage } from "@/components/pages/products-page"
import { MePage } from "@/components/pages/me-page"

function Screen() {
  const { tab } = useApp()
  return (
    <div key={tab} className="animate-in fade-in duration-200">
      {tab === "observe" && <ObservePage />}
      {tab === "journey" && <JourneyPage />}
      {tab === "products" && <ProductsPage />}
      {tab === "me" && <MePage />}
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <FlowProvider>
        <PhoneShell>
          {/* 主内容区，底部留出导航高度，避免被固定导航遮挡 */}
          <main className="flex-1 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))]">
            <Screen />
          </main>
          <BottomNav />
          <RecordFlow />
        </PhoneShell>
      </FlowProvider>
    </AppProvider>
  )
}
