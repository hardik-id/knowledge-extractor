# FeatureCard

A feature card introduces one capability with an icon, a short title, one sentence and a link.

## Rules
- Use `surface-raised`, `radius-lg`, `shadow-card` and `space-6` padding (`space-8` from 960px). On `surface-tint`, swap the shadow for a 1px `border-subtle` outline.
- The icon is a 24px line icon in a 48px `surface-tint` disc, tinted `link`.
- The title is `h3` in `ink-heading` (max 5 words). The body is `body-sm` in `ink-muted` (max 20 words).
- The grid is 3-up at `bp-md`, 2-up at `bp-sm` and 1-up on mobile, with `space-6`–`space-8` gaps. Every card in a row has the same anatomy.
- When the whole card is clickable, it lifts to `shadow-lift` and moves up 2px on hover. The link text remains the accessible name.
