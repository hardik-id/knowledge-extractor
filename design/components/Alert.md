# Alert

An alert reports the result of an action or a condition the person needs to know about.

## Rules
- Each alert pairs a soft background (`success-soft`, `warning-soft`, `danger-soft`) with an icon in the matching strong colour. Text stays in `ink` so it reads at full contrast.
- The bold first line says what happened. The second line says what to do next.
- Use `role="alert"` for errors that block progress and `role="status"` for everything else.
- Alerts use `radius-md` and `space-4` padding, and sit above the content they refer to.
