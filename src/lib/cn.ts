import { createCn } from "cn/config";

/**
 * Joins class names and resolves conflicts between Tailwind utilities, the way `clsx` with
 * `tailwind-merge` does (the `cn` package), but taught the names Polder adds in `globals.css`.
 * Without them `text-small` is read as a text colour, so it replaces a real colour and is itself
 * dropped by the next colour, and `h-control` / `rounded-control` don't conflict with `h-8` or
 * `rounded-panel` from a caller.
 *
 * Add a name here when you add a size, radius or type step to `globals.css`.
 */
export const cn = createCn({
  extend: {
    theme: {
      // `--text-*`: the type scale (text-body, text-small, ...).
      text: ["body", "small", "caption", "title", "section"],
      // `--radius-*`: rounded-control, rounded-panel, rounded-pill.
      radius: ["control", "panel", "pill"],
    },
    classGroups: {
      // `@utility h-control*` and `size-control*`: the control heights.
      h: [{ h: ["control", "control-sm", "control-xs", "control-lg"] }],
      size: [{ size: ["control", "control-sm", "control-xs", "control-lg"] }],
    },
  },
});
