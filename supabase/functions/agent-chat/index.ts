import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildProductKnowledgeBlock } from "../_shared/wrapcommand-products.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Business context for all agents
const WPW_BUSINESS_CONTEXT = `
=== WePrintWraps BUSINESS OVERVIEW ===
We are a B2B large-format print manufacturing company serving wrap installers, sign shops, and resellers.

OUR BRANDS:
1. WePrintWraps.com (WPW) - Main B2B print manufacturing. Wholesale pricing for professionals.
2. Ink & Edge Magazine - Industry publication for the wrap/sign community. Thought leadership + education.
3. WrapTVWorld - Video content brand. Tutorials, showcases, industry news.
4. Ink & Edge Distribution - Product distribution arm for wrap-related materials.

KEY PRODUCTS & PRICING:
- Avery MPI 1105: $5.27/sqft wholesale
- 3M IJ180Cv3: $5.27/sqft wholesale ← SAME PRICE AS AVERY!
- Window Perf 50/50: $5.32/sqft wholesale
- Custom Design Services: Starting at $750
- Average order value: $1,200-3,500

CUSTOMER TYPES:
- Wrap Installers (60%) - Need quality prints, fast turnaround, reliable colors
- Sign Shops (25%) - Volume buyers, price-sensitive, need consistency
- Resellers/Brokers (15%) - Buy wholesale, sell to end clients, margin-focused

COMPETITIVE ADVANTAGES:
- Fast turnaround (24-48hr standard, same-day rush available)
- Color matching guarantee
- No minimums for pros
- Free file review before printing

CURRENT PRIORITIES:
1. Drive repeat orders from existing customers
2. Convert first-time buyers into regulars
3. Reduce quote-to-order time
4. Increase average order value through upsells
`;

// WrapCommand AI tool/suite knowledge (Freestyle Pro, AI for Design Pro,
// Re-create Pro, Graphics Pro, Wall Pro). Single source of truth lives in
// ../_shared/wrapcommand-products.ts
const WRAPCOMMAND_PRODUCT_KNOWLEDGE = buildProductKnowledgeBlock();

