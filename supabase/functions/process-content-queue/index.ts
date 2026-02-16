import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get pending items from queue, ordered by priority
    const { data: queueItems, error: queueError } = await supabase
      .from('content_generation_queue')
      .select(`
        *,
        content_files (*)
      `)
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5);

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No pending items in queue' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${queueItems.length} items from queue`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const results = [];

    for (const item of queueItems) {
      const contentFile = item.content_files;
      if (!contentFile) continue;

      // Mark as processing
      await supabase
        .from('content_generation_queue')
        .update({ 
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: item.attempts + 1
        })
        .eq('id', item.id);

      try {
        // Generate content using the main content generator
        const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-social-content`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            brand: item.brand,
            content_type: 'reel',
            goal: 'sell',
            platform: 'instagram',
            media_urls: [contentFile.file_url],
            transcript: contentFile.transcript || '',
            tags: contentFile.tags || [],
            vehicle_info: contentFile.vehicle_info || {},
            additional_context: contentFile.metadata?.caption || ''
          })
        });

        if (!generateResponse.ok) {
          throw new Error(`Generation failed: ${generateResponse.status}`);
        }

        const result = await generateResponse.json();

        // Mark content file as completed
        await supabase
          .from('content_files')
          .update({ processing_status: 'completed' })
          .eq('id', contentFile.id);

        // Mark queue item as completed
        await supabase
          .from('content_generation_queue')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', item.id);

        results.push({
          file_id: contentFile.id,
          project_id: result.project_id,
          status: 'completed'
        });

      } catch (processError) {
        console.error(`Error processing item ${item.id}:`, processError);
        const errorMsg = processError instanceof Error ? processError.message : 'Unknown error';

        // Mark as failed if too many attempts
        const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
        
        await supabase
          .from('content_generation_queue')
          .update({ 
            status: newStatus,
            last_error: errorMsg
          })
          .eq('id', item.id);

        results.push({
          file_id: contentFile?.id,
          status: 'failed',
          error: errorMsg
        });
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
    console.error('Error in process-content-queue:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
