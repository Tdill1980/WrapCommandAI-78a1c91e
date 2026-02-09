import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, 
  Inbox, 
  Send, 
  RefreshCw, 
  Search, 
  AlertTriangle,
  Clock,
  User,
  ChevronRight,
  Reply,
  Archive,
  Trash2,
  Star,
  Filter,
  Loader2,
  MailOpen,
  ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/layouts/MainLayout";
import { format, formatDistanceToNow } from "date-fns";

interface Email {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  sentDateTime?: string;
  bodyPreview: string;
  body?: {
    content: string;
    contentType: string;
  };
  isRead: boolean;
  importance: string;
  hasAttachments: boolean;
}

interface InboxStats {
  inbox: { total: number; unread: number };
  sent: { total: number };
}

export default function NightmareInbox() {
  const { toast } = useToast();
  const [emails, setEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("inbox");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  useEffect(() => {
    fetchEmails();
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-inbox', {
        body: { action: 'stats' }
      });
      
      if (error) throw error;
      
      const folders = data?.data?.value || [];
      const inboxFolder = folders.find((f: any) => f.displayName === 'Inbox');
      const sentFolder = folders.find((f: any) => f.displayName === 'Sent Items');
      
      setStats({
        inbox: {
          total: inboxFolder?.totalItemCount || 0,
          unread: inboxFolder?.unreadItemCount || 0
        },
        sent: {
          total: sentFolder?.totalItemCount || 0
        }
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchEmails = async (folder: string = 'inbox') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-inbox', {
        body: { 
          action: 'recent', 
          folder: folder,
          limit: 50 
        }
      });
      
      if (error) throw error;
      
      if (folder === 'inbox') {
        setEmails(data?.emails || []);
      } else {
        setSentEmails(data?.emails || []);
      }
    } catch (err) {
      console.error('Failed to fetch emails:', err);
      toast({
        title: "Error",
        description: "Failed to load emails. Check API connection.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchEmails(activeTab === 'sent' ? 'sentItems' : 'inbox'),
      fetchStats()
    ]);
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Inbox updated"
    });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'sent' && sentEmails.length === 0) {
      fetchEmails('sentItems');
    } else if (tab === 'inbox') {
      fetchEmails('inbox');
    }
  };

  const openEmail = async (email: Email) => {
    setSelectedEmail(email);
    setShowEmailDialog(true);
    setReplyText("");
    
    // Fetch full email body if needed
    if (!email.body?.content) {
      setLoadingEmail(true);
      try {
        const { data, error } = await supabase.functions.invoke('check-inbox', {
          body: { 
            action: 'get',
            messageId: email.id
          }
        });
        
        if (!error && data?.email) {
          setSelectedEmail(data.email);
        }
      } catch (err) {
        console.error('Failed to fetch email body:', err);
      } finally {
        setLoadingEmail(false);
      }
    }
  };

  const sendReply = async () => {
    if (!selectedEmail || !replyText.trim()) return;
    
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('send-hello-email', {
        body: {
          to: selectedEmail.from.emailAddress.address,
          subject: `Re: ${selectedEmail.subject}`,
          html: `<p>${replyText.replace(/\n/g, '<br>')}</p>
            <br><hr><br>
            <p><em>On ${format(new Date(selectedEmail.receivedDateTime), 'MMM d, yyyy h:mm a')}, ${selectedEmail.from.emailAddress.name} wrote:</em></p>
            <blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;">
              ${selectedEmail.bodyPreview}
            </blockquote>`
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Reply Sent!",
        description: `Email sent to ${selectedEmail.from.emailAddress.address}`
      });
      
      setReplyText("");
      setShowEmailDialog(false);
      
    } catch (err) {
      console.error('Failed to send reply:', err);
      toast({
        title: "Send Failed",
        description: "Could not send reply. Try again.",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const filteredEmails = (activeTab === 'sent' ? sentEmails : emails).filter(email => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject?.toLowerCase().includes(query) ||
      email.from?.emailAddress?.name?.toLowerCase().includes(query) ||
      email.from?.emailAddress?.address?.toLowerCase().includes(query) ||
      email.bodyPreview?.toLowerCase().includes(query)
    );
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              Nightmare Inbox
            </h1>
            <p className="text-muted-foreground mt-1">
              hello@weprintwraps.com — {stats?.inbox.unread.toLocaleString() || '...'} unread emails waiting
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open('https://outlook.office.com/mail/inbox', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Outlook
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-red-500/20">
                  <Inbox className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-500">
                    {stats?.inbox.unread.toLocaleString() || '...'}
                  </p>
                  <p className="text-sm text-muted-foreground">Unread Emails</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/20">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {stats?.inbox.total.toLocaleString() || '...'}
                  </p>
                  <p className="text-sm text-muted-foreground">Total in Inbox</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/20">
                  <Send className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold">
                    {stats?.sent.total.toLocaleString() || '...'}
                  </p>
                  <p className="text-sm text-muted-foreground">Sent Emails</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails by subject, sender, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="h-4 w-4" />
              Inbox
              {stats?.inbox.unread ? (
                <Badge variant="destructive" className="ml-1">
                  {stats.inbox.unread > 999 ? '999+' : stats.inbox.unread}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Send className="h-4 w-4" />
              Sent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No emails found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="divide-y divide-border">
                      {filteredEmails.map((email) => (
                        <div
                          key={email.id}
                          onClick={() => openEmail(email)}
                          className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                            !email.isRead ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full ${!email.isRead ? 'bg-primary/20' : 'bg-muted'}`}>
                              {!email.isRead ? (
                                <Mail className="h-4 w-4 text-primary" />
                              ) : (
                                <MailOpen className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`font-medium truncate ${!email.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown'}
                                </p>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(email.receivedDateTime), { addSuffix: true })}
                                </span>
                              </div>
                              
                              <p className={`text-sm truncate mt-0.5 ${!email.isRead ? 'font-medium' : ''}`}>
                                {email.subject || '(No subject)'}
                              </p>
                              
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {email.bodyPreview}
                              </p>
                              
                              <div className="flex items-center gap-2 mt-2">
                                {email.hasAttachments && (
                                  <Badge variant="outline" className="text-xs">
                                    📎 Attachment
                                  </Badge>
                                )}
                                {email.importance === 'high' && (
                                  <Badge variant="destructive" className="text-xs">
                                    High Priority
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No sent emails found</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="divide-y divide-border">
                      {filteredEmails.map((email) => (
                        <div
                          key={email.id}
                          onClick={() => openEmail(email)}
                          className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-green-500/20">
                              <Send className="h-4 w-4 text-green-500" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium truncate">
                                  To: {email.toRecipients?.[0]?.emailAddress?.address || 'Unknown'}
                                </p>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDistanceToNow(new Date(email.sentDateTime || email.receivedDateTime), { addSuffix: true })}
                                </span>
                              </div>
                              
                              <p className="text-sm truncate mt-0.5">
                                {email.subject || '(No subject)'}
                              </p>
                              
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                {email.bodyPreview}
                              </p>
                            </div>
                            
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Email Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="pr-8">{selectedEmail?.subject || '(No subject)'}</DialogTitle>
              <DialogDescription>
                {activeTab === 'sent' ? 'To: ' : 'From: '}
                {activeTab === 'sent' 
                  ? selectedEmail?.toRecipients?.[0]?.emailAddress?.address
                  : `${selectedEmail?.from?.emailAddress?.name || ''} <${selectedEmail?.from?.emailAddress?.address}>`
                }
                <span className="mx-2">•</span>
                {selectedEmail && format(new Date(selectedEmail.receivedDateTime), 'MMM d, yyyy h:mm a')}
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 mt-4 border rounded-lg p-4 bg-muted/30">
              {loadingEmail ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : selectedEmail?.body?.content ? (
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: selectedEmail.body.contentType === 'html' 
                      ? selectedEmail.body.content 
                      : `<pre>${selectedEmail.body.content}</pre>`
                  }}
                />
              ) : (
                <p className="text-muted-foreground">{selectedEmail?.bodyPreview}</p>
              )}
            </ScrollArea>
            
            {activeTab === 'inbox' && selectedEmail && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Reply className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Quick Reply</span>
                </div>
                <Textarea
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                    Close
                  </Button>
                  <Button onClick={sendReply} disabled={sending || !replyText.trim()}>
                    {sending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Reply
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
