import type { Person } from "@/services/contracts";

export interface AccessTab {
  /** The last part of the address: `/access/<id>`. */
  id: string;
  label: string;
  /** Shown to platform admins only. */
  platformAdminOnly?: boolean;
}

/**
 * The tabs of the Access app, in order. A later tab is one line here, plus its page under
 * `src/app/(apps)/access/<id>/`.
 */
export const ACCESS_TABS: readonly AccessTab[] = [{ id: "members", label: "Members" }];

/** The tabs this person is shown. */
export function visibleTabs(
  person: Pick<Person, "platformAdmin">,
  tabs: readonly AccessTab[] = ACCESS_TABS,
): AccessTab[] {
  return tabs.filter((tab) => !tab.platformAdminOnly || person.platformAdmin);
}

/** The address of a tab, keeping the chosen tenant. */
export function tabHref(tab: Pick<AccessTab, "id">, tenantId: string | null): string {
  const query = tenantId ? `?tenant=${encodeURIComponent(tenantId)}` : "";
  return `/access/${tab.id}${query}`;
}
