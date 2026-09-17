Refine the existing “观察” screen based on the supplied reference image.

IMPORTANT:
The upper half of this screen is already approved and MUST remain visually unchanged.

This task is ONLY about restructuring and refining the lower half of the page.

Before coding:
1. Inspect the existing implementation of the 观察 screen.
2. Inspect the shared app theme, typography, bottom navigation, card/list components, spacing tokens, and color tokens.
3. Reuse existing components and design tokens where appropriate.
4. Do not create a new visual system.

==================================================
1. DO NOT MODIFY THE APPROVED UPPER HALF
==================================================

Preserve the current upper-half implementation exactly, including:

- “肌肤档案”
- “TODAY · 今天”
- headline:
  “今天，也留下一次
   真实观察”
- subtitle:
  “让皮肤的变化，被温和而诚实地保存。”
- the existing main visual image composition
- the existing large-image + small-circle-image composition
- “开始今天的观察” primary action
- “从相册选择原图” / album import action

Do NOT:
- replace the hero image
- change the image composition
- redesign the buttons
- modify typography hierarchy
- change upper-half spacing unless technically necessary
- change the existing interaction behavior

Treat the upper half as locked.

==================================================
2. INFORMATION ARCHITECTURE FOR THE LOWER HALF
==================================================

The “观察” tab has one core responsibility:

CAPTURE / LOG WHAT IS HAPPENING NOW.

It should NOT behave like a mini version of the “历程” tab.

Therefore:

KEEP:
- a lightweight “正在观察” context
- “记录产品使用” as a secondary logging action

REMOVE COMPLETELY:
- “最近记录”
- completed-record history
- recent-record thumbnails
- historical archive summaries
- date-range explanations
- verbose explanatory text about reviewing past evidence

Historical/completed records belong to the “历程” tab.

==================================================
3. “正在观察” — LIGHTWEIGHT CONTEXT ONLY
==================================================

The current tracked regions should remain visible, but this is NOT a management list and NOT a history section.

Use a lightweight structure similar to:

CURRENT

正在观察

下巴 · 右脸颊
2 个区域正在记录                     >

The entire context row should be clickable and can navigate to the relevant 历程 / skin-history context.

Visual requirements:
- low visual weight
- generous whitespace
- no real user photos
- no date ranges
- no multiple large cards
- no long descriptions
- no repeated status labels
- no heavy divider system

This section should simply answer:

“What am I currently observing?”

It should NOT explain the archive system.

Recommended styling:
- small editorial eyebrow: “CURRENT”
- “正在观察” as the section label
- one compact row underneath
- region names as the primary row text
- “2 个区域正在记录” as muted secondary metadata
- a small chevron on the right
- optional very lightweight circular/line icon on the left

If there are no active tracked regions:
- hide this entire section rather than showing an empty-state card

==================================================
4. REMOVE “最近记录”
==================================================

Delete the “最近记录” section from this screen entirely.

Do NOT show:
- recent completed observation thumbnail
- latest completed record
- “2 个已完成”
- recently recorded regions
- historical record cards

The user should use the “历程” tab to review completed history.

Exception:
If the application already supports an unfinished observation draft,
a future “继续今天的观察” state may remain on this page,
because unfinished work is still part of the current capture flow.

Do not add this new state unless the current business logic already supports it.

==================================================
5. “记录产品使用” — SECONDARY LOGGING ENTRY
==================================================

Keep “记录产品使用”.

It belongs on the 观察 page because it is another way of recording something that happened now.

However, it must remain visually secondary to:

“开始今天的观察”

Use one lightweight action row below the current-observation context.

Suggested content:

[light bottle icon]

记录产品使用                              >

Optional very short secondary copy:
“记录一次真实发生的护理”

Do not use the longer marketing-style sentence currently shown.

Visual treatment:
- low-emphasis Surface / paper-like row
- subtle icon
- subtle chevron
- no strong green filled button
- no heavy shadow
- no promotional banner styling

It should read as:
“another logging action”

not:
“another primary CTA”

==================================================
6. FINAL PAGE STRUCTURE
==================================================

The final structure should visually follow this hierarchy:

肌肤档案                         TODAY · 今天

今天，也留下一次
真实观察

让皮肤的变化，被温和而诚实地保存。

        [ APPROVED HERO VISUAL ]

[        开始今天的观察        ]

[        从相册选择原图        ]


CURRENT

正在观察

下巴 · 右脸颊
2 个区域正在记录                    >


记录产品使用                         >


------------------------------------------------

观察        历程        产品        我的

==================================================
7. VISUAL LANGUAGE
==================================================

Match the visual system already established in the app.

Use existing semantic tokens where available.

Existing palette direction:
Ground   #EFE8D6
Surface  #F7F1E1
Support  #A9B58F
Accent   #6D7A54
Anchor   #4A5638
Ink      #3E362B

Do not introduce generic Material colors.

Lower-half styling should feel:
- warm
- calm
- editorial
- paper-like
- low contrast
- breathable
- restrained

Beauty should come from:
- typography
- spacing
- alignment
- subtle material surfaces
- refined iconography

NOT from:
- decorative graphics
- extra photography
- glassmorphism
- strong shadows
- excessive borders
- multiple section dividers

Avoid turning every item into an independent floating card.

The lower half should visually “quiet down” after the hero section.

==================================================
8. BOTTOM NAVIGATION
==================================================

Preserve the existing bottom navigation:

观察 / 历程 / 产品 / 我的

“观察” remains the active state.

Do not redesign the global navigation component unless required to match the existing app implementation.

==================================================
9. BEHAVIOR
==================================================

Preserve existing business logic for:
- taking a new observation
- importing an original image from the album
- navigating to active observation/history context
- recording product usage
- bottom navigation

This task is primarily a visual and information-architecture refactor.

Do not modify unrelated logic.

==================================================
10. ACCEPTANCE CRITERIA
==================================================

The task is complete when:

1. The approved upper half looks unchanged.
2. “最近记录” is completely removed.
3. “正在观察” is reduced to one lightweight context block.
4. No real user photo appears in the “正在观察” context.
5. “记录产品使用” remains visible as a secondary logging entry.
6. The lower half has substantially less text and visual clutter than the current implementation.
7. The screen no longer duplicates the responsibilities of the “历程” tab.
8. Bottom navigation remains intact.
9. Existing interactions still work.
10. The overall screen feels visually continuous with the approved hero section.

After implementation:
- run the screen
- capture a screenshot
- compare it to the supplied reference
- refine spacing, typography, alignment, card weight, and visual hierarchy
- do not modify the approved hero section during visual refinement