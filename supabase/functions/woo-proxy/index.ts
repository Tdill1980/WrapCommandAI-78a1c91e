import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, orderId, orderNumber, data } = await req.json();

    // Validate user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify user belongs to an organization
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!orgMember) {
      return new Response(JSON.stringify({ error: "Forbidden - not a member of any organization" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Use server-side secrets
    const key = Deno.env.get("WOO_CONSUMER_KEY");
    const secret = Deno.env.get("WOO_CONSUMER_SECRET");
    const wooUrl = "https://weprintwraps.com";

    if (!key || !secret) {
      console.error("WooCommerce credentials not configured");
      // Return 200 with error payload so Supabase client passes through the actual error
      // instead of generic "Edge Function returned a non-2xx status code".
      return new Response(JSON.stringify({ error: "WooCommerce credentials not configured" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authString = btoa(`${key}:${secret}`);
    let response;

    console.log(`[woo-proxy] Action: ${action}, User: ${user.id}`);

    switch (action) {
      case "getOrder":
        if (!orderNumber) {
          return new Response(JSON.stringify({ error: "Order number required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        response = await fetch(
          `${wooUrl}/wp-json/wc/v3/orders?number=${encodeURIComponent(orderNumber)}`,
          {
            headers: {
              Authorization: `Basic ${authString}`,
              "Content-Type": "application/json",
            },
          }
        );
        break;

      case "updateOrder":
        if (!orderId) {
          return new Response(JSON.stringify({ error: "Order ID required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        response = await fetch(
          `${wooUrl}/wp-json/wc/v3/orders/${encodeURIComponent(orderId)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Basic ${authString}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          }
        );
        break;

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[woo-proxy] WooCommerce API error: ${response.status} - ${errorText}`);
      // Return 200 with error payload so Supabase client passes through the actual error
      return new Response(JSON.stringify({ error: `WooCommerce API error: ${response.status}` }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const result = await response.json();
    console.log(`[woo-proxy] Success: ${action}`);
    
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[woo-proxy] Error:", errorMessage);
    // Return 200 with error payload so Supabase client passes through the actual error
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
