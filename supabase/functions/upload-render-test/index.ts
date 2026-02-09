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
    const { base64, filename, contentType = 'image/jpeg' } = await req.json();
    
    if (!base64 || !filename) {
      throw new Error('base64 and filename required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Decode base64 to bytes
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    // Upload to storage
    const { data, error } = await supabase.storage
      .from('render-tests')
      .upload(`test-images/${filename}`, bytes, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('render-tests')
      .getPublicUrl(`test-images/${filename}`);

    return new Response(JSON.stringify({ 
      success: true, 
      path: data.path,
      publicUrl: urlData.publicUrl 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
