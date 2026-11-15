# StepList

A step list shows a real sequence the person follows in order, such as selecting, ingesting and converting files.

## Rules
- Use it only when the order matters. For unordered benefits, use FeatureCard.
- Place it on `surface-tint` with `radius-lg`. Number dots are 40px `radius-pill` circles in `bg-hero` with `on-hero` digits. The current step uses `brand-orange` with `bg-hero` digits.
- Run it horizontally (3–4 columns) from 960px and vertically below, keeping the numbers aligned on the left.
- Step titles use `h4` and describe the action. Descriptions use `body-sm` in `ink-muted`.
- Use a semantic `<ol>`. Mark the current step with `aria-current="step"`.
