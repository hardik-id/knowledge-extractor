# Polder

> **Source of truth.** This folder is canonical for the Knowledge Extractor app. `src/app/globals.css` implements `tokens.json`; change both in the same PR. The visual showcase lives at https://claude.ai/artifact/BidrzhMe52oe9hVbPJP1wb and may lag behind this repo.

Polder is a light-and-dark design standard for document-pipeline and knowledge tools. It pairs a deep ultramarine with one signal orange on calm white and pale-blue ground. The layouts are flat and orderly, with generous section bands, like fields seen from above.

Its visual language is calm and product-led: navy headings, an orange primary action, pale-blue panels, rounded cards, a screenshot-led hero and short FAQ blocks. It is an original standard. It uses no third-party logo, wordmark or proprietary typeface, and its colour values are its own, set to pass WCAG AA in both themes.

## Principles

1. **One orange thing per view.** `action` marks the single primary step (select files, run a stage, proceed). Everything else is blue, white or outline.
2. **Calm ground, strong type.** Colour lives in headings (`ink-heading`) and in full-width bands (`bg-hero`, `surface-tint`), not in decoration.
3. **Flat fields.** Sections are horizontal bands that alternate `bg` and `surface-tint`. Avoid diagonal cuts, gradients and floating blobs.
4. **Plain words.** People work with *files* and *stages*. They don't work with *ingestion jobs* or *pipeline cells*.
5. **Same page, either theme.** Dark mode is a designed theme with its own action colour, not an inversion.

## Content fundamentals

- Sentence case for every heading, button and nav item: "Select files", not "Select Files".
- Use direct address ("you", "your files") and active verbs. Keep sentences under 20 words.
- Buttons name the outcome: **Select files**, **Convert to Markdown**, **Build index**. Never **Click here** or **Submit**.
- Counts and key figures, such as `1,284` files indexed: always use the `metric` style with tabular numerals.
- Run ids, file hashes and request ids use the `identifier` style, grouped in fours: `7f3a 91c2 04be 5d10`.
- Error messages say what happened and what to do next: "This run no longer exists. Select your files again to start a new one."

## Colour

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #ffffff | #070b26 | Page ground |
| `surface-tint` | #eef2fc | #0d1338 | Alternate section bands, FAQ, steps |
| `surface-raised` | #ffffff | #141b4a | Cards, menus, dialogs |
| `bg-hero` | #000a6e | #0d1338 | Hero and closing CTA bands |
| `ink-heading` | #000a6e | #ffffff | Headings |
| `ink` | #0b1033 | #eef1ff | Body text |
| `ink-muted` | #4a5170 | #a9b1d6 | Captions and helper text |
| `link` | #1a33c9 | #93a6ff | Links, secondary buttons |
| `action` / `on-action` | #c94b00 / white | #ff7a21 / #1b0b00 | Primary button only |
| `brand-orange` | #ff6a00 | #ff7a21 | Decorative accents, never text |

**Contrast rules**

