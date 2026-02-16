import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkVariationRequest {
  organization_id?: string;
  brief: string;
  source_media_ids?: string[];
  inspiration_ids?: string[];
  variations: {
    agents: string[];
    formats: string[];
    styles: string[];
    count_per_combo: number;
  };
}

interface MediaFile {
  id: string;
  file_url: string;
  file_type: string;
  original_filename: string | null;
  thumbnail_url: string | null;
  tags: string[] | null;
  content_category: string | null;
}

const AGENT_PROMPTS: Record<string, string> = {
  noah_bennett: `You are Noah Bennett, a social media strategist who creates viral, scroll-stopping content. Your style is:
- High energy, attention-grabbing hooks in the first 2 seconds
- Trend-aware and culturally relevant
- Heavy use of pattern interrupts
- Focus on entertainment value while selling
- Knows what works on TikTok and Instagram Reels`,

  emily_carter: `You are Emily Carter, a marketing strategist focused on conversion and brand building. Your style is:
- Strategic storytelling that builds trust
- Clear value propositions and benefits
- Professional but approachable tone
- Excellent at email and ad copy
- Focus on the customer journey`,

  ryan_mitchell: `You are Ryan Mitchell, an editorial content creator who educates while entertaining. Your style is:
- Deep dive educational content
- Breaking down complex topics simply
- Authority-building through expertise
- Long-form hooks that build curiosity
- YouTube and blog optimized`
};

const STYLE_MODIFIERS: Record<string, string> = {
  sabri: `Apply Sabri Suby direct response style:
- Urgent, high-pressure hooks
- PAS framework (Problem-Agitate-Solution)
- Strong CTAs with scarcity
- Benefit-stacking
- "Wait, what?" pattern interrupts`,

  dara: `Apply Dara Denney UGC/paid social style:
- Authentic, conversational tone
- Native-feeling to platform
- Story-driven with emotional hooks
- Behind-the-scenes feel
- Optimized for paid social retargeting`,

  clean: `Apply Clean Professional style:
- Polished, brand-safe messaging
- Clear and concise copy
- Professional tone with warmth
- Focus on quality and trust
- Suitable for corporate/B2B`
};

