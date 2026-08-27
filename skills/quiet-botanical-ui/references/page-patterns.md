# Page Patterns

## Contents

- Universal page pattern
- Product list and search
- Product detail
- Skin analysis and AI result
- Routine
- Supporting pages
- High-density information

## Universal page pattern

For every new or revised screen:

1. Identify what the user came to accomplish.
2. Choose the primary action.
3. Order information by user value and decision sequence.
4. Reuse existing components.
5. Apply shared tokens.
6. Check the quiet botanical visual language where imagery or decoration is involved.
7. Review usability, accessibility, recovery, and consistency.

The page should have one clear first reading path. Section gaps must be larger than gaps within a section, and grouping should remain understandable without card borders.

## Product list and search

- Reuse the shared product-card family from `components.md`.
- Make query, filter, sort, and result count understandable without a dashboard-style toolbar.
- Preserve scanability: image, product name, and core differentiator should appear in a consistent position.
- Use filters progressively; do not expose every criterion at once on a small screen.
- Empty, loading, and error results use the shared state components.

## Product detail

Recommended information order:

1. Product visual
2. Brand
3. Product name
4. Category or formula
5. Core attributes
6. Primary user action
7. Usage and instructions
8. Ingredients
9. Suitability
10. Notes and warnings
11. Related products

Do not flatten all professional information into the first viewport. Use progressive disclosure, accordion, tabs, or expandable sections when they reduce cognitive load without hiding safety-critical information.

## Skin analysis and AI result

Answer the user's main question before presenting evidence:

1. Conclusion
2. Key findings
3. Evidence
4. Recommended actions
5. Detailed analysis

Use grouped result blocks and progressive disclosure so the page can be information-rich without becoming a dashboard wall.

If a severity or score is necessary:

- Prefer a clear number, restrained progress indicator, or subtle bar.
- Pair color with a label, icon, or explanatory text.
- Explain what the score means and what action follows.
- Avoid gauges, leaderboards, game mechanics, and saturated red/green coding.

Evidence should sit near the finding it supports. Detailed technical content can collapse after the summary, but warnings and next actions must remain easy to find.

## Routine

Make sequence and execution obvious:

1. AM or PM
2. Step number or order
3. Product
4. Usage
5. Notes

Prioritize the next actionable step over aggregate metrics. Do not turn a routine into a complex analytics dashboard.

## Supporting pages

Home, onboarding, profile, settings, favorites, ingredient detail, recommendations, and skin profile should use the same foundations:

- Home: establish one primary path; avoid a wall of equally weighted cards.
- Onboarding: display type and organic composition are allowed, but each step keeps a clear action and short readable copy.
- Profile/settings: favor familiar lists and controls over decorative cards.
- Favorites/recommendations: reuse product-card and list patterns.
- Ingredient detail: lead with meaning, suitability, and cautions before deep technical detail.

## High-density information

Ingredient analysis, skin reports, routines, and AI results may exceed the default medium-low density. Increase density only when:

- Related facts are grouped.
- Typography still creates an obvious reading order.
- Progressive disclosure hides detail rather than the conclusion or safety information.
- Tap targets and body text remain accessible.

If the user cannot identify the conclusion, next action, and section boundaries at a glance, the page is too dense or insufficiently structured.

