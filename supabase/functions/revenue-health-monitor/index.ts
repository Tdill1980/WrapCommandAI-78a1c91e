import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
  campaign_status: 'healthy' | 'warning' | 'critical' | 'emergency';
  signal_status: 'healthy' | 'warning' | 'critical' | 'unknown';
  overall_status: 'green' | 'yellow' | 'red';
  days_since_email: number;
  days_since_sms: number;
  signal_freshness_score: number;
  requires_action: boolean;
  alerts: string[];
  recommended_actions: string[];
}

interface RecoveryCampaign {
  subject_line: string;
  preview_text: string;
  email_html: string;
  sms_copy: string;
  suggested_segments: string[];
  meta_ad_copy: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, organizationId } = await req.json();

    switch (action) {
      case 'check_health':
        return await checkHealth(supabase, organizationId);
      case 'generate_recovery':
        return await generateRecoveryCampaign(supabase, organizationId);
      case 'log_campaign':
        const { campaignType, campaignName, campaignSource, audienceSize } = await req.json();
        return await logCampaign(supabase, organizationId, campaignType, campaignName, campaignSource, audienceSize);
      case 'log_override':
        const { overrideType, overrideReason, userName, warningLevel, daysSince } = await req.json();
        return await logOverride(supabase, organizationId, overrideType, overrideReason, userName, warningLevel, daysSince);
      default:
        return await checkHealth(supabase, organizationId);
    }
  } catch (error: any) {
    console.error('Revenue health monitor error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function checkHealth(supabase: any, organizationId?: string): Promise<Response> {
  const alerts: string[] = [];
  const recommendedActions: string[] = [];

  // Get last email campaign
  const { data: lastEmailCampaign } = await supabase
    .from('campaign_heartbeat')
    .select('sent_at')
    .eq('campaign_type', 'email')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // Get last SMS campaign
  const { data: lastSmsCampaign } = await supabase
    .from('campaign_heartbeat')
    .select('sent_at')
    .eq('campaign_type', 'sms')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // Also check klaviyo_campaigns table
  const { data: lastKlaviyoCampaign } = await supabase
    .from('klaviyo_campaigns')
    .select('sent_at, created_at')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // Calculate days since last campaign
  const now = new Date();
  let daysSinceEmail = 999;
  let daysSinceSms = 999;

  if (lastEmailCampaign?.sent_at) {
    daysSinceEmail = Math.floor((now.getTime() - new Date(lastEmailCampaign.sent_at).getTime()) / (1000 * 60 * 60 * 24));
  } else if (lastKlaviyoCampaign?.sent_at) {
    daysSinceEmail = Math.floor((now.getTime() - new Date(lastKlaviyoCampaign.sent_at).getTime()) / (1000 * 60 * 60 * 24));
  }

  if (lastSmsCampaign?.sent_at) {
    daysSinceSms = Math.floor((now.getTime() - new Date(lastSmsCampaign.sent_at).getTime()) / (1000 * 60 * 60 * 24));
  }

  // Determine campaign status
  let campaignStatus: 'healthy' | 'warning' | 'critical' | 'emergency' = 'healthy';
  
  if (daysSinceEmail >= 14) {
    campaignStatus = 'emergency';
    alerts.push(`🚨 EMERGENCY: No email campaign sent in ${daysSinceEmail} days!`);
    recommendedActions.push('Send a campaign NOW - your audience is going cold');
  } else if (daysSinceEmail >= 10) {
    campaignStatus = 'critical';
    alerts.push(`⚠️ CRITICAL: No email campaign sent in ${daysSinceEmail} days`);
    recommendedActions.push('Review and send the auto-generated recovery campaign');
  } else if (daysSinceEmail >= 7) {
    campaignStatus = 'warning';
    alerts.push(`⚡ WARNING: No email campaign sent in ${daysSinceEmail} days`);
    recommendedActions.push('Plan your next campaign this week');
  }

  // Get last signal sync
  const { data: lastSignalSync } = await supabase
    .from('signal_sync_log')
    .select('synced_at, sync_status, segments_synced')
    .eq('sync_type', 'klaviyo_meta')
    .order('synced_at', { ascending: false })
    .limit(1)
    .single();

  // Determine signal status
  let signalStatus: 'healthy' | 'warning' | 'critical' | 'unknown' = 'unknown';
  let signalFreshnessScore = 0;
  let hoursSinceSync = 999;

  if (lastSignalSync?.synced_at) {
    hoursSinceSync = Math.floor((now.getTime() - new Date(lastSignalSync.synced_at).getTime()) / (1000 * 60 * 60));
    
    if (hoursSinceSync <= 24) {
      signalStatus = 'healthy';
      signalFreshnessScore = 100 - Math.floor(hoursSinceSync * 2);
    } else if (hoursSinceSync <= 48) {
      signalStatus = 'warning';
      signalFreshnessScore = 60 - Math.floor((hoursSinceSync - 24) * 2);
      alerts.push(`⚡ Signal sync is ${hoursSinceSync} hours old`);
      recommendedActions.push('Check Klaviyo → Meta integration status');
    } else {
      signalStatus = 'critical';
      signalFreshnessScore = Math.max(0, 20 - Math.floor((hoursSinceSync - 48)));
      alerts.push(`🚨 Klaviyo → Meta signals are STALE (${hoursSinceSync}h old)`);
      recommendedActions.push('URGENT: Reactivate Klaviyo → Meta sync before increasing ad spend');
    }
  } else {
    alerts.push('❌ No Klaviyo → Meta signal sync detected');
    recommendedActions.push('Set up Klaviyo → Meta Advantage+ Shopping integration');
  }

  // Calculate overall status
  let overallStatus: 'green' | 'yellow' | 'red' = 'green';
  
  if (campaignStatus === 'emergency' || campaignStatus === 'critical' || signalStatus === 'critical') {
    overallStatus = 'red';
  } else if (campaignStatus === 'warning' || signalStatus === 'warning') {
    overallStatus = 'yellow';
  }

  const requiresAction = overallStatus !== 'green';

  // Update health status in database
  const { data: existingStatus } = await supabase
    .from('revenue_health_status')
    .select('id')
    .limit(1)
    .single();

  const healthData = {
    last_email_campaign_at: lastEmailCampaign?.sent_at || lastKlaviyoCampaign?.sent_at,
    last_sms_campaign_at: lastSmsCampaign?.sent_at,
    days_since_email: daysSinceEmail,
    days_since_sms: daysSinceSms,
    campaign_status: campaignStatus,
    klaviyo_meta_sync_active: signalStatus === 'healthy',
    last_signal_sync_at: lastSignalSync?.synced_at,
    signal_freshness_score: signalFreshnessScore,
    signal_status: signalStatus,
    synced_segments: lastSignalSync?.segments_synced || [],
    overall_status: overallStatus,
    requires_action: requiresAction,
    updated_at: new Date().toISOString(),
  };

  if (existingStatus?.id) {
    await supabase
      .from('revenue_health_status')
      .update(healthData)
      .eq('id', existingStatus.id);
  } else {
    await supabase
      .from('revenue_health_status')
      .insert(healthData);
  }

  // Generate recovery campaign if needed
  let recoveryCampaign = null;
  if (requiresAction && (campaignStatus === 'critical' || campaignStatus === 'emergency')) {
    const recovery = await generateRecoveryCampaignInternal(supabase, organizationId, campaignStatus);
    recoveryCampaign = recovery;
  }

  const result: HealthCheckResult = {
    campaign_status: campaignStatus,
    signal_status: signalStatus,
    overall_status: overallStatus,
    days_since_email: daysSinceEmail,
    days_since_sms: daysSinceSms,
    signal_freshness_score: signalFreshnessScore,
    requires_action: requiresAction,
    alerts,
    recommended_actions: recommendedActions,
  };

  return new Response(JSON.stringify({ 
    success: true, 
    health: result,
    recovery_campaign: recoveryCampaign 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function generateRecoveryCampaignInternal(supabase: any, organizationId?: string, triggerType: string = 'warning'): Promise<RecoveryCampaign | null> {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not configured');
    return null;
  }

  const systemPrompt = `You are an email marketing expert for WePrintWraps.com, a premium vehicle wrap printing company.
Generate a recovery email campaign to re-engage customers who haven't heard from the brand recently.

Brand Voice:
- Bold, confident, trade-focused
- Speaks to wrap installers and enthusiasts
- Uses phrases like "wrap game", "level up", "premium quality"
- Never desperate or salesy - always confident

The email should:
1. Acknowledge it's been a while (without being desperate)
2. Highlight something new or exciting
3. Include a compelling offer
4. Create urgency without being pushy

Return JSON with:
{
  "subject_line": "compelling subject with emoji",
  "preview_text": "teaser text under 90 chars",
  "headline": "bold headline",
  "body_copy": "2-3 paragraphs of engaging copy",
  "cta_text": "action button text",
  "offer": "specific offer details",
  "sms_copy": "160 char SMS version",
  "meta_ad_copy": "primary text for Meta ad"
}`;

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate a recovery campaign. Trigger: ${triggerType}. Make it feel urgent but not desperate.` }
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI generation failed:', await response.text());
      return getDefaultRecoveryCampaign();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultRecoveryCampaign();
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Build full email HTML
    const emailHtml = buildRecoveryEmailHtml(parsed);
    
    const campaign: RecoveryCampaign = {
      subject_line: parsed.subject_line || "🔥 We've Got Something Special For You",
      preview_text: parsed.preview_text || "New drops, better prices, same premium quality",
      email_html: emailHtml,
      sms_copy: parsed.sms_copy || "WPW: We miss you! 15% off your next order with code COMEBACK15. Shop now: weprintwraps.com",
      suggested_segments: ['Past Purchasers', 'Engaged Last 90 Days', 'High Intent'],
      meta_ad_copy: parsed.meta_ad_copy || "Your wrap game called - it wants an upgrade. Premium materials, unmatched quality. See what's new →",
    };

    // Save to database
    await supabase
      .from('auto_recovery_campaigns')
      .insert({
        trigger_type: triggerType,
        campaign_type: 'email',
        subject_line: campaign.subject_line,
        preview_text: campaign.preview_text,
        email_html: campaign.email_html,
        sms_copy: campaign.sms_copy,
        suggested_segments: campaign.suggested_segments,
        meta_ad_copy: campaign.meta_ad_copy,
        status: 'pending',
      });

    return campaign;
  } catch (error) {
    console.error('Recovery campaign generation error:', error);
    return getDefaultRecoveryCampaign();
  }
}

function getDefaultRecoveryCampaign(): RecoveryCampaign {
  return {
    subject_line: "🔥 We've Been Working On Something...",
    preview_text: "New materials, better prices, same premium quality",
    email_html: buildRecoveryEmailHtml({
      headline: "Your Wrap Game Deserves An Upgrade",
      body_copy: "It's been a minute since we connected, and we've been busy. New materials are in, prices are sharper than ever, and our print quality? Still unmatched.\n\nWhether you're working on a full wrap, partial, or just need panels - we've got you covered with the best in the game.",
      offer: "Use code COMEBACK15 for 15% off your next order",
      cta_text: "See What's New",
    }),
    sms_copy: "WPW: We miss you! 15% off your next order with code COMEBACK15. Shop now: weprintwraps.com",
    suggested_segments: ['Past Purchasers', 'Engaged Last 90 Days'],
    meta_ad_copy: "Your wrap game called - it wants an upgrade. Premium materials, unmatched quality. See what's new →",
  };
}

function buildRecoveryEmailHtml(content: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: 'Inter', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0A0A;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111111; border-radius: 12px; overflow: hidden;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 30px 40px 20px;">
              <img src="https://weprintwraps.com/wp-content/uploads/2024/01/wpw-logo.png" alt="WePrintWraps" width="180" style="max-width: 100%;">
            </td>
          </tr>
          
          <!-- Headline -->
          <tr>
            <td align="center" style="padding: 20px 40px;">
              <h1 style="font-family: 'Bebas Neue', Impact, sans-serif; font-size: 42px; color: #FF1493; margin: 0; letter-spacing: 2px; text-transform: uppercase;">
                ${content.headline || "Your Wrap Game Deserves An Upgrade"}
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 20px 40px; color: #FFFFFF; font-size: 16px; line-height: 1.6;">
              ${(content.body_copy || "").split('\n').map((p: string) => `<p style="margin: 0 0 16px;">${p}</p>`).join('')}
            </td>
          </tr>
          
          <!-- Offer Box -->
          <tr>
            <td align="center" style="padding: 20px 40px;">
              <div style="background: linear-gradient(135deg, #FF1493 0%, #FF6B6B 100%); border-radius: 8px; padding: 20px 30px;">
                <p style="color: #FFFFFF; font-size: 18px; font-weight: 600; margin: 0;">
                  ${content.offer || "Use code COMEBACK15 for 15% off"}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 30px 40px;">
              <a href="https://weprintwraps.com" style="display: inline-block; background-color: #FFD700; color: #0A0A0A; font-family: 'Bebas Neue', Impact, sans-serif; font-size: 24px; text-decoration: none; padding: 16px 48px; border-radius: 6px; letter-spacing: 1px; text-transform: uppercase;">
                ${content.cta_text || "See What's New"}
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #333333;">
              <p style="color: #888888; font-size: 12px; margin: 0; text-align: center;">
                WePrintWraps.com • Premium Vehicle Wrap Printing<br>
                <a href="https://weprintwraps.com" style="color: #00AFFF;">Shop</a> • 
                <a href="mailto:hello@weprintwraps.com" style="color: #00AFFF;">Contact</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function generateRecoveryCampaign(supabase: any, organizationId?: string): Promise<Response> {
  const campaign = await generateRecoveryCampaignInternal(supabase, organizationId, 'manual');
  
  return new Response(JSON.stringify({ 
    success: true, 
    campaign 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logCampaign(
  supabase: any, 
  organizationId: string | undefined, 
  campaignType: string, 
  campaignName: string, 
  campaignSource: string,
  audienceSize?: number
): Promise<Response> {
  const { error } = await supabase
    .from('campaign_heartbeat')
    .insert({
      organization_id: organizationId,
      campaign_type: campaignType,
      campaign_name: campaignName,
      campaign_source: campaignSource,
      audience_size: audienceSize,
      sent_at: new Date().toISOString(),
    });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logOverride(
  supabase: any,
  organizationId: string | undefined,
  overrideType: string,
  overrideReason: string,
  userName: string,
  warningLevel: string,
  daysSince: number
): Promise<Response> {
  const { error } = await supabase
    .from('accountability_overrides')
    .insert({
      organization_id: organizationId,
      override_type: overrideType,
      override_reason: overrideReason,
      overridden_by_name: userName,
      warning_level: warningLevel,
      days_since_campaign: daysSince,
    });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
