// 所有数据均为本地 mock，不连接任何后端或数据库。

export type DemoStage = "first-use" | "has-history"
export type SystemState = "normal" | "ai-unavailable" | "photo-insufficient"

export type AreaKey = "chin" | "leftCheek" | "rightCheek" | "forehead" | "nose" | "unsure"

export const AREA_LABELS: Record<AreaKey, string> = {
  chin: "下巴",
  leftCheek: "左脸颊",
  rightCheek: "右脸颊",
  forehead: "额头",
  nose: "鼻周",
  unsure: "暂时不确定",
}

// 首页可点选的脸部区域（用于确认关注位置）
export const FACE_AREAS: { key: AreaKey; label: string; cx: number; cy: number }[] = [
  { key: "forehead", label: "额头", cx: 50, cy: 22 },
  { key: "leftCheek", label: "左脸颊", cx: 68, cy: 52 },
  { key: "rightCheek", label: "右脸颊", cx: 32, cy: 52 },
  { key: "chin", label: "下巴", cx: 50, cy: 78 },
]

export const CURRENT_STATE_OPTIONS = [
  "泛红范围比之前小",
  "泛红范围比之前大",
  "表面看起来更平整",
  "出现新的可见变化",
  "整体基本稳定",
  "变化比较混合",
  "目前说不清",
]

export const FEELING_OPTIONS = ["刺痛", "发痒", "紧绷", "没有特别感受", "暂时不记录"]

export const LIFE_CONTEXT_OPTIONS = [
  "睡眠不足",
  "压力较大",
  "经期",
  "饮食变化",
  "情绪波动",
  "护理变化",
]

export const PRESET_PRODUCTS = [
  { id: "azelaic", name: "壬二酸凝胶 15%" },
  { id: "cleanser", name: "温和洁面乳" },
  { id: "moisturizer", name: "修护保湿霜" },
]

// —— 已有个人历史下的预置事件 ——
export type TimelineNode = {
  date: string
  text: string
}

export type ChangeEvent = {
  id: string
  title: string
  area: AreaKey
  startDate: string
  status: "observing" | "paused"
  statusLabel: string
  pointCount: number
  summary: string
  evidenceLabel: string
  paused?: boolean
  pausedNote?: string
  spanDays?: number
  comparablePhotos?: number
  timeline?: TimelineNode[]
}

export const PRESET_EVENTS: ChangeEvent[] = [
  {
    id: "chin-change",
    title: "下巴这段变化",
    area: "chin",
    startDate: "7 月 28 日",
    status: "observing",
    statusLabel: "正在观察",
    pointCount: 3,
    summary: "最近的记录变化混合：泛红范围较小，但仍有新的可见变化。",
    evidenceLabel: "照片与用户记录共同支持",
    spanDays: 15,
    comparablePhotos: 2,
    timeline: [
      { date: "7 月 28 日", text: "建立个人比较起点" },
      { date: "8 月 4 日", text: "记录实际使用壬二酸凝胶 15%" },
      { date: "8 月 12 日", text: "泛红范围较小，同时记录到新的可见变化" },
    ],
  },
  {
    id: "leftcheek-change",
    title: "左脸颊这段变化",
    area: "leftCheek",
    startDate: "7 月 20 日",
    status: "paused",
    statusLabel: "暂停追踪",
    pointCount: 2,
    summary: "近期没有新增记录。",
    evidenceLabel: "用户记录为主",
    paused: true,
    pausedNote: "暂停追踪只表示近期没有新增记录，不代表已经结束或痊愈。",
  },
]

export type ProductMemory = {
  id: string
  name: string
  evidenceStatus: string
  eventCount: string
  mainAreas: string
  summary: string
  note: string
}

export const PRESET_PRODUCT_MEMORY: ProductMemory[] = [
  {
    id: "azelaic",
    name: "壬二酸凝胶 15%",
    evidenceStatus: "形成个人规律",
    eventCount: "3 段独立记录",
    mainAreas: "下巴、左脸颊",
    summary: "你记录过 3 段使用后的变化，其中 2 段随后整体缓和，1 段变化混合。",
    note: "这表示个人历史中的时间关联，不代表产品疗效或适合度。",
  },
  {
    id: "cleanser",
    name: "温和洁面乳",
    evidenceStatus: "记录较少",
    eventCount: "1 段独立记录",
    mainAreas: "全脸",
    summary: "目前只有 1 段使用记录，还不足以形成个人规律。",
    note: "这表示个人历史中的时间关联，不代表产品疗效或适合度。",
  },
]
