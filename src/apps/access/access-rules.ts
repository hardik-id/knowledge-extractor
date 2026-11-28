import type { Person } from "@/services/contracts";
import type { Tenant } from "@/services/access";

/**
 * Who is shown the Access app, and which tenants they can pick. These only decide what the
 * screens offer: the API checks every call and refuses what is not allowed.
 */

type Who = Pick<Person, "platformAdmin" | "tenants">;

/** A platform admin, or an admin of at least one tenant. Not known yet answers no. */
export function mayOpenAccess(person: Who | null | undefined): boolean {
  if (!person) return false;
  return person.platformAdmin || person.tenants.some((tenant) => tenant.role === "admin");
}

/**
 * The tenants the person can manage, by name: all of them for a platform admin, the ones they
 * are an admin of for anyone else. `tenants` is what the API listed for them.
 */
export function manageableTenants(person: Who, tenants: readonly Tenant[]): Tenant[] {
  return tenants
    .filter((tenant) => person.platformAdmin || tenant.role === "admin")
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The tenant the address names, or the first one when it names none the person can manage. */
export function pickTenant(
  tenants: readonly Tenant[],
  requestedId: string | null | undefined,
): Tenant | undefined {
  return tenants.find((tenant) => tenant.id === requestedId) ?? tenants[0];
}
