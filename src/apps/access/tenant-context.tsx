"use client";

import { createContext, useContext } from "react";
import type { Tenant } from "@/services/access";

const TenantContext = createContext<Tenant | null>(null);

export const TenantProvider = TenantContext.Provider;

/** The tenant the tabs work on (the address's `?tenant=`, or the first the person can manage). */
export function useAccessTenant(): Tenant {
  const tenant = useContext(TenantContext);
  if (!tenant) throw new Error("useAccessTenant needs the Access frame around it.");
  return tenant;
}
