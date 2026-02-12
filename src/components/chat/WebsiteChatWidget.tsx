import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Car, Palette, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callEdgeFunction } from "@/integrations/supabase/production-client";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
}

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
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
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" });
  const [formError, setFormError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Add welcome message when chat opens and customer info collected
  useEffect(() => {
    if (isOpen && customerInfo && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hey ${customerInfo.name.split(' ')[0]}! Welcome to WePrintWraps. What can I help you with today?`,
        },
      ]);
    }
  }, [isOpen, customerInfo, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartChat = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const name = formData.name.trim();
    const email = formData.email.trim();
    const phone = formData.phone.trim();

    if (!name) { setFormError("Name is required"); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError("Valid email is required"); return; }
    if (!phone || phone.replace(/\D/g, "").length < 7) { setFormError("Valid phone number is required"); return; }

    setCustomerInfo({ name, email, phone });
  };

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading || !customerInfo) return;

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
      const data = await callEdgeFunction('website-chat', {
        org: "wpw",
        agent: "wpw_support",
        mode: "live",
        session_id: sessionId,
        message_text: text,
        page_url: window.location.href,
        referrer: document.referrer || "",
        customer_name: customerInfo.name,
        customer_email: customerInfo.email,
        customer_phone: customerInfo.phone,
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
      >
        <MessageCircle className="w-7 h-7 relative z-10" />
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
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/30 shadow-lg backdrop-blur-sm">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-white block text-base tracking-tight">WPW Support Team</span>
              <span className="text-white/90 text-xs flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                Website Chat &bull; Online
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

      {/* Pre-chat form OR chat messages */}
      {!customerInfo ? (
        <div className="flex-1 flex flex-col justify-center p-6 bg-[#16162a]">
          <div className="text-center mb-6">
            <h3 className="text-white font-semibold text-lg mb-1">Start a conversation</h3>
            <p className="text-gray-400 text-sm">We'll get you a quote fast!</p>
          </div>
          <form onSubmit={handleStartChat} className="space-y-3">
            <input
              type="text"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className={cn(
                "w-full bg-[#2a2a4a] border border-white/10 rounded-xl",
                "px-4 py-3 text-sm text-white placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              )}
            />
            <input
              type="email"
              placeholder="Email address"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className={cn(
                "w-full bg-[#2a2a4a] border border-white/10 rounded-xl",
                "px-4 py-3 text-sm text-white placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              )}
            />
            <input
              type="tel"
              placeholder="Phone number"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className={cn(
                "w-full bg-[#2a2a4a] border border-white/10 rounded-xl",
                "px-4 py-3 text-sm text-white placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              )}
            />
            {formError && (
              <p className="text-red-400 text-xs px-1">{formError}</p>
            )}
            <Button
              type="submit"
              className={cn(
                "w-full rounded-xl py-3 font-semibold",
                "bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500",
                "hover:opacity-90 transition-all duration-200"
              )}
            >
              Start Chat
            </Button>
          </form>
        </div>
      ) : (
        <>
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
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={isLoading}
                className={cn(
                  "flex-1 bg-[#2a2a4a] border border-white/10 rounded-full",
                  "px-4 py-2.5 text-sm text-white placeholder:text-gray-400",
                  "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500",
                  "transition-all duration-200"
                )}
              />
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
            {/* WePrintWraps.com branding - Dark */}
            <div className="mt-2 text-center">
              <span className="text-xs text-gray-500">Powered by </span>
              <span className="text-xs font-medium text-fuchsia-400">weprintwraps.com</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
