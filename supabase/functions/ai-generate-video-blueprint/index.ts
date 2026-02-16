import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_KEY = Deno.env.get("GEMINI_API_KEY")!;

/**
 * ai-generate-video-blueprint
 * 
 * Platform-aware video edit blueprint generator.
 * Takes platform, goal, brand tone, and available clips.
 * Returns structured JSON blueprint for Creatomate rendering.
 * 
 * This replaces generic reel creation with platform-specific editing decisions.
 */

interface VideoBlueprint {
  platform: string;
  aspect_ratio: string;
  video_goal: string;
  platform_rules_applied: boolean;
  music_energy: string;
  total_duration_seconds: number;
  scenes: Scene[];
  end_card: EndCard;
}

interface Scene {
  scene_number: number;
  duration_seconds: number;
  source_type: "user_clip" | "stock" | "broll";
  source_reference: string;
  editor_intent: string;
  hook_type: string;
  text_overlay: string;
  max_words: number;
  text_position: "center" | "top" | "bottom" | "left" | "right";
  text_animation: "pop" | "slide_up" | "slide_left" | "fade" | "punch";
  cut_reason: "hook" | "pattern_interrupt" | "proof" | "authority" | "payoff";
  emotion: string;
}

interface EndCard {
  duration_seconds: number;
  text: string;
  cta: string;
}

interface AvailableClip {
  id: string;
  file_url: string;
  filename: string;
  duration_seconds: number;
  tags: string[];
  category: string;
  thumbnail_url?: string;
}

// Creative context from task/calendar (THE INTENT)
interface CreativeContext {
  task_title?: string;
  task_description?: string;
  calendar_title?: string;
  calendar_caption?: string;
  platform?: string;
  brand?: string;
}

/**
 * Resolve overlay text from creative context
 * Priority: calendar_caption > task_title/description > platform default
 */
function resolveOverlayText(sceneIndex: number, context: CreativeContext): string | null {
  // 1️⃣ Highest priority — explicit calendar caption (split by line/sentence)
  if (context.calendar_caption) {
    const lines = context.calendar_caption
      .split(/[\n\.]/)
      .map(l => l.trim())
      .filter(Boolean);
    return lines[sceneIndex] ?? lines[0] ?? null;
  }

  // 2️⃣ Task title / description
  if (context.task_title || context.task_description) {
    if (sceneIndex === 0 && context.task_title) {
      return context.task_title;
    }
    if (context.task_description) {
      const phrases = context.task_description
        .split(/[\n\.]/)
        .map(l => l.trim())
        .filter(Boolean);
      return phrases[sceneIndex - 1] ?? phrases[0] ?? null;
    }
  }

  // 3️⃣ Fallback (platform generic)
  if (context.platform === "instagram") return "Tap to see the difference";
  if (context.platform === "tiktok") return "Watch closely";
  if (context.platform === "youtube") return "Watch this transformation";

  return null;
}

// Platform-specific rules
const PLATFORM_RULES: Record<string, string> = {
  instagram: `IF platform = "Instagram Reels":
• Total duration: 6–12 seconds
• Scene count: 3–5
• Hook must be visual + text in first 0.8 seconds
• Fast cuts, high contrast text
• Emotion: urgency or curiosity
• CTA must feel native, not salesy
• Aspect ratio: 9:16`,

  tiktok: `IF platform = "TikTok":
• Total duration: 7–15 seconds
• Scene count: 4–7
• First scene must feel conversational or disruptive
• Text feels reactive, imperfect, human
• Pattern interrupt every 1.5–2.5 seconds
• Emotion: surprise or relatability
• Aspect ratio: 9:16`,

  youtube: `IF platform = "YouTube Shorts":
• Total duration: 10–20 seconds
• Scene count: 4–6
• Clear narrative arc (setup → insight → payoff)
• Text supports spoken content
• Slower pacing than Reels/TikTok
• Emotion: confidence or authority
• Aspect ratio: 9:16`,

  facebook: `IF platform = "Facebook Reels":
• Total duration: 8–15 seconds
• Scene count: 3–5
• Hook must grab attention in first 1 second
• Clear value proposition early
• Emotion: trust or curiosity
• CTA can be more direct
• Aspect ratio: 9:16`,
};

