import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Slot } from "radix-ui";

/** Secondary: a neutral 1px border, ink text, no colour. `outline` is the same look under its old name. */
const SECONDARY =
  "border-border-control bg-transparent text-ink hover:bg-surface-hover aria-expanded:bg-surface-hover";

/**
 * Primary (`default`): orange, filled, one per view. Secondary (`secondary`, `outline`): a
 * neutral hairline. Tertiary (`ghost`). `destructive` is the filled danger button for the
 * confirming step only: the step before it is a secondary button. Sizes: `default` is a
 * control (32px), `lg` is for a page's main actions (36px); a touch screen gets 44px.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent text-body font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger coarse:min-h-touch [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-action-hover",
        secondary: SECONDARY,
        outline: SECONDARY,
        ghost: "text-ink hover:bg-surface-hover aria-expanded:bg-surface-hover",
        destructive: "bg-danger text-on-danger hover:bg-danger/90",
        link: "text-link underline underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-control gap-1.5 px-3",
        xs: "h-control-xs gap-1 px-2 text-caption [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-sm gap-1.5 px-2.5 text-small [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-control-lg gap-2 px-4",
        icon: "size-control coarse:min-w-touch",
        "icon-xs": "size-control-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm coarse:min-w-touch",
        "icon-lg": "size-control-lg coarse:min-w-touch",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
