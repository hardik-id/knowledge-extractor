# Accordion

An accordion holds short questions and answers so a page can stay scannable.

## Rules
- Build it with native `<details>` and `<summary>`. Each question is a `tap-target`-tall row in `h4` weight in `ink-heading`, with a `link` chevron that rotates 180° in 250ms.
- Place it on `surface-tint` with `radius-lg`, separating items with a 1px `border-subtle` rule.
- Width is max 8 of 12 columns, centred. Answers stop at `measure` (68ch).
- Open the first item by default only when it answers the page's most common question.
- Phrase questions the way people ask them: "Which file types are supported?"
