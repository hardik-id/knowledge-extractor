"use client";

import { ChevronDown, MoreHorizontal, Sparkles } from "lucide-react";
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
import { Message } from "@/features/extraction/assistant-panel";
import { useAssistant } from "@/features/extraction/use-assistant";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { describeApiError } from "@/services/errors";
import { focusAssistantInput, resetOutcomes, useProposalSync } from "./use-proposal";
import { useWorkspace } from "./workspace-state";

const OUTCOME_LINE = {
  open: "Waiting for you",
  applied: "Kept",
  dismissed: "Discarded",
  replaced: "Replaced",
  included: "Already in what you have",
} as const;

/**
 * The assistant at the bottom of the column: a one-line input; using it opens the conversation
 * upward, oldest message first. Its proposals are shown in the table, not here.
 */
export function AssistantDock({ definition }: { definition: ExtractionDefinitionState }) {
  const assistant = useAssistant(definition.draft ?? undefined);
  const { messages, busy } = assistant;
  const { conversationOpen, setConversationOpen } = useWorkspace();
  const outcomeOf = useProposalSync(definition.draft ?? undefined, messages);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  const log = useRef<HTMLDivElement>(null);

  // The newest message is the one to read.
  useEffect(() => {
    if (conversationOpen && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [conversationOpen, messages]);

  const submit = async () => {
    if (busy || text.trim() === "") return;
    setConversationOpen(true);
    if (await assistant.send(text)) setText("");
  };

  return (
    <section aria-labelledby={`${id}-title`} className="shrink-0 border-t border-border-subtle">
      <h2 id={`${id}-title`} className="sr-only">
        Assistant
      </h2>
      {conversationOpen && (
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2 pr-2 pl-4">
            <Sparkles aria-hidden className="size-4 text-link" />
            <span className="font-semibold text-ink-heading">Assistant</span>
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
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close the conversation"
              onClick={() => {
                setConversationOpen(false);
                focusAssistantInput();
              }}
            >
              <ChevronDown aria-hidden />
            </Button>
          </div>
          {assistant.error ? (
            <div className="flex flex-col items-start gap-2 px-4 pb-2">
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
              ref={log}
              role="log"
              aria-label="Conversation"
              aria-live="polite"
              aria-busy={assistant.isLoading}
              className="flex max-h-[min(13rem,30dvh)] flex-col gap-3 overflow-y-auto px-4 pb-1"
            >
              {messages.length === 0 && !assistant.isLoading && (
                <p className="text-small text-ink-muted">
                  Describe what you want to extract, or ask for a change.
                </p>
              )}
              {messages.map((m) => {
                const outcome = m.proposal ? outcomeOf(m) : null;
                return (
                  <div key={m.id} className="flex flex-col gap-1">
                    <Message message={m} />
                    {outcome && (
                      <p
                        className={
                          outcome === "open"
                            ? "text-small font-medium text-warning"
                            : "text-small text-ink-muted"
                        }
                      >
                        {OUTCOME_LINE[outcome]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <form
        className="flex items-center gap-2 py-2 pr-3 pl-4"
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
          onClick={() => setConversationOpen(true)}
          onChange={(e) => {
            setText(e.target.value);
            setConversationOpen(true);
          }}
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
