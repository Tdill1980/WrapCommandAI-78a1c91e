import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VOICECOMMAND_AI } from "../_shared/voicecommand-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PhoneCallClassification {
  intent: "quote_request" | "upset_customer" | "order_status" | "general_inquiry";
  summary: string;
  is_hot_lead: boolean;
  customer_name?: string;
  vehicle_info?: {
    year?: string;
    make?: string;
    model?: string;
  };
  urgency?: "low" | "medium" | "high";
  messages?: Array<{ role: "ai" | "caller"; content: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callSid, callerPhone, speechResult, organizationId } = await req.json();

    console.log(`🤖 [${VOICECOMMAND_AI.name}] Processing phone speech`);
    console.log(`[process-phone-speech] Processing call ${callSid} for org ${organizationId}`);
    console.log(`[process-phone-speech] Speech: ${speechResult}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get org info for context
    let companyName = "a vehicle wrap shop";
    let aiAgentName = "Jordan";
    
    if (organizationId) {
      const { data: phoneSettings } = await supabase
        .from("organization_phone_settings")
        .select("company_name, ai_agent_name, organizations(name)")
        .eq("organization_id", organizationId)
        .maybeSingle();
      
      if (phoneSettings) {
        companyName = phoneSettings.company_name || (phoneSettings.organizations as any)?.name || "a vehicle wrap shop";
        aiAgentName = phoneSettings.ai_agent_name || "Jordan";
      }
    }

    // Use Lovable AI to classify the call
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const classificationPrompt = `You are an AI assistant for ${companyName}, a vehicle wrap printing company.

Analyze this phone call transcript and extract key information:

TRANSCRIPT: "${speechResult}"

Respond in JSON format with these fields:
{
  "intent": "quote_request" | "upset_customer" | "order_status" | "general_inquiry",
  "summary": "Brief 1-2 sentence summary of what the caller wants",
  "is_hot_lead": true/false (true if they mention fleet, multiple vehicles, commercial, or seem ready to buy),
  "customer_name": "Name if mentioned, or null",
  "vehicle_info": {
    "year": "Year if mentioned or null",
    "make": "Make if mentioned or null",
    "model": "Model if mentioned or null"
  },
  "urgency": "low" | "medium" | "high"
}

Rules:
- quote_request: Caller is asking about pricing, quotes, or wants to get a wrap
- upset_customer: Caller sounds frustrated, angry, or is complaining
- order_status: Caller is asking about an existing order
- general_inquiry: Any other type of call
- is_hot_lead = true for: fleet mentions, multiple vehicles, commercial projects, wrap shops, or urgent timelines`;

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a JSON-only response bot. Output valid JSON only, no markdown." },
          { role: "user", content: classificationPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[process-phone-speech] AI error:", errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || "{}";
    
    let classification: PhoneCallClassification;
    try {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      classification = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        intent: "general_inquiry",
        summary: speechResult?.substring(0, 100) || "Unable to process",
        is_hot_lead: false,
      };
    } catch {
      console.error("[process-phone-speech] Failed to parse AI response:", responseContent);
      classification = {
        intent: "general_inquiry",
        summary: speechResult?.substring(0, 100) || "Unable to process",
        is_hot_lead: false,
      };
    }

    // Add the conversation messages
    classification.messages = [
      { role: "ai", content: `Hi, thanks for calling ${companyName}! I'm ${aiAgentName}, our AI assistant. How can I help you today?` },
      { role: "caller", content: speechResult },
    ];

    console.log(`[process-phone-speech] Classification:`, classification);

    // Update the phone call record
    const { error: updateError } = await supabase
      .from("phone_calls")
      .update({
        transcript: speechResult,
        ai_classification: classification,
        is_hot_lead: classification.is_hot_lead,
        customer_name: classification.customer_name,
        vehicle_info: classification.vehicle_info,
        status: "completed",
      })
      .eq("twilio_call_sid", callSid);

    if (updateError) {
      console.error("[process-phone-speech] Error updating phone call:", updateError);
    }

    // Create a conversation record for MightyChat inbox
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        organization_id: organizationId,
        channel: "phone",
        subject: classification.summary,
        customer_name: classification.customer_name || "Phone Caller",
        priority: classification.is_hot_lead ? "high" : classification.intent === "upset_customer" ? "urgent" : "normal",
        review_status: "needs_response",
        metadata: {
          phone: callerPhone,
          call_sid: callSid,
          intent: classification.intent,
          vehicle_info: classification.vehicle_info,
        },
      })
      .select()
      .single();

    if (convError) {
      console.error("[process-phone-speech] Error creating conversation:", convError);
    } else if (conversation) {
      // Link the phone call to the conversation
      await supabase
        .from("phone_calls")
        .update({ conversation_id: conversation.id })
        .eq("twilio_call_sid", callSid);

      // Create a message for the transcript
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        content: speechResult,
        direction: "inbound",
        sender_name: classification.customer_name || "Caller",
        metadata: { source: "phone_transcript" },
      });

      // ============================================
      // MIGHTYMAIL WIRING: Enroll phone leads in sequence
      // ============================================
      const customerEmail = (classification.customer_name && classification.customer_name.includes('@')) 
        ? classification.customer_name 
        : null; // Phone calls may not capture email
      
      // Check conversation metadata for email
      const { data: convWithEmail } = await supabase
        .from('conversations')
        .select('chat_state')
        .eq('id', conversation.id)
        .maybeSingle();
      
      const extractedEmail = customerEmail || convWithEmail?.chat_state?.customer_email;
      
      if (extractedEmail && !extractedEmail.includes('@capture.local')) {
        try {
          // Get contact
          const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('phone', callerPhone)
            .eq('organization_id', organizationId)
            .maybeSingle();

          if (contact) {
            // Find phone lead sequence
            const { data: phoneSequence } = await supabase
              .from('email_sequences')
              .select('id')
              .or('name.ilike.%phone%,name.ilike.%call%')
              .eq('is_active', true)
              .maybeSingle();

            if (phoneSequence) {
              const { error: enrollError } = await supabase.from('email_sequence_enrollments').insert({
                contact_id: contact.id,
                sequence_id: phoneSequence.id,
                customer_email: extractedEmail,
                customer_name: classification.customer_name || 'Phone Caller',
                enrolled_at: new Date().toISOString(),
                emails_sent: 0,
                is_active: true
              });
              
              if (!enrollError) {
                console.log(`[MightyMail] Enrolled phone lead ${extractedEmail} in sequence`);
              }
            }
          }
        } catch (mailError) {
          console.warn('[MightyMail] Phone enrollment warning:', mailError);
        }
      }
    }

    // If hot lead or upset customer, send SMS alert
    if (classification.is_hot_lead || classification.intent === "upset_customer") {
      console.log(`[process-phone-speech] Triggering SMS alert for ${classification.intent}`);
      
      const { error: alertError } = await supabase.functions.invoke("send-phone-alert", {
        body: {
          callSid,
          callerPhone,
          classification,
          organizationId,
        },
      });

      if (alertError) {
        console.error("[process-phone-speech] Error sending alert:", alertError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, classification }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-phone-speech] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
