import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renders Markdown with Polder typography (styles: .md-prose in globals.css). */
export function MarkdownViewer({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <article className={cn("md-prose", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  );
}
