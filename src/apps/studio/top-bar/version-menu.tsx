"use client";

import { ChevronDown, History } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { versionLine } from "@/features/extraction/version-format";
import { HistoryDialog } from "@/features/extraction/version-history";
import { MAX_DEFINITION_NOTE_LENGTH } from "@/services/contracts";

/** "Version 3", "Version 3 · unsaved changes", "Nothing saved yet" (with " · unsaved changes" once something is drafted). */
export function versionLabel(version: number, empty: boolean, dirty: boolean): string {
  const base = empty ? "Nothing saved yet" : `Version ${version}`;
  return dirty ? `${base} · unsaved changes` : base;
}

/**
 * The version of the configuration as text in the top bar. It opens save with a note, discard
 * changes and the version history.
 */
export function VersionMenu({ extraction }: { extraction: ExtractionRun }) {
  const { definition, running } = extraction;
  const { saved, dirty, saving } = definition;
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [note, setNote] = useState(definition.suggestedNote);
  const id = useId();
  // Loading a template changes what the note starts with: a form left open would show the old one.
  const [seenHint, setSeenHint] = useState(definition.suggestedNote);
  if (seenHint !== definition.suggestedNote) {
    setSeenHint(definition.suggestedNote);
    setNote(definition.suggestedNote);
    setOpen(false);
  }
  if (!saved) return null;

  const empty = saved.recordTypes.length === 0;

  const submit = async () => {
    if (!definition.valid) {
      definition.revealErrors();
      extraction.setTab?.("define");
      setOpen(false);
      toast.error(`Fix the ${extraction.noun} first`, {
        description: "Some fields need attention.",
      });
      return;
    }
    const result = await definition.save(note);
    if (result) {
      setOpen(false);
      setNote("");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className={dirty ? "text-ink" : "text-ink-muted"}>
            <span data-testid="version-line" className={dirty ? "font-medium" : undefined}>
              {versionLabel(saved.version, empty, dirty)}
            </span>
            <ChevronDown aria-hidden className="text-ink-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="space-y-3">
          {!empty && (
            <p className="text-small text-ink-muted">
              {versionLine(saved.version, saved.createdAt)}
            </p>
          )}
          {dirty ? (
            <form
              aria-label="Save configuration"
              className="space-y-3"
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
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" size="sm" disabled={saving || running}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    definition.discard();
                    setOpen(false);
                  }}
                >
                  Discard changes
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-body text-ink-muted">No unsaved changes.</p>
          )}
          <div className="border-t border-border-subtle pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5"
              onClick={() => {
                setOpen(false);
                setHistory(true);
              }}
            >
              <History data-icon="inline-start" aria-hidden />
              Version history
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {history && <HistoryDialog definition={definition} onClose={() => setHistory(false)} />}
    </>
  );
}
