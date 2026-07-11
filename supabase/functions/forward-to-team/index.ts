import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const {
      conversation_id,
      organization_id,
      to_email = "lance@weprintwraps.com",
      cc_email,
      subject,
      context,
      attachment_urls = [],
      sender_name,
      sender_email,
      original_message,
      reason = "Design file or complex request requires human review",
    } = body;

    console.log("📧 Forward to team request:", {
      conversation_id,
      to_email,
      reason,
      attachments: attachment_urls.length,
    });

    if (!resendApiKey) {
      console.error("❌ RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email HTML
    const emailSubject = subject || `[WPW] ${reason} - ${sender_name || "Customer"}`;
    
    const attachmentsHtml = attachment_urls.length > 0
      ? `
        <h3>Attachments:</h3>
        <ul>
          ${attachment_urls.map((url: string, i: number) => `
            <li><a href="${url}" target="_blank">Attachment ${i + 1}</a></li>
          `).join("")}
        </ul>
      `
      : "";

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>🔔 Forwarded from MightyChat</h2>
        <p><strong>Reason:</strong> ${reason}</p>
        <hr />
        
        <h3>Customer Info:</h3>
        <ul>
          <li><strong>Name:</strong> ${sender_name || "Unknown"}</li>
          <li><strong>Email:</strong> ${sender_email || "N/A"}</li>
        </ul>
        
        <h3>Original Message:</h3>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 10px 0;">
          <p style="white-space: pre-wrap;">${original_message || context || "(No message content)"}</p>
        </div>
        
        ${attachmentsHtml}
        
        <hr />
        <p style="color: #666; font-size: 12px;">
          Conversation ID: ${conversation_id || "N/A"}<br />
          <a href="https://weprintwraps.lovable.app/mightychat?id=${conversation_id}">View Full Conversation</a>
        </p>
      </div>
    `;

    // Send email via Resend
    console.log("📤 Sending email via Resend to:", to_email);
    
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ace • WePrintWraps <noreply@weprintwraps.com>",
        to: [to_email],
        // Silent CC to management (e.g. Trish) — skip if it's the same as the primary recipient
        ...(cc_email && cc_email !== to_email ? { cc: [cc_email] } : {}),
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("❌ Resend API error:", resendResult);
      
      // Write failed execution receipt
      await supabase.from("execution_receipts").insert({
        conversation_id,
        organization_id,
        source_table: "forward_request",
        source_id: null,
        channel: "email",
        action_type: "email_forward",
        status: "failed",
        provider: "resend",
        provider_receipt_id: null,
        payload_snapshot: { to_email, subject: emailSubject, reason, attachments: attachment_urls.length },
        error: resendResult?.message || "Failed to send email",
      });
      
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Email sent successfully:", resendResult);

    // Write success execution receipt
    await supabase.from("execution_receipts").insert({
      conversation_id,
      organization_id,
      source_table: "forward_request",
      source_id: null,
      channel: "email",
      action_type: "email_forward",
      status: "sent",
      provider: "resend",
      provider_receipt_id: resendResult.id,
      payload_snapshot: { to_email, subject: emailSubject, reason, attachments: attachment_urls.length },
      error: null,
    });

    // Also create a message record for visibility in MightyChat
    await supabase.from("messages").insert({
      conversation_id,
      organization_id,
      direction: "outbound",
      channel: "email",
      content: `📧 Forwarded to ${to_email}: ${reason}`,
      sender_type: "system",
      sender_name: "System",
      status: "sent",
      metadata: {
        forwarded_to: to_email,
        reason,
        resend_id: resendResult.id,
        attachment_count: attachment_urls.length,
      },
    });

    console.log("📝 Execution receipt and message record created");

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_id: resendResult.id,
        forwarded_to: to_email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Forward to team error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
