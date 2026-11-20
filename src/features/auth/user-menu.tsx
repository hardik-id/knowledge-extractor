"use client";

import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "./auth-provider";
import { initials } from "./initials";

/**
 * The signed-in person and a menu to sign out. Renders nothing when sign-in is
 * off or nobody is signed in. `compact` shows the badge only (mobile header).
 */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const account = auth?.state.account;
  if (!auth || !account) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={compact ? `Account: ${account.name}` : undefined}
        className={
          compact
            ? "rounded-full"
            : "flex h-control w-full min-w-0 items-center gap-2 rounded-control px-2 text-left text-body text-ink-heading hover:bg-surface-tint coarse:min-h-touch"
        }
      >
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-hero text-caption font-semibold text-on-hero",
            compact ? "size-8" : "size-6",
          )}
        >
          {initials(account.name)}
        </span>
        {!compact && <span className="truncate">{account.name}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
          <span className="truncate text-body font-semibold text-ink-heading">{account.name}</span>
          <span className="truncate text-small font-normal text-ink-muted">{account.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void auth.signOut()} className="gap-2 px-2 py-2">
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
