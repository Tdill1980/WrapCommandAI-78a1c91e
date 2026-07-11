import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWebsiteChatAnalytics() {
  return useQuery({
    queryKey: ['website-chat-analytics'],
    queryFn: async () => {
      // Get total conversations (website channel)
      const { count: totalChats } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'website');

      // Get total messages sent by agent (auto responses).
      // Persona has changed over time (Jordan Lee -> WPW Team -> Ace) so match all.
      const { count: autoResponses } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outbound')
        .in('sender_name', ['Ace', 'WPW Team', 'Jordan Lee']);

      // Get quotes generated from website chat
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, total_price, status')
        .or('source.eq.website_chat,source.eq.website');

      const quotesGenerated = quotes?.length || 0;
      
      // Calculate revenue from converted quotes
      const convertedQuotes = quotes?.filter(q => 
        q.status === 'approved' || q.status === 'converted' || q.status === 'completed'
      ) || [];
      const totalRevenue = convertedQuotes.reduce((sum, q) => sum + (q.total_price || 0), 0);

      // Get emails captured
      const { count: emailsCaptured } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'website_chat')
        .not('email', 'is', null)
        .not('email', 'ilike', '%@capture.local%');

      // Calculate conversion rate (quotes / chats)
      const conversionRate = totalChats && totalChats > 0 
        ? ((quotesGenerated / totalChats) * 100).toFixed(1) 
        : "0.0";

      // Get average messages per conversation
      const { data: conversationsWithMessages } = await supabase
        .from('conversations')
        .select(`
          id,
          messages:messages(count)
        `)
        .eq('channel', 'website')
        .limit(100);

      let avgMessages = 0;
      if (conversationsWithMessages && conversationsWithMessages.length > 0) {
        const totalMessages = conversationsWithMessages.reduce((sum, c) => {
          const msgCount = Array.isArray(c.messages) ? c.messages.length : 0;
          return sum + msgCount;
        }, 0);
        avgMessages = totalMessages / conversationsWithMessages.length;
      }

      return {
        totalChats: totalChats || 0,
        autoResponses: autoResponses || 0,
        quotesGenerated,
        totalRevenue,
        emailsCaptured: emailsCaptured || 0,
        conversionRate,
        avgMessages: avgMessages.toFixed(1),
        quoteConversions: convertedQuotes.length
      };
    },
    refetchInterval: 60000
  });
}
