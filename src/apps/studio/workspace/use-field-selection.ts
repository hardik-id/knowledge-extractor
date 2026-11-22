"use client";

/** Which field is selected in the table, and where the document should scroll for it. */
export interface FieldSelection {
  selectedFieldId: string | null;
  /** The value to scroll the document to; changes when the selection or the record does. */
  scrollTargetValueId: string | null;
  /** A click on a field's row (its id) selects it, a second click clears it; Esc passes null. */
  toggle: (fieldId: string | null) => void;
}

const noSelection: FieldSelection = {
  selectedFieldId: null,
  scrollTargetValueId: null,
  toggle: () => {},
};

/** A stub until item 8 (the field selection): no selection, and `toggle` does nothing. */
export function useFieldSelection(): FieldSelection {
  return noSelection;
}
