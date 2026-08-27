# Anti-patterns and Review

## Contents

- Default prohibitions
- Review checklist
- Conflict resolution
- Common review findings

## Default prohibitions

### Visual

- Neon gradients
- App-wide glassmorphism
- Heavy shadows
- 3D, metallic, or glossy UI
- Pure-black dominant backgrounds
- Highly saturated calls to action
- Random bright accents
- Excessive borders
- Nested cards inside cards

### Layout

- Dashboard walls
- Information overload
- Every section inside a card
- No spacing hierarchy
- Excessive centered text
- Multiple competing primary actions

### Typography

- Too many sizes or weights
- Oversized headings everywhere
- Tiny unreadable captions
- Decorative body fonts

### UX

- Hidden core actions
- Novel navigation without a user benefit
- Unnecessary steps
- Modal overuse or stacked overlays
- Confirmation for harmless, reversible actions
- Deeply nested accordions

These are defaults, not excuses to ignore a concrete platform or accessibility requirement. If an exception is genuinely required, document why it improves the user outcome and keep it narrow.

## Review checklist

### Brand

- Does the screen still look like the same app without its logo?
- Is the palette warm, neutral, and low-saturation?
- Is there breathing room without wasting the viewport?
- Does it avoid commercial-advertising and SaaS-dashboard styling?
- Is the editorial quality restrained rather than decorative?

### Layout and hierarchy

- Is the primary information immediately clear?
- Are sections separated mainly through spacing?
- Are any cards or borders structurally unnecessary?
- Is important content pushed away by excessive whitespace?
- Can the user identify the main action without scanning competing controls?

### Components

- Were existing components reused where semantics match?
- Are buttons, cards, inputs, navigation, and states consistent?
- Does every new component have a reusable, non-overlapping role?
- Are long content and state variations handled explicitly?

### UX and recovery

- Does the user know where they are and what to do next?
- Is the shortest reasonable path available?
- Are loading, empty, and error states covered?
- Can the user recover without losing work?

### Accessibility

- Is text contrast sufficient?
- Are type sizes and line heights readable?
- Are tap targets large enough?
- Are states communicated by more than color?
- Are focus and error messages visible and specific?

## Conflict resolution

When two goals conflict, resolve them in this order:

1. Usability
2. Accessibility
3. Information hierarchy
4. Consistency
5. Brand aesthetic
6. Decorative creativity

Never sacrifice the first four to strengthen the last two.

## Common review findings

| Finding | Correction |
|---|---|
| The screen feels like a tinted SaaS template | Rebuild hierarchy with typography and spacing; remove card-wall structure |
| The page is calm but hard to read | Raise contrast and restore clear interactive/state signals |
| Every section has a different card | Consolidate around semantic component roles |
| Botanical styling is literal or theatrical | Replace texture and decoration with warmer surfaces, rhythm, and restrained accents |
| The result page looks like a game dashboard | Lead with conclusion and actions; use restrained indicators and explanatory labels |
| The page has abundant whitespace but weak flow | Rebalance section gaps around task sequence and keep the primary action visible |

