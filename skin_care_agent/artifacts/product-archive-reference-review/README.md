# 产品档案视觉核验

参考：`design/ui-rebuild/products/reference/final.png`。

- `products-reference-430.png`：430×764 Web 预览，使用独立测试数据对齐参考的两张卡片，不写入真实账号。
- `android-final.png`：1080×2400 Pixel 8 / Expo Go 实际截图，沿用真实账号产品、图片、使用次数及日期。右上角圆形齿轮为 Expo 开发浮层，不属于页面。
- `product-edit-390.png`、`product-detail-edited-390.png`：隔离 Web 数据的自建产品编辑页，以及移除图片并改名后的详情页。
- `products-{320,375,390,430}.png`：多屏宽四产品列表；其余截图覆盖长名称、滑动、图片错误/恢复和已有详情/新增入口。
- `review-results.json`：Web 隔离检查结果。文件中的原生待验证标记是共享脚本的固定输出；本次 Android 目视检查另见上述真实截图，iPhone 未检查。

已按参考修正背景取景、28% Ground 遮罩、标题层级、24dp 页边距、16dp 圆角、80% Surface 卡片和底部导航。背景图未经编辑，打包副本与用户源文件 SHA-256 同为 `780C6B1B614A73066F7FB5DF245C9F87544C2CA51E651B7E505315292BCD7DB1`。

平台安全区、字体光栅化、原始产品图片及真实使用日期会与参考图存在差异。产品图与日期仍保持真实数据。

验证命令（`mobile` 目录）：

```text
npm run typecheck
npm run lint
npm run test:unit
node scripts/ui-visual-review.mjs --products-only
```

结果：类型检查、lint、254 项单测和全部产品 Web 检查通过；无横向溢出及 JavaScript 运行错误。既有详情/新增、滑动归档提示、失败后自动及手动图片恢复、签名过期补签均通过。
