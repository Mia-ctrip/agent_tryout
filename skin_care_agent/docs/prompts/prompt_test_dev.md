你现在要在当前代码仓库中开发一个独立的内部调试工具：

Skin Care Vision Prompt Lab

它不是正式产品，而是专门用于快速调试 Skin Care 项目的视觉 LLM Prompt 的本地实验工具。

请先阅读当前仓库结构和已有代码，尤其检查是否已经存在 GLM-4.6V / GLM Vision / OpenAI-compatible multimodal API 的调用实现、配置方式、环境变量、adapter/client 等代码。

如果已有可复用实现，优先复用或抽取，不要重新发明一套不兼容的调用逻辑。

如果当前仓库没有现成实现，则按下面定义实现一个最小、清晰、可替换 provider 的 GLM client。

不要先写设计文档让我确认。
不要问我一堆澄清问题。
直接检查代码 → 制定最小实现方案 → 开发 → 本地验证。

==================================================
一、这个工具解决什么问题
==================================================

我正在开发一个 Skin Care App。

视觉模型主要有三个实际使用场景：

1. 对当天单张皮肤照片的指定面部区域进行中性、可见事实分析
2. 对两个不同时间点的皮肤照片进行变化对比
3. 对一段观察历程中的多张皮肤照片组成的时间轴进行趋势总结

我现在需要频繁调试：

- system prompt
- user prompt
- 图片输入
- 图片顺序
- 时间信息
- 模型参数

目前调试成本太高。

这个工具的目标是把一次实验压缩成：

贴入图片
→ 编辑 System Prompt
→ 编辑 User Prompt
→ Run
→ 直接查看结果
→ 修改 Prompt
→ 再 Run

并且自动保存每一次实验，方便以后复现、比较和恢复。

这是内部 Prompt Lab，不是用户产品。

优先级：

调试效率 > UI 精致程度 > 通用性 > 工程复杂度

==================================================
二、技术栈
==================================================

前端：

React
TypeScript
Vite

后端：

Python
FastAPI

持久化：

本地

图片：

保存在本地目录，例如：

data/images/

数据库例如：

data/prompt_lab.md

不要引入：

- 用户系统
- 登录
- 权限系统
- Redis
- PostgreSQL
- MQ
- 对象存储
- 云部署
- Kubernetes
- 微服务
- Docker Compose
- 复杂状态管理框架

V1 必须可以直接本地运行。

目标开发体验类似：

frontend:
npm install
npm run dev

backend:
pip install -r requirements.txt
uvicorn app.main:app --reload

如果仓库本身已有统一启动方式，可以融入现有方式。

==================================================
三、项目位置
==================================================

优先在当前 repo 中创建一个边界清晰的独立工具目录，例如：

tools/vision-prompt-lab/

建议结构：

tools/vision-prompt-lab/
  frontend/
  backend/
  data/
  README.md

如果根据现有仓库结构有更自然的位置，可以调整，但不要把 Prompt Lab 的代码散落到正式 Skin Care App 各模块中。

==================================================
四、前端整体布局
==================================================

页面名称：

Skin Care Vision Prompt Lab

顶部使用三个 Tab：

[ 单图观察 ] [ 双图对比 ] [ 时间轴趋势 ]

三个 Tab 共用同一个页面骨架。

不要实现三个完全重复的独立页面。

整体布局推荐桌面双栏：

--------------------------------------------------
Skin Care Vision Prompt Lab

[ 单图观察 ] [ 双图对比 ] [ 时间轴趋势 ]
--------------------------------------------------

左侧：
图片输入
场景元数据
System Prompt
User Prompt
Model Config

右侧：
模型 Output
Raw Response
Final Request

底部或侧边：
Run History

--------------------------------------------------

重点针对桌面浏览器即可。
不需要为了手机端投入大量时间。

UI 保持简洁、干净、工具化。

==================================================
五、Tab 1：单图观察
==================================================

输入内容：

- 一张图片
- 支持点击选择文件
- 支持 drag & drop
- 强烈建议支持 Ctrl+V / Cmd+V 直接粘贴剪贴板图片
- region 输入

region 先不要做复杂的人脸区域选择器。

直接提供一个 select 或文本输入即可。

默认候选：

chin
left_cheek
right_cheek
forehead
nose
mouth_area
full_face
custom

允许填写 custom region。

页面字段：

Image
Region
System Prompt
User Prompt
Temperature
Max Tokens
Run

==================================================
六、Tab 2：双图对比
==================================================

界面明确区分：

Earlier
Later

例如：

