# SiteFooter

The site footer gives every page the same secondary navigation and legal information.

## Layout
- Use `surface-tint` with `space-12` top padding (`space-8` on mobile).
- Show four link columns from 960px and two from 600px. Below 600px, each column becomes an accordion row so the footer stays short.
- Column titles use `h4` at 17px in `ink-heading`. Links use `body-sm` in `ink-muted`, turning `link` and underlined on hover, with a 28px line height so they work as tap targets.
- The legal row sits under a 1px `border-subtle` rule, in `caption` / `ink-muted`.
