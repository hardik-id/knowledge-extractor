# Hero

The hero opens a page on a `bg-hero` band, stating what the product does and offering one primary action.

## Layout
- From 960px, use two columns (6 + 6 of the 12-column grid): copy left, product image right, vertically centred.
- Below 960px, stack the columns with the copy first. The image is capped at 280px wide and centred.
- Padding is `space-24` top and bottom on desktop, `space-12` on mobile. Height follows the content, never `100vh`.

## Content
- An optional eyebrow in `brand-orange`, then the `display` headline in `on-hero` (max 8 words), then the `lead` paragraph in `on-hero-muted` (max 2 sentences).
- One primary button plus at most one `pd-btn--on-hero` secondary.
- The product image is a real product screenshot in a frame, with a `radius-xl` frame and `shadow-lift`. Use a dark screenshot in dark mode.
