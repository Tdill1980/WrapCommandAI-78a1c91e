import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { MapPin, Mail, Phone, Clock, Globe, Car, AlertCircle, User, MessageSquare, FileText, Download, Receipt, CheckCircle, XCircle, Reply, Upload, Trash2, CheckCheck } from "lucide-react";
import type { ChatConversation } from "@/hooks/useWebsiteChats";
import { useConversationEvents } from "@/hooks/useConversationEvents";
import { useConversationQuotes } from "@/hooks/useConversationQuotes";
import { useEscalationStatus } from "@/hooks/useEscalationStatus";
import { EscalationTimeline } from "./EscalationTimeline";
import { EmailReceiptViewer } from "./EmailReceiptViewer";
import { EscalationStatusCard } from "./EscalationStatusCard";
import { InternalReplyPanel } from "./InternalReplyPanel";
import { QuoteUploadPanel } from "./QuoteUploadPanel";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

function getCountryFlag(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

interface ChatDetailModalProps {
  conversation: ChatConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDetailModal({ conversation, open, onOpenChange }: ChatDetailModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showReplyPanel, setShowReplyPanel] = useState(false);
  const [showQuoteUpload, setShowQuoteUpload] = useState(false);
  const [liveReplyText, setLiveReplyText] = useState('');
  const [isSendingLiveReply, setIsSendingLiveReply] = useState(false);
  const liveReplyInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: events, isLoading: eventsLoading } = useConversationEvents(conversation?.id || null);
  const { data: quotes, isLoading: quotesLoading } = useConversationQuotes(conversation?.id || null);
  const escalationStatus = useEscalationStatus(events);

  // Use messages from conversation object (comes from edge function with service role)
  // This avoids RLS issues with direct table queries
  const messagesLoading = false;
  const fetchedMessages = conversation?.messages || [];

  if (!conversation) return null;

  const logEvent = async (eventType: string, payload: Record<string, unknown> = {}) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('conversation_events')
        .insert([{
          conversation_id: conversation.id,
          event_type: eventType,
          actor: 'admin',
          payload: payload as any,
        }]);

      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['conversation-events', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['needs-action-queue'] });
      toast.success(`Event logged: ${eventType.replace(/_/g, ' ')}`);
    } catch (err) {
      console.error('Failed to log event:', err);
      toast.error('Failed to log event');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMarkComplete = async () => {
    setIsProcessing(true);
    try {
      // Update conversation status to 'resolved'
      const { error: statusError } = await supabase
        .from('conversations')
        .update({ status: 'resolved' })
        .eq('id', conversation.id);
      
      if (statusError) throw statusError;
      
      // Also log the event
      await logEvent('marked_complete', { resolution_notes: 'Marked complete by admin' });
      
      queryClient.invalidateQueries({ queryKey: ['website-page-chats'] });
      toast.success('Chat marked as complete');
    } catch (err) {
      console.error('Failed to mark complete:', err);
      toast.error('Failed to mark complete');
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDeleteChat = async () => {
    if (!window.confirm('Are you sure you want to delete this chat? This cannot be undone.')) {
      return;
    }
    
    setIsProcessing(true);
    try {
      // Delete messages first (due to foreign key)
      const { error: msgError } = await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversation.id);
      
      if (msgError) throw msgError;
      
      // Delete conversation events
      await supabase
        .from('conversation_events')
        .delete()
        .eq('conversation_id', conversation.id);
      
      // Delete the conversation
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);
      
      if (convError) throw convError;
      
      queryClient.invalidateQueries({ queryKey: ['website-page-chats'] });
      toast.success('Chat deleted');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to delete chat:', err);
      toast.error('Failed to delete chat');
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDismissQuote = () => logEvent('marked_no_quote_required', { 
    reason: 'Quote not needed for this escalation' 
  });
  
  const handleMarkFileReviewed = () => logEvent('asset_reviewed', { 
    reviewed_by: 'admin' 
  });
  
  const handleRefreshEvents = () => {
    queryClient.invalidateQueries({ queryKey: ['conversation-events', conversation.id] });
  };

  // LIVE CHAT REPLY - Sends message directly to chat widget via Supabase Realtime
  const handleSendLiveReply = async () => {
    if (!liveReplyText.trim() || isSendingLiveReply) return;

    setIsSendingLiveReply(true);
    try {
      // Insert message - chat widget will receive via Supabase Realtime
      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        channel: 'website',
        direction: 'outbound',
        content: liveReplyText.trim(),
        sender_name: 'Jackson',
        metadata: { source: 'dashboard_reply' }
      });

      if (msgError) throw msgError;

      // Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

      setLiveReplyText('');
      queryClient.invalidateQueries({ queryKey: ['website-page-chats'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversation.id] });
      toast.success('Message sent to chat widget');
    } catch (err) {
      console.error('Failed to send live reply:', err);
      toast.error('Failed to send message');
    } finally {
      setIsSendingLiveReply(false);
    }
  };

  const geo = conversation.metadata?.geo;
  const chatState = conversation.chat_state;
  const contact = conversation.contact;
  const messages = fetchedMessages || [];
  const escalations = chatState?.escalations_sent || [];
  const vehicle = chatState?.vehicle;

  const escalationEvents = events?.filter(e => e.event_type === 'escalation_sent') || [];
  const emailEvents = events?.filter(e => e.event_type === 'email_sent') || [];
  const assetEvents = events?.filter(e => e.event_type === 'asset_uploaded') || [];

  const displayName = contact?.email && !contact.email.includes('@capture.local')
    ? contact.email
    : contact?.name || 'Anonymous Visitor';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5" />
              Chat: {displayName}
            </div>
            <div className="flex items-center gap-2">
              {escalations.length > 0 && (
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {escalations.length} Escalation{escalations.length > 1 ? 's' : ''}
                </Badge>
              )}
              {emailEvents.length > 0 && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                  <Mail className="h-3 w-3 mr-1" />
                  {emailEvents.length} Email{emailEvents.length > 1 ? 's' : ''} Sent
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4 p-6 pt-2">
          {/* Left: Tabbed content area */}
          <div className="flex-1 flex flex-col min-w-0">
            <Tabs defaultValue="transcript" className="flex-1 flex flex-col">
              <TabsList className="mb-3">
                <TabsTrigger value="transcript" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Transcript {messagesLoading ? '(...)' : `(${messages.length})`}
                </TabsTrigger>
                <TabsTrigger value="timeline" className="gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Timeline ({events?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="emails" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Emails ({emailEvents.length})
                </TabsTrigger>
                <TabsTrigger value="quotes" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  Quotes ({quotes?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="assets" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Assets ({assetEvents.length})
                </TabsTrigger>
              </TabsList>

              {/* Transcript Tab - ONLY chat bubbles get gradient styling */}
              <TabsContent value="transcript" className="mt-0 flex flex-col">
                <ScrollArea className="h-[calc(90vh-300px)] border rounded-t-lg bg-muted/30 p-4">
                  <div className="space-y-3">
                    {messagesLoading ? (
                      <div className="text-center text-muted-foreground py-8">
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        No messages recorded
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[90%] rounded-lg p-3 ${
                              msg.direction === 'inbound'
                                ? 'bg-muted text-foreground'
                                : 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-blue-500 text-white shadow-md'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium opacity-70">
                                {msg.sender_name || (msg.direction === 'inbound' ? 'Visitor' : 'Jordan')}
                              </span>
                              {msg.created_at && (
                                <span className="text-xs opacity-50">
                                  {format(new Date(msg.created_at), 'h:mm a')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words overflow-wrap-anywhere">{msg.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                
                {/* Live Chat Reply Input */}
                <div className="border border-t-0 rounded-b-lg p-3 space-y-2">
                  {/* Live chat input - sends directly to widget */}
                  <div className="flex items-center gap-2">
                    <Input
                      ref={liveReplyInputRef}
                      placeholder="Type a message to send to chat widget..."
                      value={liveReplyText}
                      onChange={(e) => setLiveReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendLiveReply();
                        }
                      }}
                      disabled={isSendingLiveReply}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleSendLiveReply}
                      disabled={!liveReplyText.trim() || isSendingLiveReply}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  </div>

                  {/* Email reply and quote upload buttons */}
                  <div className="flex items-center gap-2">
                    {contact?.email && !contact.email.includes('@capture.local') ? (
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        size="sm"
                        onClick={() => {
                          setShowReplyPanel(true);
                          setShowQuoteUpload(false);
                        }}
                      >
                        <Reply className="h-4 w-4" />
                        Send Email to {contact.name || contact.email}
                      </Button>
                    ) : (
                      <div className="flex-1 flex items-center gap-2 text-muted-foreground text-sm bg-muted/50 rounded p-2">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span>No email for email reply</span>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowQuoteUpload(true);
                        setShowReplyPanel(false);
                      }}
                      title="Upload Quote"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline" className="flex-1 mt-0">
                <EscalationTimeline events={events || []} isLoading={eventsLoading} />
              </TabsContent>

              {/* Emails Tab */}
              <TabsContent value="emails" className="flex-1 mt-0">
                <EmailReceiptViewer emailEvents={emailEvents} />
              </TabsContent>

              {/* Quotes Tab */}
              <TabsContent value="quotes" className="flex-1 mt-0">
                {quotesLoading ? (
                  <div className="p-6 text-center text-muted-foreground">
                    Loading quotes...
                  </div>
                ) : !quotes || quotes.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground border border-dashed rounded-lg">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No quotes linked</p>
                    <p className="text-xs mt-1">Quotes created from this chat will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[calc(90vh-200px)]">
                    <div className="space-y-3">
                      {quotes.map((quote) => (
                        <Card key={quote.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-mono text-sm font-semibold">
                                    #{quote.quote_number}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={
                                      quote.status === 'sent' 
                                        ? 'bg-green-500/10 text-green-600' 
                                        : quote.status === 'created'
                                        ? 'bg-yellow-500/10 text-yellow-600'
                                        : 'bg-muted text-muted-foreground'
                                    }
                                  >
                                    {quote.status || 'draft'}
                                  </Badge>
                                  {quote.email_sent ? (
                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-600 gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      Email Sent
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                                      <XCircle className="h-3 w-3" />
                                      Not Emailed
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="text-sm text-muted-foreground space-y-1">
                                  {quote.vehicle_year || quote.vehicle_make || quote.vehicle_model ? (
                                    <div className="flex items-center gap-2">
                                      <Car className="h-4 w-4" />
                                      <span>
                                        {[quote.vehicle_year, quote.vehicle_make, quote.vehicle_model]
                                          .filter(Boolean)
                                          .join(' ')}
                                      </span>
                                    </div>
                                  ) : null}
                                  
                                  <div className="flex items-center gap-4">
                                    {quote.sqft && (
                                      <span>{quote.sqft} sqft</span>
                                    )}
                                    {quote.customer_email && (
                                      <span className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {quote.customer_email}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="text-xs">
                                    {format(new Date(quote.created_at), 'MMM d, yyyy h:mm a')}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <div className="text-xl font-bold">
                                  ${(quote.total_price || quote.material_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Material Cost
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              {/* Assets Tab */}
              <TabsContent value="assets" className="flex-1 mt-0">
                {assetEvents.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground border border-dashed rounded-lg">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No assets uploaded</p>
                    <p className="text-xs mt-1">Customer uploads will appear here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="grid grid-cols-2 gap-3">
                      {assetEvents.map((event) => (
                        <Card key={event.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-3">
                              <FileText className="h-8 w-8 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {event.payload?.filename || 'File'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {event.created_at && format(new Date(event.created_at), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              {event.payload?.file_url && (
                                <Button size="sm" variant="outline" asChild>
                                  <a href={event.payload.file_url as string} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 flex-shrink-0 space-y-4">
            {/* Escalation Status */}
            {escalations.length > 0 && (
              <EscalationStatusCard 
                statusResult={escalationStatus} 
                onMarkComplete={handleMarkComplete}
                onDismissQuote={handleDismissQuote}
                onMarkFileReviewed={handleMarkFileReviewed}
                isLoading={isProcessing}
              />
            )}

            {/* Customer Info Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {contact?.name && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.name}</span>
                  </div>
                )}
                {contact?.email && !contact.email.includes('@capture.local') && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{contact.email}</span>
                  </div>
                )}
                {contact?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.phone}</span>
                  </div>
                )}
                {geo && (
                  <div className="flex items-start gap-2 pt-2 border-t">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">
                        {getCountryFlag(geo.country)} {geo.city}, {geo.region}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {geo.country_name || geo.country}
                        {geo.timezone && ` • ${geo.timezone}`}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vehicle Interest */}
            {vehicle && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Vehicle Interest
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium">
                    {[
                      vehicle.year,
                      vehicle.make,
                      vehicle.model
                    ].filter(Boolean).join(' ')}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set('mode', 'wpw_internal');
                    if (conversation.id) params.set('conversation_id', conversation.id);
                    if (contact?.name) params.set('customer', contact.name);
                    if (contact?.email && !contact.email.includes('@capture.local')) params.set('email', contact.email);
                    if (contact?.phone) params.set('phone', contact.phone);
                    if (vehicle?.year) params.set('year', String(vehicle.year));
                    if (vehicle?.make) params.set('make', vehicle.make);
                    if (vehicle?.model) params.set('model', vehicle.model);
                    window.location.href = `/mighty-customer?${params.toString()}`;
                  }}
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Create Quote
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={handleMarkComplete}
                  disabled={isProcessing || conversation.status === 'resolved'}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {conversation.status === 'resolved' ? 'Completed' : 'Mark Complete'}
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleDeleteChat}
                  disabled={isProcessing}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Chat
                </Button>
              </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span>{conversation.created_at && format(new Date(conversation.created_at), 'h:mm a')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Messages</span>
                  <span>{messages.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className={
                    conversation.status === 'open' 
                      ? 'bg-green-500/10 text-green-600' 
                      : 'bg-muted'
                  }>
                    {conversation.status || 'active'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Reply Panel */}
            {showReplyPanel && contact?.email && (
              <InternalReplyPanel
                conversation={conversation}
                customerEmail={contact.email}
                customerName={contact.name || null}
                onClose={() => setShowReplyPanel(false)}
                onEmailSent={handleRefreshEvents}
              />
            )}

            {/* Quote Upload Panel */}
            {showQuoteUpload && (
              <QuoteUploadPanel
                conversation={conversation}
                customerEmail={contact?.email || null}
                customerName={contact?.name || null}
                onClose={() => setShowQuoteUpload(false)}
                onQuoteUploaded={handleRefreshEvents}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}