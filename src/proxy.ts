import { NextResponse, type NextRequest } from "next/server";
import { isHiddenAppPath } from "@/apps/registry";
import { isStageId } from "@/lib/stages";

/**
 * Unknown pipeline stages get a real 404 status. Without this, the static
 * app shell is already streaming (200) by the time the page calls notFound().
 * Routes of an app this deployment does not offer (`NEXT_PUBLIC_APPS`) get the
 * same 404. Other apps' routes (`/studio`) pass untouched.
 */
export function proxy(request: NextRequest) {
  if (isHiddenAppPath(request.nextUrl.pathname)) {
    return NextResponse.rewrite(new URL("/__unknown-stage", request.url));
  }
  if (!request.nextUrl.pathname.startsWith("/pipeline/")) return NextResponse.next();
  const stage = request.nextUrl.pathname.split("/")[2];
  if (stage && !isStageId(stage)) {
    return NextResponse.rewrite(new URL("/__unknown-stage", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/pipeline/:path*", "/studio/:path*"],
};
