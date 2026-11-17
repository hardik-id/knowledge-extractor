import type { Metadata } from "next";
import { RedirectBridge } from "@/features/auth/redirect-bridge";

export const metadata: Metadata = { title: "Signing in" };

export default function AuthRedirectPage() {
  return <RedirectBridge />;
}
