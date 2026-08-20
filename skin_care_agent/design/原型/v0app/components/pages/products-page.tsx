"use client"

import { useState } from "react"
import { useApp } from "@/lib/store"
import { PRESET_PRODUCT_MEMORY, type ProductMemory } from "@/lib/mock-data"
import { Tag } from "@/components/ui-bits"
import { ProductDetail } from "@/components/pages/product-detail"
import { MagnifyingGlass, Plus, CaretRight, Flask } from "@phosphor-icons/react"

export function ProductsPage() {
  const { stage } = useApp()
  const [open, setOpen] = useState<ProductMemory | null>(null)
  const [query, setQuery] = useState("")

  if (open) return <ProductDetail product={open} onBack={() => setOpen(null)} />

  const products = stage === "has-history" ? PRESET_PRODUCT_MEMORY : []
  const filtered = products.filter((p) => p.name.includes(query.trim()))

  return (
    <div className="flex flex-col gap-4 px-5 pb-6 pt-6">
      <h1 className="text-2xl font-bold text-foreground">我的产品</h1>

      {/* 搜索 + 添加 */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-[14px] border border-input bg-card px-3.5">
          <MagnifyingGlass size={17} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索产品"
            className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <button className="flex h-11 items-center gap-1.5 rounded-[14px] bg-lavender px-3.5 text-sm font-medium text-brand">
          <Plus size={17} weight="bold" />
          添加
        </button>
      </div>

      <p className="-mt-1 text-[13px] text-muted-foreground">个人外用产品柜</p>

      {filtered.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-border bg-card px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-lavender text-brand">
            <Flask size={24} />
          </div>
          <p className="text-[15px] font-medium text-foreground">
            {stage === "first-use" ? "还没有产品记录" : "没有匹配的产品"}
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {stage === "first-use"
              ? "记录实际使用后，这里会形成你的个人产品反应记忆。"
              : "换个关键词再试试，或添加新的产品。"}
          </p>
        </div>
      ) : (
        filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => setOpen(p)}
            className="rounded-[20px] border border-border bg-card p-5 text-left transition-shadow hover:shadow-[0_4px_18px_rgba(90,86,81,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-foreground">{p.name}</h2>
              <CaretRight size={18} className="mt-1 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Tag tone="brand">{p.evidenceStatus}</Tag>
              <Tag tone="neutral">{p.eventCount}</Tag>
              <Tag tone="mint">主要区域：{p.mainAreas}</Tag>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-foreground">{p.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.note}</p>
          </button>
        ))
      )}
    </div>
  )
}
