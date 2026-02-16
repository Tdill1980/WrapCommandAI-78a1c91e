import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum file size: 25MB (OpenAI Whisper limit)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Check if URL is a social media video (YouTube, TikTok, Instagram)
function isSocialMediaUrl(url: string): boolean {
  const patterns = [
    /youtube\.com/i,
    /youtu\.be/i,
    /tiktok\.com/i,
    /instagram\.com/i,
    /twitter\.com/i,
    /x\.com/i,
    /vimeo\.com/i
  ];
  return patterns.some(p => p.test(url));
}

// Extract audio from social media URL using Cobalt API
async function extractSocialMediaAudio(url: string): Promise<{ audioUrl: string; filename: string }> {
  console.log('Extracting audio via Cobalt API for:', url);
  
  const response = await fetch('https://api.cobalt.tools/', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: url,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128',
      filenameStyle: 'basic'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cobalt API error:', response.status, errorText);
    throw new Error('Audio extraction service unavailable. Please try again or download manually.');
  }

  const data = await response.json();
  console.log('Cobalt response status:', data.status);
  
  if (data.status === 'error') {
    const errorMsg = data.error?.code || data.text || 'Failed to extract audio';
    console.error('Cobalt extraction error:', errorMsg);
    throw new Error(errorMsg);
  }

  // Handle tunnel/redirect responses - both contain the download URL
  if (data.status === 'tunnel' || data.status === 'redirect' || data.status === 'stream') {
    if (!data.url) {
      throw new Error('No download URL received from extraction service');
    }
    return { 
      audioUrl: data.url, 
      filename: data.filename || 'audio.mp3' 
    };
  }

  // Handle picker response (multiple options available)
  if (data.status === 'picker' && data.picker && data.picker.length > 0) {
    // Find audio option or use first available
    const audioOption = data.picker.find((p: any) => p.type === 'audio') || data.picker[0];
    if (audioOption?.url) {
      return {
        audioUrl: audioOption.url,
        filename: audioOption.filename || 'audio.mp3'
      };
    }
  }

  console.error('Unexpected Cobalt response:', JSON.stringify(data));
  throw new Error('Unexpected response from extraction service');
}

// Convert segments to SRT format
function toSRT(segments: Array<{ start: number; end: number; text: string }>): string {
  return segments.map((seg, i) => {
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    return `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`;
  }).join('\n');
}

// Convert segments to VTT format
function toVTT(segments: Array<{ start: number; end: number; text: string }>): string {
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };
  
  const cues = segments.map(seg => 
    `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}`
  ).join('\n\n');
  
  return `WEBVTT\n\n${cues}`;
}

