import { createContext, useContext } from "react";
import type { ExtractionRecord, RecordType } from "@/services/contracts";

/** Where a value's menu opens: the highlight it belongs to, in viewport coordinates. */
export interface ValueAnchor {
  left: number;
  top: number;
  bottom: number;
  right: number;
}

/** What the working screen has selected. Nothing here is saved. */
export interface WorkspaceSelection {
  /** The record type shown in the field column; null until chosen (then the first type). */
  selectedTypeId: string | null;
  /** The record being looked at; null until chosen (then the first record of the type). */
  currentRecordId: string | null;
  /** The field selected in the table. */
  selectedFieldId: string | null;
  /** The value whose menu is open, and the highlight it opens at. */
  openValue: { valueId: string; anchor: ValueAnchor } | null;
  /** The assistant's pending proposal. A placeholder until item 10 fills it. */
  proposal: unknown;
  /** The conversation with the assistant is open in the column. */
  conversationOpen: boolean;
}

export const INITIAL_SELECTION: WorkspaceSelection = {
  selectedTypeId: null,
  currentRecordId: null,
  selectedFieldId: null,
  openValue: null,
  proposal: null,
  conversationOpen: false,
};

export type WorkspaceAction =
  | { type: "selectType"; typeId: string | null }
  | { type: "setCurrentRecord"; recordId: string | null }
  | { type: "selectField"; fieldId: string | null }
  | { type: "openValue"; value: WorkspaceSelection["openValue"] }
  | { type: "setProposal"; proposal: unknown }
  | { type: "setConversationOpen"; open: boolean };

export function workspaceReducer(
  state: WorkspaceSelection,
  action: WorkspaceAction,
): WorkspaceSelection {
  switch (action.type) {
    case "selectType":
      if (action.typeId === state.selectedTypeId) return state;
      // Another type has other records and other fields.
      return {
        ...state,
        selectedTypeId: action.typeId,
        currentRecordId: null,
        selectedFieldId: null,
        openValue: null,
      };
    case "setCurrentRecord":
      return state.currentRecordId === action.recordId
        ? state
        : { ...state, currentRecordId: action.recordId };
    case "selectField":
      return state.selectedFieldId === action.fieldId
        ? state
        : { ...state, selectedFieldId: action.fieldId };
    case "openValue":
      return { ...state, openValue: action.value };
    case "setProposal":
      return { ...state, proposal: action.proposal };
    case "setConversationOpen":
      return state.conversationOpen === action.open
        ? state
        : { ...state, conversationOpen: action.open };
  }
}

/**
 * The record type in use: the chosen one while it still exists, else the first. Null when there
 * are none.
 */
export function resolveTypeId(
  selectedTypeId: string | null,
  recordTypes: readonly Pick<RecordType, "id">[],
): string | null {
  if (selectedTypeId && recordTypes.some((t) => t.id === selectedTypeId)) return selectedTypeId;
  return recordTypes[0]?.id ?? null;
}

/**
 * The record being looked at: the chosen one while it still exists, else the first record of the
 * type. Null when the type has none.
 */
export function resolveRecordId(
  currentRecordId: string | null,
  records: readonly (Pick<ExtractionRecord, "id" | "recordTypeId"> & {
    review?: ExtractionRecord["review"];
  })[],
  typeId: string | null,
): string | null {
  if (currentRecordId && records.some((r) => r.id === currentRecordId)) return currentRecordId;
  // The first of the strip's own order (rejected records last), so the screen opens on "Record 1".
  const own = records.filter((r) => r.recordTypeId === typeId);
  return (own.find((r) => r.review !== "rejected") ?? own[0])?.id ?? null;
}

export interface WorkspaceState extends WorkspaceSelection {
  /** The open document. */
  fileId: string | null;
  setSelectedTypeId: (typeId: string | null) => void;
  setCurrentRecordId: (recordId: string | null) => void;
  setSelectedFieldId: (fieldId: string | null) => void;
  setOpenValue: (value: WorkspaceSelection["openValue"]) => void;
  setProposal: (proposal: unknown) => void;
  setConversationOpen: (open: boolean) => void;
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

/** The working screen's selection. Only inside `WorkspaceProvider`. */
export function useWorkspace(): WorkspaceState {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("useWorkspace is used outside the working screen.");
  return state;
}