Earlier
Date: 2026-09-01
[ image ]

Later
Date: 2026-09-18
[ image ]

并提供：

Region
System Prompt
User Prompt
Temperature
Max Tokens

禁止单纯依赖“上传顺序”表达时间含义。

时间信息必须显式进入前端数据模型，并且最终被 assembler 明确传递给模型。

上传图片后允许：

- 替换
- 删除

V1 不需要复杂图片编辑。

==================================================
七、Tab 3：时间轴趋势
==================================================

实现一个非常轻量的 Timeline Editor。

结构类似：

Observation Timeline

2026-08-20
[ image ]

2026-08-27
[ image ]

2026-09-05
[ image ]

[ + 添加时间点 ]

每个时间点：

- date
- image
- remove

允许添加多个时间点。

最低支持 2 张。
不要人为限制在 3 张。

时间点按照日期排序。

可以允许手动改变 date。

暂时不要加入：

- 护肤产品
- 生活因素
- 饮食
- 睡眠
- 用户文字日记
- 因果信息

这个 V1 只调试：

multiple images + dates → visual trend

同时提供：

Region
System Prompt
User Prompt
Temperature
Max Tokens

==================================================
八、前端公共组件
==================================================

三个 Tab 尽量复用公共组件，例如：

PromptEditor
ImageUploader
ModelConfig
ResponseViewer
RequestViewer
RunHistory
PromptPresetSelector
RunButton

场景差异只存在于：

SingleImageInput
PairImageInput
TimelineImageInput

不要复制三份 PromptEditor、ResponseViewer、模型配置等代码。

==================================================
九、Prompt Editor
==================================================

每个场景都有：

System Prompt

User Prompt

使用较大的 textarea/editor。

必须保证：

- 多行输入体验正常
- 不自动修改我的 Prompt
- 不自动 trim 掉有意义的换行
- 不偷偷在前端增加额外 instruction

Prompt Editor 中看到什么，最终 assembler 使用的就应该是什么。

后端如果为了组装图片信息、日期、region 等必须增加结构化内容，最终一定要在 Final Request 中完整可见。

==================================================
十、Prompt Preset
==================================================

三个场景分别维护自己的 Prompt Preset。

例如：

Single:
baseline
strict-visible-facts-v1
current-best

Pair:
baseline
trend-v1
current-best

Timeline:
baseline
timeline-v1
current-best

必须支持：

- 保存当前 System Prompt + User Prompt 为 preset
- 给 preset 命名
- 加载 preset
- 更新已有 preset
- 删除 preset

preset 至少包含：

scenario
name
system_prompt
user_prompt
created_at
updated_at

就存本地。

不需要复杂版本管理系统。

==================================================
十一、模型配置
==================================================

V1 主要调用：

GLM-4.6V

Model Config 至少包含：

model
temperature
max_tokens

model 默认 GLM-4.6V。

如果当前 API 实际模型 ID 和展示名不完全一致，以现有调用代码 / 环境配置为准。

前端不要硬编码过多 provider 细节。

==================================================
十二、后端统一 API
==================================================

不要写三套完全独立的推理接口。

统一使用类似：

POST /api/inference

前端向后端提交统一的实验结构。

逻辑模型类似：

{
  "scenario": "single | pair | timeline",

  "systemPrompt": "...",
  "userPrompt": "...",

  "region": "chin",

  "images": [
    {
      "clientId": "img_1",
      "date": "2026-09-18"
    }
  ],

  "modelConfig": {
    "model": "glm-4.6v",
    "temperature": 0.1,
    "maxTokens": 1500
  }
}

由于包含真实图片，具体 HTTP transport 可以使用：

multipart/form-data

例如：

metadata = JSON
images = files[]

不强求完全照搬上面的 JSON wire format。

但后端内部领域模型必须统一。

==================================================
十三、后端调用链
==================================================

代码职责清晰拆分为：

Frontend request
↓
Request DTO
↓
Scenario Assembler
↓
GLM Request Builder / Adapter
↓
GLM Client
↓
Raw provider response
↓
保存 Run
↓
返回前端

例如概念模块：

app/
  api/
    inference.py

  schemas/
    inference.py

  services/
    inference_service.py

  assemblers/
    scenario_assembler.py

  providers/
    glm/
      client.py
      adapter.py

  repositories/
    run_repository.py
    prompt_repository.py

不用为了符合这个目录而机械复制。
根据实际项目合理组织即可。

关键是：

业务场景组装
和
GLM provider-specific request 格式

必须解耦。

