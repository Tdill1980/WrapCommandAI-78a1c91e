import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, mime_type } = await req.json();

    if (!audio) {
      throw new Error('No audio data provided');
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // The browser MediaRecorder records webm/opus by default. Gemini's audio
    // understanding accepts it via native inline_data (audio/webm|ogg). The old
    // build sent audio through the `image_url` field on the OpenAI-compat route,
    // which does not decode audio — that's why transcription silently failed.
    const audioMime = typeof mime_type === 'string' && mime_type.startsWith('audio/')
      ? mime_type
      : 'audio/webm';

    console.log(`Processing audio transcription (${audioMime})...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: "Transcribe this audio to plain text. Return ONLY the spoken words, nothing else. If there is no discernible speech, return an empty string." },
              { inline_data: { mime_type: audioMime, data: audio } }
            ]
          }],
          generationConfig: { temperature: 0 }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${errorText}`);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("").trim() || "";
    console.log('Transcription successful:', text);

    return new Response(
      JSON.stringify({ text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transcribe-audio function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
