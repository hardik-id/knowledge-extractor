import type { TenantRole } from "@/services/contracts";
import type { TenantMember } from "@/services/access";

export const ROLE_LABEL: Record<TenantRole, string> = { admin: "Admin", member: "Member" };

/** The roles a tenant member can have, in the order the selects list them. */
export const TENANT_ROLES: readonly TenantRole[] = ["admin", "member"];

/**
 * The members to show: the pages read so far (a later page can repeat a person when the list
 * changed in between), minus the people just removed, with the roles just changed.
 */
export function visibleMembers(
  pages: readonly (readonly TenantMember[])[],
  edited: Readonly<Record<number, TenantMember>>,
  removed: ReadonlySet<number>,
): TenantMember[] {
  const seen = new Set<number>();
  const rows: TenantMember[] = [];
  for (const member of pages.flat()) {
    const id = member.user.id;
    if (seen.has(id) || removed.has(id)) continue;
    seen.add(id);
    rows.push(edited[id] ?? member);
  }
  return rows;
}
