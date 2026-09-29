# 历程三页视觉验收

参考：`design/ui-rebuild/trend/image.png`。2026-09-22。

## 用户验收后：脸图精修

最终原生截图：[face-refined-android.png](face-refined-android.png)。精修前：[thumbnail-home-android-after.png](thumbnail-home-android-after.png)。下方四宽 Web 截图也已更新。

沿用原 SVG 与六区逻辑，对照参考调整脸型、眉眼、鼻唇、耳颈、选区和标签。Android 原画布被拉长约 9%（892×1049），现按实测宽度得到正确高度（892×960），图形和点击标签等比对齐。主页之外的页面及记录逻辑未改动。

验证：254 项单测、typecheck、lint；四宽历程三页回归、区域路径越界/重叠均为 0、44px 最小点击框且无重叠。Pixel 8 + Expo Go 实际账号验证右脸颊进入正确时间线并返回，没有提交业务记录。iPhone 未运行。

原生比例回归：在历程分区主页取得 `adb shell uiautomator dump` 的 XML 后，在 mobile 下执行 `node scripts/verify-history-face-layout.mjs <XML路径>`。本次最终 dump 为 `face-android.xml`；修复前同一检查失败，修复后通过。

## 三页 Web 截图

| 页面 | 390px 截图 | 窄屏截图 |
| --- | --- | --- |
| 历程主页 | [history-390.png](history-390.png) | [history-320.png](history-320.png) |
| 这一段记录 | [timeline-390.png](timeline-390.png) | [timeline-320.png](timeline-320.png) |
| 对比观察 | [compare-390.png](compare-390.png) | [compare-320.png](compare-320.png) |

另有 375px、430px 截图、首个时间点和全脸模式截图。运行结果见 [review-results.json](review-results.json)。

复验：启动 `mobile` 中的 `npx expo start --web --port 8082`，再执行 `node scripts/ui-visual-review.mjs --journey-only`。

已目视检查标题、四栏导航、脸部分区与绿色选中态、五节点时间轴、四项同级记录卡、双图对比及纸面色调。自动检查覆盖时间点切换、当日产品使用隔离、产品详情跳转、对比返回保留选择、全脸切换、设置入口；四种宽度无文档横向溢出或运行错误，未发出业务写请求。

以上是隔离 Web 预览：示例时间点复用项目已有演示照片，文字与日期是测试数据，并非真实皮肤改善证据。应用对比展示两个时间点的已有事实，不根据产品使用生成疗效或因果判断。原有照片、区域 ID、本人真实左右、接口及记录写入保持不变。首轮未连接 Android 设备，后续原生缩略图验收见下文；iPhone 未运行。

## 用户验收后：真实缩略图修复

2026-09-22，Pixel 8 Android 模拟器 + Expo Go + 实际后端，使用已有 QA 账号记录，只读进入区域页面，未提交观察或上传照片。

- 原因：切换 COS 后，旧本地照片被错误签成云端 URL，原图请求 404，自动补签无效。现兼容原存储位置，新上传仍走 COS，保留签名访问控制。
- [修复前](thumbnail-android-before.png)：右脸颊时间线显示“照片暂不可用”；[修复后](thumbnail-android-after.png)：真实脸颊区域缩略图可见，后端图片 GET 200。
- [下巴复验](thumbnail-chin-android-after.png)：同一原图按不同保存区域裁切，没有串区。
- [主页复验](thumbnail-home-android-after.png)：四栏导航图标可见。记录卡图标也已恢复，均复用既有 Base64 SVG 编码。截图右上灰色齿轮是 Expo 开发工具浮钮。
- 后端 202 passed / 28 skipped（未启用数据库集成测试），移动端 254 passed，typecheck / lint / diff 检查通过。新增存储测试覆盖旧图签名及实际读取、签名校验、新图仍写 COS、本地副本删除。

现有两个区域各只有一个时间点，此次 Android 验收不包含多时间点比较；没有为验收伪造数据。历史照片的本地兼容依赖原文件仍在配置的本地存储目录，不会自动迁移到其他服务器。
