import React, { useState, useEffect } from 'react';
import { 
  Mail, Inbox, Send, AlertTriangle, DollarSign, Users, 
  FileText, Tag, User, Clock, RefreshCw, Search, Filter,
  ChevronRight, Paperclip, Star, Archive, Trash2, Reply,
  FileCheck, ExternalLink, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Email {
  id: string;
  microsoft_id: string;
  mailbox: string;
  subject: string;
  body_preview: string;
  body_html: string;
  from_email: string;
  from_name: string;
  has_attachments: boolean;
  attachments: any[];
  category: string;
  confidence: number;
  keywords: string[];
  assigned_to: string;
  escalation_level: number;
  is_read: boolean;
  is_processed: boolean;
  is_new_customer: boolean;
  customer_email: string;
  received_at: string;
  quote_id: string | null;
  quote_status: string | null;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  quote_request: { label: 'Quote Request', color: 'bg-green-500', icon: <DollarSign className="h-4 w-4" /> },
  escalation: { label: 'Escalation', color: 'bg-red-500', icon: <AlertTriangle className="h-4 w-4" /> },
  bulk_order: { label: 'Bulk Order', color: 'bg-purple-500', icon: <Users className="h-4 w-4" /> },
  sponsorship: { label: 'Sponsorship', color: 'bg-blue-500', icon: <Star className="h-4 w-4" /> },
  affiliate: { label: 'Affiliate', color: 'bg-orange-500', icon: <Users className="h-4 w-4" /> },
  file_submission: { label: 'File Submission', color: 'bg-cyan-500', icon: <FileText className="h-4 w-4" /> },
  general: { label: 'General', color: 'bg-gray-500', icon: <Mail className="h-4 w-4" /> },
};

const MAILBOX_LABELS: Record<string, string> = {
  'hello@weprintwraps.com': 'Hello',
  'design@weprintwraps.com': 'Design',
  'support@weprintwraps.com': 'Support',
};

export default function MightymailInbox() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    escalations: 0,
    quotes: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchEmails();
    fetchStats();
  }, [activeTab]);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('mightymail_inbox')
        .select('*')
        .eq('is_archived', false)
        .eq('is_spam', false)
        .order('received_at', { ascending: false })
        .limit(100);

      if (activeTab !== 'all') {
        if (activeTab === 'unread') {
          query = query.eq('is_read', false);
        } else if (activeTab === 'escalations') {
          query = query.eq('category', 'escalation');
        } else if (activeTab === 'quotes') {
          query = query.eq('category', 'quote_request');
        } else {
          // Mailbox filter
          query = query.eq('mailbox', activeTab);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmails(data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading emails',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: allEmails } = await supabase
        .from('mightymail_inbox')
        .select('id, is_read, category')
        .eq('is_archived', false)
        .eq('is_spam', false);

      if (allEmails) {
        setStats({
          total: allEmails.length,
          unread: allEmails.filter(e => !e.is_read).length,
          escalations: allEmails.filter(e => e.category === 'escalation').length,
          quotes: allEmails.filter(e => e.category === 'quote_request').length,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      // Trigger sync function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mightymail-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sync complete',
          description: `Synced ${result.summary?.totalSynced || 0} new emails`,
        });
        
        // Trigger classification
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mightymail-classify`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({}),
          }
        );

        fetchEmails();
        fetchStats();
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (error: any) {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const markAsRead = async (emailId: string) => {
    await supabase
      .from('mightymail_inbox')
      .update({ is_read: true })
      .eq('id', emailId);
    
    setEmails(prev => prev.map(e => 
      e.id === emailId ? { ...e, is_read: true } : e
    ));
    fetchStats();
  };

  const archiveEmail = async (emailId: string) => {
    await supabase
      .from('mightymail_inbox')
      .update({ is_archived: true })
      .eq('id', emailId);
    
    setEmails(prev => prev.filter(e => e.id !== emailId));
    setSelectedEmail(null);
    fetchStats();
    
    toast({ title: 'Email archived' });
  };

  const filteredEmails = emails.filter(email => 
    searchQuery === '' ||
    email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.from_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.from_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-[calc(100vh-80px)] bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Mightymail
          </h1>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-blue-500">{stats.unread}</div>
            <div className="text-xs text-muted-foreground">Unread</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-red-500">{stats.escalations}</div>
            <div className="text-xs text-muted-foreground">Escalations</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-green-500">{stats.quotes}</div>
            <div className="text-xs text-muted-foreground">Quotes</div>
          </Card>
        </div>

        {/* Filters */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="flex flex-col h-auto w-full gap-1">
            <TabsTrigger value="all" className="w-full justify-start">
              <Inbox className="h-4 w-4 mr-2" /> All Inbox
            </TabsTrigger>
            <TabsTrigger value="unread" className="w-full justify-start">
              <Mail className="h-4 w-4 mr-2" /> Unread
            </TabsTrigger>
            <TabsTrigger value="escalations" className="w-full justify-start">
              <AlertTriangle className="h-4 w-4 mr-2" /> Escalations
            </TabsTrigger>
            <TabsTrigger value="quotes" className="w-full justify-start">
              <DollarSign className="h-4 w-4 mr-2" /> Quotes
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 text-sm font-medium text-muted-foreground">Mailboxes</div>
          <TabsList className="flex flex-col h-auto w-full gap-1 mt-2">
            <TabsTrigger value="hello@weprintwraps.com" className="w-full justify-start text-sm">
              hello@
            </TabsTrigger>
            <TabsTrigger value="design@weprintwraps.com" className="w-full justify-start text-sm">
              design@
            </TabsTrigger>
            <TabsTrigger value="support@weprintwraps.com" className="w-full justify-start text-sm">
              support@
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Email List */}
      <div className="w-96 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Loading...</div>
          ) : filteredEmails.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No emails found</div>
          ) : (
            <div className="divide-y">
              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => {
                    setSelectedEmail(email);
                    if (!email.is_read) markAsRead(email.id);
                  }}
                  className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedEmail?.id === email.id ? 'bg-muted' : ''
                  } ${!email.is_read ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium truncate ${!email.is_read ? 'font-bold' : ''}`}>
                          {email.from_name || email.from_email?.split('@')[0] || 'Unknown'}
                        </span>
                        {email.is_new_customer && (
                          <Badge variant="outline" className="text-xs">New</Badge>
                        )}
                      </div>
                      <div className={`text-sm truncate ${!email.is_read ? 'font-semibold' : ''}`}>
                        {email.subject || '(no subject)'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-1">
                        {email.body_preview?.substring(0, 80)}...
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(email.received_at)}
                      </span>
                      {email.has_attachments && (
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {email.category && CATEGORY_CONFIG[email.category] && (
                      <Badge 
                        className={`${CATEGORY_CONFIG[email.category].color} text-white text-xs`}
                      >
                        {CATEGORY_CONFIG[email.category].icon}
                        <span className="ml-1">{CATEGORY_CONFIG[email.category].label}</span>
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {MAILBOX_LABELS[email.mailbox] || email.mailbox}
                    </Badge>
                    {email.assigned_to && (
                      <Badge variant="secondary" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        {email.assigned_to.split('@')[0]}
                      </Badge>
                    )}
                    {email.quote_status === 'pending' && (
                      <Badge className="bg-yellow-500 text-white text-xs">
                        <FileCheck className="h-3 w-3 mr-1" />
                        Quote Ready
                      </Badge>
                    )}
                    {email.quote_status === 'needs_info' && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Needs Info
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Email Detail */}
      <div className="flex-1 flex flex-col">
        {selectedEmail ? (
          <>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedEmail.subject || '(no subject)'}</h2>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span>{selectedEmail.from_name} &lt;{selectedEmail.from_email}&gt;</span>
                  <span>•</span>
                  <span>{new Date(selectedEmail.received_at).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedEmail.quote_id && (
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => window.open(`/quote-drafts?id=${selectedEmail.quote_id}`, '_blank')}
                  >
                    <FileCheck className="h-4 w-4 mr-2" /> View Quote
                  </Button>
                )}
                <Button variant="outline" size="sm">
                  <Reply className="h-4 w-4 mr-2" /> Reply
                </Button>
                <Button variant="outline" size="sm" onClick={() => archiveEmail(selectedEmail.id)}>
                  <Archive className="h-4 w-4 mr-2" /> Archive
                </Button>
              </div>
            </div>

            {/* Metadata */}
            <div className="p-4 border-b bg-muted/30">
              <div className="flex flex-wrap gap-2">
                {selectedEmail.category && CATEGORY_CONFIG[selectedEmail.category] && (
                  <Badge className={`${CATEGORY_CONFIG[selectedEmail.category].color} text-white`}>
                    {CATEGORY_CONFIG[selectedEmail.category].icon}
                    <span className="ml-1">{CATEGORY_CONFIG[selectedEmail.category].label}</span>
                    {selectedEmail.confidence && (
                      <span className="ml-1 opacity-75">
                        ({Math.round(selectedEmail.confidence * 100)}%)
                      </span>
                    )}
                  </Badge>
                )}
                {selectedEmail.assigned_to && (
                  <Badge variant="secondary">
                    <User className="h-3 w-3 mr-1" />
                    Assigned to {selectedEmail.assigned_to}
                  </Badge>
                )}
                {selectedEmail.escalation_level > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {selectedEmail.escalation_level === 2 ? 'Urgent' : 'Needs Attention'}
                  </Badge>
                )}
                {selectedEmail.keywords?.map((kw, i) => (
                  <Badge key={i} variant="outline">
                    <Tag className="h-3 w-3 mr-1" />
                    {kw}
                  </Badge>
                ))}
              </div>

              {selectedEmail.has_attachments && selectedEmail.attachments?.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium mb-2">Attachments</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEmail.attachments.map((att: any, i: number) => (
                      <Badge key={i} variant="outline" className="cursor-pointer hover:bg-muted">
                        <Paperclip className="h-3 w-3 mr-1" />
                        {att.name}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((att.size || 0) / 1024)}KB)
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Email Body */}
            <ScrollArea className="flex-1 p-4">
              {selectedEmail.body_html ? (
                <div 
                  className="prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedEmail.body_html }}
                />
              ) : (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {selectedEmail.body_preview || 'No content'}
                </p>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select an email to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
