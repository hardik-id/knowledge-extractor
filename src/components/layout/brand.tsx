import Link from "next/link";
import { FIRST_STAGE, stageHref } from "@/lib/stages";

/** Product mark + name. `compact` shows "KX" below 600px. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href={stageHref(FIRST_STAGE)}
      className="flex items-center gap-2 text-xl leading-7 font-bold text-ink-heading"
    >
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-hero">
        <span className="size-3 rounded-full bg-brand-orange" />
      </span>
      {compact ? (
        <>
          <span className="hidden sm:inline">Knowledge Extractor</span>
          <span className="sm:hidden">KX</span>
        </>
      ) : (
        <span>Knowledge Extractor</span>
      )}
    </Link>
  );
}
