import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const checks: Record<string, string> = {};
  let allHealthy = true;

  // Check OpenAI key
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    checks.openai_key = 'MISSING';
    allHealthy = false;
  } else if (!openaiKey.startsWith('sk-')) {
    checks.openai_key = 'INVALID_FORMAT';
    allHealthy = false;
  } else {
    // Validate key works
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiKey}` }
      });
      checks.openai_api = resp.ok ? 'CONNECTED' : `ERROR_${resp.status}`;
      if (!resp.ok) allHealthy = false;
    } catch {
      checks.openai_api = 'UNREACHABLE';
      allHealthy = false;
    }
  }

  // Check External Supabase
  const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
  const extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  checks.external_db_url = extUrl ? 'SET' : 'MISSING';
  checks.external_db_key = extKey ? 'SET' : 'MISSING';
  if (!extUrl || !extKey) allHealthy = false;

  // Check Resend
  const resendKey = Deno.env.get('RESEND_API_KEY');
  checks.resend_key = resendKey ? 'SET' : 'MISSING';

  // Check alert phones
  checks.alert_phone_1 = Deno.env.get('ALERT_PHONE_1') ? 'SET' : 'MISSING';
  checks.alert_phone_2 = Deno.env.get('ALERT_PHONE_2') ? 'SET' : 'MISSING';

  // Check fallback leads (last 24h)
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (serviceKey && supabaseUrl) {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/chat_fallback_leads?select=id&created_at=gte.${yesterday}&status=eq.needs_followup`,
        { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
      );
      if (resp.ok) {
        const leads = await resp.json();
        checks.unfollowed_leads_24h = String(leads.length);
        if (leads.length > 5) {
          checks.warning = 'HIGH_FAILURE_RATE — check OpenAI key';
          allHealthy = false;
        }
      }
    }
  } catch {
    checks.fallback_check = 'SKIPPED';
  }

  return new Response(JSON.stringify({
    status: allHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    checks
  }), {
    status: allHealthy ? 200 : 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