==================================================
十四、三个 Scenario Assembler
==================================================

实现：

SingleScenarioAssembler
PairScenarioAssembler
TimelineScenarioAssembler

职责是把：

prompt
region
dates
image order

组装成最终模型能够明确理解的 multimodal messages。

必须保证：

Single：

明确告诉模型当前 region 和对应图片。

Pair：

必须明确表达：

image_1 = earlier
date = xxx

image_2 = later
date = xxx

禁止仅依赖图片数组顺序推测 earlier / later。

Timeline：

必须明确表达：

timepoint_1
date
image

timepoint_2
date
image

...

顺序按日期升序。

==================================================
十五、GLM Client
==================================================

API Secret 必须只存在后端。

通过 .env 配置。

例如：

GLM_API_KEY=
GLM_BASE_URL=
GLM_MODEL=

不要把 Key 暴露到 React。

如果仓库已有 GLM 配置方式，沿用当前项目。

优先复用已有 GLM Client。

如果需要新建：

把 provider 细节封装在：

providers/glm/

未来可以较容易替换：

GPT
Gemini
Claude
Qwen

但不要为了未来扩展提前实现这些 provider。

现在只实现 GLM。

==================================================
十六、非常重要：Final Request
==================================================

这是 Prompt Lab 的核心功能之一。

每次调用完成后，前端必须可以查看：

Output
Raw Response
Final Request

Final Request 必须反映：

后端实际发送给 GLM 的最终 messages/request。

包括：

- 最终 system message
- 最终 user message
- region 信息
- 日期信息
- 图片排列顺序
- model
- temperature
- max_tokens
- multimodal content 顺序

但是：

绝对不要返回或显示 API Key。

如果图片最终转换为巨大 base64：

不要在浏览器里渲染几十 MB base64。

Final Request 展示时可以替换成：

"<base64 image omitted: image/jpeg, 382 KB>"

但是：

文本结构
content 顺序
image 所在位置

必须和真实请求一致。

我要能通过 Final Request 判断：

“我在前端写的 Prompt，后端到底组装成了什么”。

==================================================
十七、Response 区域
==================================================

右侧提供至少三个视图：

Output
Raw Response
Final Request

Output：

优先展示模型实际生成的文本 / JSON 内容。

如果模型输出 JSON：

使用格式化 JSON 展示。

Raw Response：

保存并展示 provider 原始响应。

Final Request：

展示实际请求的 sanitized representation。

同时显示本次调用：

latency
input tokens
output tokens
total tokens

如果 GLM provider 没有返回某项 usage：

显示 N/A。

不要为了计算 token 自己瞎估算后冒充 provider usage。

==================================================
十八、Run History
==================================================

每次执行必须自动保存。

保存内容至少包括：

id
created_at
scenario

system_prompt
user_prompt
region

image metadata
image local path

model
temperature
max_tokens

final_request_sanitized
raw_response
output

latency_ms
input_tokens
output_tokens
total_tokens

用yaml或者xml或者txt或者md的方式 存 metadata。

图片存：

data/images/


Run History UI：

显示最近运行记录，例如：

14:31  single    glm-4.6v
14:28  pair      glm-4.6v
14:22  timeline  glm-4.6v

点击某条 Run 后：

恢复这次实验的：

- 图片
- 日期
- region
- prompts
- model config
- response
- request

让我可以重新查看这个实验。

==================================================
十九、Duplicate & Run
==================================================

Run History 中提供：

Duplicate

点击后：

将历史实验完整复制回当前编辑器。

包括：

图片
日期
region
System Prompt
User Prompt
Model Config

但是不要直接发送请求。

用户可以修改一句 Prompt 后再次 Run。

目标使用体验：

Run 132
→ Duplicate
→ 改一句 Prompt
→ Run 133

==================================================
二十、图片存储与去重
==================================================

V1 使用本地图片目录即可。

为了避免我对同一张图片重复 Run 20 次就存 20 份：

建议根据文件内容 hash，例如 SHA-256，做简单去重。

例如：

data/images/{sha256}.jpg

数据库保存引用。

如果实现成本明显增加，可以先简单实现，但不要因为 Run History 导致大量明显重复文件。

==================================================
二十一、数据库
==================================================

本地存储的调用记录 至少需要：

runs
prompt_presets

图片如果需要独立 metadata table 可以增加。

请使用轻量方式保存。

不需要 Alembic 这种复杂 migration infrastructure，除非当前项目本来就在使用。


==================================================
二十二、错误处理
==================================================

必须处理几个常见场景：

