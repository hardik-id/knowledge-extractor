import { NextResponse, type NextRequest } from "next/server";
import { isStageId } from "@/lib/stages";

/**
 * Stages this app doesn't have (unknown, or left out of its profile) get a
 * real 404 status. Without this, the static app shell is already streaming
 * (200) by the time the page calls notFound().
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
