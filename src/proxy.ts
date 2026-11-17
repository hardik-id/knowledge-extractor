import { NextResponse, type NextRequest } from "next/server";
import { isStageId } from "@/lib/stages";

/**
 * Unknown pipeline stages get a real 404 status. Without this, the static
 * app shell is already streaming (200) by the time the page calls notFound().
 * Only `/pipeline/*` is matched: other apps' routes (`/studio`) pass untouched.
 */
export function proxy(request: NextRequest) {
  const stage = request.nextUrl.pathname.split("/")[2];
  if (stage && !isStageId(stage)) {
    return NextResponse.rewrite(new URL("/__unknown-stage", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/pipeline/:stage+",
};
