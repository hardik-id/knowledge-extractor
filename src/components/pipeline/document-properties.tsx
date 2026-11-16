import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LONG_TEXT = 80;

/** `document_type` / `documentType` -> "Document type". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

type Scalar = string | number | boolean | bigint;

function isScalar(v: unknown): v is Scalar {
  return ["string", "number", "boolean", "bigint"].includes(typeof v);
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Date) return false;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function isHttpUrl(s: string): boolean {
  if (!/^https?:\/\//i.test(s) || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function scalarText(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function Text({ value }: { value: string }) {
  if (isHttpUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-link underline underline-offset-2"
      >
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

function Value({ value }: { value: unknown }) {
  if (isEmpty(value)) return <span className="text-ink-muted">—</span>;
  if (isScalar(value) || value instanceof Date) {
    const text = scalarText(value);
    return (
      <span className="break-words">
        <Text value={text} />
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.every((v) => isScalar(v) || v instanceof Date)) {
      return (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <li key={i}>
              <Badge variant="outline" className="h-auto max-w-full py-0.5 whitespace-normal">
                {scalarText(v)}
              </Badge>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="border-l-2 border-border-subtle pl-3">
            <Value value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className="space-y-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2">
            <dt className="text-ink-muted">{humanizeKey(k)}:</dt>
            <dd className="min-w-0">
              <Value value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <>{String(value)}</>;
}

function isWide(v: unknown): boolean {
  return typeof v === "string" && !isHttpUrl(v) && v.length > LONG_TEXT;
}

/** The front matter of a document as a labelled list of properties. */
export function DocumentProperties({
  data,
  className,
}: {
  data: Record<string, unknown>;
  className?: string;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  return (
    <section
      aria-label="Document properties"
      className={cn(
        "rounded-lg border border-border-subtle bg-surface-tint p-4 text-sm",
        className,
      )}
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
        {entries.map(([key, value]) =>
          isWide(value) ? (
            <div key={key} className="sm:col-span-2">
              <dt className="font-medium text-ink-muted">{humanizeKey(key)}</dt>
              <dd className="mt-1 leading-relaxed whitespace-pre-line text-ink-heading">
                {String(value).trim()}
              </dd>
            </div>
          ) : (
            <div key={key} className="grid gap-1 sm:col-span-2 sm:grid-cols-subgrid sm:gap-x-6">
              <dt className="font-medium text-ink-muted">{humanizeKey(key)}</dt>
              <dd className="min-w-0 text-ink-heading">
                <Value value={value} />
              </dd>
            </div>
          ),
        )}
      </dl>
    </section>
  );
}