- All text tokens reach at least 4.5:1 on `bg`, `surface-tint` and `surface-raised` in their theme. The lowest pair is `ink-muted` on `surface-tint` at 6.9:1.
- White text on `brand-orange` (#ff6a00) fails at 2.9:1. That is why the button uses the deeper `action` in light mode, and why dark mode puts near-black text on a brighter orange.
- `border-control` is 3:1 on `bg` in both themes. `border-subtle` is decorative only.
- Status colours (`success`, `warning`, `danger`) always come with an icon and a word. Never rely on colour alone.

**Dark mode**

- Follow `prefers-color-scheme` by default, and let a manual toggle (`data-theme="light|dark"`) override it.
- In dark mode, elevation goes up in lightness: `bg` → `surface-tint` → `surface-raised`. Shadows are heavier but secondary.
- `bg-hero` drops to `surface-tint`'s navy in dark mode, so the hero doesn't glare. The orange action keeps its weight.
- Photos and product screenshots keep their colours. Supply a dark screenshot of the app UI where one exists.

## Typography

**Source Sans 3** is the one text family: a humanist sans that stays friendly at display sizes and legible at 13px. **Source Code Pro** is for run ids, hashes and code only. Both come from Google Fonts:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Code+Pro:wght@500&display=swap">
```

**Responsive type scale**

| Style | ≥ 960px | < 600px | Weight |
| --- | --- | --- | --- |
| `display` | 56 / 60 | 36 / 40 | 700 |
| `h1` | 44 / 52 | 32 / 38 | 700 |
| `h2` | 32 / 40 | 26 / 32 | 700 |
| `h3` | 24 / 32 | 20 / 28 | 600 |
| `h4` | 20 / 28 | 20 / 28 | 600 |
| `lead` | 20 / 30 | 18 / 28 | 400 |
| `body` | 17 / 26 | 17 / 26 | 400 |
| `body-sm` | 15 / 22 | 15 / 22 | 400 |
| `caption` | 13 / 18 | 13 / 18 | 400 |

Between 600 and 959px, interpolate with `clamp()`. For example, `h1` is `font-size: clamp(32px, 2.2rem + 1.2vw, 44px)`.

- Headings use `text-wrap: balance` and `ink-heading`. Body text uses `text-wrap: pretty` and `ink`.
- Running text stops at `measure` (68ch). Lead paragraphs stop at 60ch.
- Eyebrow labels above an `h2` use `label`, uppercase, +0.06em tracking, in `link`.
- Figures in tables and counts use `font-variant-numeric: tabular-nums`.

## Layout

**Breakpoints** are mobile first, using min-width values:

| Token | Min width | Grid | Gutter (side) | Column gap | Section padding |
| --- | --- | --- | --- | --- | --- |
| (base) | 0 | 4 columns | `space-4` 16px | `space-4` | `space-12` 48px |
| `bp-sm` | 600px | 8 columns | `space-8` 32px | `space-6` | `space-16` 64px |
| `bp-md` | 960px | 12 columns | `space-12` 48px | `space-8` | `space-24` 96px |
| `bp-lg` | 1280px | 12 columns | auto (centred) | `space-8` | `space-24` 96px |

- The container is `max-width: container-max` (1200px), centred. Coloured bands run full-bleed, and their content sits in the container.
- Side gutters use `max(<gutter>, env(safe-area-inset-left))` so content clears phone notches.
- Use flex or grid with `gap` between siblings, not margins.
- Every tappable thing is at least `tap-target` (48px) tall.

**Page anatomy** (product page)

1. **Site header**: `header-height`, sticky, `bg` with a `border-subtle` bottom rule. Logo left, primary nav centre (collapsed into a menu button below 960px), **Sign in** as the only `action` button on the right.
2. **Hero**: a `bg-hero` band. Two columns at `bp-md` (copy 6 cols, product image 6 cols), stacked below it with the image after the copy. It contains `display`, `lead`, one primary button and one secondary button. The height follows the content, never `100vh`.
3. **Benefit strip**: three or four icon-plus-sentence items in a row on `bg`, wrapping to 2×2 at `bp-sm` and one column on mobile.
4. **Feature rows**: alternating image-left and image-right rows (6 + 6 columns), stacked on mobile with the image first. Each row has an `h3`, a `body` paragraph and a text link.
5. **Feature cards**: a 3-up grid at `bp-md`, 2-up at `bp-sm`, 1-up on mobile. Cards are `surface-raised`, `radius-lg`, `shadow-card` and `space-6` padding.
6. **Steps**: a numbered list for a real sequence (select, ingest, transform), on `surface-tint`. It runs horizontal at `bp-md` and vertical below.
7. **FAQ**: an accordion on `surface-tint`, max 8 columns wide and centred, with `h4` questions.
8. **Closing CTA**: a `bg-hero` band with one `h2` and one `action` button.
9. **Footer**: `surface-tint`, with four link columns at `bp-md`, two at `bp-sm`, and an accordion on mobile. Legal small print uses `caption` in `ink-muted`.

**Wireframe at 1280px**

```
┌───────────────────────────── header 72 ─────────────────────────────┐
│ [logo]      Pipeline  Sources  Runs  Help           [ Sign in ]      │
├──────────────────────────── bg-hero band ───────────────────────────┤
│  DISPLAY HEADLINE (6 cols)              ┌──────────┐                 │
│  lead text                              │  screen  │ (6 cols)        │
│  [ Select files ] ( Watch demo )        └──────────┘                 │
├───────────────────────────── bg band ───────────────────────────────┤
│  ◎ benefit   ◎ benefit   ◎ benefit   ◎ benefit                       │
├────────────────────────── surface-tint band ────────────────────────┤
│  [card]           [card]           [card]                            │
└──────────────────────────────────────────────────────────────────────┘
```

## Shape, elevation and motion

- Radii: `radius-sm` (4px) for controls: text fields, selects and buttons, `radius-lg` for cards, `radius-xl` for hero media, `radius-pill` for chips and step dots.
- Cards on `bg` use `shadow-card`. Cards on `surface-tint` use a `border-subtle` outline and no shadow. Clickable cards lift to `shadow-lift` and move up 2px on hover.
- Motion is 150–200ms ease-out for hovers and 250ms for accordions. Turn it all off under `prefers-reduced-motion`.

## Iconography

- Use line icons on a 24px grid with a 2px stroke and round caps and joins, in `currentColor`. Benefit-strip icons sit in a 48px `surface-tint` disc tinted `link`.
- Use filled icons only for status in alerts (check, warning triangle, cross).
- This system ships no icon set. Use a consistent open set, such as Lucide or Phosphor at regular weight.
- No logo is supplied. Set the product name in `h4` weight 700 in `ink-heading` until a real mark exists.

## Accessibility checklist

- Text meets 4.5:1 in both themes, and controls, icons and focus rings meet 3:1.
- Every interactive element shows a 2px `focus-ring` outline with a 2px offset.
- Tap targets are at least 48px, with 8px between adjacent targets.
- Status is shown with an icon and words, never colour alone.
- Pages work at 320px wide with no horizontal scroll, and at 200% zoom.
