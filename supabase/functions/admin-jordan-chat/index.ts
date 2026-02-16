// WrapCommand Guide - Internal platform education assistant
// Provides feature education, stats queries, and directive management
// NOTE: This is SEPARATE from Alex (Escalations) and Jordan (Website Chat)

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WRAPCOMMAND_FEATURES, getFeatureFromPath, getFullKnowledgeBase, formatFeatureForPrompt } from "../_shared/wrapcommand-knowledge-base.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Detect if user is asking about a feature
function detectFeatureQuery(message: string): string | null {
  const lower = message.toLowerCase();
  
  for (const [key, feature] of Object.entries(WRAPCOMMAND_FEATURES)) {
    const titleLower = feature.title.toLowerCase();
    if (lower.includes(titleLower) || lower.includes(key.replace(/_/g, ' '))) {
      return key;
    }
  }
  
  return null;
}

// Detect if user is setting a directive
function detectDirective(message: string): string | null {
  const lower = message.toLowerCase();
  const directivePatterns = [
    /^directive[:\s]+(.+)/i,
    /^tell jordan[:\s]+(.+)/i,
    /^jordan should[:\s]+(.+)/i,
    /^today[,\s]+(.+)/i,
    /^from now on[,\s]+(.+)/i,
  ];
  
  for (const pattern of directivePatterns) {
    const match = message.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
}

// Detect stats query
function detectStatsQuery(message: string): { type: string; timeframe?: string } | null {
  const lower = message.toLowerCase();
  
  // Quote stats
  if (lower.includes('quote') || lower.includes('quotes')) {
    const timeframe = lower.includes('today') ? 'today' 
      : lower.includes('week') ? 'week' 
      : lower.includes('month') ? 'month' 
      : 'week';
    return { type: 'quotes', timeframe };
  }
  
  // Chat/conversation stats
  if (lower.includes('chat') || lower.includes('conversation') || lower.includes('message')) {
    const timeframe = lower.includes('today') ? 'today' 
      : lower.includes('week') ? 'week' 
      : 'week';
    return { type: 'chats', timeframe };
  }
  
  // Questions/inquiries
  if (lower.includes('asking') || lower.includes('question') || lower.includes('inquir')) {
    return { type: 'common_questions' };
  }
  
  // Escalations
  if (lower.includes('escalat')) {
    return { type: 'escalations' };
  }
  
  // Active directives
  if (lower.includes('directive') && (lower.includes('active') || lower.includes('current') || lower.includes('what'))) {
    return { type: 'active_directives' };
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, current_page, user_id, session_id } = await req.json();
    
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[AdminJordan] Received:', { message: message.substring(0, 50), current_page });

    // Get current page context
    const currentFeature = current_page ? getFeatureFromPath(current_page) : null;

    // Check for directive setting
    const directiveText = detectDirective(message);
    if (directiveText) {
      // Determine expiration
      const lower = message.toLowerCase();
      let expires_at: string | null = null;
      
      if (lower.includes('today')) {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        expires_at = endOfDay.toISOString();
      } else if (lower.includes('week')) {
        const endOfWeek = new Date();
        endOfWeek.setDate(endOfWeek.getDate() + 7);
        expires_at = endOfWeek.toISOString();
      }
      
      // Save directive
      const { error } = await supabase.from('jordan_directives').insert({
        directive: directiveText,
        active: true,
        expires_at,
        scope: 'website_chat',
        created_by: user_id
      });
      
      if (error) throw error;
      
      const expiryNote = expires_at 
        ? `It expires ${lower.includes('today') ? 'at midnight tonight' : 'in 7 days'}.`
        : 'It will stay active until you deactivate it.';
      
      return new Response(JSON.stringify({
        response: `✅ Got it! I'll incorporate this directive into my website chat responses:\n\n"${directiveText}"\n\n${expiryNote}`,
        type: 'directive_set'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for stats query
    const statsQuery = detectStatsQuery(message);
    if (statsQuery) {
      let response = '';
      
      if (statsQuery.type === 'quotes') {
        // Get quote stats
        const startDate = statsQuery.timeframe === 'today' 
          ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
          : statsQuery.timeframe === 'week'
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        
        // Count conversations with quotes
        const { count: quoteCount } = await supabase
          .from('conversation_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'quote_sent')
          .gte('created_at', startDate);
        
        response = `📊 **Quote Stats (${statsQuery.timeframe})**\n\nI've sent approximately ${quoteCount || 0} quotes ${statsQuery.timeframe === 'today' ? 'today' : `this ${statsQuery.timeframe}`}.\n\nWant more details on conversion rates?`;
      }
      
      else if (statsQuery.type === 'chats') {
        const startDate = statsQuery.timeframe === 'today' 
          ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const { count: chatCount } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('channel', 'website')
          .gte('created_at', startDate);
        
        response = `💬 **Chat Stats (${statsQuery.timeframe})**\n\nI've had ${chatCount || 0} conversations ${statsQuery.timeframe === 'today' ? 'today' : 'this week'}.\n\nWant to know what customers are asking about?`;
      }
      
      else if (statsQuery.type === 'common_questions') {
        // Get recent messages and categorize
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('content')
          .eq('direction', 'inbound')
          .order('created_at', { ascending: false })
          .limit(100);
        
        const topics: Record<string, number> = {
          'pricing': 0,
          'turnaround': 0,
          'shipping': 0,
          'design_files': 0,
          'order_status': 0,
          'materials': 0,
          'other': 0
        };
        
        for (const msg of recentMessages || []) {
          const content = (msg.content || '').toLowerCase();
          if (content.includes('price') || content.includes('cost') || content.includes('how much')) topics.pricing++;
          else if (content.includes('long') || content.includes('time') || content.includes('turnaround')) topics.turnaround++;
          else if (content.includes('ship') || content.includes('deliver')) topics.shipping++;
          else if (content.includes('file') || content.includes('design') || content.includes('upload')) topics.design_files++;
          else if (content.includes('order') || content.includes('status') || content.includes('track')) topics.order_status++;
          else if (content.includes('avery') || content.includes('3m') || content.includes('vinyl') || content.includes('material')) topics.materials++;
          else topics.other++;
        }
        
        const sorted = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const total = Object.values(topics).reduce((a, b) => a + b, 0);
        
        response = `🔍 **Top Customer Questions (Last 100 chats)**\n\n`;
        for (const [topic, count] of sorted) {
          const pct = Math.round((count / total) * 100);
          response += `• ${topic.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: ${pct}%\n`;
        }
      }
      
      else if (statsQuery.type === 'escalations') {
        const { count: escalationCount } = await supabase
          .from('agent_alerts')
          .select('*', { count: 'exact', head: true })
          .is('resolved_at', null);
        
        response = `🚨 **Escalation Status**\n\nThere are ${escalationCount || 0} unresolved escalations in the queue.\n\nCheck the Jordan Control dashboard to review them.`;
      }
      
      else if (statsQuery.type === 'active_directives') {
        const { data: directives } = await supabase
          .from('jordan_directives')
          .select('directive, expires_at, created_at')
          .eq('active', true)
          .or('expires_at.is.null,expires_at.gt.now()')
          .order('created_at', { ascending: false });
        
        if (!directives || directives.length === 0) {
          response = `📋 **Active Directives**\n\nNo active directives right now. You can set one by saying:\n\n"Directive: offer 10% off window perf today"`;
        } else {
          response = `📋 **Active Directives (${directives.length})**\n\n`;
          for (const d of directives) {
            const expiry = d.expires_at 
              ? `(expires ${new Date(d.expires_at).toLocaleDateString()})`
              : '(no expiration)';
            response += `• ${d.directive} ${expiry}\n`;
          }
        }
      }
      
      return new Response(JSON.stringify({ response, type: 'stats' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for feature query
    const featureKey = detectFeatureQuery(message);
    if (featureKey && WRAPCOMMAND_FEATURES[featureKey]) {
      const feature = WRAPCOMMAND_FEATURES[featureKey];
      const formatted = formatFeatureForPrompt(feature);
      
      return new Response(JSON.stringify({
        response: `Here's how to use **${feature.title}**:\n\n${feature.description}\n\n**Steps:**\n${feature.howToUse.map((s, i) => `${i + 1}. ${s}`).join('\n')}${feature.tips ? `\n\n**Tips:**\n${feature.tips.map(t => `• ${t}`).join('\n')}` : ''}`,
        type: 'feature_help'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // General AI response with context
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({
        response: "I can help you with WrapCommand! Try asking:\n• How do I use [feature name]?\n• How many quotes this week?\n• What are customers asking about?\n• Directive: [instruction for website chat]",
        type: 'help'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build context-aware prompt
    const systemPrompt = `You are WrapCommand Guide - the internal platform education assistant.

YOUR ROLE:
- Teach team members how to use WrapCommand features
- Explain what each tool does and why it exists
- Provide step-by-step instructions
- Answer platform questions

YOU ARE NOT:
- Alex (the Escalations Desk execution assistant - that's a separate agent)
- Jordan (the customer-facing website chat agent - that's a separate agent)

If someone asks about handling an escalation → direct them to Alex in the Escalations Desk
If someone asks about customer conversations → that's Jordan's domain on the website

${currentFeature ? `\nUser is currently on: ${currentFeature.title} (${currentFeature.path})\n${currentFeature.description}\n\nHow to use:\n${currentFeature.howToUse.join('\n')}\n` : ''}

WRAPCOMMAND FEATURES:
${Object.values(WRAPCOMMAND_FEATURES).map(f => `• ${f.title} (${f.path}): ${f.description}`).join('\n')}

Keep responses concise and educational. Use markdown formatting.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{ role: 'user', content: `${systemPrompt}\n\nUser message: ${message}` }],
          max_tokens: 500
        }),
      }
    );

    const data = await response.json();
    const aiResponse = data?.choices?.[0]?.message?.content || "I'm not sure how to help with that. Try asking about a specific feature!";

    return new Response(JSON.stringify({ response: aiResponse, type: 'general' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[AdminJordan] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
