import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANALYSIS_PROMPT = `You are an expert content analyzer for the vehicle wrap industry.

Analyze the provided content and extract structured data.

Return a JSON object with:
{
  "vehicle": {
    "year": "string or null",
    "make": "string or null", 
    "model": "string or null"
  },
  "wrap_type": "full wrap | partial wrap | accent | commercial | fleet | color change | printed | chrome | ppf",
  "editing_style": "professional | amateur | cinematic | raw | polished",
  "energy": "high | medium | low | calm | hype",
  "colors": ["primary colors visible"],
  "hooks": ["3 potential scroll-stopping hooks based on content"],
  "quality_score": 1-10,
  "best_use": "wpw_ad | wraptv_reel | inkandedge_editorial | ugc | tutorial",
  "content_type": "reveal | before_after | process | finished | broll | interview | tutorial",
  "suggested_tags": ["relevant tags for categorization"]
}

Be accurate. If information is not visible, use null.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Get pending analysis items
    const { data: items, error: fetchError } = await supabase
      .from("content_generation_queue")
      .select("*, content_files(*)")
      .eq("generation_type", "analysis")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .limit(5);

    if (fetchError) throw fetchError;

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No pending content for analysis" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${items.length} items for analysis`);

    const results = [];

    for (const item of items) {
      const file = item.content_files;
      if (!file) continue;

      // Mark as processing
      await supabase
        .from("content_generation_queue")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", item.id);

      try {
        const userContent = `Analyze this wrap content:
URL: ${file.file_url}
Caption: ${file.metadata?.caption || 'No caption'}
File Type: ${file.file_type}
Brand Context: ${file.brand}`;

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              { role: "system", content: ANALYSIS_PROMPT },
              { role: "user", content: userContent }
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`AI API error: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.choices?.[0]?.message?.content;

        let analysis;
        try {
          const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/) || 
                            aiResponse.match(/```\n?([\s\S]*?)\n?```/);
          const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse;
          analysis = JSON.parse(jsonStr.trim());
        } catch {
          analysis = { raw_response: aiResponse };
        }

        // Update content file with analysis
        await supabase
          .from("content_files")
          .update({
            ai_labels: analysis,
            tags: [...(file.tags || []), ...(analysis.suggested_tags || [])],
            processing_status: 'analyzed'
          })
          .eq("id", file.id);

        // Mark queue item as completed
        await supabase
          .from("content_generation_queue")
          .update({ 
            status: "completed", 
            completed_at: new Date().toISOString() 
          })
          .eq("id", item.id);

        results.push({ id: file.id, success: true, analysis });

      } catch (analysisError) {
        console.error(`Analysis failed for ${file.id}:`, analysisError);
        
        await supabase
          .from("content_generation_queue")
          .update({ 
            status: "failed", 
            last_error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
            attempts: (item.attempts || 0) + 1
          })
          .eq("id", item.id);

        results.push({ id: file.id, success: false, error: analysisError });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in content-analysis:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
