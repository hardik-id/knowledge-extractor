import Link from "next/link";
import { FIRST_APP } from "@/apps/registry";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-[max(16px,env(safe-area-inset-left))]">
      <p className="text-sm leading-5 font-semibold tracking-[0.06em] text-link uppercase">
        Error 404
      </p>
      <h1 className="text-[32px] leading-10 font-bold">This page doesn’t exist</h1>
      <p className="text-ink-muted">The link may be mistyped, or the page was moved.</p>
      <Button asChild>
        <Link href={FIRST_APP.href}>Go to {FIRST_APP.name}</Link>
      </Button>
    </main>
  );
}