const FORMAT_SPECS: Record<string, { description: string; structure: string }> = {
  reel: {
    description: "Short-form vertical video (9:16) for Instagram/TikTok",
    structure: "Hook (0-3s) → Problem/Setup (3-10s) → Solution/Reveal (10-20s) → CTA (20-30s)"
  },
  story: {
    description: "15-second story format with quick impact",
    structure: "Immediate hook → Quick value → Swipe up CTA"
  },
  carousel: {
    description: "Multi-slide Instagram carousel (up to 10 slides)",
    structure: "Cover hook → Problem slides → Solution slides → Benefits → CTA slide"
  },
  paid_ad: {
    description: "Paid social ad with headline, primary text, and description",
    structure: "Hook headline → Primary text (value prop) → Description → CTA button"
  },
  caption: {
    description: "Instagram/TikTok caption with hashtags",
    structure: "Hook line → Story/value → CTA → Hashtags"
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const lovableApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!lovableApiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const body: BulkVariationRequest = await req.json();
    const { brief, source_media_ids, inspiration_ids, variations, organization_id } = body;

    if (!brief || !variations) {
      throw new Error("Missing required fields: brief and variations");
    }

    console.log(`[ai-bulk-variations] Starting bulk generation for brief: "${brief.substring(0, 50)}..."`);
    console.log(`[ai-bulk-variations] Config: ${variations.agents.length} agents × ${variations.formats.length} formats × ${variations.styles.length} styles × ${variations.count_per_combo} each`);

    // Fetch source media details
    let sourceMedia: MediaFile[] = [];
    if (source_media_ids && source_media_ids.length > 0) {
      const { data } = await supabase
        .from("content_files")
        .select("*")
        .in("id", source_media_ids);
      sourceMedia = data || [];
    }

    // Fetch inspiration media
    let inspirationMedia: MediaFile[] = [];
    if (inspiration_ids && inspiration_ids.length > 0) {
      const { data } = await supabase
        .from("content_files")
        .select("*")
        .in("id", inspiration_ids);
      inspirationMedia = data || [];
    }

    // Load brand voice/TradeDNA if organization_id provided
    let brandVoice = "";
    if (organization_id) {
      const { data: voiceProfile } = await supabase
        .from("customer_voice_profiles")
        .select("*")
        .eq("organization_id", organization_id)
        .single();
      
      if (voiceProfile) {
        brandVoice = `Brand Voice Guidelines:
- Persona: ${JSON.stringify(voiceProfile.persona || {})}
- Style: ${voiceProfile.style_preference || "professional"}
- Content Examples: ${JSON.stringify(voiceProfile.content_examples || [])}`;
      }
    }

    // Build all variation combinations
    const combinations: { agent: string; format: string; style: string; index: number }[] = [];
    for (const agent of variations.agents) {
      for (const format of variations.formats) {
        for (const style of variations.styles) {
          for (let i = 0; i < variations.count_per_combo; i++) {
            combinations.push({ agent, format, style, index: i + 1 });
          }
        }
      }
    }

    console.log(`[ai-bulk-variations] Generating ${combinations.length} total variations`);

    // Generate variations in batches (parallel but with concurrency limit)
    const BATCH_SIZE = 5;
    const allResults: any[] = [];
    const bulkId = crypto.randomUUID();

    for (let i = 0; i < combinations.length; i += BATCH_SIZE) {
      const batch = combinations.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async ({ agent, format, style, index }) => {
        const agentPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.noah_bennett;
        const stylePrompt = STYLE_MODIFIERS[style] || "";
        const formatSpec = FORMAT_SPECS[format] || FORMAT_SPECS.reel;

        const mediaContext = sourceMedia.length > 0
          ? `Available Source Media:
${sourceMedia.map(m => `- ${m.original_filename} (${m.file_type}) - Tags: ${(m.tags || []).join(", ")}`).join("\n")}`
          : "No specific source media provided - create script-only content.";

        const inspirationContext = inspirationMedia.length > 0
          ? `Style Inspiration References:
${inspirationMedia.map(m => `- ${m.original_filename} (${m.content_category})`).join("\n")}`
          : "";

        const prompt = `${agentPrompt}

${stylePrompt}

${brandVoice}

---

Content Brief: ${brief}

${mediaContext}

${inspirationContext}

---

Create a ${format} content piece following this structure:
${formatSpec.description}
Structure: ${formatSpec.structure}

This is variation #${index} - make it unique from other variations.

Respond in JSON format:
{
  "hook": "The attention-grabbing opening line/visual description",
  "script": "Full script or content body",
  "caption": "Social media caption (if applicable)",
  "hashtags": ["relevant", "hashtags"],
  "suggested_clips": ["description of clip 1", "description of clip 2"],
  "music_vibe": "energetic/emotional/chill/dramatic",
  "cta": "Call to action text"
}`;

        try {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
              messages: [
                { role: "system", content: "You are an AI content generation assistant. Always respond with valid JSON." },
                { role: "user", content: prompt }
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ai-bulk-variations] AI API error: ${response.status} - ${errorText}`);
            throw new Error(`AI API error: ${response.status}`);
          }

          const aiData = await response.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          
          // Extract JSON from response
          let parsedContent;
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            parsedContent = jsonMatch ? JSON.parse(jsonMatch[0]) : { script: content, hook: "", caption: "" };
          } catch {
            parsedContent = { script: content, hook: "", caption: "" };
          }

          return {
            agent,
            format,
            style,
            index,
            content: parsedContent,
            success: true
          };
        } catch (error: any) {
          console.error(`[ai-bulk-variations] Failed to generate ${agent}/${format}/${style}:`, error);
          return {
            agent,
            format,
            style,
            index,
            content: null,
            success: false,
            error: error?.message || "Unknown error"
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults);

      console.log(`[ai-bulk-variations] Completed batch ${Math.ceil((i + BATCH_SIZE) / BATCH_SIZE)} of ${Math.ceil(combinations.length / BATCH_SIZE)}`);
    }

    // Insert successful variations into content_queue
    const successfulResults = allResults.filter(r => r.success && r.content);
    const queueInserts = successfulResults.map(r => ({
      organization_id,
      content_type: r.format,
      mode: "bulk",
      ai_prompt: brief,
      ai_metadata: {
        agent: r.agent,
        style: r.style,
        bulk_id: bulkId,
        variation_index: r.index,
        source_media_ids,
        inspiration_ids
      },
      script: r.content.script,
      caption: r.content.caption,
      hashtags: r.content.hashtags,
      cta_text: r.content.cta,
      media_urls: sourceMedia.map(m => m.file_url),
      status: "draft",
      title: `${r.agent} - ${r.format} - ${r.style} #${r.index}`
    }));

    if (queueInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("content_queue")
        .insert(queueInserts);

      if (insertError) {
        console.error("[ai-bulk-variations] Failed to insert to queue:", insertError);
      }
    }

    console.log(`[ai-bulk-variations] Complete: ${successfulResults.length}/${combinations.length} variations generated`);

    return new Response(JSON.stringify({
      success: true,
      bulk_id: bulkId,
      total_requested: combinations.length,
      variations_created: successfulResults.length,
      failed: combinations.length - successfulResults.length,
      items: successfulResults.map(r => ({
        agent: r.agent,
        format: r.format,
        style: r.style,
        hook: r.content.hook,
        caption: r.content.caption?.substring(0, 100) + "...",
        music_vibe: r.content.music_vibe
      }))
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("[ai-bulk-variations] Error:", error);
    return new Response(JSON.stringify({ 
      error: error?.message || "Unknown error",
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
