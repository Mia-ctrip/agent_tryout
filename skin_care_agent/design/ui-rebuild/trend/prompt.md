Implement the final “历程” module UI based on the supplied reference image. You must refer to this pic as sample : D:\Mia\agent_tryout\skin_care_agent\design\ui-rebuild\trend\image.png and modify front code to make front display as similar as you can.

The supplied reference image is the visual source of truth.
Your task is to reproduce the design faithfully, not reinterpret it.

IMPORTANT
- This is a visual implementation / refinement task.
- Preserve existing business logic and navigation logic.
- Do not redesign unrelated screens.
- Do not replace the design with framework-default Material styling.
- Do not simplify or “improve” the visual language.
- Prioritize fidelity to the supplied reference.

==================================================
SCOPE
==================================================

Implement / refine the following 3 screens of the 历程 module:

1. 历程 (main page / skin map entry page)
2. 左脸颊 · 这一段记录 (timeline detail page)
3. 左脸颊 · 对比观察 (compare mode page)

All 3 screens must share one consistent visual language.

==================================================
GLOBAL VISUAL STYLE
==================================================

The overall tone should be:
- calm
- warm
- restrained
- archive-like
- skincare-focused
- elegant but not decorative-heavy

Do NOT make decoration the main focus.
The beauty should come from:
- typography hierarchy
- spacing
- line quality
- card proportion
- refined component styling
- soft material feeling

Avoid excessive background patterns.
Do not add extra flowers, leaves, stickers, or ornamental graphics beyond what is already implied by the reference.
Subtle visual accents are allowed, but information components should remain the visual priority.

==================================================
COLOR / MATERIAL DIRECTION
==================================================

Use a warm ivory / paper-like foundation with muted green accents.

Recommended palette direction:
- warm ivory background
- warm paper surface cards
- soft muted green selected states
- dark ink text
- muted secondary text

Cards should feel:
- matte
- paper-like
- softly elevated if needed
- very low contrast
- not glossy
- not glassmorphism

Avoid:
- pure white large surfaces
- hard black strokes
- heavy shadows
- shiny glass effects
- strong gradients

==================================================
SCREEN 1: 历程 (MAIN PAGE)
==================================================

This is the main page of the module, so it MUST have the bottom navigation bar.

Title:
- The page title must be “历程”
- NOT “皮肤地图”

Top section:
- title: 历程
- short subtitle under the title
- top-right settings icon
- segmented switch: “全脸 / 分区”
- “分区” is the selected state in the reference

Main visual:
- a refined face map as the core entry
- reproduce the current face-map implementation closely
- do not invent a new illustration style

The face drawing must be refined according to these rules:
1. more unified line quality
2. more natural region shapes
3. more balanced inner whitespace inside regions
4. clearer selected state
5. refined region hit areas / region framing

Region design rules:
- do not overfit real anatomical boundaries
- region boundaries should be clean, calm, and interaction-friendly
- actual clickable hit areas may be slightly larger than the visible region boundaries
- preserve the overall region logic from the supplied reference

Selected state:
- use muted green fill
- selected state should be more legible and clearer than the unselected regions
- selected state should remain soft and elegant, not loud

Under the face map:
- a “正在记录” section
- show lightweight list items for regions currently being tracked
- do NOT use real user photos in this list
- use simple dots or lightweight icons instead
- each list item should show:
  - region name
  - number of time points
  - latest date
  - chevron / navigation affordance
- example regions: 左脸颊, 下巴

Main page list role:
- this section is clickable and leads into the timeline page
- list should feel clean and editorial, not like a generic Android list

Bottom navigation:
- must be present on this page
- “历程” is the active tab
- preserve the 4-tab structure from the app

==================================================
SCREEN 2: 左脸颊 · 这一段记录 (TIMELINE PAGE)
==================================================

This is already a secondary page.
Do NOT embed another tertiary page inside it.

The page should directly show the complete content for the currently selected day/record.

Top:
- back arrow
- title: 左脸颊 · 这一段记录
- date range + number of time points under title

Timeline section:
- multi-time-point horizontal timeline
- based on the supplied reference
- show skin thumbnails across time
- selected item is clearly highlighted
- the timeline visually communicates change over time

Below the timeline:
- directly display the complete content of the selected record
- do not make the user enter another nested page to see the details

The record content card must include ALL of the following at the same level:
1. 照片中可见
2. 你的记录
3. 产品使用记录
4. 来源

Important:
- “产品使用记录” must NOT be rendered as a decorative banner outside the card
- it must be inside the main record card
- it should be visually at the same hierarchy level as:
  - 照片中可见
  - 你的记录
  - 来源

Product usage record:
- should visually indicate that it can navigate to the product page
- but still needs to show its content directly on this page
- example: 使用了 阿达帕林凝胶

The record card should feel complete and self-contained.

==================================================
SCREEN 3: 左脸颊 · 对比观察 (COMPARE MODE PAGE)
==================================================

This page is used to visualize whether the skin condition improved or worsened.

Top:
- back arrow
- title: 左脸颊 · 对比观察
- short helper text indicating that two time points are being compared

Compare mode behavior (for this design mock):
- assume two records are randomly selected from the timeline
- use the compare layout shown in the supplied reference

Main compare area:
- two images side by side
- left = earlier state
- right = more recent state
- each image has a date label and short status label below

Below:
- a comparison summary card
- card title: 对比观察
- a concise conclusion sentence, e.g.:
  - 整体泛红减轻，肤色更稳定。
- supporting rows / metrics underneath, such as:
  - 泛红程度
  - 肤色状态
  - 整体状态

The compare page should be clean and readable.
Do not over-decorate it.

==================================================
TYPOGRAPHY / SPACING / COMPONENT QUALITY
==================================================

Use a clear hierarchy:
- large elegant Chinese titles
- muted secondary metadata
- restrained body copy
- compact but breathable list rows
- soft rounded cards

Focus on:
- beautiful spacing
- clean alignment
- consistent icon style
- refined separators
- calm component rhythm

The UI should feel premium but understated.

==================================================
DO NOT
==================================================

- Do not rename “历程” to “皮肤地图”
- Do not remove the bottom navigation from the main page
- Do not embed a third-level detail page inside the timeline page
- Do not move “产品使用记录” outside the record card as a decorative strip
- Do not use real photos in the “正在记录” list on the main page
- Do not introduce excessive decoration
- Do not use heavy Material defaults
- Do not use loud green or bright white
- Do not redesign the face map into a new style

==================================================
DELIVERABLE
==================================================

Implement the 3 screens so that they closely match the supplied reference image.

After implementation:
1. run the screens
2. capture screenshots
3. compare screenshots against the reference
4. refine differences in:
   - title text
   - navigation presence
   - face map fidelity
   - region shapes
   - spacing
   - card structure
   - timeline structure
   - compare layout
   - color tone
   - component polish

Stop only when the result is visually close to the supplied final design direction.