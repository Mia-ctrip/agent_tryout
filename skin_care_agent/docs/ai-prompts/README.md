# 运行时 AI Prompt 导出

> 导出日期：2026-09-17
>
> 代码基线：`main` @ `921eaf9`（2026-09-16）
>
> 性质：**派生产物，不是信息源**。内容由 `backend/app/services/` 下的 Python 常量导出，代码是唯一权威。修改 prompt 必须改代码并递增版本号，然后同步本目录；不要反过来先改文档。

## 这个目录装什么

后端调用 AI 时实际发出的 prompt 全文。与 `docs/prompts/` 区分：`docs/prompts/` 装的是给开发者的实施任务提示词，本目录装的是发给模型的运行时 prompt。

| 文件 | 对应调用 | 输入 |
|---|---|---|
| `region-observation.md` | 区域观察（当前 MVP 主路径） | 原图 + 单个区域 ID |
| `full-face-observation.md` | 全脸观察 | 原图 |
| `vision-analyze.md` | 整图 vision 分析（旧路径） | 原图 |
| `chat-qa.md` | 文字问答（**不含图片**） | 纯文本 |

## 代码对应关系

| 文档 | 常量来源 | 版本号 | 调用点 |
|---|---|---|---|
| `region-observation.md` | `backend/app/services/region_observation_prompt.py` | `region-observation-1.1.0` | `backend/app/services/region_analysis_service.py` `analyze_region_photo()` |
| `full-face-observation.md` | `backend/app/services/full_face_prompt.py` | `full-face-observation-1.2.0` | `backend/app/services/full_face_analysis_service.py` `analyze_full_face_photo()` |
| `vision-analyze.md` | `backend/app/services/ai_gateway/prompts.py` | `vision-2.0.0` | `backend/app/services/analysis_service.py` |
| `chat-qa.md` | `backend/app/services/ai_gateway/prompts.py` | `chat-1.0.0` | `backend/app/services/chat_service.py` |

三份图片 prompt（region / full-face / vision）都走同一个 gateway 路由名 `"vision_analyze"`。Provider 层不做任何消息改写，`system` 与 `user` 原样透传（`backend/app/services/ai_gateway/providers/openai_compat.py` `_build_payload()`），图片以 data URL 附在 `user` 消息上。

## 导出时发现的两处问题

### 1. 区域 prompt 里硬编码了“口周”约束

`region_observation_prompt.py` 的一段约束写死了口周场景：

```
即使所选区域是口周，也只观察嘴唇外缘周围的皮肤和法令纹区域内的皮肤；不得分析或描述唇色、
唇纹、唇毛、胡须、嘴唇形态、唇炎等嘴唇疾病，也不得评价眼睛、鼻形、嘴型、脸型或其他五官与外貌。
```

这段无论 `region_id` 是 `forehead` 还是 `chin` 都会原样发出。对非口周区域是无效指令，且“口周”与 `mouth_area` 的 `direction_note`（“嘴唇、嘴角及周围范围”）本身还略有出入——prompt 要求只看“嘴唇外缘周围”，区域定义写的是“嘴唇、嘴角及周围范围”。建议改成只在 `region_id == "mouth_area"` 时拼接。

### 2. vision 路径与 region/full-face 路径的合规范式互相冲突

`vision-analyze.md` 的输出仍要求模型使用 `痤疮`、`papule`、`pustule`、`nodule`、`cyst` 等词，并给出 `overall_severity` 1-10 评分与 `needs_doctor` 判断；而 region / full-face 两份 prompt 明确禁止疾病分类、严重度和评分，只允许中性可见外观词。

对应地，确定性合规改写器 `backend/app/services/ai_gateway/compliance.py` 只挂在 vision 路径上，region/full-face 走的是各自的 sanitizer。两条范式目前并存于同一路由名下。

若 vision 路径仍在产品中使用，它与 MVP “只记录中性可见事实”的边界不一致；若已废弃，建议确认无调用方后移除，避免误用。**这一条是导出时的观察，不构成结论——需要按 `design/product/skin_care_app_mvp_spec.md` 判定后再动代码。**

## 维护方式

改动任一份 prompt 时：

1. 修改对应 Python 常量，递增同文件里的 `*_VERSION`；
2. 同步本目录对应 `.md` 的正文与版本号；
3. 更新本文件表里的版本号与基线提交。

重试消息是**追加**一条 `user` 消息，不替换原消息，且同一 provider binding 只重试一次（`_schedule_validation_retry()` / `_retry_request()`）。
