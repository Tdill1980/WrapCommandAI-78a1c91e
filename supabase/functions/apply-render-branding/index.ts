// ============================================
// ApproveFlow OS — Render Branding Function
// ============================================
// Applies branding overlay using Gemini image generation
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OS CONSTANTS — LOCKED BRANDING
const BRAND_LINE_1 = "WrapCommandAI™ for WPW";
const BRAND_LINE_2 = "ApproveFlow™";

interface BrandingRequest {
  imageUrl: string;
  orderNumber: string;
  viewLabel?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, orderNumber, viewLabel } = await req.json() as BrandingRequest;

    console.log('[apply-render-branding] Request received:', {
      imageUrl: imageUrl?.substring(0, 50) + '...',
      orderNumber,
      viewLabel
    });

    if (!imageUrl) throw new Error('imageUrl is required');
    if (!orderNumber) throw new Error('orderNumber is required');

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Fetch image and convert to base64
    let imageBase64: string;
    let mimeType = "image/png";

    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBase64 = matches[2];
      } else {
        throw new Error("Invalid data URL format");
      }
    } else {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);
      mimeType = imgResponse.headers.get("content-type") || "image/png";
      const imgBuffer = await imgResponse.arrayBuffer();
      const uint8Array = new Uint8Array(imgBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      imageBase64 = btoa(binary);
    }

    const brandingPrompt = `Add professional branding text overlays to this vehicle render image:

TOP-LEFT CORNER:
- Line 1: "${BRAND_LINE_1}" in small black text
- Line 2: "${BRAND_LINE_2}" below it, same style

BOTTOM-RIGHT CORNER:
- Text: "Order #${orderNumber}" in small black text
${viewLabel ? `- Below: "${viewLabel}"` : ''}

RULES:
- Add slight semi-transparent white background behind text for readability
- DO NOT modify the vehicle or wrap design
- DO NOT change the studio environment
- Only add the text overlays
- Keep text crisp and professional`;

    console.log('[apply-render-branding] Calling native Gemini API for branding...');

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: brandingPrompt },
              { inlineData: { mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[apply-render-branding] Gemini error:', error);
      // Graceful fallback - return original image
      return new Response(JSON.stringify({
        success: true,
        brandedUrl: imageUrl,
        warning: 'Branding API error, returning original'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    let brandedUrl: string | null = null;
    const resParts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of resParts) {
      if (part.inlineData?.mimeType?.startsWith("image/")) {
        brandedUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        break;
      }
    }

    if (brandedUrl) {
      console.log('[apply-render-branding] Branding applied successfully');

      return new Response(JSON.stringify({
        success: true,
        brandedUrl,
        brandingApplied: {
          line1: BRAND_LINE_1,
          line2: BRAND_LINE_2,
          orderNumber: `Order #${orderNumber}`,
          viewLabel: viewLabel || null
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // No image returned - return original
    console.log('[apply-render-branding] No image in response, returning original');
    return new Response(JSON.stringify({
      success: true,
      brandedUrl: imageUrl,
      warning: 'No branded image generated, returning original'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[apply-render-branding] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
