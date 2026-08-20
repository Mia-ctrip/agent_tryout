"use client"

import type { ProductMemory } from "@/lib/mock-data"
import { Tag, OutlineButton } from "@/components/ui-bits"
import { CaretLeft } from "@phosphor-icons/react"

export function ProductDetail({ product, onBack }: { product: ProductMemory; onBack: () => void }) {
  return (
    <div className="flex flex-col pb-8">
      <div className="flex items-center gap-3 px-5 pb-2 pt-5">
        <button
          onClick={onBack}
          aria-label="返回"
          className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
        >
          <CaretLeft size={20} className="text-foreground" />
        </button>
        <span className="text-sm font-medium text-muted-foreground">产品详情</span>
      </div>

      <div className="px-5">
        <h1 className="mt-2 text-2xl font-bold text-foreground">{product.name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Tag tone="brand">{product.evidenceStatus}</Tag>
          <Tag tone="neutral">{product.eventCount}</Tag>
        </div>

        {/* 1. 个人结论 */}
        <Block title="个人结论">
          <p className="text-[15px] leading-relaxed text-foreground">
            在你的 3 段独立记录中，使用后较常出现整体缓和的后续记录，同时也有一次变化混合。
          </p>
        </Block>

        {/* 2. 为什么这样判断 */}
        <Block title="为什么这样判断">
          <ul className="flex flex-col gap-2">
            <Li>3 段实际使用记录</Li>
            <Li>2 段随后整体缓和</Li>
            <Li>1 段变化混合</Li>
            <Li>主要涉及下巴和左脸颊</Li>
            <Li>依据来自照片与用户记录</Li>
          </ul>
        </Block>

        {/* 3. 这次有多大参考价值 */}
        <Block title="这次有多大参考价值">
          <Kv k="相似之处" v="主要区域和使用方式接近" />
          <Kv k="不同之处" v="其中一次同时使用了修护保湿霜" />
          <Kv k="未知因素" v="一次记录缺少完整生活背景" />
          <div className="mt-3 rounded-[14px] bg-muted px-4 py-3">
            <p className="text-[13px] leading-relaxed text-foreground">
              你曾记录过一次轻微刺痛。这里无法判断刺痛由该产品导致。
            </p>
          </div>
        </Block>

        {/* 4. 下一步可以做什么 */}
        <Block title="下一步可以做什么">
          <ul className="flex flex-col gap-2">
            <Li>可以回顾其中一次组合使用的记录，避免把结果归到单个产品</Li>
            <Li>如果准备咨询医生或药师，可以重点说明一次刺痛和一次组合使用</Li>
          </ul>
        </Block>
      </div>

      {/* 底部操作（不提供继续使用 / 适合你 / 购买） */}
      <div className="mt-6 flex flex-col gap-2.5 px-5">
        <OutlineButton>查看相关事件</OutlineButton>
        <div className="grid grid-cols-2 gap-2.5">
          <OutlineButton>补充个人备注</OutlineButton>
          <OutlineButton>纠正产品信息</OutlineButton>
        </div>
      </div>
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
