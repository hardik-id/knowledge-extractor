/** What decides how one painted piece looks: the marks under it, the field in focus and the selected value. */
interface LookMark {
  fieldId: string;
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
 * With a field in focus, a piece is coloured by its marks of that field at full strength; a piece
 * with none of them is faded (a pale fill and underline, still in its colour), unless its value is
 * the selected one. Without a field in focus nothing is faded.
 */
export function highlightLook<T extends LookMark>(
  items: T[],
  focusFieldId: string | null | undefined,
  activeValueId: string | null | undefined,
): { faded: boolean; active: boolean; labelIndex: number } {
  const focused = focusFieldId == null ? items : items.filter((i) => i.fieldId === focusFieldId);
  const active = activeValueId != null && items.some((item) => item.valueId === activeValueId);
  return {
    faded: focusFieldId != null && focused.length === 0 && !active,
    active,
    labelIndex: primaryOf(focused.length === 0 ? items : focused).labelIndex,
  };
}
