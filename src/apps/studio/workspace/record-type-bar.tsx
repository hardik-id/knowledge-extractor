"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  addField,
  addRecordType,
  removeRecordType,
  updateRecordType,
} from "@/features/extraction/definition-draft";
import { Problem } from "@/features/extraction/field-table";
import { Segmented } from "@/features/extraction/review-panes";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { plural } from "@/lib/format";
import { useWorkspace } from "./workspace-state";

type Editing = "name" | "description" | null;

/**
 * The record type above the table: its name, "n fields" and "Add field"; a segmented control
 * when there are several types; and the "Record type options" menu (rename, description, add and
 * remove a record type). Every change goes into the draft.
 */
export function RecordTypeBar({ definition }: { definition: ExtractionDefinitionState }) {
  const { selectedTypeId, setSelectedTypeId } = useWorkspace();
  const { draft, setDraft, errors, showErrors } = definition;
  const [editing, setEditing] = useState<Editing>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The row a new field adds, to move the focus to its name once it is drawn.
  const focusNewField = useRef<number | null>(null);
  // Set when a menu item opens an input, so the closing menu leaves the focus to it.
  const keepFocus = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // Set by Esc and Enter: the focus goes back to the options button. Not by a blur.
  const returnFocus = useRef(false);
  const type = draft?.recordTypes.find((t) => t.id === selectedTypeId);
  const fieldCount = type?.fields.length ?? 0;

  useEffect(() => {
    if (editing) input.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    const wanted = focusNewField.current;
    if (wanted === null || fieldCount < wanted) return;
    focusNewField.current = null;
    const column = root.current?.parentElement;
    const name = Array.from(column?.querySelectorAll<HTMLInputElement>("input") ?? []).find(
      (el) => el.getAttribute("aria-label") === `Name of field ${wanted}`,
    );
    name?.focus();
    name?.scrollIntoView({ block: "nearest" });
  }, [fieldCount]);

  if (!draft || !type) return null;
  const typeError = showErrors ? errors.types[type.id] : undefined;

  const closeEdit = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" && event.key !== "Enter") return;
    // The edit is what Esc and Enter close here: not the field selection, not the overlay.
    event.preventDefault();
    event.stopPropagation();
    returnFocus.current = true;
    setEditing(null);
  };

  const edit = (what: Editing) => {
    keepFocus.current = true;
    setEditing(what);
  };

  const onAddField = () => {
    focusNewField.current = fieldCount + 1;
    setDraft((d) => addField(d, type.id));
  };

  const onAddType = () => {
    const next = addRecordType(draft);
    const added = next.recordTypes[next.recordTypes.length - 1];
    setDraft(next);
    setSelectedTypeId(added.id);
    edit("name");
  };

  return (
    <div ref={root} className="border-b border-border-subtle py-2 pr-3 pl-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {editing === "name" ? (
          <Input
            ref={input}
            value={type.name}
            aria-label="Record type name"
            placeholder="ADR"
            className="h-control-sm max-w-48 font-semibold text-ink-heading"
            aria-invalid={!!typeError}
            onChange={(e) =>
              setDraft((d) => updateRecordType(d, type.id, { name: e.target.value }))
            }
            onKeyDown={closeEdit}
            onBlur={() => setEditing(null)}
          />
        ) : (
          <h2 className="min-w-0 truncate text-body font-semibold text-ink-heading">
            {type.name || "Record type"}
          </h2>
        )}
        <span className="text-small whitespace-nowrap text-ink-muted">
          {plural(fieldCount, "field")}
        </span>
        <span className="flex-1" />
        {draft.recordTypes.length > 1 && (
          <Segmented
            label="Record type"
            value={type.id}
            onChange={setSelectedTypeId}
            options={draft.recordTypes.map((t) => ({
              value: t.id,
              label: t.name || "Record type",
            }))}
          />
        )}
        <Button variant="ghost" size="sm" onClick={onAddField}>
          <Plus data-icon="inline-start" />
          Add field
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={trigger} variant="ghost" size="icon-sm" aria-label="Record type options">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48"
            onCloseAutoFocus={(e) => {
              // After "Rename" or "Edit description" the focus belongs to the input just opened.
              if (!keepFocus.current) return;
              keepFocus.current = false;
              e.preventDefault();
              input.current?.focus();
            }}
          >
            <DropdownMenuItem onSelect={() => edit("name")}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => edit("description")}>
              Edit description
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onAddType}>Add record type</DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setEditing(null);
                setDraft((d) => removeRecordType(d, type.id));
              }}
            >
              Remove record type
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {typeError && <Problem id={`${type.id}-name-err`}>{typeError}</Problem>}
      {editing === "description" && (
        <Input
          ref={input}
          value={type.description}
          aria-label="Record type description"
          placeholder="An architecture decision record"
          className="mt-1.5 h-control-sm"
          onChange={(e) =>
            setDraft((d) => updateRecordType(d, type.id, { description: e.target.value }))
          }
          onKeyDown={closeEdit}
          onBlur={() => setEditing(null)}
        />
      )}
    </div>
  );
}