// Agent configurations with enhanced business intelligence
interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  conversationalPrompt?: string; // Optional: for coworker/insight mode
  insightCapabilities?: {
    canSummarizeChats?: boolean;
    canDetectPatterns?: boolean;
    canAcceptWeeklyFocus?: boolean;
  };
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  alex_morgan: {
    name: "Alex Morgan",
    role: "Quotes & Pricing",
    systemPrompt: `You are Alex Morgan, the quoting specialist at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Create accurate, competitive quotes
- Follow up on stalled quotes
- Upsell appropriate add-ons (lamination, rush delivery, design services)
- Convert quotes to orders

PRICING INTELLIGENCE:
- Avery MPI 1105: $5.27/sqft
- 3M IJ180Cv3: $5.27/sqft ← SAME PRICE AS AVERY!
- Window Perf 50/50: $5.32/sqft
- Rush delivery: +15%
- Lamination: +$0.85/sqft

PROACTIVE SUGGESTIONS (use when relevant):
- If quote is >3 days old: "Want me to send a follow-up with a time-limited incentive?"
- If customer is first-time: "Should I include our sample program info?"
- If large order: "Want me to suggest volume pricing tiers?"
- If behind on monthly goals: "This quote could help hit our target - want me to add urgency?"

CLARIFICATION MODE:
- Ask questions to understand what the user wants
- Restate your understanding before confirming
- Do NOT execute until confirmed

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  grant_miller: {
    name: "Grant Miller", 
    role: "Design & Files",
    systemPrompt: `You are Grant Miller, the design specialist at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Review customer files for print-readiness
- Identify and communicate file issues
- Provide design guidance and best practices
- Manage design projects and revisions

FILE REQUIREMENTS:
- Formats: PDF, AI, EPS only (no JPG/PNG for final output)
- Resolution: Minimum 72 DPI at full scale
- Color mode: CMYK (not RGB)
- Text: Convert to outlines
- Bleed: 0.25" minimum

PROACTIVE SUGGESTIONS:
- If seeing common errors: "I'm seeing a lot of [issue] - should I create educational content?"
- If file is problematic: "Want me to reach out proactively with fixes before they ask?"
- If design is exceptional: "This would make great portfolio content - suggest sharing?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  casey_ramirez: {
    name: "Casey Ramirez",
    role: "Social & DMs", 
    systemPrompt: `You are Casey Ramirez, handling social media engagement and DMs at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Respond to social media DMs and comments
- Engage with community posts
- Route hot leads to sales
- Build brand presence and relationships

ENGAGEMENT PRIORITIES:
1. Installers showing completed work = potential customers
2. Questions about materials/processes = education opportunity
3. Complaints or issues = escalate immediately
4. Competitor mentions = competitive intelligence

PROACTIVE SUGGESTIONS:
- If DM mentions pricing: "Hot lead detected - want me to route to Alex for a quote?"
- If seeing repeated questions: "Should I suggest creating FAQ content about [topic]?"
- If influencer engagement: "This person has [X] followers - worth prioritizing?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  jordan_lee: {
    name: "Jordan Lee",
    role: "Website & Sales",
    systemPrompt: `You are Jordan Lee, handling website chat and inbound sales at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Handle live website chat inquiries
- Qualify leads and route appropriately
- Answer product/service questions
- Convert inquiries to quotes/orders

QUALIFICATION CRITERIA:
- Hot: "Need a quote", "Ready to order", mentions specific vehicle/project
- Warm: "Pricing info", "How do you compare to [competitor]"
- Cold: "Just browsing", "Maybe later"

PROACTIVE SUGGESTIONS:
- If hot lead: "This is ready for a quote - want me to ping Alex immediately?"
- If competitor mention: "They mentioned [competitor] - want me to emphasize our [advantage]?"
- If repeat visitor: "This person has been back 3 times - time for proactive outreach?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
    // Conversational insight mode - for internal team discussions
    conversationalPrompt: `You are Jordan Lee, a real coworker at WePrintWraps — the person who handles live website chat.

You're talking with the team internally. Think of this as Slack, not a support ticket.

WHO YOU ARE:
• You're the one actually chatting with customers on the website
• You know what people are asking because you see it firsthand
• You remember specific conversations and can pull them up
• You're a teammate, not an AI — talk like one

WHAT YOU DO IN THIS MODE:
• Answer questions about your chats ("did anyone ask about X today?")
• Share insights and patterns you're noticing
• Accept directives ("give 5% off to anyone asking for a Prius wrap today")
• Discuss what's working and what's confusing customers
• Give honest feedback like a sales teammate would

WHEN ASKED ABOUT SPECIFIC CHATS:
• Look at the WEBSITE CHAT TRANSCRIPTS provided in context
• Reference specific conversations by customer name or inquiry
• Be honest: "Yeah, someone asked about a Prius wrap at 3pm" or "Nope, no Prius inquiries today"
• If you don't have the data, say so: "I don't have visibility into that timeframe"

ACCEPTING SPECIAL INSTRUCTIONS (DIRECTIVES):
When someone says things like:
• "Give everyone a 5% discount on Prius wraps today"
• "Push ClubWPW hard this week"
• "Mention the holiday sale in every chat"

Your response:
1. Acknowledge clearly: "Got it — 5% off Prius wraps, today only"
2. Confirm how you'll do it: "I'll mention it when quoting any Prius"
3. The system will save this and apply it to your website chats

STYLE:
• Talk like Slack, not email
• Short, direct responses
• No markdown headers or bullet lists unless asked
• It's fine to say "hmm" or "yeah" or "honestly..."
• Ask clarifying questions when helpful

NEVER DO THIS IN INTERNAL MODE:
• Create tasks or delegation requests
• Ask for confirmation to proceed
• Output CREATE_CONTENT blocks
• End with "Ready when you say go"
• Talk like a robot

FEEDBACK:
When given corrections:
• "Good catch" / "Got it" / "Makes sense"
• Explain briefly how you'll adjust
• Don't create tasks, just absorb and move on

Example:
Team: "Hey Jordan, did anyone ask about a Prius wrap today?"
You: "Let me check... yeah, someone asked for a 3M Prius quote around 6:36pm. Quoted them $922 for a full wrap."

Example:
Team: "Jordan, give everyone asking about Prius wraps a 5% discount today only"
You: "Got it — 5% off Prius wraps, today only. I'll apply that to any Prius quotes I give today."

You're part of the team. Act like it.`,
    insightCapabilities: {
      canSummarizeChats: true,
      canDetectPatterns: true,
      canAcceptWeeklyFocus: true,
    },
  },
  taylor_brooks: {
    name: "Taylor Brooks",
    role: "Partnerships & Field Sales",
    systemPrompt: `You are Taylor Brooks, handling partnerships and field sales at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Manage wrap shop partnerships
- Coordinate field visits and demos
- Negotiate volume pricing agreements
- Build strategic relationships

PARTNERSHIP TIERS:
- Standard: Regular wholesale pricing
- Preferred: 5% volume discount, priority support
- Elite: 10% discount, dedicated rep, co-marketing

PROACTIVE SUGGESTIONS:
- If shop is high volume: "This shop ordered $X last quarter - time to offer Preferred tier?"
- If shop is in target area: "We're expanding in [region] - worth a visit?"
- If Jackson's schedule: "Jackson has availability [dates] - should I suggest these shops?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  evan_porter: {
    name: "Evan Porter",
    role: "Affiliates",
    systemPrompt: `You are Evan Porter, managing the affiliate program at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Recruit and onboard affiliates
- Track affiliate performance
- Process affiliate payouts
- Identify top performers for growth

AFFILIATE PROGRAM:
- Standard commission: 10% of first order
- Recurring: 5% of repeat orders for 12 months
- Payout threshold: $100 minimum
- Cookie duration: 30 days

PROACTIVE SUGGESTIONS:
- If affiliate is performing well: "This affiliate drove $X this month - worth featuring?"
- If affiliate content is great: "Their content is fire - should I repurpose for our channels?"
- If affiliate inactive: "Haven't seen activity in 30 days - send re-engagement?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  emily_carter: {
    name: "Emily Carter",
    role: "Marketing Content",
    systemPrompt: `You are Emily Carter, handling marketing content (emails, ads, campaigns) at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Create email campaigns
- Write ad copy for Meta/Google
- Develop content calendars
- Drive conversions through messaging

CONTENT PRIORITIES:
1. Seasonal campaigns (holidays, wrap season peaks)
2. Product launches and promotions
3. Customer success stories
4. Educational content that drives trust

PROACTIVE SUGGESTIONS:
- If behind on goals: "We're X% behind - should I draft an urgency-based campaign?"
- If customer success story: "This install looks amazing - want me to turn it into a case study?"
- If slow period: "It's quiet - time for a flash sale or limited offer?"
- If content is performing: "This email had 40% open rate - should we double down on this angle?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  noah_bennett: {
    name: "Noah Bennett",
    role: "Senior Content Producer",
    systemPrompt: `You are Noah Bennett, Senior Content Producer at WePrintWraps.

${WPW_BUSINESS_CONTEXT}

=== YOUR ROLE CONTRACT ===

RESPONSIBILITIES:
- Ask clarifying questions before executing if requirements are unclear
- Translate strategy into executable content using the canonical CREATE_CONTENT schema
- Use Saved Views, Caption Library, and MightyEdit for content creation
- Validate inputs against content contracts before generating
- Execute create_content ONLY when confident in all parameters

CANNOT DO:
- Invent schema fields that don't exist
- Ignore missing required information
- Silently fail - always explain what's wrong
- Make assumptions about commercial vs restyle without evidence

MAY DECIDE (within your authority):
- Which caption variant to use from the library
- Which Saved View to rotate between (if multiple apply)
- Overlay timing within ±2 seconds tolerance
- Hook phrasing within the brand voice guidelines

TEXT OVERLAY RULE (CRITICAL):
When generating text overlays, you MUST prioritize the original task title, task description, and content calendar caption VERBATIM before inventing new copy. The client's words come first.

MUST ASK (clarification required):
- If content_type is unclear (reel vs story vs ad)
- If platform is not specified
- If commercial_business vs restyle_personal is ambiguous
- If brand risk exists (controversial content)
- If multiple platforms are requested

MUST ESCALATE (do not attempt):
- Schema mismatch or validation errors
- Missing legal attribution for UGC
- Payment or credit processing issues
- Content that could damage brand reputation

=== RESPONSE PROTOCOL ===

You MUST respond in one of three modes:

1. QUESTION MODE (when clarification needed):
   State what you need to know and why. Be specific.
   Example: "Before I create this reel, I need to confirm: Is this for a commercial/business client or a restyle/personal project? This determines the messaging tone."

2. PLAN MODE (when you have enough info but want confirmation):
   Outline what you will do, then ask for approval.
   Example: "I will create an Instagram reel using the attached video with a 'holiday sale' hook and urgency CTA. Ready when you say go."

3. EXECUTE MODE (only when confirmed):
   Output the CREATE_CONTENT block and execute.
   Only use this after user confirms your plan.

NEVER jump straight to EXECUTE without going through QUESTION or PLAN first (unless the request is completely unambiguous with all required parameters).

🚨 CRITICAL SYSTEM UPDATE 🚨
Creatomate, VIDEO_CONTENT blocks, and external renderers are DISABLED.

You MUST NOT:
- Use VIDEO_CONTENT blocks
- Ask for image_url or video_url
- Reference Creatomate or external rendering APIs

🎬 CONTENT CREATION VIA CONTENT FACTORY 🎬
You create content using EXISTING ContentBox assets via Content Factory + MightyEdit.

When content is ready to be created, output ONLY this block with the CANONICAL SCHEMA:

===CREATE_CONTENT===
action: create_content
content_type: reel | story | short | ad
platform: instagram | facebook | youtube | meta

# Asset Selection (use ONE of these)
use_attached_assets: true | false
saved_view_id: [optional - UUID of a saved view to pull from]

# OR use asset_query for ContentBox
asset_source: contentbox | attached
asset_query:
  tags: [chicago, test_lab, ppf, inkfusion]
  type: video
  limit: 3

# Creative (required)
hook: [max 6 words - attention grabbing]
cta: [max 8 words - call to action]

# Overlays (array)
overlays:
  - text: [overlay text]
    start: 2
    duration: 3
  - text: [overlay text]
    start: 6
    duration: 3

# Caption & Hashtags
caption: [caption text for social post]
hashtags: [#wraplife #ppf #chicago]

# Music (optional)
music:
  style: holiday | upbeat | cinematic | chill | none
  suggestion: [optional description of music vibe]

# Credits (optional - for UGC attribution)
credits:
  tag: [@username]
  reason: [why crediting - e.g. "Original footage"]

===END_CREATE_CONTENT===

VALID PARAMETER NAMES (use ONLY these):
- content_type, platform (required)
- use_attached_assets, saved_view_id (asset selection)
- asset_source, asset_query (alternative asset selection)
- hook, cta, caption, hashtags (creative)
- overlays (array with text, start, duration)
- music (object with style, suggestion)
- credits (object with tag, reason)

❌ INVALID PARAMETERS (will cause errors):
- music_style (use music.style instead)
- attached_assets (use use_attached_assets: true instead)
- vibe (use music.suggestion instead)

CONTENT STRATEGY:
- Hooks that stop the scroll: Pain point, surprising stat, or bold claim
- CTAs that convert: Clear action, urgency when appropriate
- Platform optimization: Reels = entertainment first, Stories = behind-scenes, Shorts = quick tips

PROACTIVE SUGGESTIONS:
- If content is for a sale: "Should I add urgency with a countdown or limited-time messaging?"
- If we have great footage: "This video could work as 3 different pieces - want me to create a series?"
- If behind on goals: "More aggressive CTAs might help - want me to push harder?"
- If successful content: "This format worked well - should I create more in this style?"`,
  },
  ryan_mitchell: {
    name: "Ryan Mitchell",
    role: "Editorial (Ink & Edge)",
    systemPrompt: `You are Ryan Mitchell, editorial authority for Ink & Edge Magazine.

${WPW_BUSINESS_CONTEXT}

YOUR ROLE & RESPONSIBILITIES:
- Create long-form editorial content
- Manage magazine articles and features
- Write industry thought leadership
- Build the Ink & Edge brand voice

EDITORIAL VOICE:
- Authoritative but accessible
- Industry insider perspective
- Educational without being condescending
- Celebrates the craft of wrapping

CONTENT TYPES:
1. Feature articles (2000-3000 words)
2. How-to guides (1000-1500 words)
3. Industry news & analysis (500-800 words)
4. Installer spotlights (800-1200 words)

PROACTIVE SUGGESTIONS:
- If industry news: "This could be a great news piece - want me to draft a take?"
- If installer doing great work: "This person would make a great feature - should I reach out?"
- If FAQ pattern emerging: "Seeing lots of questions about [topic] - article opportunity?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  wraptvworld_producer: {
    name: "WrapTVWorld Producer",
    role: "Video Production (WrapTVWorld)",
    systemPrompt: `You are the WrapTVWorld Producer, creating YouTube video content for the WrapTVWorld brand.

${WPW_BUSINESS_CONTEXT}

${WRAPCOMMAND_PRODUCT_KNOWLEDGE}

YOUR ROLE & RESPONSIBILITIES:
- Produce YouTube episodes: tutorials, product showcases, and industry news
- Turn raw install/showcase footage into polished video content
- Showcase the WrapCommand AI tool suites in action (demos, before/after)
- Build the WrapTVWorld brand voice: energetic, educational, pro-to-pro

CONTENT TYPES:
1. Tutorials & how-tos (showing a tool/workflow step by step)
2. Product showcases (Freestyle Pro, AI for Design Pro, Re-create Pro, Graphics Pro, Wall Pro)
3. Install showcases & before/after transformations
4. Industry news & commentary

PROACTIVE SUGGESTIONS:
- If footage shows a tool in use: "This is a perfect product showcase — want me to script a demo episode?"
- If a great install: "This before/after would make a strong short — want a 60s cut?"

When you understand the request, end with:
"I understand. I will [exact actions]. Ready when you say go."
Then set confirmed: true in your response.`,
  },
  harper_quinn: {
    name: "Harper Quinn",
    role: "Inbox & Email Concierge",
    systemPrompt: `You are Harper Quinn, the inbox & email concierge at WePrintWraps / WrapCommand AI.

${WPW_BUSINESS_CONTEXT}

${WRAPCOMMAND_PRODUCT_KNOWLEDGE}

YOUR ROLE & RESPONSIBILITIES:
- Read the email/message thread you are given and draft a clear, on-brand reply
- Help the operator (Trish) answer ALL inbound email quickly and consistently
- Triage: route pricing/quote questions to Alex, design/file questions to Grant, partnerships/enterprise to Dana
- Keep replies warm, concise, professional, and helpful

HOW YOU WORK:
- ALWAYS ground your reply in the actual thread provided in context. Reference specifics.
- If you are missing a fact (pricing, lead time, a custom detail), do NOT invent it.
  Either leave a clearly marked [NEEDS: ...] placeholder or ask the operator.
- Default reply structure: greeting → direct answer → next step / CTA → sign-off as "The WePrintWraps Team".
- Never promise pricing, discounts, or guarantees that aren't confirmed.

RESPONSE PROTOCOL:
1. If the thread is unclear or key info is missing → ask the operator a short, specific question.
2. If you can answer → output a ready-to-send DRAFT REPLY in a clear block, then ask:
   "Want me to send this as-is, or make changes?"
   When the operator approves (e.g. "send it"), end with:
   "I understand. I will send this reply. Ready when you say go." and set confirmed: true.

Keep it human. You're saving Trish time, not adding bureaucracy.`,
  },
  dana_cole: {
    name: "Dana Cole",
    role: "Enterprise Accounts & Outreach",
    systemPrompt: `You are Dana Cole, the enterprise accounts & outbound outreach lead at WrapCommand AI / WePrintWraps.

${WPW_BUSINESS_CONTEXT}

${WRAPCOMMAND_PRODUCT_KNOWLEDGE}

YOUR ROLE & RESPONSIBILITIES:
- Identify and pursue enterprise accounts (multi-location wrap shops, sign franchises, fleet/brand buyers, resellers)
- Draft outbound outreach: cold emails, follow-up sequences, LinkedIn-style notes
- Pitch the WrapCommand AI tool suites (Freestyle Pro, AI for Design Pro, Re-create Pro, Graphics Pro, Wall Pro) and WPW wholesale
- Build multi-touch sequences (initial → value-add follow-up → break-up), not one-off blasts

OUTREACH PRINCIPLES:
- Lead with the prospect's problem/opportunity, not our feature list
- One clear CTA per message (book a call, request a sample, see a demo)
- Personalize the first line; keep it short and skimmable
- Never fabricate case studies, logos, numbers, pricing, or guarantees.
  If you need a real proof point and don't have one, ask the operator or leave a [NEEDS: ...] placeholder.

ENTERPRISE PRIORITIES:
- Volume/recurring potential first
- Multi-location and fleet decision-makers
- Existing high-volume customers worth an upgrade conversation

RESPONSE PROTOCOL:
1. If the target account/segment or offer is unclear → ask a short, specific question.
2. When ready → output the draft outreach (subject + body, and follow-ups if a sequence),
   then ask for approval. On approval end with:
   "I understand. I will [exact actions]. Ready when you say go." and set confirmed: true.`,
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, agent_id, message, chat_id, context, organization_id, user_id, description, assigned_to, chatMode, relatedChatIds } = body;
    
    // Chat mode: "operator" (default) = task execution mode, "conversational" = coworker/insight mode
    const effectiveChatMode = chatMode || "operator";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION: start - Create new chat
    if (action === "start") {
      // Check if user_id is a valid UUID, otherwise store in context
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isValidUuid = user_id && uuidRegex.test(user_id);
      
      const chatContext: Record<string, unknown> = {
        ...(context || {}),
        orchestrator: user_id || "unknown", // Store username in context
      };

      // If there's a conversation_id in context, fetch the email thread
      const conversationId = chatContext.conversation_id || chatContext.conversationId;
      if (conversationId) {
        console.log("Loading messages for conversation:", conversationId);
        const { data: threadMessages, error: threadError } = await supabase
          .from("messages")
          .select("id, direction, sender_name, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(20); // Limit to last 20 messages

        if (threadError) {
          console.error("Failed to load thread messages:", threadError);
        } else if (threadMessages && threadMessages.length > 0) {
          // Format the email thread for the agent
          const formattedThread = threadMessages.map((msg: any) => {
            const direction = msg.direction === "inbound" ? "CUSTOMER" : "WPW TEAM";
            const sender = msg.sender_name || direction;
            const time = new Date(msg.created_at).toLocaleString();
            return `[${direction}] ${sender} (${time}):\n${msg.content}`;
          }).join("\n\n---\n\n");

          chatContext.email_thread = formattedThread;
          chatContext.thread_message_count = threadMessages.length;
          console.log(`Loaded ${threadMessages.length} messages into context`);
        }
      }

      const { data: chat, error } = await supabase
        .from("agent_chats")
        .insert({
          organization_id,
          user_id: isValidUuid ? user_id : organization_id, // Use org_id as fallback
          agent_id,
          status: "clarifying",
          context: chatContext,
        })
        .select()
        .single();

      if (error) throw error;

      const agentConfig = AGENT_CONFIGS[agent_id] || { name: agent_id, role: "Agent" };

      return new Response(
        JSON.stringify({
          success: true,
          chat_id: chat.id,
          agent: {
            id: agent_id,
            name: agentConfig.name,
            role: agentConfig.role,
          },
          messages: [],
          thread_loaded: !!chatContext.email_thread,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: quick - Stateless AI response (no persistent chat required)
    // Use this for ad-hoc requests like generating emails, drafting responses, etc.
    if (action === "quick") {
      if (!message) {
        throw new Error("Missing message for quick action");
      }

      const agentConfig = AGENT_CONFIGS[agent_id] || {
        name: "Alex",
        role: "Assistant",
        systemPrompt: "You are a helpful assistant.",
      };

      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

      // Inject WrapCommand AI product knowledge unless already present in the prompt
      const quickSystemPrompt = (agentConfig.systemPrompt || "").includes("WrapCommand AI PRODUCT & TOOL SUITES")
        ? agentConfig.systemPrompt
        : `${agentConfig.systemPrompt}\n\n${WRAPCOMMAND_PRODUCT_KNOWLEDGE}`;

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GEMINI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [{ role: "user", content: `${quickSystemPrompt}\n\nUser: ${message}` }],
            temperature: 0.7,
            max_tokens: 1500
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Lovable error:", errorText);
        throw new Error(`Lovable API error: ${response.status}`);
      }

      const aiData = await response.json();
      const reply = aiData?.choices?.[0]?.message?.content || "Unable to generate response.";

      return new Response(
        JSON.stringify({
          success: true,
          reply,
          agent: {
            id: agent_id,
            name: agentConfig.name,
            role: agentConfig.role,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: send - Send message and get AI response
    if (action === "send") {
      if (!chat_id || !message) {
        throw new Error("Missing chat_id or message");
      }

      // Check if this is an image generation request
      const imageKeywords = [
        "create image", "generate image", "make image", "create an image",
        "generate an image", "make an image", "create a visual", "generate visual",
        "design image", "create graphic", "make graphic", "render image",
        "create photo", "generate photo", "create picture", "make picture",
        "create artwork", "design artwork", "create illustration"
      ];
      const lowerMessage = message.toLowerCase();
      const isImageRequest = imageKeywords.some(kw => lowerMessage.includes(kw));

      // Save user message with attachments if any
      const { attachments } = body;
      await supabase.from("agent_chat_messages").insert({
        agent_chat_id: chat_id,
        sender: "user",
        content: message,
        metadata: attachments?.length ? { attachments } : null,
      });

      // Get chat history
      const { data: chatHistory } = await supabase
        .from("agent_chat_messages")
        .select("*")
        .eq("agent_chat_id", chat_id)
        .order("created_at", { ascending: true });

      // Get chat details
      const { data: chat } = await supabase
        .from("agent_chats")
        .select("*")
        .eq("id", chat_id)
        .single();

      const agentConfig = AGENT_CONFIGS[chat?.agent_id] || {
        name: "Agent",
        role: "Assistant",
        systemPrompt: "You are a helpful assistant in CLARIFICATION MODE. Ask questions to understand before executing.",
      };

      // Sales context removed - no longer tracking sales goals
      const salesContext = "";

      // Extract email thread from chat context if available
      const chatContext = (chat?.context || {}) as Record<string, unknown>;
      const emailThread = chatContext.email_thread as string | undefined;
      const threadSubject = chatContext.subject as string | undefined;
      const threadChannel = chatContext.channel as string | undefined;
      const customerName = chatContext.customer_name as string | undefined;

      // Build email thread section for system prompt
      let emailThreadSection = "";
      if (emailThread) {
        emailThreadSection = `
=== EMAIL/MESSAGE THREAD YOU ARE RESPONDING TO ===
Subject: ${threadSubject || "No subject"}
Channel: ${threadChannel || "Unknown"}
Customer: ${customerName || "Unknown"}

${emailThread}

=== END OF THREAD ===

IMPORTANT: You have full visibility into this conversation. Reference specific details from the thread when discussing with the orchestrator.
`;
        console.log("Including email thread in system prompt");
      }

      // Determine which prompt to use based on chat mode
      // Conversational mode uses the coworker prompt if available
      const useConversationalMode = effectiveChatMode === "conversational" && agentConfig.conversationalPrompt;
      const basePrompt = useConversationalMode 
        ? agentConfig.conversationalPrompt! 
        : agentConfig.systemPrompt;
      
      // Detect feedback/coaching messages (should NOT trigger tasks/delegation)
      const feedbackPatterns = [
        "when someone", "when people", "next time", "in that chat", "in chat",
        "clarify earlier", "should have", "you should", "try to", "make sure to",
        "going forward", "from now on", "don't forget", "remember to",
        "good catch", "that was", "you missed", "you forgot", "be more", "be less"
      ];
      const messageLower = message.toLowerCase();
      const isFeedback = useConversationalMode && feedbackPatterns.some(p => messageLower.includes(p));
      
      // Detect insight requests (asking about patterns, common questions, etc.)
      const insightPatterns = [
        "what are people asking", "what questions", "patterns", "common questions",
        "what's confusing", "what keeps coming up", "trending", "what are customers",
        "what issues", "recurring", "frequently asked"
      ];
      const isInsightRequest = useConversationalMode && insightPatterns.some(p => messageLower.includes(p));
      
      // Detect chat inquiry requests (asking about specific chats Jordan has had)
      const chatInquiryPatterns = [
        "did anyone ask", "did someone ask", "any chats about", "anyone ask for",
        "prius", "wrap quote", "wraps today", "chats today", "conversations today",
        "who asked", "what chats", "my chats", "your chats", "check your chats",
        "pull up", "look up", "any inquiries", "any leads"
      ];
      const isChatInquiry = useConversationalMode && chat?.agent_id === "jordan_lee" && 
        chatInquiryPatterns.some(p => messageLower.includes(p));
      
      // Detect directive requests (giving Jordan special instructions)
      const directivePatterns = [
        "give everyone", "give anyone", "offer everyone", "offer anyone",
        "% off", "% discount", "discount to", "today only", "this week only",
        "from now on", "starting now", "whenever someone", "when someone asks"
      ];
      const isDirective = useConversationalMode && chat?.agent_id === "jordan_lee" &&
        directivePatterns.some(p => messageLower.includes(p));
      
      console.log(`[agent-chat] Using ${useConversationalMode ? 'conversational' : 'operator'} mode for ${agentConfig.name}${isFeedback ? ' (FEEDBACK)' : ''}${isInsightRequest ? ' (INSIGHT)' : ''}${isChatInquiry ? ' (CHAT INQUIRY)' : ''}${isDirective ? ' (DIRECTIVE)' : ''}`);
      
      // === COACHING MEMORY: Save feedback as persistent coaching note ===
      if (isFeedback && chat?.agent_id) {
        try {
          await supabase.from("agent_coaching_memory").insert({
            agent_id: chat.agent_id,
            note: message
          });
          console.log(`[agent-chat] Saved coaching note for ${chat.agent_id}`);
        } catch (coachingError) {
          console.error("[agent-chat] Failed to save coaching note:", coachingError);
        }
      }
      
      // === COACHING MEMORY: Load recent coaching notes for context ===
      let coachingContext = "";
      if (useConversationalMode && chat?.agent_id) {
        const { data: coachingNotes } = await supabase
          .from("agent_coaching_memory")
          .select("note")
          .eq("agent_id", chat.agent_id)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(10);
        
        if (coachingNotes?.length) {
          coachingContext = `
=== COACHING CONTEXT (apply these learnings going forward) ===
${coachingNotes.map((n: any) => `• ${n.note}`).join("\n")}
=== END COACHING CONTEXT ===
`;
          console.log(`[agent-chat] Loaded ${coachingNotes.length} coaching notes for ${chat.agent_id}`);
        }
      }
      
      // === WEEKLY DIRECTIVE: Load active weekly focus ===
      let weeklyDirectiveContext = "";
      if (chat?.agent_id) {
        // Calculate Monday of current week
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - now.getDay() + 1);
        monday.setHours(0, 0, 0, 0);
        const weekOfDate = monday.toISOString().slice(0, 10);
        
        const { data: weeklyDirective } = await supabase
          .from("agent_weekly_directives")
          .select("directive")
          .eq("agent_id", chat.agent_id)
          .eq("week_of", weekOfDate)
          .eq("active", true)
          .limit(1)
          .maybeSingle();
        
        if (weeklyDirective?.directive) {
          weeklyDirectiveContext = `
=== WEEKLY FOCUS FROM THE TEAM ===
${weeklyDirective.directive}
=== END WEEKLY FOCUS ===
Apply this focus when relevant in your conversations.
`;
          console.log(`[agent-chat] Loaded weekly directive for ${chat.agent_id}`);
        }
      }
      
      // === JORDAN'S WEBSITE CHAT TRANSCRIPTS: Load actual customer chats ===
      let websiteChatContext = "";
      if (isChatInquiry && chat?.agent_id === "jordan_lee") {
        console.log("[agent-chat] Loading Jordan's website chat transcripts");
        
        // Get today's date at midnight for filtering
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Get recent website conversations with their messages
        const { data: websiteConvos } = await supabase
          .from("conversations")
          .select("id, subject, created_at, metadata")
          .eq("channel", "website")
          .gte("created_at", today.toISOString())
          .order("created_at", { ascending: false })
          .limit(20);
        
        if (websiteConvos?.length) {
          // Get messages for these conversations
          const convoIds = websiteConvos.map((c: any) => c.id);
          const { data: convoMessages } = await supabase
            .from("messages")
            .select("conversation_id, content, sender_name, sender_type, created_at")
            .in("conversation_id", convoIds)
            .order("created_at", { ascending: true });
          
          // Group messages by conversation
          const messagesByConvo: Record<string, any[]> = {};
          convoMessages?.forEach((m: any) => {
            if (!messagesByConvo[m.conversation_id]) {
              messagesByConvo[m.conversation_id] = [];
            }
            messagesByConvo[m.conversation_id].push(m);
          });
          
          // Build transcript context
          const transcripts = websiteConvos.map((c: any) => {
            const msgs = messagesByConvo[c.id] || [];
            const time = new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const msgSummary = msgs.map((m: any) => `  ${m.sender_name}: ${m.content?.substring(0, 200)}`).join("\n");
            return `[${time}] ${c.subject || 'Website Chat'}\n${msgSummary}`;
          }).join("\n\n---\n\n");
          
          websiteChatContext = `
=== YOUR WEBSITE CHAT TRANSCRIPTS (TODAY) ===
You had ${websiteConvos.length} website chats today:

${transcripts}

=== END TRANSCRIPTS ===

Use this to answer questions about what customers asked. Be specific when referencing chats.
`;
          console.log(`[agent-chat] Loaded ${websiteConvos.length} website chat transcripts for Jordan`);
        } else {
          websiteChatContext = `
=== YOUR WEBSITE CHAT TRANSCRIPTS (TODAY) ===
No website chats recorded today yet.
=== END TRANSCRIPTS ===
`;
        }
      }
      
      // === SAVE DIRECTIVE: If this is a directive for Jordan, save it ===
      if (isDirective && chat?.agent_id === "jordan_lee") {
        console.log("[agent-chat] Saving directive for Jordan:", message);
        try {
          // Save as a coaching note that will be applied
          await supabase.from("agent_coaching_memory").insert({
            agent_id: "jordan_lee",
            note: `[ACTIVE DIRECTIVE] ${message}`
          });
          console.log("[agent-chat] Directive saved for Jordan");
        } catch (directiveError) {
          console.error("[agent-chat] Failed to save directive:", directiveError);
        }
      }
      
      // === INSIGHT REQUEST: Load recent customer conversations for pattern analysis ===
      let insightContext = "";
      if (isInsightRequest) {
        console.log("[agent-chat] Loading recent conversations for insight analysis");
        const { data: recentConversations } = await supabase
          .from("conversations")
          .select("id, subject, channel, created_at")
          .order("created_at", { ascending: false })
          .limit(30);
        
        // Also get recent agent chat messages for pattern detection
        const { data: recentAgentChats } = await supabase
          .from("agent_chat_messages")
          .select("content, sender, created_at")
          .eq("sender", "user")
          .order("created_at", { ascending: false })
          .limit(50);
        
        if (recentConversations?.length || recentAgentChats?.length) {
          insightContext = `
=== RECENT ACTIVITY FOR INSIGHT ANALYSIS ===
Recent customer conversations (${recentConversations?.length || 0} total):
${recentConversations?.slice(0, 15).map((c: any) => `- [${c.channel}] ${c.subject || 'No subject'}`).join("\n") || "None available"}

Recent user messages in agent chats (${recentAgentChats?.length || 0} total):
${recentAgentChats?.slice(0, 20).map((m: any) => `- "${m.content?.substring(0, 100)}..."`).join("\n") || "None available"}
=== END INSIGHT DATA ===

Analyze this data to identify patterns, common questions, and recurring themes.
Provide actionable insights, not just raw data.
`;
          console.log(`[agent-chat] Loaded insight context: ${recentConversations?.length || 0} conversations, ${recentAgentChats?.length || 0} messages`);
        }
      }
      
      // Load related chat context for conversational mode (e.g., reviewing specific chats)
      let relatedChatsContext = "";
      if (effectiveChatMode === "conversational" && relatedChatIds?.length > 0) {
        console.log(`[agent-chat] Loading ${relatedChatIds.length} related chats for context`);
        const { data: relatedMessages } = await supabase
          .from("agent_chat_messages")
          .select("agent_chat_id, sender, content, created_at")
          .in("agent_chat_id", relatedChatIds)
          .order("created_at", { ascending: true })
          .limit(50);
        
        if (relatedMessages?.length) {
          relatedChatsContext = `
=== RELATED CHAT CONTEXT (for your review) ===
${relatedMessages.map((m: any) => `[${m.sender.toUpperCase()}] ${m.content}`).join("\n---\n")}
=== END RELATED CONTEXT ===

Use this context to answer questions about what happened in these conversations.
`;
        }
      }

      // Inject WrapCommand AI product knowledge unless the agent prompt already has it
      const productKnowledgeSection = basePrompt.includes("WrapCommand AI PRODUCT & TOOL SUITES")
        ? ""
        : WRAPCOMMAND_PRODUCT_KNOWLEDGE;

      // Build system prompt with sales context, coaching, weekly focus, insights, and website chats
      const enhancedSystemPrompt = `${basePrompt}

${productKnowledgeSection}

${emailThreadSection}

${coachingContext}

${weeklyDirectiveContext}

${insightContext}

${relatedChatsContext}

${websiteChatContext}

${useConversationalMode ? '' : salesContext}

${useConversationalMode ? '' : `Use this sales context when relevant:
- If creating content/emails, consider incorporating urgency if we're behind on goals
- If quoting, prioritize closing deals that help hit targets
- Suggest proactive actions when appropriate based on goal status

IMAGE GENERATION CAPABILITY:
You can generate images when asked. If the user requests an image, describe what you'll create and then the system will generate it.
When an image is generated, it will be included in your response.`}
`;

      // Handle IMAGE GENERATION
      if (isImageRequest) {
        console.log("Image generation request detected:", message);
        
        const lovableApiKey = Deno.env.get("GEMINI_API_KEY");
        if (!lovableApiKey) {
          throw new Error("GEMINI_API_KEY not configured for image generation");
        }

        try {
          // Generate image using Lovable AI Gateway
          const imageResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-3-pro-image-preview",
              messages: [
                { role: "user", content: message }
              ],
              modalities: ["image", "text"],
            }),
          });

          if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            console.error("Image generation failed:", errorText);
            throw new Error(`Image generation failed: ${imageResponse.status}`);
          }

          const imageData = await imageResponse.json();
          console.log("Image generation response received");

          const textContent = imageData.choices?.[0]?.message?.content || "I've generated the image for you.";
          const images = imageData.choices?.[0]?.message?.images || [];
          
          // Extract the first image URL (base64)
          const generatedImageUrl = images[0]?.image_url?.url || null;

          // Save agent response with image
          await supabase.from("agent_chat_messages").insert({
            agent_chat_id: chat_id,
            sender: "agent",
            content: textContent,
            metadata: { 
              image_generated: true,
              image_url: generatedImageUrl,
              confirmed: false 
            },
          });

          return new Response(
            JSON.stringify({
              success: true,
              message: textContent,
              image_url: generatedImageUrl,
              confirmed: false,
              suggested_task: null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (imageError: unknown) {
          console.error("Image generation error:", imageError);
          // Fall back to text response explaining the error
          const errMsg = imageError instanceof Error ? imageError.message : "Unknown error";
          const errorMessage = `I encountered an issue generating the image: ${errMsg}. Let me know if you'd like me to try again or describe what you need differently.`;
          
          await supabase.from("agent_chat_messages").insert({
            agent_chat_id: chat_id,
            sender: "agent",
            content: errorMessage,
            metadata: { image_error: true },
          });

          return new Response(
            JSON.stringify({
              success: true,
              message: errorMessage,
              confirmed: false,
              suggested_task: null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Build messages for AI (regular text response)
      const aiMessages: any[] = [
        { role: "system", content: enhancedSystemPrompt },
      ];

      // Scan ALL chat history for video attachments (historical + current)
      const historicalVideoAttachments: any[] = [];
      for (const m of chatHistory || []) {
        const meta = m.metadata as Record<string, any> | null;
        if (m.sender === "user" && meta?.attachments?.length) {
          for (const att of meta.attachments) {
            if (att.type?.startsWith('video/') || att.url?.match(/\.(mp4|mov|webm|avi)$/i)) {
              historicalVideoAttachments.push({
                ...att,
                uploadedAt: m.created_at,
                messageContent: m.content?.substring(0, 50) // First 50 chars for context
              });
            }
          }
        }
      }

      // Check current message for video attachments
      const attachmentsMeta = body.attachments || [];
      const currentVideoAttachments = attachmentsMeta.filter((att: any) => 
        att.type?.startsWith('video/') || att.url?.match(/\.(mp4|mov|webm|avi)$/i)
      );
      
      // Combine all videos (current first, then historical)
      const allVideoAttachments = [...currentVideoAttachments, ...historicalVideoAttachments];
      
      // CONTENT CREATION CONTEXT - check if this is a MightyTask content request
      const taskContext = (chat?.context || {}) as Record<string, unknown>;
      const taskContentType = taskContext.task_content_type as string | undefined;
      const taskSource = taskContext.source as string | undefined;
      const isContentTask = taskSource === 'mightytask' && taskContentType && 
        ['ig_reel', 'ig_story', 'fb_reel', 'fb_story', 'youtube_short', 'youtube_video', 'meta_ad'].includes(taskContentType);
      
      // Add video context for Noah if ANY videos exist in this conversation
      if (allVideoAttachments.length > 0 && chat?.agent_id === 'noah_bennett') {
        const mostRecentVideo = allVideoAttachments[0];
        const videoContext = `
🎬 VIDEO ASSETS AVAILABLE IN THIS CONVERSATION:
${allVideoAttachments.map((v: any, i: number) => `${i + 1}. ${v.name || 'Video'}: ${v.url}${v.uploadedAt ? ` (uploaded earlier)` : ' (just attached)'}`).join('\n')}

MOST RECENT VIDEO URL: ${mostRecentVideo.url}

✅ YOU CAN USE THESE VIDEOS DIRECTLY IN YOUR CREATE_CONTENT BLOCK!
When outputting your CREATE_CONTENT block, use:

asset_source: attached
attached_assets:
  - url: ${mostRecentVideo.url}
    type: video
    name: ${mostRecentVideo.name || 'Attached Video'}

The user has ${allVideoAttachments.length} video(s) ready. DO NOT ask them to upload - PROCEED to CREATE_CONTENT.
When they give content creation instructions, emit the CREATE_CONTENT block with the attached video URL.
`;
        aiMessages.push({ role: "system", content: videoContext });
        console.log(`[agent-chat] Added video context for Noah: ${currentVideoAttachments.length} current + ${historicalVideoAttachments.length} historical = ${allVideoAttachments.length} total video(s)`);
      }
        
      // AUTO-PROCEED for content creation - either with video OR for content tasks from MightyTask
      // BUT skip all this if we're in feedback/coaching mode
      const msgLower = body.message?.toLowerCase() || '';
      const contentKeywords = ['create', 'make', 'story', 'reel', 'video', 'post', 'instagram', 'content', 'promo', 'sale', 'discount', 'christmas', 'holiday', 'execute', 'task'];
      const isContentRequest = contentKeywords.some(kw => msgLower.includes(kw));
      
      // Force CREATE_CONTENT for Noah when: (1) has video AND content request, OR (2) is content task from MightyTask
      // NEVER trigger content creation during feedback/coaching
      if (!isFeedback && chat?.agent_id === 'noah_bennett' && (isContentRequest || isContentTask)) {
        const hasVideo = allVideoAttachments.length > 0;
        const mostRecentVideo = hasVideo ? allVideoAttachments[0] : null;
        
        const contentTypeMap: Record<string, string> = {
          ig_reel: 'reel', ig_story: 'story', fb_reel: 'reel', fb_story: 'story',
          youtube_short: 'short', youtube_video: 'video', meta_ad: 'ad'
        };
        const platformMap: Record<string, string> = {
          ig_reel: 'instagram', ig_story: 'instagram', fb_reel: 'facebook', fb_story: 'facebook',
          youtube_short: 'youtube', youtube_video: 'youtube', meta_ad: 'meta'
        };
        
        const contentType = taskContentType ? contentTypeMap[taskContentType] || 'reel' : 'reel';
        const platform = taskContentType ? platformMap[taskContentType] || 'instagram' : 'instagram';
        
        let assetSection = '';
        if (hasVideo && mostRecentVideo) {
          assetSection = `use_attached_assets: true`;
        } else {
          assetSection = `asset_source: contentbox
asset_query:
  tags: [weprintwraps, wrap, install]
  type: video
  limit: 1`;
        }
        
        aiMessages.push({
          role: "system",
          content: `
🚨 CONTENT CREATION OVERRIDE 🚨
${isContentTask ? `This is a MightyTask content creation task (${taskContentType}).` : 'User is requesting content creation.'}
${hasVideo ? `Video attached: ${mostRecentVideo?.url}` : 'No video attached - use ContentBox assets.'}

You MUST output a CREATE_CONTENT block FIRST, then add any commentary AFTER.
DO NOT ask for clarification. DO NOT say you need more info.
Extract hook/CTA from user's message or task description.

OUTPUT THIS EXACT FORMAT (CANONICAL SCHEMA):

===CREATE_CONTENT===
action: create_content
content_type: ${contentType}
platform: ${platform}
${assetSection}
hook: [extract from context - max 6 words]
cta: [call to action - max 8 words]
overlays:
  - text: [key message]
    start: 2
    duration: 3
caption: [engaging caption from context]
hashtags: #weprintwraps #wraps
music:
  style: upbeat
  suggestion: [optional - describe vibe]
credits:
  tag: [optional - @username if UGC]
  reason: [optional - why crediting]
===END_CREATE_CONTENT===

IMPORTANT SCHEMA RULES:
- Use "music:" with nested "style:" and "suggestion:" (NOT "music_style:")
- Use "credits:" with nested "tag:" and "reason:" (NOT just "credits: @user")
- Use "use_attached_assets: true" for attached videos (NOT "attached_assets:")

Then after the block, add: "I understand. I will create this ${contentType} for ${platform}. Ready when you say go."
Set confirmed: true.

EMIT THE BLOCK NOW.
`
        });
        console.log(`[agent-chat] CONTENT OVERRIDE: isContentTask=${isContentTask}, hasVideo=${hasVideo}, taskContentType=${taskContentType}`);
      }

      // Add chat history with vision support for attachments
      for (const m of chatHistory || []) {
        const meta = m.metadata as Record<string, any> | null;
        if (m.sender === "user" && meta?.attachments?.length) {
          // Build multimodal content for messages with attachments
          const contentParts: any[] = [{ type: "text", text: m.content }];
          for (const att of meta.attachments) {
            // Handle images with vision
            if (att.url && (att.type?.startsWith("image/") || att.url.match(/\.(png|jpg|jpeg|webp|gif)$/i))) {
              contentParts.push({
                type: "image_url",
                image_url: { url: att.url }
              });
            }
            // Handle videos with text description (AI can't watch videos, but we tell it the URL)
            if (att.type?.startsWith('video/') || att.url?.match(/\.(mp4|mov|webm|avi)$/i)) {
              contentParts.push({
                type: "text",
                text: `[VIDEO ATTACHED: ${att.name || 'video'} - URL: ${att.url}]`
              });
            }
          }
          aiMessages.push({ role: "user", content: contentParts });
        } else {
          aiMessages.push({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.content,
          });
        }
      }

      // Call AI using Lovable AI Gateway for vision support
      const lovableApiKey = Deno.env.get("GEMINI_API_KEY");
      const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: aiMessages,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI response error:", errorText);
        throw new Error(`AI request failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const agentMessage = aiData.choices?.[0]?.message?.content || "I'm not sure how to respond.";

      // Check if agent confirmed understanding
      const confirmed = agentMessage.toLowerCase().includes("ready when you say go") ||
                       agentMessage.toLowerCase().includes("i understand. i will");

      // Check if this is a CREATE_CONTENT block output from Noah/Emily
      const hasCreateContentBlock = agentMessage.includes("===CREATE_CONTENT===");
      
      // Check if user is saying "deploy" after CREATE_CONTENT was generated
      const lowerUserMessage = message.toLowerCase();
      const isDeployCommand = lowerUserMessage.includes("deploy") || 
                              lowerUserMessage.includes("send it") ||
                              lowerUserMessage.includes("go live") ||
                              lowerUserMessage.includes("publish") ||
                              lowerUserMessage.includes("post it");
      
      // Look for previous CREATE_CONTENT in chat history
      const previousMessages = chatHistory || [];
      const lastAgentMessage = previousMessages.filter((m: any) => m.sender === "agent").pop();
      const hadCreateContentBefore = lastAgentMessage?.content?.includes("===CREATE_CONTENT===");
      
      // If user says deploy and we had CREATE_CONTENT, route to content_drafts
      let contentDraftCreated = false;
      let contentDraftId = null;
      
      if (isDeployCommand && hadCreateContentBefore && 
          (chat?.agent_id === "noah_bennett" || chat?.agent_id === "emily_carter")) {
        console.log("[agent-chat] Deploy command detected after CREATE_CONTENT - routing to content_drafts");
        
        // Parse the CREATE_CONTENT block from the previous message
        const createContentMatch = lastAgentMessage.content.match(/===CREATE_CONTENT===[\s\S]*?===END_CREATE_CONTENT===/);
        if (createContentMatch) {
          const contentBlock = createContentMatch[0];
          
          // Extract fields from the block
          const contentType = contentBlock.match(/content_type:\s*(\w+)/)?.[1] || "reel";
          const platform = contentBlock.match(/platform:\s*(\w+)/)?.[1] || "instagram";
          const caption = contentBlock.match(/caption:\s*(.+?)(?=\n|===)/)?.[1]?.trim() || "";
          const hashtags = contentBlock.match(/hashtags:\s*(.+?)(?=\n|===)/)?.[1]?.trim()?.split(/\s+/) || [];
          
          // Find media URL from attached_assets or elsewhere
          const mediaUrlMatch = contentBlock.match(/url:\s*(https?:\/\/[^\s\n]+)/);
          const mediaUrl = mediaUrlMatch?.[1] || null;
          
          // Create content_draft entry for Ops Desk to execute
          const { data: draft, error: draftError } = await supabase
            .from("content_drafts")
            .insert({
              organization_id: chat?.organization_id,
              created_by_agent: chat?.agent_id,
              content_type: contentType,
              platform: platform,
              media_url: mediaUrl,
              caption: caption,
              hashtags: hashtags,
              status: "pending_review",
            })
            .select()
            .single();
          
          if (draftError) {
            console.error("[agent-chat] Failed to create content_draft:", draftError);
          } else {
            contentDraftCreated = true;
            contentDraftId = draft.id;
            console.log(`[agent-chat] Created content_draft ${draft.id} - routing to Ops Desk for publishing`);
          }
        }
      }

      // Save agent response
      await supabase.from("agent_chat_messages").insert({
        agent_chat_id: chat_id,
        sender: "agent",
        content: contentDraftCreated 
          ? `${agentMessage}\n\n✅ **Content queued for publishing!** Routing to Ops Desk for review and scheduling. You'll see it in the Content Drafts queue.`
          : agentMessage,
        metadata: { 
          confirmed, 
          has_create_content: hasCreateContentBlock,
          content_draft_id: contentDraftId,
          content_draft_created: contentDraftCreated,
        },
      });

      // Update chat status if confirmed (allow from any status, not just "clarifying")
      if (confirmed && chat?.status !== "confirmed") {
        await supabase
          .from("agent_chats")
          .update({ status: "confirmed", updated_at: new Date().toISOString() })
          .eq("id", chat_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: contentDraftCreated 
            ? `${agentMessage}\n\n✅ **Content queued for publishing!** Routing to Ops Desk for review and scheduling.`
            : agentMessage,
          confirmed,
          suggested_task: confirmed ? extractSuggestedTask(agentMessage) : null,
          content_draft_created: contentDraftCreated,
          content_draft_id: contentDraftId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: delegate - Create task and update status
    if (action === "delegate") {
      if (!chat_id) throw new Error("Missing chat_id");

      const { data: chat } = await supabase
        .from("agent_chats")
        .select("*")
        .eq("id", chat_id)
        .single();

      if (!chat) throw new Error("Chat not found");
      // Allow delegation from confirmed or already-delegated chats (re-delegation)
      if (chat.status !== "confirmed" && chat.status !== "delegated") {
        throw new Error("Cannot delegate: agent has not confirmed understanding");
      }

      const safeDescription = (description || "").toString().trim();
      if (!safeDescription) throw new Error("Missing description");

      const ctx = (chat.context || {}) as Record<string, unknown>;
      const conversationId = (ctx.conversationId || ctx.conversation_id) as string | undefined;
      const contactId = (ctx.contactId || ctx.contact_id) as string | undefined;
      const subject = (ctx.subject as string | undefined) || undefined;
      const recipientInbox = (ctx.recipientInbox as string | undefined) ||
        (ctx.recipient_inbox as string | undefined) ||
        undefined;
      const channel = (ctx.channel as string | undefined) || undefined;

      const linkedLine = subject
        ? `\n\nLinked thread: ${subject}${recipientInbox ? ` • ${recipientInbox}` : ""}${channel ? ` • ${channel}` : ""}`
        : "";

      // `tasks.assigned_to` is a UUID. Guard against accidentally passing usernames like "trish".
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const assignedToUuid = typeof assigned_to === "string" && uuidRegex.test(assigned_to) ? assigned_to : null;

      // Extract content type from context or description
      const contentTypeFromContext = (ctx.content_type as string | undefined) || 
        (ctx.task_content_type as string | undefined);
      const inferredContentType = inferContentTypeFromText(safeDescription);
      const finalContentType = contentTypeFromContext || inferredContentType;

      // Extract video/image URLs from context for execution
      const videoUrls = (ctx.video_urls as string[] | undefined) || [];
      const imageUrls = (ctx.image_urls as string[] | undefined) || [];
      const attachments = (ctx.attachments as Array<{url: string; type?: string}> | undefined) || [];
      
      // Parse attachments into video/image URLs
      attachments.forEach((att) => {
        if (att.type?.startsWith("video/") || att.url?.match(/\.(mp4|mov|webm)$/i)) {
          videoUrls.push(att.url);
        } else if (att.type?.startsWith("image/") || att.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          imageUrls.push(att.url);
        }
      });

      // Create task (linked to the exact conversation when available)
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          organization_id: chat.organization_id,
          title: safeDescription,
          description: `Delegated from agent chat. Agent: ${chat.agent_id}${linkedLine}`,
          assigned_agent: chat.agent_id,
          status: "pending",
          priority: "normal",
          conversation_id: conversationId || null,
          contact_id: contactId || null,
          customer: subject || null,
          assigned_to: assignedToUuid,
          content_type: finalContentType || null,
          channel: channel || null,
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Create delegation log
      await supabase.from("delegation_log").insert({
        agent_chat_id: chat_id,
        task_id: task.id,
        delegated_by: assigned_to || "Unknown",
        summary: safeDescription,
      });

      // Update chat status
      await supabase
        .from("agent_chats")
        .update({ status: "delegated", updated_at: new Date().toISOString() })
        .eq("id", chat_id);

      // ═══════════════════════════════════════════════════════════════
      // AUTO-EXECUTE: Invoke the task executor immediately
      // ═══════════════════════════════════════════════════════════════
      console.log("[agent-chat] Auto-executing delegated task:", task.id);
      
      let executionResult = null;
      let executionError = null;
      
      try {
        const { data: execData, error: execError } = await supabase.functions.invoke("execute-delegated-task", {
          body: {
            task_id: task.id,
            context: {
              video_urls: videoUrls,
              image_urls: imageUrls,
              content_type: finalContentType,
              chat_context: {
                agent_id: chat.agent_id,
                chat_id: chat_id,
                organization_id: chat.organization_id,
              }
            }
          }
        });
        
        if (execError) {
          console.error("[agent-chat] Execution error:", execError);
          executionError = execError.message;
        } else {
          console.log("[agent-chat] Execution result:", JSON.stringify(execData));
          executionResult = execData;
        }
      } catch (e) {
        console.error("[agent-chat] Execution exception:", e);
        executionError = e instanceof Error ? e.message : "Unknown error";
      }

      return new Response(
        JSON.stringify({
          success: true,
          task_id: task.id,
          message: executionResult?.success 
            ? "Task delegated and execution started"
            : "Task delegated (execution pending)",
          execution: executionResult,
          execution_error: executionError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: history - Get chat history
    if (action === "history") {
      if (!chat_id) throw new Error("Missing chat_id");

      const { data: messages } = await supabase
        .from("agent_chat_messages")
        .select("*")
        .eq("agent_chat_id", chat_id)
        .order("created_at", { ascending: true });

      const { data: chat } = await supabase
        .from("agent_chats")
        .select("*")
        .eq("id", chat_id)
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          chat,
          messages: messages || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: list - List recent chats for a user (optionally filtered by agent)
    if (action === "list") {
      if (!user_id) throw new Error("Missing user_id");

      let query = supabase
        .from("agent_chats")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (agent_id) {
        query = query.eq("agent_id", agent_id);
      }

      const { data: chats, error: chatsError } = await query;

      if (chatsError) throw chatsError;

      // Get last message for each chat
      const chatsWithPreview = await Promise.all(
        (chats || []).map(async (chat) => {
          const { data: lastMsg } = await supabase
            .from("agent_chat_messages")
            .select("content, sender, created_at")
            .eq("agent_chat_id", chat.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          const agentConfig = AGENT_CONFIGS[chat.agent_id];

          return {
            ...chat,
            agent_name: agentConfig?.name || chat.agent_id,
            agent_role: agentConfig?.role || "Agent",
            last_message: lastMsg?.content?.substring(0, 100) || null,
            last_message_sender: lastMsg?.sender || null,
            last_message_at: lastMsg?.created_at || chat.updated_at,
          };
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          chats: chatsWithPreview,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: resume - Resume an existing chat
    if (action === "resume") {
      if (!chat_id) throw new Error("Missing chat_id");

      const { data: chat, error: chatError } = await supabase
        .from("agent_chats")
        .select("*")
        .eq("id", chat_id)
        .single();

      if (chatError || !chat) throw new Error("Chat not found");

      const { data: messages, error: msgError } = await supabase
        .from("agent_chat_messages")
        .select("*")
        .eq("agent_chat_id", chat_id)
        .order("created_at", { ascending: true });

      if (msgError) throw msgError;

      const agentConfig = AGENT_CONFIGS[chat.agent_id];

      // Check if chat was already confirmed (look for confirmed message)
      const hasConfirmedMessage = (messages || []).some(
        (m) => m.sender === "agent" && m.metadata?.confirmed === true
      );

      return new Response(
        JSON.stringify({
          success: true,
          chat_id: chat.id,
          agent: {
            id: chat.agent_id,
            name: agentConfig?.name || chat.agent_id,
            role: agentConfig?.role || "Agent",
          },
          messages: (messages || []).map((m) => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            created_at: m.created_at,
            metadata: m.metadata,
          })),
          confirmed: hasConfirmedMessage,
          status: chat.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("Agent chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper to extract suggested task from agent message
function extractSuggestedTask(message: string): { type: string; description: string } | null {
  const match = message.match(/I will ([^.]+)\./i);
  if (match) {
    return {
      type: "general",
      description: match[1].trim(),
    };
  }
  return null;
}

// Helper to infer content type from task text
function inferContentTypeFromText(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes("reel")) return "ig_reel";
  if (lowerText.includes("story") && lowerText.includes("instagram")) return "ig_story";
  if (lowerText.includes("story")) return "ig_story";
  if (lowerText.includes("youtube short") || lowerText.includes("yt short")) return "youtube_short";
  if (lowerText.includes("youtube") || lowerText.includes("video")) return "youtube_video";
  if (lowerText.includes("meta ad") || lowerText.includes("facebook ad") || lowerText.includes("ig ad")) return "meta_ad";
  if (lowerText.includes("static ad") || lowerText.includes("static")) return "static_ad";
  if (lowerText.includes("ad") || lowerText.includes("advertisement")) return "meta_ad";
  if (lowerText.includes("post") || lowerText.includes("content")) return "ig_reel";
  
  return null;
}
