"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CloudOff, ShieldOff } from "lucide-react";
import { FIRST_APP } from "@/apps/registry";
import { EmptyState } from "@/components/pipeline/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/iam/use-me";
import { cn } from "@/lib/utils";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { Person } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { manageableTenants, mayOpenAccess, pickTenant } from "./access-rules";
import { tabHref, visibleTabs } from "./access-tabs";
import { TenantProvider } from "./tenant-context";

/**
 * The frame of the Access app, shared by its tabs: the header, the tenant, and the tabs as
 * links. Until the API has said who the person is a loading state shows, never the page; anyone
 * who is not an admin gets a plain refusal. The API refuses every call anyway: this only
 * decides what is shown.
 */
export function AccessFrame({ children }: { children: React.ReactNode }) {
  const { person, failed } = useMe();

  if (!person) {
    return failed ? (
      <div className="px-4 py-6 sm:px-6">
        <EmptyState
          icon={CloudOff}
          title="Couldn't check your access"
          description="Reload the page to try again."
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    ) : (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading"
        className="space-y-3 px-4 py-6 sm:px-6"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!mayOpenAccess(person)) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to this page."
          action={
            <Button variant="secondary" asChild>
              <Link href={FIRST_APP.href}>Go to {FIRST_APP.name}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <AdminFrame person={person}>{children}</AdminFrame>;
}

function AdminFrame({ person, children }: { person: Person; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const selectId = useId();
  const tenants = useAsyncData("access-tenants", (signal) => services.access.tenants.list(signal));

  const manageable = tenants.data ? manageableTenants(person, tenants.data) : null;
  const tenant = manageable ? pickTenant(manageable, search.get("tenant")) : undefined;
  const tabs = visibleTabs(person);

  const chooseTenant = (id: string) => {
    const params = new URLSearchParams(search.toString());
    params.set("tenant", id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const tenantControl =
    manageable && tenant ? (
      manageable.length > 1 ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={selectId}>Tenant:</Label>
          <Select
            id={selectId}
            value={tenant.id}
            className="w-56 max-w-full"
            onChange={(event) => chooseTenant(event.target.value)}
          >
            {manageable.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-body text-ink">
          Tenant: <span className="font-semibold text-ink-heading">{tenant.name}</span>
        </p>
      )
    ) : null;

  return (
    <section aria-labelledby="access-title" className="flex flex-1 flex-col md:min-h-0">
      <PageHeader
        id="access-title"
        title="Access"
        facts="Who is in a tenant and what they can do there."
        actions={tenantControl}
      />
      <nav aria-label="Access" className="shrink-0 overflow-x-auto border-b border-border-subtle">
        <ul className="flex gap-1 px-4 sm:px-6">
          {tabs.map((tab) => {
            const current = pathname === `/access/${tab.id}`;
            return (
              <li key={tab.id}>
                <Link
                  href={tabHref(tab, tenant?.id ?? null)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-control items-center rounded-control px-3 text-body font-medium whitespace-nowrap transition-colors coarse:min-h-touch",
                    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-link after:opacity-0",
                    current
                      ? "text-ink-heading after:opacity-100"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="relative min-w-0 flex-1 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-y-auto">
        {tenants.error ? (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load the tenants"
            description={describeApiError(tenants.error)}
            action={
              <Button variant="secondary" onClick={tenants.retry}>
                Try again
              </Button>
            }
          />
        ) : !manageable ? (
          <div role="status" aria-busy="true" aria-label="Loading tenants" className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !tenant ? (
          <p className="text-body text-ink-muted">There is no tenant to manage.</p>
        ) : (
          <TenantProvider value={tenant}>{children}</TenantProvider>
        )}
      </div>
    </section>
  );
}
