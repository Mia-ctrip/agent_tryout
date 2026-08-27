---
name: quiet-botanical-ui
description: Use when designing, implementing, reviewing, or unifying mobile app pages and components that must follow the project's quiet botanical skincare UI system, including product, routine, skin-analysis, onboarding, form, navigation, modal, loading, empty, and error experiences.
---

# Quiet Botanical UI

## Overview

Use this skill to keep every app screen recognizably part of the same quiet botanical skincare product. Preserve usability, accessibility, information hierarchy, and interaction clarity before adding brand expression.

Core principle:

> Calm clarity over visual excitement.

The intended result is quiet, warm, natural, restrained, breathable, and lightly editorial—professional without looking clinical, premium without looking ostentatious, and warm without becoming childish.

## Required workflow

1. Inspect the existing app, shared components, design tokens, and nearby screens before proposing UI changes.
2. State the screen's user goal and primary action.
3. Establish the information hierarchy before choosing decoration.
4. Load only the references relevant to the task using the routing table below.
5. Reuse existing tokens and components. Create a new token or component only when the current system cannot express a reusable need.
6. Review the result against `references/anti-patterns.md` and accessibility requirements.
7. Verify the implemented screen in its actual target viewport when implementation is in scope.

Do not infer authorization to redesign unrelated screens, replace the product's interaction model, or change shared foundations beyond the requested scope.

## Reference routing

| Task | Read |
|---|---|
| Choose or map colors, type, spacing, radius, borders, shadows, or state colors | [references/design-tokens.md](references/design-tokens.md) |
| Build or review navigation, buttons, forms, cards, modal/sheet, empty, loading, or error states | [references/components.md](references/components.md) |
| Design a product list/detail, skin-analysis result, routine, onboarding, profile, settings, or other full page | [references/page-patterns.md](references/page-patterns.md) |
| Choose imagery, illustration, material treatment, editorial composition, or motion | [references/visual-language.md](references/visual-language.md) |
| Review an existing design, resolve a style conflict, or check forbidden patterns | [references/anti-patterns.md](references/anti-patterns.md) |

For a full new screen, normally read design tokens, components, the relevant page pattern, and anti-patterns. Read visual language only when the task includes imagery, illustration, decorative composition, material treatment, or motion.

## Non-negotiable priorities

Resolve conflicts in this order:

1. Usability
2. Accessibility
3. Information hierarchy
4. Consistency
5. Brand aesthetic
6. Decorative creativity

Use typography, spacing, and grouping as the primary hierarchy tools. Do not rely on card walls, borders, shadows, or color blocks to make structure understandable.

## Component and token discipline

Prefer an existing component when it has the same semantic role, even if minor composition changes are needed. Create a new component only when all are true:

- Existing components cannot reasonably complete the task.
- The new component has clear reuse value.
- It follows the shared token and state model.
- It does not overlap semantically with an existing component.

Do not introduce one-off colors, font sizes, radii, shadows, or spacing values inside a page. If the codebase lacks a named token for a required role, map the role to the nearest existing token and flag the gap before changing shared foundations.

## Example: skin-analysis result page

For a request to implement a skin-analysis result page:

1. Read `references/page-patterns.md` for the result-page hierarchy.
2. Read `references/design-tokens.md` for typography and semantic-state treatment.
3. Read `references/components.md` for reusable result blocks, actions, disclosure, loading, and error states.
4. Read `references/anti-patterns.md` before final review.
5. Use `references/visual-language.md` only if the page includes illustration or motion.

The page should answer the user's main question first, then show findings, evidence, actions, and detail. Avoid an exaggerated dashboard, game-like scoring, or saturated red/green status treatment.

## Common mistakes

- Applying the mood as a surface theme while keeping an unrelated SaaS dashboard structure.
- Treating low contrast as permission to reduce readability.
- Creating a new card, button, or spacing value for each screen.
- Loading every reference for a narrow task instead of following the routing table.
- Copying paper, linen, or frosted-glass effects literally into every surface.

