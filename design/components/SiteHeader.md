# SiteHeader

The site header holds the product name, the main navigation and the sign-in action on every page.

## Layout
- Height is `header-height` (72px, 64px below 960px). Use `bg` with a 1px `border-subtle` bottom rule, sticky at `top: env(safe-area-inset-top)`.
- From 960px: logo on the left, up to five nav items, and **Sign in** as the only primary button on the right.
- Below 960px, the nav collapses into a **Menu** button that opens a full-height sheet. **Sign in** stays visible.
- The current section gets `aria-current="page"`, `ink-heading` text and a 3px `brand-blue` underline.

## Consumer provides
The logo (or product name in text), nav items, and the current item.