// Decode base64 and return size info
function decodeBase64(base64String: string): { data: Blob; size: number; detectedMime: string | null } {
  // Remove data URL prefix if present
  let base64Data = base64String;
  let detectedMime: string | null = null;
  
  if (base64String.startsWith('data:')) {
    const mimeMatch = base64String.match(/^data:([^;]+);/);
    if (mimeMatch) {
      detectedMime = mimeMatch[1];
    }
    const commaIndex = base64String.indexOf(',');
    if (commaIndex !== -1) {
      base64Data = base64String.substring(commaIndex + 1);
    }
  }
  
  // Use Deno's built-in base64 decoding
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Create blob from the array buffer directly
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: detectedMime || 'audio/webm' });
  
  return { data: blob, size: binaryString.length, detectedMime };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { 
      youtube_url, 
      video_url,
      audio_base64,
      include_timestamps = true,
      output_format = 'json',
      language
    } = requestBody;
    
    console.log('Video transcribe request:', { 
      youtube_url: youtube_url ? 'provided' : 'none',
      video_url: video_url ? 'provided' : 'none', 
      audio_base64: audio_base64 ? `provided (${Math.round((audio_base64?.length || 0) / 1024)}KB base64)` : 'none',
      include_timestamps,
      output_format 
    });

    let audioBlob: Blob;
    let mimeType = 'audio/webm';
    let fileName = 'audio.mp4';

    // Handle YouTube/Social Media URLs - extract audio via Cobalt
    if (youtube_url) {
      const videoId = extractYouTubeVideoId(youtube_url);
      console.log('YouTube video ID:', videoId);
      
      try {
        // Step 1: Get audio download URL from Cobalt
        const { audioUrl, filename } = await extractSocialMediaAudio(youtube_url);
        console.log('Audio URL obtained, downloading...');
        
        // Step 2: Download the audio file
        const audioResponse = await fetch(audioUrl, {
          headers: {
            'Accept': 'audio/*',
            'User-Agent': 'Mozilla/5.0 (compatible; VideoTranscriber/1.0)'
          }
        });
        
        if (!audioResponse.ok) {
          throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }
        
        const contentLength = audioResponse.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          throw new Error(`Video audio is too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Maximum is 25MB. Try a shorter video.`);
        }
        
        const audioBuffer = await audioResponse.arrayBuffer();
        if (audioBuffer.byteLength > MAX_FILE_SIZE) {
          throw new Error('Audio file exceeds 25MB limit. Try a shorter video.');
        }
        
        audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' });
        mimeType = 'audio/mp3';
        fileName = filename || 'audio.mp3';
        
        console.log('YouTube audio downloaded, size:', audioBuffer.byteLength);
        
      } catch (extractError) {
        // Fallback: Return helpful error if extraction fails
        console.error('YouTube extraction failed:', extractError);
        return new Response(
          JSON.stringify({
            error: 'youtube_extraction_failed',
            message: extractError instanceof Error 
              ? extractError.message 
              : 'Could not extract audio from YouTube. Please download the audio manually and upload it.',
            video_id: videoId,
            suggestion: 'Use a YouTube to MP3 converter, then upload the file directly.',
            fallback_urls: [
              'https://cobalt.tools/',
              'https://y2mate.com/',
              'https://ytmp3.cc/'
            ]
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    // Handle direct video URL - check if it's social media first
    else if (video_url) {
      // Check if this is a social media URL that needs extraction
      if (isSocialMediaUrl(video_url)) {
        console.log('Social media URL detected, extracting audio...');
        
        try {
          const { audioUrl, filename } = await extractSocialMediaAudio(video_url);
          console.log('Audio URL obtained, downloading...');
          
          const audioResponse = await fetch(audioUrl, {
            headers: {
              'Accept': 'audio/*',
              'User-Agent': 'Mozilla/5.0 (compatible; VideoTranscriber/1.0)'
            }
          });
          
          if (!audioResponse.ok) {
            throw new Error(`Failed to download audio: ${audioResponse.status}`);
          }
          
          const contentLength = audioResponse.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
            throw new Error(`Audio is too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Maximum is 25MB.`);
          }
          
          const audioBuffer = await audioResponse.arrayBuffer();
          if (audioBuffer.byteLength > MAX_FILE_SIZE) {
            throw new Error('Audio file exceeds 25MB limit.');
          }
          
          audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' });
          mimeType = 'audio/mp3';
          fileName = filename || 'audio.mp3';
          
          console.log('Social media audio downloaded, size:', audioBuffer.byteLength);
          
        } catch (extractError) {
          console.error('Social media extraction failed:', extractError);
          return new Response(
            JSON.stringify({
              error: 'extraction_failed',
              message: extractError instanceof Error 
                ? extractError.message 
                : 'Could not extract audio. Please download manually and upload.',
              suggestion: 'Use cobalt.tools to download the audio, then upload it here.',
              fallback_urls: ['https://cobalt.tools/']
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
      } else {
        // Direct video URL - download and process
        console.log('Fetching video from URL:', video_url);
        
        const videoResponse = await fetch(video_url, {
          headers: {
            'Accept': 'audio/*, video/*',
          }
        });
        
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }
        
        const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
        const contentLength = videoResponse.headers.get('content-length');
        
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          throw new Error(`File too large. Maximum size is 25MB for transcription. Your file is ${Math.round(parseInt(contentLength) / 1024 / 1024)}MB.`);
        }
        
        const videoBuffer = await videoResponse.arrayBuffer();
        
        if (videoBuffer.byteLength > MAX_FILE_SIZE) {
          throw new Error(`File too large. Maximum size is 25MB for transcription.`);
        }
        
        audioBlob = new Blob([videoBuffer], { type: contentType });
        mimeType = contentType;
        
        const extension = contentType.split('/')[1]?.split(';')[0] || 'mp4';
        fileName = `audio.${extension}`;
        
        console.log('Video fetched, size:', videoBuffer.byteLength, 'type:', contentType);
      }
    }
    // Handle base64 encoded audio
    else if (audio_base64) {
      console.log('Processing base64 audio...');
      
      // Check approximate decoded size (base64 is ~33% larger than binary)
      const estimatedSize = Math.floor(audio_base64.length * 0.75);
      if (estimatedSize > MAX_FILE_SIZE) {
        throw new Error(`File too large. Maximum size is 25MB for transcription. Your file is approximately ${Math.round(estimatedSize / 1024 / 1024)}MB.`);
      }
      
      // Decode base64
      const decoded = decodeBase64(audio_base64);
      
      if (decoded.size > MAX_FILE_SIZE) {
        throw new Error(`File too large. Maximum size is 25MB for transcription.`);
      }
      
      // Use detected mime type or default
      mimeType = decoded.detectedMime || 'audio/webm';
      audioBlob = decoded.data;
      
      // Determine file extension
      const extension = mimeType.split('/')[1]?.split(';')[0] || 'mp4';
      fileName = `audio.${extension}`;
      
      console.log('Audio blob created, size:', decoded.size, 'type:', mimeType);
    }
    else {
      throw new Error('No video source provided. Please provide youtube_url, video_url, or audio_base64');
    }

    // Get Gemini API key
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Convert blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const audioBase64 = btoa(binary);

    console.log('Sending to Gemini for transcription...');

    const transcriptionPrompt = include_timestamps
      ? `Transcribe this audio with timestamps. Return a JSON object with this structure:
{
  "text": "full transcription text",
  "segments": [
    {"start": 0.0, "end": 2.5, "text": "segment text"},
    ...
  ]
}
Return ONLY the JSON, no markdown.`
      : `Transcribe this audio. Return ONLY the transcription text, nothing else.`;

    // Send to Lovable Gateway
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: transcriptionPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${audioBase64}` } }
            ]
          }]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable API error:', errorText);
      throw new Error(`Transcription failed: ${errorText}`);
    }

    const lovableResult = await response.json();
    const textContent = lovableResult?.choices?.[0]?.message?.content || "";
    console.log('Transcription complete');

    // Parse result based on whether timestamps were requested
    let result: any = { text: textContent };
    if (include_timestamps) {
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('Could not parse timestamps, using plain text');
        result = { text: textContent, segments: [] };
      }
    }

    // Format the response based on output_format
    const segments = result.segments?.map((seg: any) => ({
      start: seg.start || 0,
      end: seg.end || 0,
      text: seg.text || ""
    })) || [];

    let formattedOutput: string | undefined;
    if (output_format === 'srt') {
      formattedOutput = toSRT(segments);
    } else if (output_format === 'vtt') {
      formattedOutput = toVTT(segments);
    } else if (output_format === 'text') {
      formattedOutput = result.text;
    }

    const responseData = {
      transcript: result.text,
      segments: include_timestamps ? segments : undefined,
      duration_seconds: result.duration,
      language: result.language,
      word_count: result.text?.split(/\s+/).length || 0,
      formatted_output: formattedOutput
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in video-transcribe function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Failed to transcribe video. Please try again with a smaller file (max 25MB).'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});