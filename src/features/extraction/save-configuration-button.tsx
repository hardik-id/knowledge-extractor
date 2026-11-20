"use client";

import { Save } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_DEFINITION_NOTE_LENGTH } from "@/services/contracts";
import type { ExtractionRun } from "./use-extraction-run";

/** "Save configuration": saves the draft as a new version, with an optional note asked for underneath. */
export function SaveConfigurationButton({ extraction }: { extraction: ExtractionRun }) {
  const { definition, running } = extraction;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(definition.suggestedNote);
  const id = useId();
  // Loading a template changes what the note starts with: a form left open would show the old one.
  const [seenHint, setSeenHint] = useState(definition.suggestedNote);
  if (seenHint !== definition.suggestedNote) {
    setSeenHint(definition.suggestedNote);
    setNote(definition.suggestedNote);
    setOpen(false);
  }

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!definition.valid) {
      definition.revealErrors();
      extraction.setTab("define");
      toast.error(`Fix the ${extraction.noun} first`, {
        description: "Some fields on the Define tab need attention.",
      });
      return;
    }
    setOpen(true);
  };

  const submit = async () => {
    const saved = await definition.save(note);
    if (saved) {
      setOpen(false);
      setNote("");
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={!definition.dirty || running || definition.saving}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <Save data-icon="inline-start" aria-hidden />
        Save configuration
      </Button>
      {open && (
        <form
          id={id}
          aria-label="Save configuration"
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2.5rem)] space-y-3 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${id}-note`}>Note (optional)</Label>
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={MAX_DEFINITION_NOTE_LENGTH}
              placeholder="What changed and why"
              autoFocus
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" size="sm" disabled={definition.saving}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={definition.saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
