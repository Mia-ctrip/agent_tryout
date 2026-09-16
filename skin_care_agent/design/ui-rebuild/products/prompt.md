Before coding, inspect the existing Product Archive implementation,
the homepage styling, the app theme/color tokens,
and the supplied reference/background assets.

Reuse existing components and typography where appropriate.
Do not duplicate existing design tokens.

Implement/refine the Product Archive screen based on the supplied UI reference image.

The reference image is the visual source of truth.
Do not redesign, reinterpret, simplify, or replace the visual language with framework-default styling.

SCOPE
This is a visual refactor only.
Preserve all existing product data, navigation, interactions, and business logic.
Do not change unrelated screens.

DESIGN SYSTEM
Use the existing app color system consistently:

Ground  #EFE8D6
Surface #F7F1E1
Support #A9B58F
Accent  #6D7A54
Anchor  #4A5638
Ink     #3E362B

Note    #C89A45
Alert   #8A4D3E

For this screen, Note and Alert should not be used unless semantically necessary.

Do not substitute these colors with:
- pure white
- pure black
- generic gray
- Material/default framework green

Use Ink for primary text, reduced-opacity Ink for secondary text,
Accent for subtle editorial accents,
and Anchor for selected/active states.

LAYOUT
Keep the screen structure:

AmbientBackground
→ Header
→ Hero
→ ProductSection
→ BottomNavigation

Use approximately 24dp horizontal page padding.
Use generous vertical spacing instead of divider lines.

Do not add visible section separators.

BACKGROUND
Use the supplied skincare background image asset.
Do not reconstruct the background using gradients, vector shapes, or generated decorative blobs.

The background should:
- remain low contrast
- feel matte and soft
- visually stay behind the content
- contain no sharp product edges behind text
- avoid strong highlights or glossy reflections

Apply a warm Ground-colored veil above the image if needed
(roughly 20–35% opacity) to improve readability and keep the page inside the app palette.

Do not create a high-gloss perfume / glassmorphism look.

TYPOGRAPHY
Match the typography hierarchy of the supplied reference and the existing homepage.

Preserve:
- small editorial eyebrow text
- large elegant page title
- restrained body text
- clear product hierarchy

Do not introduce new fonts if the app already has established typography.
Prefer the same type styles already used on the homepage.

CARDS
Product cards should feel like matte warm paper / frosted skincare surfaces.

Target:
- warm Surface-based background
- low contrast
- approximately 16dp corner radius
- minimal shadow
- subtle separation from the background

Avoid:
- strong glassmorphism
- glossy reflections
- bright white borders
- heavy elevation
- obvious backdrop blur

Keep product thumbnails, text hierarchy, metadata, and chevrons aligned and visually calm.

BOTTOM NAVIGATION
Preserve the existing four items:
观察 / 历程 / 产品 / 我的

“产品” is the active state.
Use Anchor for the selected item.
Keep inactive states muted using Ink at reduced opacity.

IMPORTANT
Do not change business logic.
Do not introduce a new design system.
Do not replace custom styling with Material/framework defaults.
Do not “improve” the design beyond the supplied reference.
Visual fidelity is the priority.

After implementation:
1. Run the Product Archive screen.
2. Capture a screenshot.
3. Compare it against the reference image.
4. Correct visible differences in:
   - layout and spacing
   - typography scale and hierarchy
   - colors
   - background exposure
   - card opacity and radius
   - bottom navigation styling

Stop only when the implementation visually matches the reference closely.