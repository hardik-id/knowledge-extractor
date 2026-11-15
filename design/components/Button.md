# Button

Buttons start one action; the primary variant marks the single most important step in a view.

## Variants
- **Primary** (`pd-btn--primary`): `action` fill, `on-action` label. Use at most one per view.
- **Secondary** (`pd-btn--secondary`): a 2px `link` outline. Use for the alternative next step.
- **Text** (`pd-btn--text`): an underlined `link` label. Use for tertiary actions inside content.
- **On hero** (`pd-btn--on-hero`): a white outline. Use only for a secondary action on `bg-hero`.

## Rules
- Height is at least `tap-target` (48px), padding is `space-3` × `space-6`, and corners use `radius-md`.
- Labels use the `button` style in sentence case and name the outcome: **Build index**, not **OK**.
- Below 600px, buttons in a hero or form stack full-width with a `space-2` gap, primary on top.
- Disabled buttons drop to 45% opacity. Always explain nearby why the action is unavailable.

## Consumer provides
The label, the `href` or click handler, and the choice of variant.
