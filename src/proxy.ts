import { NextResponse, type NextRequest } from "next/server";
import { STAGE_IDS } from "@/types/pipeline";

/**
 * Unknown stages get a real 404 status. Without this, the static app shell is
 * already streaming (200) by the time the page calls notFound().
 */
export function proxy(request: NextRequest) {
  const stage = request.nextUrl.pathname.split("/")[2];
  if (stage && !(STAGE_IDS as readonly string[]).includes(stage)) {
    return NextResponse.rewrite(new URL("/__unknown-stage", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/pipeline/:stage+",
};
