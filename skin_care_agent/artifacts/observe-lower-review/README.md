# 观察首页下半部分验收

2026-09-21。参考：`design/ui-rebuild/observation/image.png`。

后续按钮修订：用户明确授权主操作增加右箭头、相册入口改为“从相册导入原图”并加图片图标与描边。两行沿用共享 primary/secondary 的 52 单位高度和胶囊圆角，间距 8。最新 Android 截图为 `android-buttons.png`；Web `after-*.png` 已更新。主视觉和导航未改，类型检查、lint、254 项单测与四屏宽验证再次通过。下方锁定区域像素对比描述的是首轮下半部分调整，未把本次用户要求的按钮改动计作零差异。

- `android-top.png`：最终 Android 首屏。
- `android-lower.png`：最终 Android 下半部分；实际账号已有下巴、右脸颊两个当前区域。
- `android-before-top.png` / `android-before-lower.png`：修改前 Android 截图。
- `before-*.png` / `after-*.png`：320、375、390、430px Web 前后截图，仅使用隔离 API 数据。
- `observe-all-320.png` / `observe-empty-320.png`：六区域换行和无当前区域场景。
- `review-results.json`：Web 专项自动化结果，原生结果以本说明为准。

## 锁定区域

观察页从 AppScreen 开始至错误提示之前的 JSX，以及 screen 至 primaryActions 的样式，与修改前 Git HEAD 逐字相同；底部导航文件未修改。

使用 Pillow 对 Android 两张首屏做 RGB 像素差分：批准上半部分矩形 `(0,132,1080,1772)` 与底部导航矩形 `(0,2186,1080,2400)` 的 `ImageChops.difference(...).getbbox()` 均返回 `None`。排除顶部系统时间栏。参考图的下半部分层级已应用；上下文未增加照片、日期、边框或独立浮卡，产品行使用原有浅纸面与细线瓶子图标。

## 验证

后续标题修订：“正在观察”改为 700 字重，字号、字体、行高和间距未改；最新 `after-lower-390.png` 可查看加粗效果，四屏宽预览通过。本轮 Android 模拟器未连接，原生截图仍对应前一轮按钮修订。

在 mobile 目录执行：

```sh
npm run test:unit
npm run typecheck
npm run lint
node scripts/ui-visual-review.mjs --observe-only
```

254 项单测通过；类型检查与 lint 通过。视觉脚本需要本地 Expo Web 8082，沿用现有脚本的隔离 Chrome/API 夹具，不写入实际后端。四种宽度无横向溢出；检查摘要名称/数量、无历史内容、无上下文照片、历程入口、产品使用来源和返回、六区以及空态。

Android Pixel 8 / Expo Go 57 / 真实本地后端：当前区域行进入历程；产品使用打开并取消返回；相册原图入口打开系统选择器，取消后保留现有捕获页；主操作进入相机界面。未拍摄、上传或提交记录。最终仍停留在观察页。iPhone 未验收。
