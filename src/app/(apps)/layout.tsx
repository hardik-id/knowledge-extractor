import { Suspense } from "react";
import { connection } from "next/server";
import { env } from "@/config/env";
import { AuthGate } from "@/features/auth/auth-gate";
import { AuthProvider } from "@/features/auth/auth-provider";

async function Connection() {
  await connection();
  return null;
}

/**
 * Renders nothing. With sign-in on, the gate keeps every page out of the
 * prerendered HTML, so a route whose title depends on the URL
 * (`/pipeline/[stage]`) is left with request-time metadata on an otherwise
 * static page, and Next.js refuses to build that unless the page says the
 * deferred rendering is meant. This says so. See "With Cache Components" in
 * the generateMetadata reference.
 */
function RequestTimeMarker() {
  return (
    <Suspense>
      <Connection />
    </Suspense>
  );
}

/** Every app sits behind sign-in. It is a no-op when sign-in is off. */
export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthProvider>
        <AuthGate>{children}</AuthGate>
      </AuthProvider>
      {env.authMode !== "none" && <RequestTimeMarker />}
    </>
  );
}
