import * as React from "react";
import { cn } from "cn";

/** A native select, styled like Input. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&>option]:bg-surface-raised [&>option]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
