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
    const { shopName, websiteUrl, instagramHandle } = await req.json();

    console.log("[analyze-brand-voice-enhanced] Analyzing:", shopName);

    // Build context for AI analysis
    let contextData = `Shop Name: ${shopName}\n`;
    if (instagramHandle) {
      contextData += `Instagram: @${instagramHandle}\n`;
    }

    // Fetch website content if URL provided
    let websiteContent = "";
    if (websiteUrl) {
      try {
        const response = await fetch(websiteUrl, {
          headers: { "User-Agent": "WrapCommandAI Brand Analyzer" },
        });
        if (response.ok) {
          const html = await response.text();
          // Extract text content
          websiteContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 8000);
          contextData += `\nWebsite Content:\n${websiteContent}\n`;
        }
      } catch (err) {
        console.log("[analyze-brand-voice-enhanced] Could not fetch website:", err);
      }
    }

    // Fetch Instagram profile data if handle provided
    let instagramBio = "";
    let instagramPosts: string[] = [];
    if (instagramHandle) {
      const cleanHandle = instagramHandle.replace("@", "").trim();
      console.log("[analyze-brand-voice-enhanced] Scrubbing Instagram:", cleanHandle);
      
      try {
        // Try to fetch Instagram public profile page
        const igUrl = `https://www.instagram.com/${cleanHandle}/`;
        const igResponse = await fetch(igUrl, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        });
        
        if (igResponse.ok) {
          const igHtml = await igResponse.text();
          
          // Extract bio from meta description (public profiles)
          const descMatch = igHtml.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]+)"/i);
          if (descMatch && descMatch[1]) {
            instagramBio = descMatch[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&#x27;/g, "'")
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');
            console.log("[analyze-brand-voice-enhanced] Found Instagram bio");
          }
          
          // Extract any visible captions/text from page
          const captionMatches = igHtml.match(/"caption"\s*:\s*"([^"]{10,200})"/g);
          if (captionMatches) {
            instagramPosts = captionMatches
              .slice(0, 5)
              .map(m => {
                const match = m.match(/"caption"\s*:\s*"([^"]+)"/);
                return match ? match[1].replace(/\\n/g, ' ').slice(0, 200) : '';
              })
              .filter(Boolean);
            console.log("[analyze-brand-voice-enhanced] Found", instagramPosts.length, "Instagram captions");
          }
        }
      } catch (err) {
        console.log("[analyze-brand-voice-enhanced] Could not fetch Instagram:", err);
      }
      
      // Add Instagram data to context
      if (instagramBio) {
        contextData += `\nInstagram Bio: ${instagramBio}\n`;
      }
      if (instagramPosts.length > 0) {
        contextData += `\nRecent Instagram Captions:\n${instagramPosts.join('\n')}\n`;
      }
    }

    // Use Lovable AI Gateway
    const lovableApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!lovableApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const systemPrompt = `You are a brand voice analyst and business intelligence expert specializing in automotive wrap shops. Analyze the provided business information and extract a comprehensive profile.

Return a JSON object with this EXACT structure:
{
  "voiceProfile": {
    "tone": "one or two words describing overall tone (e.g., Professional, Friendly, Bold, Expert)",
    "energy": "one word (High, Medium, Calm, Intense)",
    "persona": "short description of brand personality (e.g., Expert Installer, Creative Artist, Trusted Pro)",
    "vocabulary": {
      "signature_phrases": ["list of 5-8 phrases they likely use"],
      "words_to_avoid": ["list of 3-5 words that don't fit"]
    },
    "sales_style": {
      "approach": "Consultative, Direct, Educational, or Relationship-focused",
      "urgency_level": "Low, Medium, or High",
      "cta_style": "Soft, Medium, or Direct"
    },
    "customer_profile": {
      "pain_points": ["list of 3-5 customer pain points"],
      "desires": ["list of 3-5 customer desires"]
    }
  },
  "detectedServices": [
    {
      "name": "Full Vehicle Wraps",
      "category": "wraps",
      "pricing_type": "per_sqft",
      "suggested_price": 5.50,
      "confidence": "high"
    }
  ],
  "detectedInfo": {
    "email": "extracted email or null",
    "phone": "extracted phone or null",
    "address": "extracted address or null",
    "instagram_bio": "instagram bio text or null",
    "brand_colors": ["#hex1", "#hex2"]
  }
}

IMPORTANT FOR detectedServices:
- Analyze the website content carefully for services mentioned
- Look for keywords like: wrap, wraps, PPF, paint protection, tint, tinting, ceramic, coating, chrome delete, decals, graphics, commercial fleet
- For each service found, estimate a reasonable price:
  - Full wraps: $4-7/sqft
  - PPF: $6-10/sqft
  - Window tint: $150-400 flat
  - Ceramic coating: $300-1500 flat
  - Partial wraps: $3-5/sqft
  - Commercial graphics: $4-8/sqft
- Set confidence to "high" if explicitly mentioned, "medium" if implied
- Include at least 2-5 services based on what a typical wrap shop offers

For detectedInfo:
- Extract any contact information visible on the website
- Look for brand colors in the design (primary and accent colors)

Be specific to the wrap industry and the shop's positioning.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this wrap shop and create their brand voice profile with detected services:\n\n${contextData}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[analyze-brand-voice-enhanced] AI error:", errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON from response (handle potential markdown code blocks)
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[analyze-brand-voice-enhanced] Parse error:", parseError);
      throw new Error("Failed to parse AI response");
    }

    console.log("[analyze-brand-voice-enhanced] Generated profile for:", shopName);
    console.log("[analyze-brand-voice-enhanced] Detected services:", result.detectedServices?.length || 0);

    return new Response(
      JSON.stringify({
        success: true,
        voiceProfile: result.voiceProfile,
        detectedServices: result.detectedServices || [],
        detectedInfo: {
          ...result.detectedInfo,
          instagram_bio: instagramBio || result.detectedInfo?.instagram_bio || null,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[analyze-brand-voice-enhanced] Error:", error);
    
    // Return fallback data
    return new Response(
      JSON.stringify({
        success: true,
        voiceProfile: {
          tone: "Professional",
          energy: "Medium",
          persona: "Expert Installer",
          vocabulary: {
            signature_phrases: [
              "Transform your ride",
              "Premium quality guaranteed",
              "Wrap it right the first time",
              "Your vision, our expertise",
            ],
            words_to_avoid: ["cheap", "basic", "discount"],
          },
          sales_style: {
            approach: "Consultative",
            urgency_level: "Medium",
            cta_style: "Medium",
          },
          customer_profile: {
            pain_points: [
              "Want to protect investment",
              "Looking for unique style",
              "Tired of factory paint",
            ],
            desires: [
              "Stand out from crowd",
              "Quality that lasts",
              "Professional results",
            ],
          },
        },
        detectedServices: [
          {
            name: "Full Vehicle Wraps",
            category: "wraps",
            pricing_type: "per_sqft",
            suggested_price: 5.50,
            confidence: "medium",
          },
          {
            name: "Paint Protection Film (PPF)",
            category: "ppf",
            pricing_type: "per_sqft",
            suggested_price: 8.00,
            confidence: "medium",
          },
          {
            name: "Window Tint",
            category: "tint",
            pricing_type: "flat",
            suggested_price: 250,
            confidence: "medium",
          },
          {
            name: "Ceramic Coating",
            category: "ceramic",
            pricing_type: "flat",
            suggested_price: 800,
            confidence: "low",
          },
        ],
        detectedInfo: {},
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
