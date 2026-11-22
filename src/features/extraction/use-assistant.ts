"use client";

import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { AssistantMessage, ExtractionDefinitionDraft } from "@/services/contracts";
import { toastFailure } from "@/features/auth/report-failure";
import { usePipelineStore } from "@/store/pipeline-store";

export interface AssistantState {
  messages: AssistantMessage[];
  isLoading: boolean;
  error: unknown;
  retry: () => void;
  /** A reply is being written, or a message is on its way. */
  busy: boolean;
  /** Resolves true when the message was accepted. */
  send: (text: string) => Promise<boolean>;
  /** Removes the whole conversation. Resolves true when it was cleared. */
  clear: () => Promise<boolean>;
}

/**
 * The conversation with the extraction assistant. Loaded once per run into the
 * store, where live parts of a reply arrive. `draft` is sent with each message,
 * unsaved edits included.
 */
export function useAssistant(draft: ExtractionDefinitionDraft | undefined): AssistantState {
  const runId = usePipelineStore((s) => s.runId);
  const messages = usePipelineStore((s) => s.assistantMessages);
  const setAssistantMessages = usePipelineStore((s) => s.setAssistantMessages);
  const putAssistantMessage = usePipelineStore((s) => s.putAssistantMessage);
  const [sending, setSending] = useState(false);
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  const { error, isLoading, retry } = useAsyncData(runId, async (signal) => {
    if (!runId) return null;
    const loaded = await services.extraction.getAssistantMessages(runId, signal);
    if (!signal.aborted) {
      // Live parts may have arrived while this was on its way: keep what is newer.
      const local = latest.current;
      const byId = new Map(local.map((m) => [m.id, m]));
      const merged = loaded.map((m) => {
        const mine = byId.get(m.id);
        return mine && mine.status === "done" && m.status === "streaming" ? mine : m;
      });
      const known = new Set(loaded.map((m) => m.id));
      setAssistantMessages([...merged, ...local.filter((m) => !known.has(m.id))]);
    }
    return loaded;
  });

  const busy = sending || messages.some((m) => m.status === "streaming");

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!runId || !draft || trimmed === "" || busy) return false;
    setSending(true);
    try {
      const sent = await services.extraction.sendAssistantMessage(runId, trimmed, draft);
      putAssistantMessage(sent);
      return true;
    } catch (e) {
      toastFailure("Couldn't send your message", e);
      return false;
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    if (!runId || busy) return false;
    setSending(true);
    try {
      await services.extraction.clearAssistantMessages(runId);
      setAssistantMessages([]);
      return true;
    } catch (e) {
      toastFailure("Couldn't clear the conversation", e);
      return false;
    } finally {
      setSending(false);
    }
  };

  return { messages, isLoading, error, retry, busy, send, clear };
}
