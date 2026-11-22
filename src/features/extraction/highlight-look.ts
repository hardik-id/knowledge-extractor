/** What decides how one painted piece looks: the marks under it, the record in focus and the selected value. */
interface LookMark {
  recordId: string;
  valueId: string;
  start: number;
  end: number;
  labelIndex: number;
}

/** The shortest mark wins the colour; among equals, the one listed last (the inner one). */
export function primaryOf<T extends LookMark>(items: T[]): T {
  return items.reduce((best, item) =>
    item.end - item.start <= best.end - best.start ? item : best,
  );
}

/**
 * With a record in focus, a piece is coloured by its marks of that record; a piece
 * with none of them is faint (dashed, no fill), unless its value is the selected one.
 */
export function highlightLook<T extends LookMark>(
  items: T[],
  focusRecordId: string | null | undefined,
  activeValueId: string | null | undefined,
): { faint: boolean; active: boolean; labelIndex: number } {
  const focused = focusRecordId == null ? items : items.filter((i) => i.recordId === focusRecordId);
  const active = activeValueId != null && items.some((item) => item.valueId === activeValueId);
  return {
    faint: focused.length === 0 && !active,
    active,
    labelIndex: primaryOf(focused.length === 0 ? items : focused).labelIndex,
  };
}
