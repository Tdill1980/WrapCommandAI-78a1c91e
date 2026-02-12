/**
 * Sales Chat Hook - adapted from Lovable (bright-fleet-flow)
 * Uses the existing WrapCommand Supabase functions for chat.
 */

import { useState, useCallback, useRef } from "react";
import { lovableFunctions } from "@/integrations/supabase/client";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function useSalesChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const sendMessage = useCallback(async (input: string) => {
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await lovableFunctions.functions.invoke("website-chat", {
        body: {
          message: input,
          session_id: sessionIdRef.current,
          source: "commercialpro",
        },
      });

      if (fnError) {
        setError("Failed to connect. Please try again.");
        setIsLoading(false);
        return;
      }

      const reply = data?.reply || data?.response || "I'm here to help with wholesale wrap pricing. What can I assist you with?";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      console.error("Chat error:", e);
      setError("Connection error. Please check your internet and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = crypto.randomUUID();
  }, []);

  return { messages, isLoading, error, sendMessage, clearChat };
}
