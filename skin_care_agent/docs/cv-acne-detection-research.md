---
name: cv-acne-detection-research
description: 痤疮/痘痘识别 CV 模型调研结论——MVP 阶段无稳定开箱即用方案，继续用 LLM + MediaPipe 预处理，未来用自训模型替代
metadata:
  type: reference
  last-updated: 2026-07-03
  status: 待 deep-research workflow 完成后可能更新
---

# 痤疮识别方案调研结论（2026-07-03）

> **状态说明（2026-07-20）**：本文的视觉模型调研结论仍作为技术参考；文中微信小程序表述属于撰写时的早期平台背景。当前客户端路线为 React Native + Expo SDK 57 App，最新进度见 [`../project_background.md`](../project_background.md) 和 [`../backend/dev_notes.md`](../backend/dev_notes.md)。

## 一、问题背景

项目 skin_care_agent（当前为 iOS / Android App；本文撰写时仍按微信小程序设想）识图方案：
- **后端 LLM 视觉模型**：MiniMax-M3 / Qwen-VL / GLM-4V（v2 patch schema，输出 JSON 含 patch bbox / coverage / dominant_type / estimated_count）
- **每次分析成本**：5-10 分钱
- **痛点**：每次调用 5-10s 慢、结果稳定性受 LLM 抽风影响、重度用户融合成片时数不准

用户询问：市面上有没有**稳定可直接用**的 CV 小模型替代或补充 LLM？

## 二、调研现状（基于经验判断，待 deep-research 验证）

### 开源方案（GitHub / HuggingFace / Roboflow）

| 方案 | 状态 | 备注 |
|---|---|---|
| **ACNE04 数据集 + YOLO 微调** | ❌ 不可直接用 | 1457 张图，GitHub 上有几个项目但 Star 数低、维护差、权重经常挂 |
| **HuggingFace 上搜 "acne detection"** | ❌ 学生项目居多 | 多数是毕业项目，无生产验证，权重可能失效 |
| **Roboflow Universe 痤疮数据集** | ⚠️ 通用性差 | 能一键训练，但跨肤色/光照准确率暴跌，需重训练 |
| **论文 2023-2025 开源实现** | ❌ 多数权重丢失 | "声称开源但实际链接失效"是普遍现象 |

### 商业 API（国内）

| 厂商 | 状态 | 备注 |
|---|---|---|
| 腾讯云/阿里云/百度智能云 | ❌ 无痤疮识别 API | 有"肤质检测"但输出不带 bbox，无痘痘精确定位 |
| 美图开放平台 | ⚠️ 有，但贵+不透明 | "MTlab 肌肤检测 API" 可给痘痘打分，但商用授权贵，价格不透明 |
| 医疗级 AI 公司（透彻/推想） | ❌ 不做小程序供应商 | 面向医院端 |
| 一体化消费级 App（你今天真好看/美图 AI 测肤） | ❌ 无公开 API | 产品内嵌，不对外供 |

### 中文数据集/亚洲皮肤专门模型
- **无稳定开源方案**。亚洲皮肤痤疮检测是长尾需求，没有像 ImageNet 级别的大数据集

## 三、核心结论

**MVP 阶段继续用 LLM 视觉模型做识图，CV 只用于预处理**。理由：
1. 没有一个"pip install + 一行调用"级别的稳定痤疮 CV 方案
2. 商业 API 要么不存在、要么贵、要么不透明
3. LLM 视觉模型虽贵但**开箱即用、输出结构化 JSON、跨肤色鲁棒**
4. 痤疮识别是长尾场景，开源数据集规模小，训练出的模型泛化差

## 四、项目内的具体落地（已规划）

**Task #4：vision 模块**
- 用 **MediaPipe** 做人脸对齐（固定姿态/光照/距离）
- **眼部打码**：隐私 + 让 LLM 聚焦皮肤区域
- **面部裁剪**：去掉多余背景，降低 LLM 处理 token 数（对应 3b 阶段的压缩策略）
- **不引入痤疮检测 CV 模型**（理由如上）

**识别仍走 LLM**：
- 当前 `analysis_service.analyze_photo` → `gateway.invoke("vision_analyze")` 链路
- 已经实现了 fallback 链（minimax → qwen → glm → doubao）+ schema_guard + 合规词库 + 模板兜底 + needs_doctor 强判
- 稳定性由多层防护兜住，不依赖单一 LLM 输出

## 五、未来 CV 替代时机

**触发条件**（任一达成）：
1. 积累 **500-1000 张真实用户标注照片** → 微调 YOLOv8n 一个通用检测头
2. **LLM 输出弱监督标注**：LLM 每次输出的 acne_points / patches 做半监督数据 → 攒够后训专用 CV 模型
3. **出现新的开源方案**：GitHub/HF 上出现 Star > 1k、维护 > 18 个月、商用友好的痤疮检测模型

**替代路径**：
- 阶段 1：CV 预处理 + LLM 识图（现状）
- 阶段 2：CV 检测 bbox → LLM 只做分类和计数（混合方案）
- 阶段 3：CV 端到端检测 + 分类（需要 N=5000+ 标注）

## 六、相关文档

- `project_background.md` — 项目定位
- `skin_condition_labels.md` — 痘痘标签体系（v2 patch schema）
- `backend/dev_notes.md` Step #4 — vision 模块规划

## 七、避免重复问询

如果用户问以下问题，**直接引用本文结论**，不要重新调研：
- "痘痘识别能不能不用 LLM"
- "市面上有现成的痤疮检测模型吗"
- "ACNE04 开源模型能不能用"
- "CV 小模型替代 LLM 识别痤疮可行吗"
- "Task #4 的 vision 模块该怎么做"
- "商业 API 有痤疮识别的吗"

如需**更新**结论，等 deep-research workflow `w29ozlyoc` 完成后查看结果再修改本文件。
