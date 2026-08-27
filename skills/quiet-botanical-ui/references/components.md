# Components

## Contents

- Shared component policy
- Navigation
- Buttons and actions
- Inputs and forms
- Product cards
- Overlays
- Empty, loading, and error states

## Shared component policy

Reuse shared components for equivalent semantic roles. A page may change content composition or density without inventing a parallel button, form, or card language.

Create a new component only when existing components cannot reasonably serve the task, the new component has clear reuse value, it uses shared tokens and states, and it does not overlap an existing component's meaning.

## Navigation

Navigation should be simple, predictable, and consistent with mobile conventions.

- Keep bottom navigation, back, close, search, and more actions in familiar positions.
- Preserve labels or accessible names for ambiguous icons.
- Do not move core actions into hidden gestures for visual novelty.
- Brand expression must not override discoverability or platform behavior.

## Buttons and actions

Use only these semantic types unless the existing system defines an equivalent set:

- Primary
- Secondary
- Tertiary or text
- Destructive
- Icon button

Within one viewport, aim for one visually dominant primary call to action. Secondary actions must not compete with it.

Avoid gradients, gloss, 3D treatment, saturated fills, and heavy shadows. Every interactive button needs default, pressed, focus, loading, and disabled behavior appropriate to the platform.

## Inputs and forms

Inputs must be clear, calm, and explicit. A placeholder does not replace a persistent label.

Support at least:

| State | Required signal |
|---|---|
| Default | Label, input boundary or surface, readable value/placeholder |
| Focus | Visible focus indicator using shared tokens |
| Filled | Value remains distinct from placeholder and helper text |
| Error | Semantic border/icon plus a specific recovery message |
| Disabled | Visually and behaviorally disabled, while remaining legible |

Keep helper, validation, and metadata text aligned with the input they describe. Do not encode validation only with red/green color.

## Product cards

Product lists should share one product-card family. Define slots rather than making unrelated cards for each page:

1. Product image
2. Brand
3. Product name
4. Category
5. Key strength, concentration, or benefit
6. Optional rating or status
7. Optional action

The image is the primary visual anchor; the product name is the primary textual anchor. Keep brand, category, concentration, and status subordinate through typography and spacing.

For narrow mobile cards, preserve the primary anchors first and progressively omit optional metadata. Handle long names with a consistent line limit or layout expansion defined by the existing component; do not shrink text until it becomes hard to read.

Product imagery should use a clean, low-stimulation background and preserve the product photography language. Avoid saturated backdrops, cluttered props, and strong artificial shadows.

## Overlays

Modal, drawer, and bottom sheet use `surface-elevated` and may use restrained shadow or translucency to establish layer order.

- Use an overlay only when the interaction benefits from retained page context.
- Provide an obvious close or completion path.
- Avoid stacking overlays.
- Do not turn translucency into app-wide glassmorphism.

## Empty state

An empty state should be quiet, brief, and actionable. It may use a botanical illustration, restrained organic shape, or minimal product drawing.

Include:

- What is absent
- Why it matters when clarification is useful
- One suitable next action

Avoid giant cartoon characters, childish treatment, and marketing copy that does not help the user proceed.

## Loading state

Prefer skeletons, subtle progress, and low-stimulation motion. Match skeleton geometry to the content that will replace it. Avoid large bouncing graphics, fast spinners, and decorative brand animation that delays comprehension.

## Error state

An error state must tell the user what happened and what to do next. When possible provide:

- A specific explanation
- Retry
- An alternative action or safe exit
- Preservation of already-entered user data

Avoid a context-free “Something went wrong.”

