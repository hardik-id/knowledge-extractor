"use client";

import { useState } from "react";
import { CloudOff, LoaderCircle, MoreHorizontal, UserMinus, Users } from "lucide-react";
import { EmptyState } from "@/components/pipeline/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isSessionEnd } from "@/features/auth/report-failure";
import { useMe } from "@/features/iam/use-me";
import { formatDate } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { cn } from "@/lib/utils";
import { services } from "@/services";
import type { Tenant, TenantMember } from "@/services/access";
import type { TenantRole } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { ROLE_LABEL, TENANT_ROLES, visibleMembers } from "./member-rules";
import { RemoveMemberDialog } from "./remove-member-dialog";

interface MemberListProps {
  tenant: Tenant;
  /** What the person typed in the search box (already waited for). */
  search: string;
  /** A change was refused: show the sentence and read the list again. */
  onRefused: (sentence: string) => void;
  /** A change is about to be made: the sentence of an earlier refusal no longer applies. */
  onChanging: () => void;
}

const HEAD = "px-3 py-2 text-left text-caption font-medium text-ink-muted";

/**
 * The tenant's members as a table: the first page, "Load more", the role as a select and a row
 * menu. The parent gives it a new `key` to read the list again (a new search, a refused change),
 * so everything here starts over then.
 */
export function MemberList({ tenant, search, onRefused, onChanging }: MemberListProps) {
  const { person } = useMe();
  const first = useAsyncData(`${tenant.id}`, (signal) =>
    services.access.tenantMembers.list(tenant.id, { search: search || undefined, signal }),
  );

  const [more, setMore] = useState<{ items: TenantMember[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<number, TenantMember>>({});
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [removing, setRemoving] = useState<TenantMember | null>(null);

  const markBusy = (id: number, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const refuse = (failure: unknown) => {
    // A refused token is reported by the sign-in surface, not here.
    if (!isSessionEnd(failure)) onRefused(describeApiError(failure));
  };

  const changeRole = async (member: TenantMember, role: TenantRole) => {
    if (role === member.role) return;
    onChanging();
    markBusy(member.user.id, true);
    try {
      const saved = await services.access.tenantMembers.setRole(tenant.id, member.user.id, role);
      setEdited((current) => ({ ...current, [saved.user.id]: saved }));
      markBusy(member.user.id, false);
    } catch (failure) {
      refuse(failure);
    }
  };

  const remove = async (member: TenantMember) => {
    onChanging();
    try {
      await services.access.tenantMembers.remove(tenant.id, member.user.id);
      setRemoved((current) => new Set(current).add(member.user.id));
    } catch (failure) {
      refuse(failure);
    }
  };

  const next = more ? more.next : (first.data?.next ?? null);
  const showMore = async () => {
    if (next === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await services.access.tenantMembers.list(tenant.id, {
        search: search || undefined,
        cursor: next,
      });
      setMore({ items: [...(more?.items ?? []), ...page.items], next: page.next });
    } catch (failure) {
      if (!isSessionEnd(failure)) setMoreError(describeApiError(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  if (first.error) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Couldn't load the members"
        description={describeApiError(first.error)}
        action={
          <Button variant="secondary" onClick={first.retry}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!first.data) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading members" className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const rows = visibleMembers([first.data.items, more?.items ?? []], edited, removed);
  if (rows.length === 0 && next === null) {
    return (
      <EmptyState
        icon={Users}
        title={search ? "No one matches" : "No members yet"}
        description={
          search
            ? "No member has this name or sign-in name."
            : "Add a person by their sign-in name."
        }
      />
    );
  }

  return (
    <>
      <div className="relative overflow-x-auto rounded-panel border border-border-subtle">
        <table
          aria-label={`Members of ${tenant.name}`}
          className="w-full min-w-160 border-collapse text-body"
        >
          <thead>
            <tr className="border-b border-border-subtle">
              <th scope="col" className={HEAD}>
                Name
              </th>
              <th scope="col" className={HEAD}>
                Sign-in name
              </th>
              <th scope="col" className={cn(HEAD, "w-40")}>
                Role
              </th>
              <th scope="col" className={cn(HEAD, "w-32 whitespace-nowrap")}>
                Added
              </th>
              <th scope="col" className="w-12 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((member) => {
              const you = person?.id === member.user.id;
              return (
                <tr key={member.user.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2 align-middle break-words text-ink-heading">
                    {member.user.name}
                    {you && <span className="text-ink-muted"> (you)</span>}
                  </td>
                  <td className="px-3 py-2 align-middle break-all text-ink-muted">
                    {member.user.preferredUsername}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <Select
                      aria-label={`Role of ${member.user.name}`}
                      value={member.role}
                      disabled={busyIds.has(member.user.id)}
                      onChange={(event) =>
                        void changeRole(member, event.target.value as TenantRole)
                      }
                    >
                      {TENANT_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap text-ink-muted">
                    <time dateTime={member.addedAt}>{formatDate(member.addedAt)}</time>
                  </td>
                  <td className="px-3 py-2 text-right align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="text-ink-muted">
                          <MoreHorizontal />
                          <span className="sr-only">Actions for {member.user.name}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemoving(member)}
                        >
                          <UserMinus aria-hidden />
                          Remove from tenant
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {next !== null && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <Button variant="secondary" disabled={loadingMore} onClick={() => void showMore()}>
            {loadingMore && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
          {moreError && (
            <p role="alert" className="text-small text-danger">
              {moreError}
            </p>
          )}
        </div>
      )}
      <RemoveMemberDialog
        member={removing}
        tenantName={tenant.name}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </>
  );
}
