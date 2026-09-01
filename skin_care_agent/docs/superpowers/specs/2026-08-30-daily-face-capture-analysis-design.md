# 每日面部拍摄与 AI 皮肤分析设计

> 状态：APPROVED。用户已明确授权无人值守实施，并要求本设计与 MVP 冲突时优先满足本次 prompt。

## 目标与主操作

用户目标是用一张稳定、可解释的正脸照片完成当天的区域观察。流程中的主操作依次是“打开相机”“拍下并继续”“开始观察”“完成”，每个视口只保留一个视觉上最强的主按钮。

信息顺序固定为：拍摄准备、实时引导、拍后质量检查、区域选择、可靠保存、按区域异步分析、结论优先的结果展示。原图不做美颜、调色、锐化或生成式修改。

## 现状审计

- 移动端为 React Native 0.86、Expo SDK 57、Expo Router 和 TypeScript。现有 `expo-camera`、`expo-image`、Reanimated、Safe Area 和公共按钮/页面容器可复用。
- `src/app/observation/new.tsx` 已包含权限、拍摄、选区、30 天事件确认、保存和失败恢复，但以页面模式和多个布尔值组织，且区域仅用文字列表选择。
- `src/app/observation/[observationId].tsx` 已能轮询各区域独立状态并保留失败区域，但结果是卡片式七字段列表，没有扫描连续性、结论层级和照片证据。
- 后端现有 ObservationRecord/ObservationTarget、幂等 UUID、对象存储、异步 worker、按区域 Prompt/Schema 和失败降级均可直接复用。
- 后端 legacy `services/vision/quality.py` 已使用本地 MediaPipe Face Landmarker、OpenCV 和 Pillow，可检测人脸数、距离、角度、光线与模糊；模型资产已存在。它尚未暴露给新版 observation，也没有返回区域多边形。
- 当前观察页仍使用旧紫色 theme；产品页已经建立 MVP 的奶油色、深绿、草木绿与蜂蜜金语义色。新流程复用后者，不全局重绘无关页面。
- Expo 57 `CameraView` 提供预览、`onCameraReady` 和 `takePictureAsync`，但没有人脸关键点帧回调。实时关键点不能在 Expo Go 内直接复用后端 MediaPipe。

## 方案比较与决定

### 方案 A：纯前端视觉模拟

优点是改动小，Expo Go 可直接运行。缺点是距离、角度和光线提示没有真实依据，不满足质量验收。拒绝。

### 方案 B：原生实时帧处理器

使用 Vision Camera/ML Kit 可提供真实实时关键点。代价是增加原生模块、改为 development build、改变当前 Expo Go 验收与构建链，并带来 SDK 57 兼容风险。本轮不采用。

### 方案 C：可替换实时适配器 + 拍后真实 MediaPipe 检查

这是本轮采用方案。相机页使用独立 `CameraGuideAdapter` 输出明确状态；当前 Expo Go 实现只基于相机准备度提供稳定的构图提示，不伪造实时关键点。拍照后立即把临时照片发送到新增的只读质量预检接口，由现有本地 MediaPipe 真实检查并返回具体恢复文案和区域多边形。未来接入原生帧处理器时只替换适配器，不改页面状态机、选区或结果组件。

## 状态机

使用一个判别联合和 reducer 表达流程，不使用互相独立的页面布尔状态。状态至少包括：

`permission_required`、`camera_starting`、`camera_ready`、`face_not_found`、`face_too_far`、`face_too_close`、`face_off_angle`、`poor_lighting`、`unstable`、`ready_to_capture`、`quality_checking`、`quality_failed`、`selecting_regions`、`confirming_events`、`saving`、`analyzing_quality`、`analyzing_landmarks`、`analyzing_regions`、`generating_result`、`success`、`error`。

权限拒绝、质量失败、网络失败和 AI 失败都保留已完成步骤。质量失败保留临时照片与具体问题，提供重新拍摄；分析失败保留已经可靠保存的照片和区域，沿用现有目标级文字补充能力。

保存与 AI 仍保持分离。主按钮“开始观察”先调用现有幂等创建接口，确认 `saved` 后进入扫描页面。重复点击由状态机和固定客户端 UUID 双重阻止。

## 后端质量与几何契约

新增 `POST /api/v1/observations/photo-quality` multipart 端点。它只在内存中读取临时照片，不创建数据库记录或 AI 任务，返回：

- `status`: `passed | failed`
- `primary_issue`: 当前优先处理的问题
- `issues`: 稳定错误码、中文恢复文案和相关区域
- `metrics`: 人脸框、姿态、亮度和清晰度的非诊断指标
- `regions`: 六个固定区域的归一化多边形

创建 observation 时再次运行同一检查，防止绕过预检，并把通过的 `quality_meta` 与区域多边形保存到已有 Photo JSONB 字段。新增返回字段是向后兼容扩展，不改变已有目标、幂等和异步 AI 契约。

