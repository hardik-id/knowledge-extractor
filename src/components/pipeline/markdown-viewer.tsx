import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitFrontMatter } from "@/lib/front-matter";
import { cn } from "@/lib/utils";
import { DocumentProperties } from "./document-properties";

/**
 * Renders Markdown with Polder typography (styles: .md-prose in globals.css).
 * A leading YAML front matter block is shown as a properties block above the body.
 * `className` goes on the outer wrapper (callers pass padding).
 */
export function MarkdownViewer({ markdown, className }: { markdown: string; className?: string }) {
  const { data, raw, body } = splitFrontMatter(markdown);
  return (
    <div className={cn("space-y-6", className)}>
      {data ? (
        <DocumentProperties data={data} />
      ) : raw?.trim() ? (
        <pre
          aria-label="Document properties (unparsed)"
          className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-tint p-4 font-mono text-xs whitespace-pre-wrap text-ink-heading"
        >
          {raw}
        </pre>
      ) : null}
      <article className="md-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </article>
    </div>
  );
}
