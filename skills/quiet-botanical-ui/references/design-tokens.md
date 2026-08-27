# Design Tokens

## Contents

- Token policy
- Color roles
- Typography roles
- Spacing and layout rhythm
- Shape, borders, and shadows
- Accessibility and state mapping

## Token policy

Use the app's existing named tokens whenever they are available. This reference defines semantic roles, not permission to add duplicate constants. Do not invent one-off colors, type sizes, radii, shadows, borders, or spacing values inside a page.

If the codebase uses different token names, map these roles to the closest existing tokens. Propose a shared token addition only when no existing role is suitable and the need is reusable.

## Color roles

### Background

| Role | Intent |
|---|---|
| `bg-primary` | Warm ivory or cream; default page background |
| `bg-secondary` | Very pale sage; gentle section distinction |
| `bg-tertiary` | Warm beige-grey; supporting region |

Avoid pure white as the dominant page background unless platform or accessibility constraints require it.

### Surface

| Role | Intent |
|---|---|
| `surface-primary` | Main card or container |
| `surface-secondary` | Secondary region |
| `surface-soft` | Low-emphasis module |
| `surface-elevated` | Modal, drawer, or bottom sheet |

Separate surfaces first with small tonal differences, spacing, or a subtle border. Elevation shadow is reserved for true overlays and temporary floating layers.

### Text

| Role | Intent |
|---|---|
| `text-primary` | Deep warm grey-brown for primary content |
| `text-secondary` | Medium grey-brown for supporting copy |
| `text-tertiary` | Lower-emphasis metadata that remains readable |
| `text-disabled` | Disabled content with sufficient state distinction |
| `text-inverse` | Light text on a dark-enough surface |

Avoid large areas of pure black. Never reduce contrast merely to appear softer.

### Brand and accent

| Role | Intent |
|---|---|
| `brand-primary` | Muted sage |
| `brand-secondary` | Soft olive |
| `brand-soft` | Very pale sage |
| `accent-yellow` | Dusty yellow |
| `accent-pink` | Muted blush |
| `accent-plum` | Dusty plum |

Brand greens must not become vivid, fluorescent, or technological. Accent colors are small-area emphasis, normally no more than about 10% of the visible composition.

### Semantic color

Keep `success`, `warning`, `error`, and `info` immediately recognizable. They may be stronger than brand colors, but should remain moderated enough to coexist with the palette. Never encode a state through color alone.

## Typography roles

Use a stable role set:

| Role | Use |
|---|---|
| Display | Onboarding, hero, or rare brand moments |
| Page Title | Screen-level heading with clear surrounding space |
| Section Title | Major content-group heading |
| Card Title | Reusable container title |
| Body | Primary readable content with relaxed line height |
| Secondary Body | Supporting explanation |
| Caption | Compact secondary copy |
| Label | Form and control labels |
| Button | Action text |
| Metadata | Time, volume, concentration, brand, category, status |

Do not use display type repeatedly on ordinary screens. Avoid excessive sizes or weights, ultra-light body text, oversized headings on every section, and unreadably small captions.

## Spacing and layout rhythm

Space is a brand element. Separate content in this order:

1. Spacing
2. Subtle background difference
3. Subtle divider
4. Border
5. Shadow

Use the existing spacing scale. If the project has no documented scale, prefer a restrained rhythm such as `4, 8, 12, 16, 24, 32, 40, 48, 64` rather than arbitrary values.

- Standard mobile horizontal padding: typically 16–20 units.
- Editorial or hero composition: may expand to about 24 units.
- Section-to-section gaps must be visibly larger than gaps inside a section.
- Default density is medium-low; professional result or ingredient screens may be denser when grouping and progressive disclosure keep them readable.

Breathing room must not waste the viewport or hide important actions below unnecessary empty space.

## Shape, borders, and shadows

The shape language is soft geometry with restrained organic accents.

- Keep radius to 3–4 shared roles such as `radius-sm`, `radius-md`, `radius-lg`, and `radius-pill`.
- Cards are simple, flat, soft, and moderately rounded.
- Organic shapes belong mainly in heroes, illustrations, empty states, or background accents—not forms, navigation, tables, or dense information.
- Borders are low-contrast, usually one physical pixel, in warm grey or pale sage.
- Shadows are for modal, bottom sheet, floating action, or temporary overlays—not every card.

## Accessibility and state mapping

- Body text must meet the target platform's contrast requirements.
- Tap targets must be comfortably operable.
- Buttons must remain identifiable without relying only on fill color.
- Focus, selected, error, warning, success, and disabled states need non-color signals where appropriate: icon, label, border, message, or position.
- Error messages explain what happened and how to recover.

Low-contrast aesthetic does not mean unreadable UI.

