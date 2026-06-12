import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, Sparkles, X, Mail, CheckCircle, MessageCircle, Bot, User, Receipt, ShoppingCart, Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";
import type { ChatConversation } from "@/hooks/useWebsiteChats";
import { QuoteSelector } from "./QuoteSelector";

interface InternalReplyPanelProps {
  conversation: ChatConversation;
  customerEmail: string | null;
  customerName: string | null;
  onClose: () => void;
  onEmailSent: () => void;
}

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function InternalReplyPanel({
  conversation,
  customerEmail,
  customerName,
  onClose,
  onEmailSent,
}: InternalReplyPanelProps) {
  const [subject, setSubject] = useState(`Re: Your WePrintWraps Inquiry`);
  const [body, setBody] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // Quote attachment state
  const [selectedQuote, setSelectedQuote] = useState<{ id: string; quote_number: string; total_price: number } | null>(null);
  const [showQuoteSelector, setShowQuoteSelector] = useState(false);
  
  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<'jordan' | 'alex'>('jordan');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = conversation.messages || [];

  // Scroll to bottom of AI chat when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [aiMessages]);

  // Build conversation context for AI
  const getConversationContext = () => {
    return messages
      .slice(-10)
      .map((msg) => `${msg.direction === 'inbound' ? 'Customer' : 'Jordan'}: ${msg.content}`)
      .join('\n');
  };

  // Ask AI for advice
  const handleAskAI = async () => {
    if (!aiInput.trim()) return;

    const userMessage = aiInput.trim();
    setAiInput("");
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAiThinking(true);

    try {
      const conversationContext = getConversationContext();
      const currentDraft = body.trim();

      const agentName = selectedAgent === 'jordan' ? 'Jordan Lee' : 'Alex Morgan';
      const agentPersonality = selectedAgent === 'jordan' 
        ? 'You are Jordan Lee, a friendly and knowledgeable wrap specialist. You speak casually but professionally, with enthusiasm about vehicle wraps.'
        : 'You are Alex Morgan, a senior customer success manager. You speak professionally and are excellent at de-escalation and problem-solving.';

      const { data, error } = await lovableFunctions.functions.invoke('agent-chat', {
        body: {
          action: 'quick',
          agent_id: selectedAgent === 'jordan' ? 'jordan_lee' : 'alex_morgan',
          message: `${agentPersonality}

You are helping an admin reply to a customer. The admin is asking for your advice.

Customer Name: ${customerName || 'Unknown'}
Customer Email: ${customerEmail || 'Unknown'}

Recent conversation with customer:
${conversationContext}

${currentDraft ? `Current draft response the admin is working on:\n${currentDraft}\n` : ''}

Admin's question to you: ${userMessage}

Provide helpful, concise advice. If they ask you to rephrase or write something, give them the exact text they can use. Keep responses short and actionable.`,
        },
      });

      if (error) throw error;

      if (data?.reply) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      console.error('Failed to get AI advice:', err);
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I had trouble processing that. Please try again.' 
      }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Use AI suggestion in draft
  const useInDraft = (text: string) => {
    setBody(text);
    toast.success('Added to draft!');
  };

  // Generate AI draft based on conversation context
  const handleAIDraft = async () => {
    setIsDrafting(true);
    try {
      const conversationSummary = getConversationContext();

      const { data, error } = await lovableFunctions.functions.invoke('agent-chat', {
        body: {
          action: 'quick',
          agent_id: 'alex_morgan',
          message: `You are drafting a professional follow-up email to a customer.

Customer Name: ${customerName || 'Valued Customer'}
Customer Email: ${customerEmail}

Recent conversation:
${conversationSummary}

Write a helpful, professional email response that:
1. Thanks them for their inquiry
2. Addresses their specific questions/needs based on the conversation
3. Provides clear next steps
4. Uses a warm, professional tone
5. Signs off as "The WePrintWraps Team"

Keep it concise (2-3 short paragraphs max). Do NOT include the subject line, just the body.`,
        },
      });

      if (error) throw error;

      if (data?.reply) {
        setBody(data.reply);
        toast.success('Draft generated!');
      }
    } catch (err) {
      console.error('Failed to generate draft:', err);
      toast.error('Failed to generate draft');
    } finally {
      setIsDrafting(false);
    }
  };

  // Send the email
  const handleSendEmail = async () => {
    if (!customerEmail || !body.trim()) {
      toast.error('Email address and message body are required');
      return;
    }

    setIsSending(true);
    try {
      // Get current user for approved_by field
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await lovableFunctions.functions.invoke('send-admin-reply', {
        body: {
          conversation_id: conversation.id,
          to_email: customerEmail,
          to_name: customerName || undefined,
          subject: subject,
          body: body,
          quote_id: selectedQuote?.id,
          quote_number: selectedQuote?.quote_number,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      if (data?.success) {
        setEmailSent(true);
        toast.success('Email sent successfully!');
        onEmailSent();
      } else {
        throw new Error(data?.error || 'Failed to send email');
      }
    } catch (err) {
      console.error('Failed to send email:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  if (emailSent) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Email Sent!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your reply was sent to {customerEmail}
          </p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Reply to Customer
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {customerEmail && (
          <Badge variant="secondary" className="w-fit">
            To: {customerEmail}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="compose" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="compose" className="gap-2">
              <Mail className="h-3 w-3" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="ai-help" className="gap-2">
              <MessageCircle className="h-3 w-3" />
              Ask AI
            </TabsTrigger>
          </TabsList>

          {/* Compose Tab */}
          <TabsContent value="compose" className="space-y-4 mt-4">
            {/* Quick Action Links */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBody(prev => 
                  prev + (prev ? "\n\n" : "") + "Ready to order? Complete your purchase here: https://weprintwraps.com/quote"
                )}
                className="gap-1.5 text-xs"
              >
                <ShoppingCart className="h-3 w-3" />
                Add Order Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBody(prev => 
                  prev + (prev ? "\n\n" : "") + "Need design help? Our team can prepare your artwork for $75+: https://weprintwraps.com/design-services"
                )}
                className="gap-1.5 text-xs"
              >
                <Palette className="h-3 w-3" />
                Add Design Fee Link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuoteSelector(true)}
                className="gap-1.5 text-xs"
              >
                <Receipt className="h-3 w-3" />
                Attach Quote
              </Button>
            </div>

            {/* Attached Quote Preview */}
            {selectedQuote && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-2">
                <Receipt className="h-4 w-4 text-green-500" />
                <span className="text-sm">Quote #{selectedQuote.quote_number}</span>
                <span className="text-sm font-bold">${selectedQuote.total_price?.toLocaleString()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 ml-auto"
                  onClick={() => setSelectedQuote(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Message</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAIDraft}
                  disabled={isDrafting}
                  className="gap-2"
                >
                  {isDrafting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI Draft
                </Button>
              </div>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message or click 'AI Draft' to generate one..."
                className="min-h-[150px] resize-none"
              />
            </div>

            {/* Quote Selector Modal */}
            {showQuoteSelector && (
              <QuoteSelector
                customerEmail={customerEmail}
                onSelect={(quote) => {
                  setSelectedQuote(quote);
                  setShowQuoteSelector(false);
                }}
                onClose={() => setShowQuoteSelector(false)}
              />
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={isSending || !body.trim() || !customerEmail}
                className="gap-2"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Email
              </Button>
            </div>
          </TabsContent>

          {/* AI Help Tab */}
          <TabsContent value="ai-help" className="space-y-3 mt-4">
            {/* Agent Selector */}
            <div className="flex gap-2">
              <Button
                variant={selectedAgent === 'jordan' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedAgent('jordan')}
                className="flex-1 gap-2"
              >
                <Bot className="h-3 w-3" />
                Jordan
              </Button>
              <Button
                variant={selectedAgent === 'alex' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedAgent('alex')}
                className="flex-1 gap-2"
              >
                <Bot className="h-3 w-3" />
                Alex
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {selectedAgent === 'jordan' 
                ? 'Jordan is friendly & casual — great for product questions'
                : 'Alex is professional — great for escalations & problem-solving'}
            </p>

            {/* AI Chat Messages */}
            <ScrollArea className="h-[180px] border rounded-lg bg-muted/20 p-3" ref={scrollRef}>
              {aiMessages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-6">
                  <MessageCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p>Ask {selectedAgent === 'jordan' ? 'Jordan' : 'Alex'} for help!</p>
                  <p className="text-xs mt-1">
                    e.g. "How should I respond to this?" or "Rephrase this more professionally"
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {aiMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-3 w-3 text-primary" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-lg p-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        {msg.role === 'assistant' && msg.content.length > 50 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-6 text-xs gap-1"
                            onClick={() => useInDraft(msg.content)}
                          >
                            <Sparkles className="h-3 w-3" />
                            Use in draft
                          </Button>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <User className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="flex gap-2 items-center">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* AI Input */}
            <div className="flex gap-2">
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder={`Ask ${selectedAgent === 'jordan' ? 'Jordan' : 'Alex'} for advice...`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAskAI();
                  }
                }}
                disabled={isAiThinking}
              />
              <Button
                size="icon"
                onClick={handleAskAI}
                disabled={isAiThinking || !aiInput.trim()}
              >
                {isAiThinking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Quick prompts */}
            <div className="flex flex-wrap gap-1">
              {[
                'Rephrase professionally',
                'How should I respond?',
                'Write a polite decline',
              ].map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => {
                    setAiInput(prompt);
                  }}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}