// Check Artwork File Edge Function
// Hybrid AI pre-check + human design team review
// Provides preliminary file analysis and routes to Ops Desk

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// File quality assessment based on type and size
function assessFileQuality(fileName: string, fileType: string, fileSize: number): {
  score: number;
  fileTypeOk: boolean;
  quickIssues: string[];
  fileTypeLabel: string;
  sizeAssessment: string;
} {
  const quickIssues: string[] = [];
  let score = 5; // Start at neutral
  let fileTypeOk = true;
  let fileTypeLabel = 'Unknown';
  let sizeAssessment = '';

  // Assess file type
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const mimeType = fileType.toLowerCase();

  if (ext === 'pdf' || mimeType.includes('pdf')) {
    fileTypeLabel = 'PDF';
    score += 2;
    // PDFs are great - vector, scalable
  } else if (ext === 'ai' || mimeType.includes('illustrator')) {
    fileTypeLabel = 'Adobe Illustrator';
    score += 2;
    // AI files are ideal
  } else if (ext === 'eps' || mimeType.includes('eps') || mimeType.includes('postscript')) {
    fileTypeLabel = 'EPS Vector';
    score += 2;
  } else if (ext === 'psd' || mimeType.includes('photoshop')) {
    fileTypeLabel = 'Photoshop';
    score += 1;
    quickIssues.push('Photoshop files work, but vector formats (PDF, AI) are preferred for wraps');
  } else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.includes('image')) {
    fileTypeLabel = ext.toUpperCase() || 'Image';
    // Raster images - need to check resolution
    if (fileSize > 10 * 1024 * 1024) {
      // Over 10MB - likely high resolution
      score += 1;
      sizeAssessment = 'Large file size suggests good resolution';
    } else if (fileSize > 5 * 1024 * 1024) {
      // 5-10MB - probably okay
      sizeAssessment = 'File size is moderate - resolution may be acceptable';
    } else if (fileSize > 1 * 1024 * 1024) {
      // 1-5MB - might be okay for smaller areas
      score -= 1;
      sizeAssessment = 'File size is small - resolution may need verification';
      quickIssues.push('Image may need higher resolution for large format printing (100+ DPI at full size)');
    } else {
      // Under 1MB - likely too low resolution
      score -= 2;
      sizeAssessment = 'File size is very small - likely too low resolution';
      quickIssues.push('Image appears to be low resolution - may not be suitable for vehicle wrap printing');
    }
  } else if (['tif', 'tiff'].includes(ext) || mimeType.includes('tiff')) {
    fileTypeLabel = 'TIFF';
    score += 1;
    // TIFFs are usually high quality
  } else {
    fileTypeLabel = ext.toUpperCase() || 'Unknown Format';
    fileTypeOk = false;
    score -= 2;
    quickIssues.push(`Unusual file format (${ext}) - our design team will verify compatibility`);
  }

  // Size assessment for vector files
  if (['pdf', 'ai', 'eps'].includes(ext)) {
    if (fileSize < 100 * 1024) {
      // Under 100KB for vector - might just be text/simple shapes
      quickIssues.push('Vector file is very small - may be simple shapes or placeholder');
    }
    sizeAssessment = 'Vector format - scales to any size';
  }

  // Cap score between 1-10
  score = Math.max(1, Math.min(10, score));

  return {
    score,
    fileTypeOk,
    quickIssues,
    fileTypeLabel,
    sizeAssessment
  };
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      session_id,
      file_url,
      file_name,
      file_type,
      file_size,
      customer_email,
      vehicle_info,
      customer_confirmed_full_wrap,
      geo_data
    } = body;

    console.log('[CheckArtwork] Received:', { 
      session_id, 
      file_name, 
      file_type, 
      file_size: formatFileSize(file_size || 0),
      customer_email,
      vehicle_info,
      confirmed: customer_confirmed_full_wrap
    });

    // Validate required fields
    if (!file_url || !file_name || !session_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: file_url, file_name, session_id' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Validate customer confirmed full wrap
    if (!customer_confirmed_full_wrap) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Customer must confirm this is a full wrap over 200 sq ft' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Perform AI pre-check (file analysis based on metadata)
    const assessment = assessFileQuality(file_name, file_type || '', file_size || 0);
    
    console.log('[CheckArtwork] Assessment:', assessment);

    // Create ai_actions record for Ops Desk
    const { data: actionRecord, error: actionError } = await supabase
      .from('ai_actions')
      .insert({
        action_type: 'artwork_review',
        organization_id: '031ac427-f078-4086-a9bc-7bdb78cc1c73', // WePrintWraps — required NOT NULL col
        priority: 'high',
        resolved: false,
        action_payload: {
          file_url,
          file_name,
          file_type: file_type || 'unknown',
          file_size: file_size || 0,
          file_size_formatted: formatFileSize(file_size || 0),
          customer_email: customer_email || null,
          vehicle_info: vehicle_info || null,
          session_id,
          geo_data: geo_data || null,
          submitted_at: new Date().toISOString(),
          ai_precheck: {
            preliminary_score: assessment.score,
            quick_issues: assessment.quickIssues,
            file_type_ok: assessment.fileTypeOk,
            file_type_label: assessment.fileTypeLabel,
            size_assessment: assessment.sizeAssessment
          },
          response_options: ['design_fee', 'wrap_quote'],
          needs_response: true,
          summary: `Artwork review: ${file_name} (${formatFileSize(file_size || 0)}) - Score: ${assessment.score}/10`
        }
      })
      .select()
      .single();

    if (actionError) {
      console.error('[CheckArtwork] Failed to create ai_action:', actionError);
    } else {
      console.log('[CheckArtwork] Created ai_action:', actionRecord?.id);
    }

    // Send email notification to design team
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        
        const vehicleStr = vehicle_info 
          ? `${vehicle_info.year || ''} ${vehicle_info.make || ''} ${vehicle_info.model || ''}`.trim()
          : 'Not provided';
        const sqftStr = vehicle_info?.sqft ? `${vehicle_info.sqft} sq ft` : '';
        const locationStr = geo_data 
          ? `${geo_data.city || ''}, ${geo_data.region || ''}`.replace(/^, |, $/g, '')
          : 'Unknown';

        const issuesHtml = assessment.quickIssues.length > 0
          ? `<ul style="margin:8px 0;padding-left:20px;">${assessment.quickIssues.map(i => `<li style="color:#666;">${i}</li>`).join('')}</ul>`
          : '<p style="color:#22c55e;margin:8px 0;">✓ No immediate issues detected</p>';

        const emailHtml = `
          <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="background:linear-gradient(135deg,#e6007e,#ff4d94);padding:20px;border-radius:12px 12px 0 0;">
              <h1 style="color:white;margin:0;font-size:20px;">📎 New Artwork for Review</h1>
            </div>
            <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;">
              <p style="margin:0 0 16px;color:#374151;">Customer submitted artwork for print-ready review.</p>
              
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;width:140px;">📧 Customer Email:</td>
                  <td style="padding:8px 0;color:#111827;font-weight:500;">${customer_email || 'Not provided yet'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;">🚗 Vehicle:</td>
                  <td style="padding:8px 0;color:#111827;">${vehicleStr}${sqftStr ? ` (${sqftStr})` : ''}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;">📍 Location:</td>
                  <td style="padding:8px 0;color:#111827;">${locationStr}</td>
                </tr>
              </table>

              <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px;">
                <h3 style="margin:0 0 8px;font-size:14px;color:#374151;">📁 File Details</h3>
                <p style="margin:0;"><strong>${file_name}</strong></p>
                <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">
                  ${assessment.fileTypeLabel} • ${formatFileSize(file_size || 0)}
                </p>
              </div>

              <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:16px;">
                <h3 style="margin:0 0 8px;font-size:14px;color:#92400e;">🤖 AI Pre-Check (Score: ${assessment.score}/10)</h3>
                ${issuesHtml}
                ${assessment.sizeAssessment ? `<p style="color:#666;font-size:13px;margin:8px 0 0;">${assessment.sizeAssessment}</p>` : ''}
              </div>

              <div style="text-align:center;margin:20px 0;">
                <a href="${file_url}" style="display:inline-block;background:#e6007e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:10px;">
                  📥 Download File
                </a>
              </div>

              <div style="background:#f1f5f9;border-radius:8px;padding:12px;margin-top:16px;">
                <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">
                  <strong>Response Options:</strong><br/>
                  1. If print-ready → Send wrap quote<br/>
                  2. If needs work → Send design services link ($75+)
                </p>
              </div>
            </div>
            <div style="padding:12px;text-align:center;color:#94a3b8;font-size:12px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
              WrapCommand AI • Artwork Review System
            </div>
          </div>
        `;

        await resend.emails.send({
          from: 'WePrintWraps <hello@weprintwraps.com>',
          to: ['jackson@weprintwraps.com', 'Design@WePrintWraps.com'],
          cc: ['Trish@WePrintWraps.com'],
          subject: `📎 [ARTWORK CHECK] ${file_name} - Customer Upload`,
          html: emailHtml
        });

        console.log('[CheckArtwork] Email sent to design team');
      } catch (emailErr) {
        console.error('[CheckArtwork] Email send failed:', emailErr);
      }
    }

    // Build response message for Jordan to display
    const scoreEmoji = assessment.score >= 7 ? '✓' : assessment.score >= 4 ? '⚠️' : '❌';
    const fileTypeStatus = assessment.fileTypeOk ? '✓' : '⚠️';

    // Return preliminary check results
    return new Response(
      JSON.stringify({
        success: true,
        action_id: actionRecord?.id || null,
        ...(body.debug ? { insert_error: actionError?.message || actionError || null } : {}),
        preliminary_check: {
          score: assessment.score,
          score_emoji: scoreEmoji,
          file_type_ok: assessment.fileTypeOk,
          file_type_label: assessment.fileTypeLabel,
          file_type_status: fileTypeStatus,
          quick_issues: assessment.quickIssues,
          size_assessment: assessment.sizeAssessment,
          file_size_formatted: formatFileSize(file_size || 0)
        },
        message: `Got your file! Here's a quick preliminary check:\n\n📊 Quick Analysis:\n• File type: ${assessment.fileTypeLabel} ${fileTypeStatus}\n• File size: ${formatFileSize(file_size || 0)}${assessment.sizeAssessment ? ` (${assessment.sizeAssessment.toLowerCase()})` : ''}\n${assessment.quickIssues.length > 0 ? '\n⚠️ Notes:\n' + assessment.quickIssues.map(i => '• ' + i).join('\n') : ''}\n\n⚠️ This is a PRELIMINARY check only. It does NOT guarantee your file is print-ready.\n\nOur design team will do a full review and email you with:\n• Detailed print-ready analysis\n• Quote for your wrap project\n• Design services options if needed\n\n💡 For instant sq ft pricing on your vehicle, use our quote tool at weprintwraps.com/quote - just select your make & model!`,
        next_steps: 'Design team will review and email you with detailed analysis and quote.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[CheckArtwork] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
