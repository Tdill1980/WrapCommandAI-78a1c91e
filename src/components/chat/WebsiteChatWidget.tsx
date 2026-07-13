import { useState, useEffect, useRef } from "react";
import { X, Send, Car, Palette, Package, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase, callEdgeFunction } from "@/integrations/supabase/production-client";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import aceAvatar from "@/assets/wrapcommand-logo-astronaut.png";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
}

const QUICK_ACTIONS = [
  { icon: Car, label: "How much is my wrap project?", message: "How much is my wrap project?", primary: true },
  { icon: Package, label: "How do I order?", message: "How do I place an order?" },
  { icon: Palette, label: "Ask me about RestyleProAI", message: "Tell me about RestyleProAI and how it can help visualize my wrap" },
];

export function WebsiteChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `website-${crypto.randomUUID()}`);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [geo, setGeo] = useState<Record<string, unknown> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isRecording, isProcessing, startRecording, stopRecording } = useVoiceInput();

  // Capture visitor geo once (mirrors the embed widget) so admin sees exact location.
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((g) => setGeo(g))
      .catch(() => {});
  }, []);

  // Push-to-talk: tap the mic to start, tap again to stop + transcribe into the input
  const handleMic = async () => {
    if (isProcessing || isLoading) return;
    if (isRecording) {
      try {
        const text = await stopRecording();
        if (text?.trim()) {
          setInput((prev) => (prev ? `${prev} ${text}`.trim() : text.trim()));
        }
      } catch {
        /* toast handled inside the hook */
      }
    } else {
      await startRecording();
    }
  };

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Hey, I'm the Wrap Guru with WePrintWraps! Tell me your vehicle and I'll get you a wrap price, a cart link, or connect you with the team. What are you working on?",
        },
      ]);
    }
  }, [isOpen, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const data = await callEdgeFunction('command-chat', {
        org: "wpw",
        agent: "wpw_ai_team",
        mode: "live",
        session_id: sessionId,
        message_text: text,
        page_url: window.location.href,
        referrer: document.referrer || "",
        geo,
      });

      if (data?.reply || data?.message) {
        const fullContent = data.reply || data.message;
        const messageId = crypto.randomUUID();
        
        // Add empty message that will be typed out
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: "assistant",
            content: "",
            isTyping: true,
          },
        ]);
        setIsLoading(false);
        
        // Type out the message in chunks
        await typeMessage(messageId, fullContent);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, I'm having trouble connecting. Please try again in a moment.",
        },
      ]);
      setIsLoading(false);
    }
  };

  // Type message in natural chunks
  const typeMessage = async (messageId: string, fullContent: string) => {
    const words = fullContent.split(' ');
    let currentContent = '';
    
    for (let i = 0; i < words.length; i++) {
      const chunkSize = Math.floor(Math.random() * 3) + 1;
      const chunk = words.slice(i, i + chunkSize).join(' ');
      currentContent += (currentContent ? ' ' : '') + chunk;
      i += chunkSize - 1;
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, content: currentContent }
            : msg
        )
      );
      
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
    }
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, isTyping: false }
          : msg
      )
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Floating bubble when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full",
          "bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#A855F7]",
          "text-white shadow-2xl flex items-center justify-center",
          "transition-all duration-300 ease-out",
          "hover:scale-110 hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]",
          "before:absolute before:inset-0 before:rounded-full",
          "before:bg-gradient-to-r before:from-[#2563EB] before:via-[#7C3AED] before:to-[#A855F7]",
          "before:animate-ping before:opacity-30"
        )}
        style={{
          boxShadow: "0 4px 20px rgba(124, 58, 237, 0.4), 0 0 40px rgba(37, 99, 235, 0.2)"
        }}
        aria-label="Chat with the Wrap Guru"
      >
        <img src={aceAvatar} alt="Wrap Guru" className="w-11 h-11 relative z-10 object-contain drop-shadow" />
      </button>
    );
  }

  return (
    <div 
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "w-[380px] max-w-[calc(100vw-48px)]",
        "h-[520px] max-h-[calc(100vh-100px)]",
        "bg-[#1a1a2e] backdrop-blur-xl",
        "border border-white/10 rounded-2xl",
        "shadow-2xl flex flex-col overflow-hidden",
        "animate-in slide-in-from-bottom-5 duration-300"
      )}
      style={{
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 60px rgba(168, 85, 247, 0.2)"
      }}
    >
      {/* Header with purple-magenta gradient */}
      <div className="relative bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 px-4 py-4">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/30 shadow-lg backdrop-blur-sm overflow-hidden">
              <img src={aceAvatar} alt="Wrap Guru" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <span className="font-bold text-white block text-base tracking-tight">Wrap Guru</span>
              <span className="text-white/90 text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                WePrintWraps × RestyleProAI • Online
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Messages area - Dark background */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 bg-[#16162a] scrollbar-thin scrollbar-thumb-purple-500/30">
        {messages.map((message, index) => (
          <div 
            key={message.id}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className={cn(
                "max-w-[85%] px-4 py-3 rounded-2xl text-sm",
                "transition-all duration-200",
                message.role === "user"
                  ? "bg-[#2a2a4a] text-white ml-auto rounded-br-sm border border-white/10"
                  : "bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500 text-white rounded-bl-sm shadow-[0_4px_15px_rgba(168,85,247,0.4)]"
              )}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Quick Actions - Dark themed */}
        {showQuickActions && messages.length === 1 && !isLoading && (
          <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {/* Primary CTA */}
            {QUICK_ACTIONS.filter(a => a.primary).map((action) => (
              <button
                key={action.label}
                onClick={() => handleSend(action.message)}
                className={cn(
                  "w-full flex items-center justify-center gap-2 p-3",
                  "bg-gradient-to-r from-orange-500 to-orange-600",
                  "hover:opacity-90 hover:scale-[1.02]",
                  "rounded-xl text-sm font-semibold",
                  "text-white transition-all duration-200",
                  "shadow-lg shadow-orange-500/30"
                )}
              >
                <action.icon className="w-5 h-5" />
                {action.label}
              </button>
            ))}

            {/* Secondary Actions - Single column */}
            <div className="space-y-2">
              {QUICK_ACTIONS.filter(a => !a.primary).map((action, i) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.message)}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 p-3",
                    "bg-[#2a2a4a] hover:bg-purple-500/20",
                    "rounded-xl text-sm font-medium",
                    "border border-purple-500/30 hover:border-purple-400",
                    "transition-all duration-200 hover:scale-[1.02]",
                    "text-white"
                  )}
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <action.icon className="w-4 h-4 text-purple-400" />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Typing indicator - Dark themed */}
        {isLoading && (
          <div className="flex items-center gap-2 py-2 animate-in fade-in duration-200">
            <div className="flex gap-1 px-4 py-3 bg-[#2a2a4a] rounded-2xl rounded-bl-sm border border-white/10">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area - Dark */}
      <div className="p-3 border-t border-white/10 bg-[#1a1a2e]" style={{ paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom))` }}>
        {/* Contextual input hints based on last message */}
        {(() => {
          const lastAssistantMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content.toLowerCase() || '';
          if (lastAssistantMsg.includes('quote number') || lastAssistantMsg.includes('quote #')) {
            return <div className="text-xs text-gray-500 mb-2 px-1">Example: Q-10432</div>;
          }
          if (lastAssistantMsg.includes('order number') || lastAssistantMsg.includes('order #')) {
            return <div className="text-xs text-gray-500 mb-2 px-1">Example: #18392</div>;
          }
          if (lastAssistantMsg.includes('email') && (lastAssistantMsg.includes('send') || lastAssistantMsg.includes('what'))) {
            return <div className="text-xs text-gray-500 mb-2 px-1">We'll only use this to send your quote.</div>;
          }
          if (lastAssistantMsg.includes('name') && lastAssistantMsg.includes('quote')) {
            return <div className="text-xs text-gray-500 mb-2 px-1">This helps us label your quote correctly.</div>;
          }
          if (lastAssistantMsg.includes('company') || lastAssistantMsg.includes('shop name')) {
            return <div className="text-xs text-gray-500 mb-2 px-1">Optional — but helpful for shop or fleet orders.</div>;
          }
          return null;
        })()}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isRecording ? "Listening… tap the mic to stop" : isProcessing ? "Transcribing…" : "Type or tap the mic to talk…"}
            disabled={isLoading || isProcessing}
            className={cn(
              "flex-1 bg-[#2a2a4a] border border-white/10 rounded-full",
              "px-4 py-2.5 text-sm text-white placeholder:text-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500",
              "transition-all duration-200"
            )}
          />
          {/* Voice input — record, transcribe, drop into the box */}
          <Button
            size="icon"
            onClick={handleMic}
            disabled={isLoading || isProcessing}
            aria-label={isRecording ? "Stop recording" : "Record voice message"}
            className={cn(
              "shrink-0 rounded-full w-10 h-10 transition-all duration-200",
              isRecording
                ? "bg-red-500 hover:bg-red-600 animate-pulse"
                : "bg-[#2a2a4a] border border-purple-500/40 hover:bg-purple-500/20",
              "disabled:opacity-50"
            )}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className={cn(
              "shrink-0 rounded-full w-10 h-10",
              "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
              "hover:opacity-90 hover:scale-105",
              "transition-all duration-200",
              "disabled:opacity-50 disabled:hover:scale-100"
            )}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {/* WePrintWraps × RestyleProAI branding */}
        <div className="mt-2 text-center">
          <span className="text-xs text-gray-500">Powered by </span>
          <span className="text-xs font-medium text-fuchsia-400">WePrintWraps × RestyleProAI</span>
        </div>
      </div>
    </div>
  );
}
