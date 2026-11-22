"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitFrontMatter } from "@/lib/front-matter";
import { CHIPS_ATTRIBUTE, MARKS_ATTRIBUTE, rehypeHighlights } from "@/lib/rehype-highlights";
import { cn } from "@/lib/utils";
import {
  Highlight,
  type AnnotationProps,
  type HighlightData,
  type HighlightMark,
} from "./annotated-text";

interface AnnotatedMarkdownProps extends AnnotationProps {
  /** The full Markdown the marks point into, front matter included. */
  markdown: string;
  marks: HighlightMark[];
  className?: string;
}

/** The text content of a hast node, for the accessible name of a piece. */
function textOf(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] } | undefined;
  if (!n) return "";
  if (n.type === "text") return n.value ?? "";
  return (n.children ?? []).map(textOf).join("");
}

/**
 * Rendered view: the Markdown body with Polder typography, its marks painted
 * by a rehype plugin (lib/rehype-highlights). Front matter is shown as
 * properties above, like MarkdownViewer; marks inside it are not shown here.
 */
export function AnnotatedMarkdown({
  markdown,
  marks,
  activeValueId,
  onMarkClick,
  focusFieldId,
  chips = true,
  className,
}: AnnotatedMarkdownProps) {
  // The front matter is left out here: the Enrichment stage shows it, and this view is about the text.
  const { body } = useMemo(() => splitFrontMatter(markdown), [markdown]);
  const bodyOffset = markdown.length - body.length;

  const rehypePlugins = useMemo(
    () => [
      [
        rehypeHighlights,
        {
          marks: marks.map((m) => ({ start: m.start, end: m.end, data: { id: m.data.id } })),
          body,
          bodyOffset,
          chips,
        },
      ] as [typeof rehypeHighlights, Parameters<typeof rehypeHighlights>[0]],
    ],
    [marks, body, bodyOffset, chips],
  );

  const components = useMemo<Components>(() => {
    const byId = new Map<string, HighlightData>(marks.map((m) => [m.data.id, m.data]));
    return {
      mark(props) {
        const attrs = props as unknown as Record<string, string | undefined>;
        const items = (attrs[MARKS_ATTRIBUTE] ?? "").split(" ").flatMap((id) => byId.get(id) ?? []);
        if (items.length === 0) return <>{props.children}</>;
        const chipIds = (attrs[CHIPS_ATTRIBUTE] ?? "").split(" ").filter(Boolean);
        return (
          <Highlight
            items={items}
            chipIds={chipIds}
            label={textOf(props.node)}
            activeValueId={activeValueId}
            onMarkClick={onMarkClick}
            focusFieldId={focusFieldId}
          >
            {props.children}
          </Highlight>
        );
      },
    };
  }, [marks, activeValueId, onMarkClick, focusFieldId]);

  return (
    <div className={cn("space-y-6", className)}>
      <article className="md-prose md-prose-reading">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={rehypePlugins}
          components={components}
        >
          {body}
        </ReactMarkdown>
      </article>
    </div>
  );
}
