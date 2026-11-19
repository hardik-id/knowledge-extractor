"use client";

import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AssistantMessage } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import type { Draft } from "./definition-draft";
import { AssistantProposalCard, type ProposalOutcome } from "./assistant-proposal-card";
import { useAssistant } from "./use-assistant";

interface AssistantPanelProps {
  draft: Draft;
  setDraft: (next: Draft) => void;
}

function suggestionsFor(draft: Draft): { label: string; text: string | null }[] {
  if (draft.recordTypes.length === 0) {
    return [{ label: "Suggest fields from my prompt", text: draft.prompt.trim() || null }];
  }
  return [
    {
      label: "Split approver and approval date",
      text: "Split approver and approval date into two fields.",
    },
    {
      label: "Make status exact text",
      text: "Make the status field exact text from the document, not inferred.",
    },
    { label: "Output as JSON", text: "Output as JSON." },
  ];
}

function Message({ message }: { message: AssistantMessage }) {
  const mine = message.role === "user";
  const streaming = message.status === "streaming";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <span className="text-[12px] leading-4 font-semibold text-ink-muted">
        {mine ? "You" : "Assistant"}
      </span>
      {(message.text || streaming) && (
        <div
          className={cn(
            "max-w-[92%] rounded-lg border px-3 py-2 text-[15px] leading-6 break-words whitespace-pre-wrap",
            mine
              ? "border-border-control bg-surface-tint text-ink"
              : "border-border-subtle bg-surface-raised text-ink",
          )}
        >
          {message.text}
          {streaming && (
            <span className="mt-1 flex items-center gap-1 text-[13px] leading-[18px] text-ink-muted">
              <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
              Writing…
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantPanel({ draft, setDraft }: AssistantPanelProps) {
  const assistant = useAssistant(draft);
  const { messages, busy } = assistant;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, ProposalOutcome>>({});
  const id = useId();

  const latestProposalId = [...messages].reverse().find((m) => m.proposal)?.id;

  const submit = async (value: string) => {
    if (busy || value.trim() === "") return;
    if (await assistant.send(value)) setText("");
  };

  const suggestions = suggestionsFor(draft);

  return (
    <aside
      aria-labelledby={`${id}-title`}
      className="flex min-h-0 flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-card lg:max-h-[max(22rem,calc(100dvh-25rem))]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h2
            id={`${id}-title`}
            className="flex items-center gap-2 text-xl leading-7 font-semibold"
          >
            <Sparkles aria-hidden className="size-5 text-ink-muted" />
            Assistant
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-muted">
            Describe what you want to extract, or ask for a change. It proposes; you decide.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Show"}
          <ChevronDown data-icon="inline-end" aria-hidden className={cn(open && "rotate-180")} />
        </Button>
      </div>

      <div
        id={`${id}-body`}
        className={cn("min-h-0 flex-1 flex-col gap-3", open ? "flex" : "hidden lg:flex")}
      >
        {assistant.error ? (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p>
              <span className="font-semibold text-ink">Couldn&apos;t load the conversation.</span>{" "}
              {describeApiError(assistant.error)}
            </p>
            <Button variant="outline" size="sm" onClick={assistant.retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            aria-live="polite"
            aria-busy={assistant.isLoading}
            aria-label="Conversation"
            role="log"
            className="flex min-h-24 flex-1 flex-col gap-4 overflow-y-auto pr-1"
          >
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <Message message={m} />
                {m.proposal && (
                  <AssistantProposalCard
                    proposal={m.proposal}
                    draft={draft}
                    outcome={outcomes[m.id] ?? (m.id === latestProposalId ? "open" : "replaced")}
                    onApply={() => {
                      setDraft(m.proposal!.definition);
                      setOutcomes((o) => ({ ...o, [m.id]: "applied" }));
                      toast.success("Applied. Review it and save, or run the extraction.");
                    }}
                    onDismiss={() => setOutcomes((o) => ({ ...o, [m.id]: "dismissed" }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {messages.length === 0 && !assistant.isLoading && (
          <ul className="flex flex-wrap gap-2" aria-label="Suggestions">
            {suggestions.map((s) => (
              <li key={s.label}>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() =>
                    s.text
                      ? void submit(s.text)
                      : toast.message("Write a prompt first", {
                          description: "Fill in “What to extract”, then ask again.",
                        })
                  }
                >
                  {s.label}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label htmlFor={`${id}-input`} className="sr-only">
            Message to the assistant
          </label>
          <Textarea
            id={`${id}-input`}
            rows={3}
            value={text}
            disabled={busy}
            placeholder="For example: add a field for the approver"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit(text);
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] leading-4 text-ink-muted">
              Enter to send, Shift+Enter for a new line
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || messages.length === 0}
                onClick={() => setConfirming(true)}
              >
                Clear conversation
              </Button>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={busy || text.trim() === ""}
              >
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the conversation?</DialogTitle>
            <DialogDescription>
              This removes every message and proposal for everyone on this project. The definition
              and the records stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await assistant.clear()) setOutcomes({});
                setConfirming(false);
              }}
            >
              Clear conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
