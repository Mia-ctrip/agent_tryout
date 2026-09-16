# 全脸专项验收证据 · 2026-09-16

## 验证边界

Web 报告 `review-results.json` 与非 `-native` 截图均使用明确的隔离夹具；API 请求被拦截，不是后端持久化或真实 AI 结果。运行命令：`node scripts/ui-visual-review.mjs --full-face-only`。

Pixel 8 模拟器、Expo Go 57、1080×2400、字体 1.0，通过运行中的本地真实后端，只读回看已有部分选区照片。不创建观察，不保存产品使用，不主动重新分析，不复制照片或修改区域归属。

## 已执行的原生路径

1. 历程选择“全脸”，已有仅选右脸颊/下巴的照片显示实际范围、时间及两个 completed 状态：`full-face-history-native.png`。
2. 打开同一观察，默认完整原图概览；实际观察仍为两区：`full-face-partial-overview-native.png`。
3. 纵向滚动读取已有区域事实：`full-face-partial-facts-native.png`。
4. 切换“分区详情”，实际横向手势切至第二区下巴，页码、标签和报告同步：`full-face-regions-native.png`。
5. Android 系统返回，保留全脸选中态及原卡片位置：`full-face-return-native.png`。选中态同时核对原生无障碍树；未执行完整 TalkBack 语音验收。

模拟器曾出现系统服务异常及 Expo 下载连接失败，恢复后完成上述路径。小屏/字体缩放尝试只得到加载或非目标界面，不能当作本功能验收；`full-face-history-320-large-font-native.png`、`native-current.png`、`full-face-native-entry.png`、`expo-native-error-log.png` 仅为诊断记录。最终恢复屏幕物理尺寸 1080×2400、字体缩放 1.0。

## 自动化证据

- 移动端 254 项单测通过；TypeScript、Expo lint 通过。
- 后端对应 pytest：27 passed、1 skipped；专项 Ruff 通过。SQLite 中执行真实查询的分页测试覆盖发生时间回填的 51 条记录、相同时刻稳定排序、不同账号游标和软删除游标；仅证明查询行为。
- PostgreSQL 集成测试 `tests/integration/test_observation_history_pagination.py` 已编写，因没有显式可丢弃 `TEST_DATABASE_URL` 跳过；不将 SQLite 或当前开发后端读取当作 PostgreSQL 验收。
- 隔离 Web 覆盖 320/375/390/430 宽度、六区混合状态、部分区域完整照片概览、旧无照片全脸原文、区域 API 失败不隐藏照片、失效原图一次自动补签/手动恢复、详情返回、实际第三区切换后分页位置，以及回看期间没有业务写请求。完整结果以 `review-results.json` 为准。

## 尚未执行

- 原生新六区选择/确认 → 保存 → 产品步骤 → 真实区域 AI → 概览闭环；真实 AI 全失败/部分失败及补充文字恢复。
- 可丢弃 PostgreSQL 全序列化分页与跨账号持久化隔离。
- 本功能原生小屏/大字体、TalkBack、iPhone、物理 Android 相机、release 包。

当前数据库含真实记录，没有为补截图写入或伪造 AI。上述缺口保留在当前状态及收口盘点中；本项代码收口不等于整个 MVP、一般产品历史或 Slice 4A Task 12 完成。
