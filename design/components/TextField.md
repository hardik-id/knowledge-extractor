# TextField

> In the app: a 32px field with a 1px `border-control` and `radius-control`, text in `text-body` (16px on a touch screen). See "Polder for apps" in `../DESIGN.md`; the sizes below are the website's.

A text field collects one value with a visible label above it and optional helper text below.

## Anatomy
A `label` style label, then the input (`tap-target` height, `border-control` 1px outline, `radius-sm`, 4px), then helper text in `caption` / `ink-muted`.

## Rules
- Labels always sit above the field and stay visible. Never use placeholder-only labels.
- Run ids and codes use the `identifier` mono style. Other inputs use `body` in `--font-sans`.
- In the error state, use a 2px `danger` border, a `danger-soft` fill, and helper text in `danger` that says how to fix the value. Set `aria-invalid` and link the helper text with `aria-describedby`.
- Field max width is 360px. On mobile, fields fill the column.

## Consumer provides
The label text, input `id`, helper text and validation message.
