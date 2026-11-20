/**
 * Probe path for the cluster (liveness and readiness). It answers 200 from the
 * Next.js server alone: no backend call, no sign-in, no page render.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
