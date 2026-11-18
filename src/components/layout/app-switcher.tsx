"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronsUpDown, FlaskConical } from "lucide-react";
import { APP_ICONS } from "@/apps/icons";
import { APPS, appForPath } from "@/apps/registry";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Mark() {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-hero">
      <span className="size-3 rounded-full bg-brand-orange" />
    </span>
  );
}

/**
 * The product mark and the current app's name; opens a menu of every app.
 * `compact` is for the mobile header: the mark only below 600px.
 */
export function AppSwitcher({ compact = false }: { compact?: boolean }) {
  const current = appForPath(usePathname()) ?? APPS[0];
  // One app on offer: nothing to switch to, so only the product mark and name.
  if (APPS.length < 2) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-lg leading-6 font-bold text-ink-heading">
        <Mark />
        <span className={compact ? "hidden truncate sm:inline" : "line-clamp-2 leading-5"}>
          {current.name}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch app, current: ${current.name}`}
        className="-ml-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-lg leading-6 font-bold text-ink-heading outline-none hover:bg-surface-tint focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Mark />
        <span className={compact ? "hidden truncate sm:inline" : "line-clamp-2 leading-5"}>
          {current.name}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))]">
        {APPS.map((app) => {
          const Icon = APP_ICONS[app.id];
          const isCurrent = app.id === current.id;
          return (
            <DropdownMenuItem key={app.id} asChild className="items-start gap-3 p-3">
              <Link href={app.href} aria-current={isCurrent ? "page" : undefined}>
                <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-base leading-6 font-semibold text-ink-heading">
                    {app.name}
                    {app.experimental && (
                      <Badge variant="outline">
                        <FlaskConical aria-hidden />
                        Experimental
                      </Badge>
                    )}
                  </span>
                  <span className="text-[15px] leading-[22px] font-normal text-ink-muted">
                    {app.description}
                  </span>
                </span>
                {isCurrent && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-link" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
