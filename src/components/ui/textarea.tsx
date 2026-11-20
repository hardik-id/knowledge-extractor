import * as React from "react";
import { cn } from "@/lib/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 rounded-control border border-border-control bg-transparent px-2.5 py-1.5 text-body text-ink transition-colors placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-tint disabled:opacity-60 aria-invalid:border-danger coarse:text-base",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
