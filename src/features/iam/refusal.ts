import { isApiError } from "@/lib/api/api-error";

/** A 403 `forbidden`: the role does not allow the action (other 403s are not about the role). */
export function isRefusal(error: unknown): boolean {
  return isApiError(error) && error.status === 403 && error.code === "forbidden";
}
