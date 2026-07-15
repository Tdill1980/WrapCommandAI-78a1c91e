import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use EXTERNAL database (user's Supabase) with fallback - this function runs on Lovable but queries external DB
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body for optional filters
    let channelFilter: string | null = null;
    let orgFilter: string | null = null; // SaaS tenant isolation
    let limitCount = 200; // Increased default limit

    if (req.method === "POST") {
      try {
        const body = await req.json();
        channelFilter = body.channel || null; // null = all channels
        orgFilter = body.organization_id || null; // null = all orgs (single-tenant fallback)
        limitCount = body.limit || 200;
      } catch {
        // No body or invalid JSON - use defaults
      }
    }

    // Fetch conversations - optionally filter by channel
    let query = supabase
      .from("conversations")
      .select(`
        id,
        channel,
        status,
        chat_state,
        metadata,
        created_at,
        updated_at,
        last_message_at,
        contact_id
      `);

    // Only filter by channel if explicitly requested
    if (channelFilter) {
      query = query.eq("channel", channelFilter);
    }
    // Tenant isolation: only this org's conversations when an org is provided.
    if (orgFilter) {
      query = query.eq("organization_id", orgFilter);
    }

    const { data: conversations, error } = await query
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limitCount);

    if (error) {
      console.error("[get-website-chats] Query error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch messages for all conversations
    const conversationIds = (conversations || []).map(c => c.id);
    let allMessages: any[] = [];

    if (conversationIds.length > 0) {
      const { data: msgs, error: msgError } = await supabase
        .from("messages")
        .select("id, conversation_id, content, direction, sender_name, created_at, metadata")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true });

      if (msgError) {
        console.error("[get-website-chats] Messages query error:", msgError);
      } else {
        allMessages = msgs || [];
        console.log(`[get-website-chats] Fetched ${allMessages.length} messages for ${conversationIds.length} conversations`);
      }
    }

    // Group messages by conversation_id
    const messagesByConversation: Record<string, any[]> = {};
    for (const msg of allMessages || []) {
      if (!messagesByConversation[msg.conversation_id]) {
        messagesByConversation[msg.conversation_id] = [];
      }
      messagesByConversation[msg.conversation_id].push(msg);
    }

    // Enrich with customer info from chat_state
    const enrichedChats = (conversations || []).map((conv: any) => {
      const chatState = conv.chat_state || {};
      const metadata = conv.metadata || {};
      // Get messages for this conversation (already sorted)
      const messages = messagesByConversation[conv.id] || [];

      return {
        id: conv.id,
        channel: conv.channel,
        status: conv.status,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_message_at: conv.last_message_at,
        // MESSAGES - critical for message count display
        messages: messages,
        // Extract customer info from chat_state
        customer_name: chatState.customer_name || chatState.name || null,
        customer_email: chatState.customer_email || chatState.email || null,
        customer_phone: chatState.customer_phone || chatState.phone || null,
        // Vehicle info
        vehicle: chatState.vehicle || null,
        // Conversation state
        stage: chatState.stage || "initial",
        intent: chatState.intent || null,
        // Escalation tracking
        escalations_sent: chatState.escalations_sent || [],
        escalation_sent: chatState.escalation_sent || null, // Legacy field
        // Message preview from chat_state
        last_message: chatState.last_message || chatState.last_customer_message || null,
        ai_summary: chatState.ai_summary || null,
        // Session info from metadata
        session_id: metadata.session_id || null,
        page_url: metadata.page_url || null,
        // Full objects for detailed view
        chat_state: chatState,
        metadata: metadata,
      };
    });

    return new Response(
      JSON.stringify(enrichedChats),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (err) {
    console.error("[get-website-chats] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