const SYSTEM_PROMPT = `You are a senior short-form video editor and performance creative.

You do NOT create templates.
You do NOT reuse layouts.
You do NOT repeat scene structures.

Your job is to generate a PLATFORM-SPECIFIC video edit blueprint
that plugs directly into an existing Creatomate rendering system.

You think in pacing, hooks, retention, and emotional beats.

–––––––––––––––––––––––––––––
CRITICAL OUTPUT RULES
–––––––––––––––––––––––––––––

• Output VALID JSON ONLY
• No markdown
• No commentary
• No explanations
• No Creatomate template IDs
• No fixed layouts

–––––––––––––––––––––––––––––
JSON OUTPUT SCHEMA (REQUIRED)
–––––––––––––––––––––––––––––

{
  "platform": "",
  "aspect_ratio": "",
  "video_goal": "",
  "platform_rules_applied": true,
  "music_energy": "",
  "total_duration_seconds": 0,
  "scenes": [
    {
      "scene_number": 1,
      "duration_seconds": 0,
      "source_type": "user_clip | stock | broll",
      "source_reference": "",
      "editor_intent": "",
      "hook_type": "",
      "text_overlay": "",
      "max_words": 6,
      "text_position": "center | top | bottom | left | right",
      "text_animation": "pop | slide_up | slide_left | fade | punch",
      "cut_reason": "hook | pattern_interrupt | proof | authority | payoff",
      "emotion": ""
    }
  ],
  "end_card": {
    "duration_seconds": 0,
    "text": "",
    "cta": ""
  }
}

–––––––––––––––––––––––––––––
EDITORIAL INTELLIGENCE RULES
–––––––––––––––––––––––––––––

• Scene 1 MUST hook attention immediately
• Each scene must serve a DIFFERENT purpose
• No repeated text phrasing
• No repeated animation patterns
• Vary text placement across scenes
• Assume viewer is scrolling aggressively
• Cut scenes BEFORE they feel finished

–––––––––––––––––––––––––––––
CREATIVE CONSTRAINTS
–––––––––––––––––––––––––––––

You are NOT allowed to:
• Reuse scene layouts
• Output generic marketing slogans
• Create symmetrical scene timing
• Create "Canva-style" videos
• Repeat animation sequences

–––––––––––––––––––––––––––––
FINAL DIRECTIVE
–––––––––––––––––––––––––––––

Think like a real editor.
Design the cut before the render.
Creatomate only executes your decisions.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[ai-generate-video-blueprint] ====== FUNCTION INVOKED ======");

  try {
    const { 
      platform,
      goal,
      brand_tone,
      available_clips,
      organization_id,
      content_calendar_id,
      task_id,
      creative_context = {} as CreativeContext, // ✅ ACCEPT INTENT
    } = await req.json();

    console.log("[ai-generate-video-blueprint] Inputs:", {
      platform, goal, brand_tone, 
      clips_count: available_clips?.length || 0,
      organization_id, content_calendar_id, task_id,
      has_creative_context: !!creative_context.task_title || !!creative_context.calendar_caption
    });
    
    console.log("[ai-generate-video-blueprint] Creative context:", creative_context);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine platform rules
    const platformKey = (platform || "instagram").toLowerCase();
    const platformRule = PLATFORM_RULES[platformKey] || PLATFORM_RULES.instagram;

    // Build clips context
    let clipsContext = "";
    let clips: AvailableClip[] = available_clips || [];

    // If no clips provided, fetch from ContentBox
    if (!clips.length && organization_id) {
      console.log("[ai-generate-video-blueprint] Fetching clips from ContentBox...");
      
      const { data: contentFiles } = await supabase
        .from("content_files")
        .select("id, file_url, original_filename, duration_seconds, tags, content_category, thumbnail_url")
        .eq("organization_id", organization_id)
        .eq("file_type", "video")
        .order("created_at", { ascending: false })
        .limit(20);

      if (contentFiles && contentFiles.length > 0) {
        clips = contentFiles.map((f: any) => ({
          id: f.id,
          file_url: f.file_url,
          filename: f.original_filename || "Untitled",
          duration_seconds: f.duration_seconds || 10,
          tags: f.tags || [],
          category: f.content_category || "raw",
          thumbnail_url: f.thumbnail_url
        }));
        console.log(`[ai-generate-video-blueprint] Found ${clips.length} clips`);
      }
    }

    if (clips.length > 0) {
      clipsContext = `
AVAILABLE CLIPS (use source_reference = clip ID):
${clips.map((c, i) => `${i + 1}. ID: ${c.id}
   - Filename: ${c.filename}
   - Duration: ${c.duration_seconds}s
   - Tags: ${c.tags.join(", ") || "none"}
   - Category: ${c.category}`).join("\n\n")}

Select the BEST clips for this platform and goal. Use their IDs as source_reference.`;
    }

    // Build the full prompt
    const userPrompt = `Generate a video blueprint for:

PLATFORM: ${platform || "Instagram Reels"}
GOAL: ${goal || "engagement"}
BRAND TONE: ${brand_tone || "professional but approachable"}

${platformRule}

${clipsContext}

Return ONLY valid JSON matching the schema. No explanations.`;

    console.log("[ai-generate-video-blueprint] Calling AI...");

    // Call AI to generate blueprint
    const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error("[ai-generate-video-blueprint] AI error:", aiRes.status, errorText);
      
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error(`AI error: ${errorText}`);
    }

    const aiJson = await aiRes.json();
    const content = aiJson.choices?.[0]?.message?.content || "{}";

    // Parse the blueprint JSON
    let blueprint: VideoBlueprint;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      blueprint = JSON.parse(jsonMatch?.[0] ?? "{}");
    } catch (parseErr) {
      console.error("[ai-generate-video-blueprint] Failed to parse:", content);
      throw new Error("Failed to parse AI blueprint response");
    }

    console.log("[ai-generate-video-blueprint] Blueprint generated:", {
      platform: blueprint.platform,
      scenes: blueprint.scenes?.length || 0,
      duration: blueprint.total_duration_seconds
    });

    // Enrich scenes with actual clip URLs AND apply intent-aware overlays
    const enrichedScenes = (blueprint.scenes || []).map((scene: any, index: number) => {
      const clip = clips.find(c => c.id === scene.source_reference);
      
      // ✅ APPLY INTENT-AWARE OVERLAY TEXT (prioritize creative context)
      const intentOverlay = resolveOverlayText(index, creative_context);
      
      return {
        ...scene,
        file_url: clip?.file_url || null,
        thumbnail_url: clip?.thumbnail_url || null,
        original_filename: clip?.filename || null,
        // Use intent overlay if available, otherwise keep AI-generated
        text_overlay: intentOverlay || scene.text_overlay || null,
        text: intentOverlay || scene.text_overlay || null, // Also set 'text' for compatibility
      };
    });

    const enrichedBlueprint = {
      ...blueprint,
      scenes: enrichedScenes,
      clips_available: clips.length,
      creative_context, // ✅ PRESERVE INTENT IN OUTPUT
      generated_at: new Date().toISOString()
    };

    console.log("[ai-generate-video-blueprint] ====== SUCCESS ======");

    return new Response(JSON.stringify(enrichedBlueprint), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[ai-generate-video-blueprint] FATAL ERROR:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
