import * as React from "react";
import { cn } from "cn";

/** A text field: 32px tall, a 1px control border, the focus ring from globals.css. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full min-w-0 rounded-control border border-border-control bg-transparent px-2.5 text-body text-ink transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-small file:font-medium file:text-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-tint disabled:opacity-60 aria-invalid:border-danger coarse:min-h-touch coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
