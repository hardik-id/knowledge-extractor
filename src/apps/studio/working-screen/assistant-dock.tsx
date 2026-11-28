"use client";

import { MoreHorizontal, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AssistantWorking, Message } from "@/features/extraction/assistant-panel";
import { useAssistant } from "@/features/extraction/use-assistant";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { describeApiError } from "@/services/errors";
import { StartPanel } from "../start/start-panel";
import { resetOutcomes, useProposalSync } from "./use-proposal";

/**
 * The assistant in the column, always open: its header with the menu, the conversation filling the
 * height (oldest message first, the newest in view) and the input at the bottom. With nothing
 * configured the conversation starts with the start content (ask, templates, add a field).
 * Its proposals are shown in the table, not here.
 */
export function AssistantDock({
  definition,
  starting,
}: {
  definition: ExtractionDefinitionState;
  /** Nothing saved, drafted or suggested: the conversation opens with the start content. */
  starting: boolean;
}) {
  const assistant = useAssistant(definition.draft ?? undefined);
  const { messages, busy, activity } = assistant;
  const outcomeOf = useProposalSync(
    definition.draft ?? undefined,
    messages,
    !assistant.isLoading && !assistant.error,
  );
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  const log = useRef<HTMLDivElement>(null);

  // The newest message is the one to read.
  useEffect(() => {
    // With no message yet the start content is shown from its top.
    if (log.current && messages.length > 0) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, activity]);

  const submit = async () => {
    if (busy || text.trim() === "") return;
    if (await assistant.send(text)) setText("");
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-h-[max(240px,40%)] flex-1 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2 py-1 pr-2 pl-4">
        <Sparkles aria-hidden className="size-4 text-link" />
        <h2 id={`${id}-title`} className="font-semibold text-ink-heading">
          Assistant
        </h2>
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More about the conversation">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44 whitespace-nowrap">
            <DropdownMenuItem
              disabled={busy || messages.length === 0}
              onSelect={() => setConfirming(true)}
            >
              Clear conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {assistant.error ? (
        <div className="flex min-h-0 flex-1 flex-col items-start gap-2 px-4 pb-2">
          <p>
            <span className="font-semibold text-ink">Couldn&apos;t load the conversation.</span>{" "}
            {describeApiError(assistant.error)}
          </p>
          <Button variant="outline" size="sm" onClick={assistant.retry}>
            Try again
          </Button>
        </div>
      ) : (
        <div ref={log} className="min-h-0 flex-1 overflow-y-auto px-4 pb-1">
          {starting && (
            <div className="pt-2 pb-4">
              <StartPanel definition={definition} assistant={assistant} />
            </div>
          )}
          <div
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-busy={assistant.isLoading}
            className="flex flex-col gap-3"
          >
            {messages.length === 0 && !assistant.isLoading && !starting && (
              <p className="text-small text-ink-muted">
                Describe what you want to extract, or ask for a change.
              </p>
            )}
            {messages.map((m) => {
              const shown = m.proposal ? outcomeOf(m) : null;
              return (
                <div key={m.id} className="flex flex-col gap-1">
                  <Message message={m} />
                  {shown && (
                    <p
                      className={
                        shown.outcome === "open"
                          ? "text-small font-medium text-warning"
                          : "text-small text-ink-muted"
                      }
                    >
                      {shown.line}
                    </p>
                  )}
                </div>
              );
            })}
            {(activity === "working" || activity === "awaited") && <AssistantWorking />}
          </div>
        </div>
      )}
      <form
        className={`flex shrink-0 items-center gap-2 border-t border-border-subtle py-2 pr-3 pl-4 ${
          // Next's development indicator sits at the bottom left of a phone-wide overlay.
          process.env.NODE_ENV === "development" ? "max-sm:pl-[190px]" : ""
        }`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          value={text}
          disabled={busy}
          aria-label="Ask the assistant"
          placeholder={messages.length > 0 ? "Ask for something else" : "Ask the assistant"}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || text.trim() === ""}>
          Send
        </Button>
      </form>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the conversation?</DialogTitle>
            <DialogDescription>
              This removes every message and proposal for everyone on this workspace. The definition
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
                if (await assistant.clear()) resetOutcomes();
                setConfirming(false);
              }}
            >
              Clear conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
