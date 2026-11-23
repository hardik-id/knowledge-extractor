"use client";

import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { AssistantMessage, ExtractionDefinitionDraft } from "@/services/contracts";
import { toastFailure } from "@/features/auth/report-failure";
import {
  AWAITED_EXPIRY_MS,
  assistantActivity,
  awaitedMessageId,
  mergeAssistantMessages,
  type AssistantActivity,
} from "./assistant-activity";
import { usePipelineStore } from "@/store/pipeline-store";

export interface AssistantState {
  messages: AssistantMessage[];
  isLoading: boolean;
  error: unknown;
  retry: () => void;
  /** A reply is being written, or a message is on its way. */
  busy: boolean;
  /** "awaited": last message is the person's, no reply known; "working": no text yet; "writing". */
  activity: AssistantActivity;
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
  const [sendingMessage, setSendingMessage] = useState(false);
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  const { error, isLoading, retry } = useAsyncData(runId, async (signal) => {
    if (!runId) return null;
    const loaded = await services.extraction.getAssistantMessages(runId, signal);
    if (!signal.aborted) {
      // Live parts may have arrived while this was on its way: keep what is newer.
      setAssistantMessages(mergeAssistantMessages(latest.current, loaded));
    }
    return loaded;
  });

  // A reply awaited for too long (on this page's clock) is given up on.
  const awaitedId = awaitedMessageId(messages);
  const [expiredId, setExpiredId] = useState<string | null>(null);
  useEffect(() => {
    if (!awaitedId) return;
    const timer = setTimeout(() => setExpiredId(awaitedId), AWAITED_EXPIRY_MS);
    return () => clearTimeout(timer);
  }, [awaitedId]);
  const activity = assistantActivity(
    messages,
    sendingMessage,
    awaitedId !== null && expiredId === awaitedId,
  );
  // Awaiting a reply that may never come does not lock the input: only a request in flight or a
  // streaming reply known here does.
  const busy = sending || messages.some((m) => m.status === "streaming");

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!runId || !draft || trimmed === "" || busy) return false;
    setSending(true);
    setSendingMessage(true);
    try {
      const sent = await services.extraction.sendAssistantMessage(runId, trimmed, draft);
      putAssistantMessage(sent);
      return true;
    } catch (e) {
      toastFailure("Couldn't send your message", e);
      return false;
    } finally {
      setSending(false);
      setSendingMessage(false);
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

  return { messages, isLoading, error, retry, busy, activity, send, clear };
}
