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
            ? "rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            : "flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-base leading-6 font-semibold text-ink-heading outline-none hover:bg-surface-tint focus-visible:ring-[3px] focus-visible:ring-ring/50"
        }
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-hero text-sm font-semibold text-on-hero"
        >
          {initials(account.name)}
        </span>
        {!compact && <span className="truncate">{account.name}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
          <span className="truncate text-base leading-6 font-semibold text-ink-heading">
            {account.name}
          </span>
          <span className="truncate text-[15px] leading-[22px] font-normal text-ink-muted">
            {account.username}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void auth.signOut()}
          className="gap-2 px-2 py-2 text-base"
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
