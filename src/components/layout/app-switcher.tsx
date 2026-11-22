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
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-control bg-hero">
      <span className="size-2 rounded-full bg-brand-orange" />
    </span>
  );
}

/**
 * The product mark and the current app's name; opens a menu of every app.
 * `compact` is for the mobile header: the mark only below 600px. `markOnly` is the mark at every width.
 */
export function AppSwitcher({
  compact = false,
  markOnly = false,
}: {
  compact?: boolean;
  /** The mark alone at every width (a bar with no room for the name). */
  markOnly?: boolean;
}) {
  const current = appForPath(usePathname()) ?? APPS[0];
  // One app on offer: nothing to switch to, so only the product mark and name.
  if (APPS.length < 2) {
    return (
      <div className="flex min-w-0 items-center gap-2 px-2 text-body font-semibold text-ink-heading">
        <Mark />
        <span className={markOnly ? "sr-only" : compact ? "hidden truncate sm:inline" : "truncate"}>
          {current.name}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch app, current: ${current.name}`}
        className="flex h-control min-w-0 items-center gap-2 rounded-control px-2 text-left text-body font-semibold text-ink-heading hover:bg-surface-tint coarse:min-h-touch"
      >
        <Mark />
        <span className={markOnly ? "sr-only" : compact ? "hidden truncate sm:inline" : "truncate"}>
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
                  <span className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink-heading">
                    {app.name}
                    {app.experimental && (
                      <Badge variant="outline">
                        <FlaskConical aria-hidden />
                        Experimental
                      </Badge>
                    )}
                  </span>
                  <span className="text-small font-normal text-ink-muted">{app.description}</span>
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
