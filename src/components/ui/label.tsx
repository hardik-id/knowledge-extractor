import * as React from "react";
import { cn } from "cn";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-[13px] leading-[18px] font-semibold text-ink", className)}
      {...props}
    />
  );
}

export { Label };
