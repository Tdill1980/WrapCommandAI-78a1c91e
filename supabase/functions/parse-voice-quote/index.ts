import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!LOVABLE_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const { transcript } = await req.json();
    
    if (!transcript || typeof transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing transcript" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("🎤 Parsing voice transcript:", transcript);

    const parsePrompt = `Extract quote data from this voice transcript. Return ONLY valid JSON with these exact flat keys (no nesting):

{
  "customerName": string or null,
  "companyName": string or null,
  "email": string or null,
  "phone": string or null,
  "vehicleYear": string or null,
  "vehicleMake": string or null,
  "vehicleModel": string or null,
  "serviceType": "full_wrap" | "partial_wrap" | "color_change" | "ppf" | "chrome_delete" | "window_tint" | null,
  "productType": string or null (e.g., "Printed Wrap Film", "3M IJ180", "Avery", "Chrome Delete"),
  "finish": "Gloss" | "Matte" | "Satin" | null,
  "notes": string or null
}

Rules:
- Extract year as 4-digit string (e.g., "2024")
- Capitalize make/model properly (e.g., "Ford", "Bronco")
- Extract phone in any format mentioned (555-1234, 555.1234, 5551234 all valid)
- IMPORTANT: Extract email addresses carefully - look for patterns like "name at gmail.com", "name@domain", "email is xyz"
- If "for [Name]" pattern, that's the customer name
- If company name mentioned, capture it
- Notes should contain any special requests or deadlines

Voice transcript: "${transcript}"`;


    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a data extraction assistant. Return ONLY valid JSON, no markdown, no explanation." },
          { role: "user", content: parsePrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    console.log("🤖 AI raw response:", content);

    // Extract JSON from response (handle markdown code blocks)
    let parsed: any = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
    }

    // Handle nested structures defensively (flatten if AI returns nested)
    const result = {
      customerName: parsed.customerName || parsed["CUSTOMER INFO"]?.name || null,
      companyName: parsed.companyName || parsed["CUSTOMER INFO"]?.company || null,
      email: parsed.email || parsed["CUSTOMER INFO"]?.email || null,
      phone: parsed.phone || parsed["CUSTOMER INFO"]?.phone || null,
      vehicleYear: parsed.vehicleYear || parsed["VEHICLE INFO"]?.year || parsed.vehicle?.year || null,
      vehicleMake: parsed.vehicleMake || parsed["VEHICLE INFO"]?.make || parsed.vehicle?.make || null,
      vehicleModel: parsed.vehicleModel || parsed["VEHICLE INFO"]?.model || parsed.vehicle?.model || null,
      serviceType: parsed.serviceType || parsed["SERVICE INFO"]?.type || null,
      productType: parsed.productType || parsed["SERVICE INFO"]?.product || null,
      finish: parsed.finish || parsed["SERVICE INFO"]?.finish || null,
      notes: parsed.notes || parsed["ADDITIONAL"]?.notes || null,
    };

    console.log("✅ Parsed voice data:", result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Parse voice quote error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