质量错误优先级为：无人脸、多张脸、脸过远、脸过近、角度不正、光线不可用、明显模糊、疑似遮挡。一次只展示首要恢复动作，同时保留完整问题列表供拍后确认页读取。遮挡只在关键点缺失或可信度不足时报告，不用肤色或纹理猜测。

## 区域定位与左右方向

后端根据 MediaPipe 关键点生成六个归一化多边形：额头、用户左侧脸、用户右侧脸、鼻周、口周、下巴。左右以用户本人真实方向为准；对于未镜像保存的正脸照片，用户左侧通常位于图像右侧。多边形随人脸关键点、脸型和照片尺寸变化。

移动端 `FaceRegionMap` 在获知图片实际布局后，把原图归一化坐标通过与 `contentFit="cover"` 相同的缩放和裁切矩阵映射到屏幕。可见边界和点击命中分离，命中区至少 44pt。照片区域与文字选项共用同一个选区状态，保证双向同步。

未选中区域使用暖白 1.5px 虚线和极淡填充。选中区域使用 2px 草木绿实线、低透明填充与勾选。当前选中区域最多显示一个短标签。现有 MVP 没有系统必检来源，本轮不伪造“本次必检”；接口预留 `requiredRegionIds`，为空时全部显示为“我想关注”。保持现有一至六区多选，不擅自限制为两区。

## 页面与组件

- `CameraStartPanel`：深森林绿预览容器、真实上传/保存说明、首次与日常简短提示。
- `CameraGuideOverlay`：椭圆引导、框外暖灰绿遮罩、单条稳定状态提示和拍摄按钮。
- `FaceRegionMap`：关键点区域绘制、无障碍名称、点击命中与标签。
- `RegionChoiceBar`：文字区域选项、选中数量和必检/关注语义。
- `AnalysisScanner`：保留照片、全图淡网格、当前区域扫描线、区域完成勾选和阶段文案。
- `ObservationResult`：先结论，再 1 至 2 项发现、照片证据、详细信息和完成操作；不展示分数、诊断、商品或护理建议。
- `ObservationActionBar`：安全区固定底栏，主次操作不遮挡内容。

扫描阶段由真实目标状态推导：刚保存为“正在检查照片质量”，目标 queued 为“正在定位区域”，processing 为“正在读取皮肤表现”，全部完成后为“正在生成分析结果”。没有后端百分比时不显示虚假百分比。多个区域按固定区域字典顺序展示。减少动态效果时关闭持续扫描，只保留轮廓亮度和阶段文字。

## 结果信息结构

结果不产生新医学或评分字段。自然语言结论从现有区域事实中确定性整理，例如“右脸颊已完成观察，有两项可见信息值得留意”。重点发现优先使用 `summary`、`daily_appearance`、`coverage` 和 `unknowns`，最多两项。区域多边形作为“本次观察范围”证据，不伪装成 AI 精确病灶定位；当前后端没有问题坐标时，不绘制虚假的不规则病灶。

“今日建议”不展示。主按钮为“完成”，预留但禁用“查看昨日对比”，并明确尚未开放。记录在创建接口返回 `saved` 时已经自动保存，不再出现“保存照片”。

## 视觉与无障碍

观察流程新增可复用语义 token，映射现有产品色：背景 `#F8F0DD`、主操作 `#71813C`、品牌/选中 `#9BAD50`、正文 `#46502C`、柔白 `#FFFDF7`、少量陶土提示色。普通页面不使用阴影墙，浮层和底部操作区才有克制阴影。

所有操作不小于 44pt；状态同时使用文字、图标和边界；图片区域提供区域无障碍名称；页面适配顶部/底部安全区；动画只使用 opacity 和 transform，并读取系统减少动态设置。

## 参考图映射

- `ref-nura-01-camera-idle.jpg`：拍摄启动容器、隐私层级和单一主按钮。
- `ref-nura-02-camera-guide.jpg`：椭圆引导与底部半透明状态条。
- `ref-nura-03-ai-scanning.jpg`：原照片、淡网格、扫描线和阶段式文案。
- `ref-nura-04-result.jpg`：结论优先、重点发现与渐进式详情；删除分数和商品推荐。
- `ref-perfectcorp-01-callouts.jpg`：单个当前区域的短引导线和标签。
- `ref-perfectcorp-02-cheek-zones.jpg`：照片上的直接点击区域和克制虚线边界。
- `ref-glowupface-zone-map.webp`：仅参考贴合脸型的不规则轮廓，不使用其黑底、黄色和医学化表达。

## 验证

自动化覆盖状态转移、提示优先级、重复提交保护、质量端点、区域多边形、坐标映射、左右方向、文字/照片双向选区、阶段映射、结果整理、错误保留和减少动态分支。完成后运行后端完整 pytest/Ruff、移动端完整 unit/typecheck/lint，并用本地后端执行一条合成照片质量预检和 observation HTTP 闭环。真实相机、不同脸型和遮挡准确度仍需物理设备专项验收，不用模拟结果冒充。
