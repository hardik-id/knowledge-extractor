import Link from "next/link";
import { appProfile } from "@/config/app-profile";
import { FIRST_STAGE, stageHref } from "@/lib/stages";

/** Product mark + name. `compact` shows the short name below 600px. */
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
          <span className="hidden sm:inline">{appProfile.name}</span>
          <span className="sm:hidden">{appProfile.shortName}</span>
        </>
      ) : (
        <span>{appProfile.name}</span>
      )}
    </Link>
  );
}
