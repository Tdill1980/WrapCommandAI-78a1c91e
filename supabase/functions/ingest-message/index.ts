import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPricingContext, calculateQuickQuote } from "../_shared/wpw-pricing.ts";
import { VOICECOMMAND_AI, detectHotLead, detectPricingIntent } from "../_shared/voicecommand-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_KEY = Deno.env.get("GEMINI_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();

    console.log(`🤖 [${VOICECOMMAND_AI.name}] Processing inbound message`);
    console.log("📥 Ingesting message:", body);

    // ========== CHECK AI STATUS FIRST ==========
    const { data: aiStatus } = await supabase
      .from("ai_status_settings")
      .select("mode")
      .limit(1)
      .single();
    
    const aiMode = aiStatus?.mode || 'off';
    console.log("🎛️ AI Status Mode:", aiMode);

    // If OFF, log message but don't generate or send any AI response
    if (aiMode === 'off') {
      console.log("⛔ AI is OFF - logging message only, no AI response");
    }

    // Check for file attachments
    const hasFiles = body.attachments?.length > 0;
    const fileUrls = body.attachments || [];

    // 1. Log raw message
    const { error: logError } = await supabase.from("message_ingest_log").insert({
      platform: body.platform,
      sender_id: body.sender_id,
      sender_username: body.sender_username,
      message_text: body.message_text,
      raw_payload: { ...body, has_files: hasFiles, file_count: fileUrls.length },
    });

    if (logError) console.error("Log insert error:", logError);

    // 2. Classify intent AND extract vehicle info via AI
    // CRITICAL: Also detect ANY price/quote/cost mentions for retargeting
    const classifyPrompt = `Analyze this customer message and return JSON only:
{
  "type": "quote" | "design" | "support" | "file_received" | "general",
  "wants_pricing": boolean,
  "vehicle": { "year": string | null, "make": string | null, "model": string | null },
  "wrap_type": "full" | "partial" | "color_change" | "fade" | "commercial" | null,
  "urgency": "high" | "normal" | "low",
  "needs_vehicle_info": boolean,
  "has_file_intent": boolean,
  "customer_email": string | null
}

CRITICAL - Set wants_pricing=true if ANY of these are mentioned:
- price, pricing, cost, how much, quote, estimate, rate, $, dollar
- "what would it cost", "ballpark", "rough idea", "budget"

Look for:
- Vehicle year/make/model mentions
- Email addresses
- File sending intent (words like "send", "file", "design", "artwork", "attached")
- Wrap type mentions
- ANY pricing/cost questions (ALWAYS set wants_pricing=true for these!)

Message: "${body.message_text}"
${hasFiles ? `NOTE: Customer also sent ${fileUrls.length} file(s)` : ''}`;

    const classifyRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a message classifier. Return valid JSON only. ALWAYS detect pricing questions!" },
          { role: "user", content: classifyPrompt },
        ],
      }),
    });

    let parsed: any = { 
      type: hasFiles ? "file_received" : "general", 
      wants_pricing: false,
      vehicle: {}, 
      urgency: "normal", 
      needs_vehicle_info: true, 
      wrap_type: null,
      has_file_intent: hasFiles,
      customer_email: null
    };
    
    try {
      const classifyData = await classifyRes.json();
      const content = classifyData.choices?.[0]?.message?.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Classification parse error:", e);
    }
    
    // FALLBACK: Check for pricing keywords if AI missed it
    const lowerMsg = (body.message_text || '').toLowerCase();
    const pricingKeywords = ['price', 'pricing', 'cost', 'how much', 'quote', 'estimate', '$', 'dollar', 'ballpark', 'budget', 'rate'];
    if (!parsed.wants_pricing && pricingKeywords.some(kw => lowerMsg.includes(kw))) {
      parsed.wants_pricing = true;
      console.log("💰 Pricing intent detected via keyword fallback");
    }

    // Override type if files were received
    if (hasFiles) {
      parsed.type = "file_received";
    }

    console.log("🎯 Classified:", parsed);

    // 3. Find or create contact and conversation
    const WPW_ORG_ID = '51aa96db-c06d-41ae-b3cb-25b045c75caf';
    
    // ============================================================
    // CRITICAL GUARD: Instagram must use webhook-provided IDs
    // The webhook is the ONLY creator of IG contacts/conversations
    // ============================================================
    if (body.platform === 'instagram') {
      if (!body.conversation_id) {
        console.error("❌ BLOCKED: Instagram ingest requires conversation_id from webhook");
        return new Response(JSON.stringify({ 
          error: "Instagram ingest requires conversation_id from webhook",
          blocked: true 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      if (!body.contact_id) {
        console.error("❌ BLOCKED: Instagram ingest requires contact_id from webhook");
        return new Response(JSON.stringify({ 
          error: "Instagram ingest requires contact_id from webhook",
          blocked: true 
        }), { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      console.log("✅ Instagram using webhook IDs - conversation:", body.conversation_id, "contact:", body.contact_id);
    }
    
    // Use IDs from webhook if provided (Instagram always provides these)
    let conversation = body.conversation_id 
      ? { id: body.conversation_id } 
      : null;
    
    let contact: any = null;
    
    // If we have a contact_id passed from webhook, use it
    if (body.contact_id) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", body.contact_id)
        .single();
      contact = existingContact;
    }
    
    // For non-Instagram platforms ONLY: find/create if needed
    if (!contact && body.sender_id && body.platform !== 'instagram') {
      // Use consistent lookup - check for sender_id patterns
      const { data: foundContact } = await supabase
        .from("contacts")
        .select("*")
        .eq("source", body.platform)
        .or(`metadata->>sender_id.eq.${body.sender_id},metadata->>instagram_id.eq.${body.sender_id}`)
        .maybeSingle();
      
      if (foundContact) {
        contact = foundContact;
      }
    }
    
    // Only create new contact for NON-INSTAGRAM platforms
    if (!contact && body.platform !== 'instagram') {
      console.log("👤 Creating new contact for platform:", body.platform);
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          name: body.sender_username || body.sender_id || 'Unknown',
          email: parsed.customer_email || `${body.sender_id}@capture.local`,
          source: body.platform,
          organization_id: WPW_ORG_ID,
          metadata: {
            sender_id: body.sender_id,
          },
          tags: parsed.wants_pricing ? ['lead', 'pricing_interest'] : ['lead'],
        })
        .select()
        .single();
      
      if (!contactErr) {
        contact = newContact;
        console.log("👤 Created new contact:", contact.id);
      } else {
        console.error("Contact create error:", contactErr);
      }
    } else if (contact && parsed.customer_email && !parsed.customer_email.includes('@capture.local') && contact.email?.includes('@capture.local')) {
      // Update existing contact with real email if captured
      await supabase
        .from("contacts")
        .update({ 
          email: parsed.customer_email,
          tags: [...(contact.tags || []), 'email_captured'].filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
        })
        .eq("id", contact.id);
      console.log("📧 Updated contact with real email:", parsed.customer_email);
    }

    // Find existing conversation if not passed from webhook (for non-Instagram only)
    if (!conversation && body.platform !== 'instagram') {
      // Fallback: search by subject pattern
      const { data: subjectConv } = await supabase
        .from("conversations")
        .select("*")
        .eq("channel", body.platform)
        .ilike("subject", `%${body.sender_id}%`)
        .maybeSingle();
      
      if (subjectConv) {
        conversation = subjectConv;
      }
    }

    // Only create new conversation for NON-INSTAGRAM platforms
    if (!conversation && body.platform !== 'instagram') {
      console.log("💬 Creating new conversation for platform:", body.platform);
      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          channel: body.platform,
          subject: `${body.platform.toUpperCase()} - ${body.sender_id}`,
          unread_count: 1,
          priority: parsed.urgency === "high" ? "high" : "normal",
          status: "open",
          contact_id: contact?.id || null,
          organization_id: WPW_ORG_ID,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (convError) console.error("Conversation create error:", convError);
      conversation = newConv;
    } else if (conversation && 'unread_count' in conversation) {
      // Update existing conversation with last_message_at
      const updateData: any = { 
        unread_count: ((conversation as any).unread_count || 0) + 1,
        last_message_at: new Date().toISOString()
      };
      if (!('contact_id' in conversation) || !(conversation as any).contact_id) {
        if (contact?.id) {
          updateData.contact_id = contact.id;
        }
      }
      await supabase
        .from("conversations")
        .update(updateData)
        .eq("id", conversation.id);
    }

    // 4. Insert inbound message with file metadata
    if (conversation) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "inbound",
        channel: body.platform,
        content: hasFiles ? `${body.message_text || ''} [Sent ${fileUrls.length} file(s)]` : body.message_text,
        sender_name: body.sender_username || body.sender_id,
        metadata: hasFiles ? { attachments: fileUrls, has_files: true } : {}
      });
    }

    // 5. Handle quote requests - ALWAYS CREATE QUOTE RECORD FOR RETARGETING
    // CRITICAL: Create quote even with partial info - this is for sales pipeline tracking
    let autoQuoteResult: any = null;
    const hasCompleteVehicle = parsed.vehicle?.year && parsed.vehicle?.make && parsed.vehicle?.model;
    const shouldCreateQuote = parsed.type === "quote" || parsed.wants_pricing;
    
    if (shouldCreateQuote) {
      const quoteNumber = `WPW-${body.platform.toUpperCase().slice(0,2)}-${Date.now().toString().slice(-6)}`;
      console.log("💰 PRICING INTEREST DETECTED - Creating quote record:", quoteNumber);
      
      // Map wrap_type to WPW product types
      let wpwProductType = 'avery'; // Default to Avery Printed Wrap $5.27/sqft
      const msgLower = (body.message_text || '').toLowerCase();
      if (parsed.wrap_type === '3m' || msgLower.includes('3m')) {
        wpwProductType = '3m';
      } else if (parsed.wrap_type === 'window' || msgLower.includes('window') || msgLower.includes('perf')) {
        wpwProductType = 'window';
      } else if (parsed.wrap_type === 'contour' || msgLower.includes('contour') || msgLower.includes('cut')) {
        wpwProductType = 'contour';
      }

      if (hasCompleteVehicle) {
        // FULL AUTO-QUOTE: We have complete vehicle info
        console.log("🚀 Auto-generating complete quote for:", parsed.vehicle);
        
        try {
          const autoQuoteResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-auto-quote`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_ROLE}`
            },
            body: JSON.stringify({
              vehicleYear: parsed.vehicle.year,
              vehicleMake: parsed.vehicle.make,
              vehicleModel: parsed.vehicle.model,
              customerName: body.sender_username || body.sender_id,
              customerEmail: parsed.customer_email || null,
              productType: wpwProductType,
              conversationId: conversation?.id,
              autoEmail: false, // NEVER auto-send - requires approval
              source: body.platform, // Track source (instagram, email, etc)
              sourceMessage: body.message_text // Store original message
            })
          });
          
          if (autoQuoteResponse.ok) {
            autoQuoteResult = await autoQuoteResponse.json();
            console.log("✅ Auto-quote created:", autoQuoteResult);
          } else {
            const errorText = await autoQuoteResponse.text();
            console.error("❌ Auto-quote failed:", errorText);
          }
        } catch (autoQuoteErr) {
          console.error("❌ Auto-quote error:", autoQuoteErr);
        }
      } else {
        // PARTIAL QUOTE: Create lead record even without complete vehicle info
        // This is CRITICAL for retargeting - don't lose these leads!
        console.log("📋 Creating PARTIAL quote for retargeting:", quoteNumber);
        
        const quoteData = {
          quote_number: quoteNumber,
          customer_name: body.sender_username || body.sender_id || 'Unknown',
          customer_email: parsed.customer_email || `pending-${body.sender_id}@capture.local`,
          vehicle_year: parsed.vehicle?.year || null,
          vehicle_make: parsed.vehicle?.make || null,
          vehicle_model: parsed.vehicle?.model || null,
          product_name: wpwProductType,
          status: 'lead',
          total_price: 0,
          ai_generated: false,
          ai_message: body.message_text,
          source: body.platform, // Track source platform (instagram, email, etc)
          source_message: body.message_text, // Store original message
          source_conversation_id: conversation?.id || null
        };
        
        console.log("📝 Inserting quote with data:", JSON.stringify(quoteData));
        
        const { data: partialQuote, error: quoteErr } = await supabase
          .from("quotes")
          .insert(quoteData)
          .select()
          .single();
        
        if (quoteErr) {
          console.error("❌ CRITICAL - Quote insert failed:", quoteErr.message);
          console.error("❌ Quote error details:", JSON.stringify(quoteErr));
          console.error("❌ Attempted quote data:", JSON.stringify(quoteData));
        } else {
          console.log("✅ LEAD CAPTURED:", quoteNumber, partialQuote?.id);
          autoQuoteResult = { 
            success: true, 
            partial: true, 
            quote: { 
              id: partialQuote?.id, 
              quoteNumber,
              status: 'lead'
            } 
          };
        }
      }
      
      // Log to ai_actions for MCP visibility - ALWAYS require approval
      // CRITICAL: Always include conversation_id for thread linking
      const { error: actionError } = await supabase.from("ai_actions").insert({
        action_type: "create_quote",
        conversation_id: conversation?.id || null, // Link to conversation
        organization_id: WPW_ORG_ID,
        priority: parsed.urgency,
        resolved: false, // ALWAYS require approval before sending
        resolved_at: null,
        action_payload: {
          source: body.platform,
          sender_id: body.sender_id,
          sender_username: body.sender_username,
          conversation_id: conversation?.id || null, // Also in payload for fallback
          customer_email: parsed.customer_email,
          vehicle: parsed.vehicle,
          message: body.message_text,
          is_partial_lead: autoQuoteResult?.partial || false,
          quote_number: autoQuoteResult?.quote?.quoteNumber || null,
          auto_quote: autoQuoteResult?.success && !autoQuoteResult?.partial ? {
            quote_id: autoQuoteResult.quote?.id,
            quote_number: autoQuoteResult.quote?.quoteNumber,
            total_price: autoQuoteResult.quote?.totalPrice,
            price_per_sqft: autoQuoteResult.quote?.pricePerSqft,
            product_name: autoQuoteResult.quote?.productName,
            customer_name: body.sender_username || body.sender_id,
            customer_email: parsed.customer_email
          } : null,
          needs_follow_up: !hasCompleteVehicle,
          pending_email: true // Mark that email needs to be sent on approval
        },
      });
      if (actionError) console.error("AI action error:", actionError);
      console.log("📝 Quote logged to ai_actions - PENDING APPROVAL");
    }

    // 5b. Handle file received - escalate to design team
    if (parsed.type === "file_received" || hasFiles) {
      console.log("📁 File received - escalating to design team");
      
      // Create ai_action for file review
      await supabase.from("ai_actions").insert({
        action_type: "file_review",
        priority: "high",
        action_payload: {
          source: body.platform,
          sender_id: body.sender_id,
          sender_username: body.sender_username,
          file_urls: fileUrls,
          message: body.message_text,
          conversation_id: conversation?.id
        },
      });

      // Email design team about files (if files present)
      if (hasFiles && fileUrls.length > 0) {
        try {
          const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
          if (RESEND_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${RESEND_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "WePrintWraps <hello@weprintwraps.com>",
                to: ["Design@WePrintWraps.com"],
                cc: ["Trish@WePrintWraps.com"],
                subject: `📁 New Files Received via Instagram DM - ${body.sender_username || body.sender_id}`,
                html: `
                  <h2>Customer sent design files!</h2>
                  <p><strong>From:</strong> ${body.sender_username || body.sender_id}</p>
                  <p><strong>Platform:</strong> ${body.platform}</p>
                  <p><strong>Message:</strong> ${body.message_text || 'No message'}</p>
                  <p><strong>Files (${fileUrls.length}):</strong></p>
                  <ul>${fileUrls.map((url: string) => `<li><a href="${url}">${url}</a></li>`).join('')}</ul>
                  <p><em>AI is asking for their email to send a formal quote.</em></p>
                `
              })
            });
            console.log("✅ Design team notified via email");
          }
        } catch (emailErr) {
          console.error("Email notification error:", emailErr);
        }
      }
    }

    // 6. Get official pricing context
    const pricingContext = getPricingContext();

    // 7. Generate AI reply with intent-specific prompts
    const intentPrompts: Record<string, string> = {
      quote: parsed.needs_vehicle_info 
        ? "Ask for their vehicle YEAR, MAKE, and MODEL. Be friendly and quick."
        : autoQuoteResult?.success 
          ? `QUOTE CREATED! Tell them: "Great news! I just generated your quote for the ${parsed.vehicle.year} ${parsed.vehicle.make} ${parsed.vehicle.model} - ${autoQuoteResult.quote?.formattedPrice}! ${autoQuoteResult.emailSent ? 'Check your email for the full breakdown!' : 'Drop your email and I\'ll send the full quote details!'}" Be excited!`
          : "They provided vehicle info but quote failed. Confirm details and ask for their email to send a formal quote.",
      design: "Ask what style they're looking for. Offer to show examples.",
      support: "Ask for their order number so you can help track it.",
      file_received: "Thank them for sending files! Tell them our design team will review shortly. Ask for their email so the team can send a formal quote.",
      general: "Answer their question helpfully. Guide toward getting a quote if appropriate."
    };

    const fileHandlingRules = `
FILE HANDLING RULES (CRITICAL):
- WePrintWraps CAN receive files directly via Instagram DM!
- ALWAYS encourage customers to send their files here
- When they mention files/artwork/designs, say: "Yes! Send it right over and our design team will take a look!"
- If files need review, mention Jackson or Lance will review them
- NEVER say "I can't receive files" - that's WRONG
- When files ARE received: "Got it! 👊 Our design team will review and get back to you with a quote!"
- NEVER say "I've forwarded" or "I've emailed" - only say the team will review
- Always ask for their email after receiving files so team can follow up`;

    // Check if we have their email already
    const hasEmail = parsed.customer_email && !parsed.customer_email.includes('@capture.local');
    const emailCapturePrompt = hasEmail ? '' : `
EMAIL CAPTURE (CRITICAL - DO THIS FIRST):
- You DO NOT have their email yet!
- BEFORE giving ANY pricing info, you MUST ask: "Drop your email and I'll send the full quote breakdown! 📧"
- If they ask about cost/price/quote, say: "I'd love to help! Quick - what's your email so I can send pricing details?"
- Be natural but ALWAYS work in the email ask
- Examples: "Sure thing! What email should I send the quote to?" or "Got it! Drop your email and I'll get you a quote!"`;

    const replyPrompt = `You are WPW AI TEAM - the friendly AI assistant for WePrintWraps.com.

BRAND VOICE:
- High-energy wrap industry pro
- Professional but friendly
- Quick and helpful
- Use emojis sparingly (1-2 max)

INTENT: ${parsed.type}
${intentPrompts[parsed.type] || intentPrompts.general}
${emailCapturePrompt}

${parsed.vehicle?.year ? `Vehicle detected: ${parsed.vehicle.year} ${parsed.vehicle.make} ${parsed.vehicle.model}` : ''}
${parsed.wrap_type ? `Wrap type: ${parsed.wrap_type}` : ''}
${hasFiles ? `FILES RECEIVED: Customer just sent ${fileUrls.length} file(s)! Thank them and confirm forwarding to design team.` : ''}
${parsed.has_file_intent ? `Customer mentioned files/artwork - encourage them to send it!` : ''}
${hasEmail ? `CUSTOMER EMAIL: ${parsed.customer_email}` : 'NO EMAIL CAPTURED YET - Ask for it!'}

${pricingContext}

${fileHandlingRules}

RULES:
- Keep replies under 40 words
- Use 1-2 emojis max
- Be direct and helpful
- Direct them to weprintwraps.com for instant quotes
- NEVER make up prices - only use the pricing listed above
- When you have vehicle info + sqft, give them the actual price!
- ${hasEmail ? '' : 'ALWAYS ask for their email if you dont have it yet!'}`;

    // ========== AI RESPONSE GENERATION (RESPECTS AI STATUS) ==========
    let aiReply = "";
    let shouldSendReply = false;
    
    if (aiMode === 'off') {
      // OFF mode: No AI response at all
      console.log("⛔ AI is OFF - skipping AI response generation");
      aiReply = "";
      shouldSendReply = false;
    } else {
      // LIVE or MANUAL mode: Generate AI response
      const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: replyPrompt },
            { role: "user", content: body.message_text || (hasFiles ? "[Customer sent files]" : "") },
          ],
        }),
      });

      const aiData = await aiResp.json();
      aiReply = aiData.choices?.[0]?.message?.content || "Thanks for reaching out! How can I help you today?";
      console.log("💬 AI Reply:", aiReply);
      
      // Determine if we should send based on mode
      shouldSendReply = aiMode === 'live'; // Only auto-send in LIVE mode
      
      if (aiMode === 'manual') {
        console.log("✋ MANUAL mode - AI response drafted, awaiting approval");
      }
    }

    // 8. Save outbound message with PENDING status (NOT "sent" until Meta confirms!)
    let savedMessageId: string | null = null;
    if (conversation && aiReply) {
      const { data: insertedMsg, error: insertMsgErr } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        channel: body.platform,
        content: aiReply,
        metadata: {
          ai_mode: aiMode,
          status: aiMode === 'manual' ? 'pending_approval' : 'pending_delivery',
          generated_at: new Date().toISOString(),
          generated_by: body.platform === 'instagram' ? 'casey_ramirez' : 'alex_morgan'
        }
      })
      .select('id')
      .single();
      
      if (insertMsgErr) {
        console.error("❌ Failed to insert outbound message:", insertMsgErr);
      } else {
        savedMessageId = insertedMsg?.id || null;
        console.log("📝 Outbound message saved with id:", savedMessageId, "status: pending_delivery");
      }
      
      // Create ai_action for manual approval if in MANUAL mode
      if (aiMode === 'manual') {
        // Determine AI agent based on platform
        const aiAgent = body.platform === 'instagram' ? 'Casey Ramirez' : 'Alex Morgan';
        
        // Handle image-only messages (no text but has files)
        let displayOriginalMessage = body.message_text || '';
        if (!displayOriginalMessage && hasFiles && fileUrls.length > 0) {
          displayOriginalMessage = `[Customer sent ${fileUrls.length} attachment(s)]`;
        }
        
        await supabase.from("ai_actions").insert({
          action_type: "approve_message",
          priority: parsed.urgency || "normal",
          action_payload: {
            source: body.platform,
            sender_id: body.sender_id,
            sender_username: body.sender_username,
            conversation_id: conversation.id,
            draft_message: aiReply,
            original_message: displayOriginalMessage,
            needs_approval: true,
            agent: aiAgent,
            attachments: hasFiles ? fileUrls : []
          },
        });
        console.log("📋 Created approval task for MANUAL mode - Agent:", aiAgent);
      }
    }

    // 9. Send reply back via Instagram (ONLY in LIVE mode)
    if (body.platform === "instagram" && shouldSendReply && aiReply && savedMessageId) {
      console.log("🚀 INVOKING send-instagram-reply", {
        recipient: body.sender_id,
        message_id: savedMessageId,
        aiReply_length: aiReply?.length
      });
      
      try {
        const sendResult = await fetch(`${SUPABASE_URL}/functions/v1/send-instagram-reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({
            recipient: body.sender_id,
            message: aiReply,
            message_id: savedMessageId // Pass message ID for delivery tracking
          }),
        });
        
        const sendResponse = await sendResult.json();
        
        if (sendResult.ok && sendResponse.success) {
          console.log("✅ Instagram reply sent (LIVE mode)");
          console.log("✅ Meta message_id:", sendResponse.result?.message_id);
          
          // Get existing metadata and MERGE with delivery results
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("metadata")
            .eq("id", savedMessageId)
            .single();
          
          const existingMeta = (existingMsg?.metadata as Record<string, unknown>) || {};
          
          const { error: updateError } = await supabase
            .from("messages")
            .update({
              metadata: {
                ...existingMeta,
                status: 'sent',
                instagram_sent: true,
                instagram_message_id: sendResponse.result?.message_id,
                sent_at: new Date().toISOString(),
                delivery_latency_ms: sendResponse.delivery_result?.latency_ms
              }
            })
            .eq("id", savedMessageId);
          
          if (updateError) {
            console.error("Failed to update message status:", updateError);
          } else {
            console.log("✅ Message", savedMessageId, "marked as instagram_sent: true");
          }
        } else {
          // Capture delivery failure details
          const errorCode = sendResponse.error_code || sendResponse.delivery_result?.error_code;
          const errorMessage = sendResponse.error_summary || sendResponse.delivery_result?.error_message;
          
          console.error("❌ Instagram reply failed:", errorMessage);
          console.error("❌ Error code:", errorCode);
          
          // Get existing metadata and MERGE with failure status
          const { data: failedMsg } = await supabase
            .from("messages")
            .select("metadata")
            .eq("id", savedMessageId)
            .single();
          
          const failedMeta = (failedMsg?.metadata as Record<string, unknown>) || {};
          
          await supabase
            .from("messages")
            .update({
              metadata: {
                ...failedMeta,
                status: 'failed',
                instagram_sent: false,
                instagram_error: true,
                instagram_error_code: errorCode,
                instagram_error_message: errorMessage,
                delivery_attempted_at: new Date().toISOString()
              }
            })
            .eq("id", savedMessageId);
          console.log("⚠️ Message", savedMessageId, "marked as failed");
        }
      } catch (replyErr) {
        console.error("❌ Instagram reply EXCEPTION:", replyErr);
        
        // Get existing metadata and MERGE with exception status
        if (savedMessageId) {
          const { data: exceptionMsg } = await supabase
            .from("messages")
            .select("metadata")
            .eq("id", savedMessageId)
            .single();
          
          const exceptionMeta = (exceptionMsg?.metadata as Record<string, unknown>) || {};
          
          await supabase
            .from("messages")
            .update({
              metadata: {
                ...exceptionMeta,
                status: 'failed',
                instagram_sent: false,
                instagram_error: true,
                instagram_error_message: String(replyErr),
                delivery_attempted_at: new Date().toISOString()
              }
            })
            .eq("id", savedMessageId);
          console.log("⚠️ Message", savedMessageId, "marked as failed due to exception");
        }
      }
    } else if (aiMode !== 'live' && aiReply && savedMessageId) {
      console.log(`📝 Message drafted but NOT sent (mode: ${aiMode}), message_id: ${savedMessageId}`);
      // No extra update needed - message was already saved with pending_approval status
    }

    return new Response(JSON.stringify({ 
      reply: aiReply, 
      intent: parsed, 
      auto_quote: autoQuoteResult,
      ai_mode: aiMode,
      message_sent: shouldSendReply 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
