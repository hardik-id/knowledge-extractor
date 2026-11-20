import * as React from "react";
import { cn } from "@/lib/cn";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-small font-medium text-ink", className)}
      {...props}
    />
  );
}

export { Label };
