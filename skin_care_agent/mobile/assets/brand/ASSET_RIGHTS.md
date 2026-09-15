# 品牌影像登记

2026-09-07：使用内置 imagegen 为本项目原创生成，两张图片已经检查并接入观察首页。
没有输入第三方参考图，没有复制交接包图片。只用于品牌拼贴，不能作为用户皮肤证据或产品包装。

| 文件 | 来源 | 用途 | 检查 |
|---|---|---|---|
| natural-light-v1.png | 本会话 imagegen 原创生成 | 首页主图：自然光、亚麻、手持绿枝 | 无文字、商标或可识别人脸 |
| leaf-water-v1.png | 本会话 imagegen 原创生成 | 首页圆形辅图：叶片与水面 | 无文字或商标 |
| product-glass-still-life-v1.png | 2026-09-11 内置 imagegen 原创生成 | 首轮摄影底纹，已被 v2 插画替换，保留供比较 | 无文字、商标或真实产品 |
| product-still-life-illustration-v2.png | 2026-09-11 内置 imagegen 原创生成 | 当前产品页：右上大幅主底纹与列表两侧局部淡纹 | 无标签或品牌；PNG 透明角点已验证，不含矩形背景 |

授权来源：本次用户要求按交接包实施 UI，交接包允许为本产品生成原创品牌素材；未引入第三方摄影许可。
素材随 UI 一起由用户作上线前视觉审核，不宣称第三方版权审查或商标清查已完成。

## 生成提示

主图：Original square editorial natural-light photograph. Anonymous linen-clad person cropped at shoulder and waist, hand holding a small green branch, blurred moss-green garden, warm natural light, matte analog texture, negative space at lower left. No face, cosmetic product, text, logo, watermark or UI. No reference images.

辅图：Original square photograph of overlapping dark olive and sage leaves by rippling water, reflected late-afternoon light, gentle lateral camera movement, shallow focus, subtle film texture. No people, products, text, logo, watermark, borders or UI. No reference images.

图像原始生成文件保留在工具输出目录；本目录是应用使用的独立副本。

## 产品档案底纹 · 2026-09-11

用户确认本次方案后生成；三张用户参考图仅用于理解材质、留白和柔光，没有作为输入图片复制或编辑。使用内置工具，无 CLI/API 回退。人工检查了瓶口、液面、叶影及左侧标题留白；不作为真实包装或用户证据使用。

首轮摄影底纹提示词（已不在页面使用）：

Use case: photorealistic-natural. Asset type: original decorative background for a quiet botanical skincare app header, landscape 1536x1024. Refined editorial still life photographed through thin translucent vellum in warm diffused daylight. Composition: LEFT 62 percent is almost empty flat warm ivory #F7F1E1, no objects or visible hard lines in this text-safe area. On RIGHT edge only, a cropped unbranded transparent glass bottle with a short delicate neck, finely resolved thick glass rim, softly curved shoulders, a little pale honey liquid and subtle refraction. Behind it a much softer indistinct container silhouette. At far upper right just a faint out-of-focus olive leaf shadow. Glass catches broad soft light; physically plausible gentle tonal transitions, fine analog grain barely visible, matte atmosphere, refined Japanese editorial still-life photography, restrained asymmetry. Pale ivory, muted sage, pale honey, no strong contrast. Objects should fade naturally into the warm ivory background near the left and bottom edges. NO labels, no brands, no typography, no logo, no watermark, no interface, no text, no collage borders. No vector outlines, no cartoon shapes, no shiny 3D render, no dark hard shadows. This image provides atmosphere only and depicts NO actual catalog product. Photographic detail and material subtlety should feel like fine translucent glass, not a generic bottle drawing.

## 淡彩器物插画 v2 · 2026-09-11

按用户验收反馈改为绘画、清晰轮廓与透明背景。使用内置 imagegen 从文字描述原创生成，无图片输入。首次接入为标题旁的小幅 Strong 插画，已按三轮确认调整为连续大幅底纹：右上 320px、22% 不透明度，列表两侧 360/400px、whisper 8%。22% 是用户确认的 18%–24% 主图区间内的局部构图值，不更改全局主题档位。仅使用界面布局缩放、旋转与页面边缘裁切，PNG 内容未改动；图层始终位于真实包装与文字后方，不带底板或模糊滤镜。

最终提示词：

Use case: illustration-story. Create a refined small editorial STILL LIFE ILLUSTRATION, a cutout PNG with genuinely transparent alpha background, square canvas. Subject: three unbranded skincare vessels arranged as a relaxed asymmetrical overlapping composition, clear silhouettes recognizable at 150px wide. One tall honey-ochre translucent pump bottle behind on the right, one shorter rectangular translucent glass bottle with a muted sage cylindrical cap leaning gently at the left, and one small ivory cream jar low in front. A spare olive twig with two elongated leaves extends toward the upper right. Medium: sophisticated hand-painted gouache and colored-pencil illustration, pale layered pigment and translucent washes, fine irregular pencil contour, subtle printed texture confined WITHIN objects. The forms have careful bottle shoulders, necks, caps, glass rim and liquid level details, but read as DRAWN AND PAINTED, never photographic, never CGI. Colors muted warm honey, sage olive, sandy beige, tiny terracotta hint. Keep outlines moderately legible and shapes distinct, not blurred. Harmonious quiet botanical editorial art. No heavy black outline, no cartoon faces. Composition uses organic edges and breathing room; all objects entirely within canvas, leave transparent padding on all four sides. No surrounding wash, no ground plane, no backdrop, no paper rectangle, no border, no frame, no drop shadow, no photographic lighting. Background MUST be fully transparent, do not paint a white or beige background or checkerboard. No words, text, labels, brands, watermarks or logos anywhere. Original shapes, do not copy any branded packaging. This small painting will sit beside a Chinese page title on a warm ivory app page.
