import * as React from "react";
import { cn } from "cn";

/** A native select, styled like Input. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-control w-full min-w-0 rounded-control border border-border-control bg-transparent px-2 text-body text-ink transition-colors disabled:cursor-not-allowed disabled:bg-surface-tint disabled:opacity-60 aria-invalid:border-danger coarse:min-h-touch coarse:text-base [&>option]:bg-surface-raised [&>option]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
