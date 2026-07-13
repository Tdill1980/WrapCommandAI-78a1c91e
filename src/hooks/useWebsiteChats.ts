import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ChatConversation {
  id: string;
  contact_id: string | null;
  channel: string;
  status: string | null;
  priority: string | null;
  subject: string | null;
  last_message_at: string | null;
  created_at: string | null;
  unread_count: number | null;
  chat_state: {
    stage?: string;
    mode?: string;
    operator?: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    vehicle?: { year?: string; make?: string; model?: string };
    intent?: string;
    urgency?: string;
    tags?: string[];
    ai_summary?: string;
    escalations_sent?: string[];
    last_parsed?: string;
  } | null;
  metadata: {
    session_id?: string;
    page_url?: string;
    org?: string;
    mode?: string;
    geo?: {
      ip?: string;
      city?: string;
      region?: string;
      country?: string;
      country_name?: string;
      timezone?: string;
      latitude?: number;
      longitude?: number;
    };
  } | null;
  contact?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
  } | null;
  messages?: {
    id: string;
    content: string;
    direction: string;
    sender_name: string | null;
    created_at: string | null;
    metadata: unknown;
  }[];
}

// Helper type for message metadata
interface MessageMetadata {
  status?: 'pending_approval' | 'sent' | 'approved';
  instagram_sent?: boolean;
  ai_mode?: string;
}

// Hook to get total conversation count in DB (OS transparency)
export function useConversationTotalCount() {
  return useQuery({
    queryKey: ['conversations-total-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000
  });
}

export function useWebsiteChats() {
  const query = useQuery({
    queryKey: ['website-page-chats'],
    queryFn: async (): Promise<ChatConversation[]> => {
      // Use WePrintWraps Supabase directly (qxllysilzonrlyoaomce)
      const WPW_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM';
      const response = await fetch(
        'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/get-website-chats',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Supabase gateway rejects the call (401) without these — this is why
            // the admin sat on "Loading sessions…" with Loaded: 0.
            'apikey': WPW_ANON,
            'Authorization': `Bearer ${WPW_ANON}`,
          },
          body: JSON.stringify({ channel: 'website' })
        }
      );

      if (!response.ok) throw new Error('Failed to fetch chats');

      const data = await response.json();

      // Edge function returns array directly, not wrapped in { conversations: [...] }
      const chats = Array.isArray(data) ? data : (data.conversations || []);

      // Debug: Log messages info
      if (chats.length > 0) {
        console.log('[useWebsiteChats] Loaded', chats.length, 'chats');
        console.log('[useWebsiteChats] First chat has', chats[0].messages?.length || 0, 'messages');
      }

      return chats.map((convo: any) => ({
        ...convo,
        messages: convo.messages || [], // Explicitly include messages array
        chat_state: convo.chat_state as ChatConversation['chat_state'],
        metadata: convo.metadata as ChatConversation['metadata'],
      }));
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Real-time subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('website-chats-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: 'channel=eq.website'
        },
        () => {
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return {
    conversations: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}

// Stats hook - channel-scoped only (no agent filter)
export function useWebsiteChatStats() {
  return useQuery({
    queryKey: ['website-page-chat-stats'],
    queryFn: async () => {
      // Use UTC midnight to match database timestamps (Supabase stores in UTC)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Website chats today (channel = website)
      const { count: totalToday } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'website')
        .gte('created_at', today.toISOString());

      // Emails captured today from website chat
      const { count: emailsCaptured } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'website_chat')
        .not('email', 'is', null)
        .not('email', 'ilike', '%@capture.local%')
        .gte('created_at', today.toISOString());

      // Active website conversations
      const { count: activeConversations } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'website')
        .eq('status', 'open');

      return {
        totalToday: totalToday || 0,
        emailsCaptured: emailsCaptured || 0,
        activeConversations: activeConversations || 0
      };
    },
    refetchInterval: 60000
  });
}