- API Key 未配置
- GLM API 请求失败
- 网络错误
- timeout
- provider 返回 4xx
- provider 返回 5xx
- 图片格式不支持
- 图片过大
- timeline 缺少图片
- pair 缺 earlier / later
- invalid date
- JSON parse failure

前端不要只显示：

Something went wrong

尽量显示：

HTTP status
provider error message
request id（如果有）

但不要泄露 secret。

==================================================
二十三、不要做的事情
==================================================

这是非常重要的 scope 限制。

V1 不要开发：

账号
登录
注册
RBAC
多人协作
云同步
公网部署
Redis
PostgreSQL
S3
OSS
Kubernetes
Docker Compose
CI/CD 大工程
复杂 dashboard
Prompt 自动优化
LLM 自动打分
AI Judge
图片标注系统
测试数据集管理平台
模型排行榜
AB Test 平台
正式 Skin Care App UI
医学诊断系统

不要自作主张把它变成完整的“LLMOps 平台”。

这是一个个人本地 Prompt 调试工具。

==================================================
二十四、UI 细节
==================================================

UI 风格：

清晰
轻量
开发工具感
信息密度适中

不需要模仿正式 Skin Care App 的自然护肤视觉风格。

这是工程调试工具。

重点保证：

图片能看清
Prompt 好编辑
Response 好看
JSON 好读
History 好用

图片可以显示缩略图。

点击可查看较大预览。

Prompt 编辑区域不要太矮。

Response 区域建议允许 copy。

Final Request 建议允许 copy。

==================================================
二十五、开发顺序
==================================================

请按照能够最快形成可用闭环的顺序开发。

优先保证：

单图
→ GLM 调用
→ Response 展示
→ Final Request 展示

闭环先跑通。

然后增加：

双图
时间轴
History
Preset
Duplicate

不要先花时间装修 UI。

==================================================
二十六、测试
==================================================

至少为后端 Scenario Assembler 写基础测试。

必须验证：

single 图片和 region 顺序正确

pair：
earlier / later 语义正确
日期正确
图片顺序正确

timeline：
按日期排序
日期和图片没有错位

还要验证：

API Key 不会进入 sanitized Final Request。

前端完成后至少：

npm build

后端至少：

pytest

如果当前环境支持，实际启动前后端做一次 smoke test。

不要假装测试通过。
实际执行测试命令并修复明显问题。

==================================================
二十七、README
==================================================

写一个简短、实用 README。

只需要包含：

项目用途
目录结构
环境变量
后端启动
前端启动
GLM 配置
SQLite / 图片保存位置

不要写几十页设计文档。

例如提供：

.env.example

不要提交真实 API Key。

==================================================
二十八、完成标准
==================================================

完成后我应该能够做到：

打开浏览器

进入 Single Tab

Ctrl+V 粘贴一张皮肤照片

填写：

region = chin

贴入 System Prompt

贴入 User Prompt

点击 Run

看到：

模型 Output

Raw GLM Response

实际发送出去的 Final Request

latency

token usage

然后：

修改 Prompt

再次 Run

两次实验都自动进入 History。

我也能：

切换到 Pair

上传 Earlier / Later 两张照片

设置日期

测试趋势 Prompt。

还能：

切换 Timeline

添加 3~10 个不同日期的图片

运行多时间点趋势 Prompt。

关闭程序重新启动以后：

历史 Run 和 Prompt Preset 仍然存在。

==================================================
二十九、工程原则
==================================================

请始终记住：

这是一个我马上就要使用的实验工具。

不要追求“企业级架构”。

代码应该：

短
清晰
可读
容易修改
容易 debug

不要为了抽象而抽象。

但以下边界必须清楚：

UI
Scenario Assembly
Provider Adapter
Provider Client
Persistence

尤其不要把：

Prompt 拼装
GLM HTTP 请求

全部写进一个巨型 FastAPI endpoint。

==================================================
三十、开始执行
==================================================

现在：

1. 检查当前 repo。
2. 找出现有 GLM / Vision API 相关代码和配置。
3. 确定最小目录结构。
4. 直接开始实现。
5. 优先跑通 Single Image 的完整链路。
6. 再完成 Pair / Timeline。
7. 加入 Run History / Preset / Duplicate。
8. 执行测试和 build。
9. 最后告诉我：
   - 创建/修改了哪些主要文件
   - 如何启动
   - GLM API Key 配在哪里
   - 数据保存在哪里
   - 目前有哪些已知限制

除非遇到真正无法继续的外部依赖问题，否则不要中途停下来让我确认。