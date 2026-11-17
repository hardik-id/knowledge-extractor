/** Helpers to bring a highlight or a value into view. */

function behavior(): ScrollBehavior {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function scrollToElement(element: Element | null | undefined): void {
  element?.scrollIntoView({ block: "center", behavior: behavior() });
}

const escape = (value: string) => (typeof CSS !== "undefined" ? CSS.escape(value) : value);

/** The first highlight of a value in the document, in whichever view is showing. */
export function findHighlight(root: ParentNode | null, valueId: string): Element | null {
  return root?.querySelector(`[data-value-id="${escape(valueId)}"]`) ?? null;
}

/** A value in the records pane. */
export function findRecordValue(root: ParentNode | null, valueId: string): Element | null {
  return root?.querySelector(`[data-record-value="${escape(valueId)}"]`) ?? null;
}

export function findRecordCard(root: ParentNode | null, recordId: string): Element | null {
  return root?.querySelector(`[data-record="${escape(recordId)}"]`) ?? null;
}

/** The highlight that starts closest to a position in the text, for records with no highlight of their own. */
export function findHighlightNear(root: ParentNode | null, position: number): Element | null {
  let best: Element | null = null;
  let distance = Infinity;
  for (const el of root?.querySelectorAll("[data-start]") ?? []) {
    const d = Math.abs(Number(el.getAttribute("data-start")) - position);
    if (d < distance) {
      best = el;
      distance = d;
    }
  }
  return best;
}
