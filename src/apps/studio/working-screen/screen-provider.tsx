"use client";

import { useEffect, useMemo, useReducer, type ReactNode } from "react";
import { readConfigurationOpen, rememberConfigurationOpen } from "./configuration-memory";
import { offerProposal } from "./use-proposal";
import { useFileExtraction } from "@/features/run/use-extraction";
import type { RecordType } from "@/services/contracts";
import {
  INITIAL_SELECTION,
  resolveRecordId,
  resolveTypeId,
  ScreenContext,
  screenReducer,
  type ScreenState,
} from "./screen-state";

/**
 * Holds the working screen's selection for one open document. Keyed by the caller on the file, so
 * opening another document starts clean. The defaults that depend on data (the first type, the
 * first record of the type) are resolved here, so a consumer never sees an id that is gone.
 */
export function ScreenProvider({
  fileId,
  recordTypes,
  children,
}: {
  fileId: string | null;
  recordTypes: readonly RecordType[];
  children: ReactNode;
}) {
  const [selection, dispatch] = useReducer(screenReducer, INITIAL_SELECTION);
  const records = useFileExtraction(fileId).data?.records;
  // A template offer belongs to this screen: it must not outlive the workspace or document.
  useEffect(() => () => offerProposal(null), []);
  // Closed until the browser says otherwise (read after the first paint, so the server and the
  // client draw the same; a person who left it open sees it open a moment later, on purpose). It only ever opens here: a person or a problem that opened it first wins.
  useEffect(() => {
    if (readConfigurationOpen()) dispatch({ type: "setConfigurationOpen", open: true });
  }, []);

  const value = useMemo<ScreenState>(() => {
    const selectedTypeId = resolveTypeId(selection.selectedTypeId, recordTypes);
    const selectedFieldId = recordTypes.some((t) =>
      t.fields.some((f) => f.id === selection.selectedFieldId),
    )
      ? selection.selectedFieldId
      : null;
    return {
      ...selection,
      fileId,
      selectedTypeId,
      selectedFieldId,
      currentRecordId: resolveRecordId(selection.currentRecordId, records ?? [], selectedTypeId),
      setSelectedTypeId: (typeId) => dispatch({ type: "selectType", typeId }),
      setCurrentRecordId: (recordId) => dispatch({ type: "setCurrentRecord", recordId }),
      setSelectedFieldId: (fieldId) => dispatch({ type: "selectField", fieldId }),
      setOpenValue: (openValue) => dispatch({ type: "openValue", value: openValue }),
      setProposal: (proposal) => dispatch({ type: "setProposal", proposal }),
      setConfigurationOpen: (open, remember = false) => {
        if (remember) rememberConfigurationOpen(open);
        dispatch({ type: "setConfigurationOpen", open });
      },
    };
  }, [selection, fileId, recordTypes, records]);

  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}
