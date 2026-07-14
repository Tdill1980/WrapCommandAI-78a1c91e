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

// =========================================================================
// REAL file analysis — actually fetch the bytes and parse true dimensions,
// embedded DPI, color space, and vector/raster (not guessing from the name).
// =========================================================================
interface RealAnalysis {
  format: string;
  parsed: boolean;
  is_vector: boolean;
  width_px?: number;
  height_px?: number;
  embedded_dpi?: number;
  color_space?: "RGB" | "CMYK" | "Grayscale" | "unknown";
  page_w_in?: number;
  page_h_in?: number;
}
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];

function parsePNG(b: Uint8Array): RealAnalysis {
  const width = u32be(b, 16), height = u32be(b, 20), colorType = b[25];
  let dpi: number | undefined;
  for (let i = 8; i < b.length - 12;) {
    const len = u32be(b, i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    if (type === "pHYs") { const ppuX = u32be(b, i + 8); if (b[i + 16] === 1) dpi = Math.round(ppuX * 0.0254); break; }
    if (type === "IDAT") break;
    i += 12 + len;
    if (len < 0) break;
  }
  return { format: "PNG", parsed: true, is_vector: false, width_px: width, height_px: height, embedded_dpi: dpi, color_space: (colorType === 0 || colorType === 4) ? "Grayscale" : "RGB" };
}

function parseJPEG(b: Uint8Array): RealAnalysis {
  let w: number | undefined, h: number | undefined, comps: number | undefined, dpi: number | undefined;
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    const len = u16be(b, i + 2);
    if (marker === 0xE0 && b[i + 4] === 0x4A && b[i + 5] === 0x46) { // APP0 JFIF
      const units = b[i + 11], xd = u16be(b, i + 12);
      if (units === 1) dpi = xd; else if (units === 2) dpi = Math.round(xd * 2.54);
    }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) { // SOF
      h = u16be(b, i + 5); w = u16be(b, i + 7); comps = b[i + 9];
    }
    if (marker === 0xDA) break; // SOS
    i += 2 + len;
  }
  return { format: "JPEG", parsed: !!w, is_vector: false, width_px: w, height_px: h, embedded_dpi: dpi, color_space: comps === 4 ? "CMYK" : comps === 1 ? "Grayscale" : "RGB" };
}

function parseTIFF(b: Uint8Array): RealAnalysis {
  const le = b[0] === 0x49;
  const r16 = (o: number) => le ? (b[o] | (b[o + 1] << 8)) : ((b[o] << 8) | b[o + 1]);
  const r32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
  const ifd = r32(4), n = r16(ifd);
  let w: number | undefined, h: number | undefined, photo: number | undefined, xres: number | undefined, resunit = 2;
  for (let e = 0; e < n && ifd + 2 + e * 12 + 12 < b.length; e++) {
    const o = ifd + 2 + e * 12, tag = r16(o), val = r32(o + 8);
    if (tag === 256) w = val; else if (tag === 257) h = val; else if (tag === 262) photo = val;
    else if (tag === 296) resunit = val; else if (tag === 282 && val + 8 < b.length) { const num = r32(val), den = r32(val + 4) || 1; xres = num / den; }
  }
  const dpi = xres ? (resunit === 3 ? Math.round(xres * 2.54) : Math.round(xres)) : undefined;
  return { format: "TIFF", parsed: !!w, is_vector: false, width_px: w, height_px: h, embedded_dpi: dpi, color_space: photo === 5 ? "CMYK" : (photo === 2 || photo === 6) ? "RGB" : (photo === 0 || photo === 1) ? "Grayscale" : "unknown" };
}

function parsePDF(b: Uint8Array): RealAnalysis {
  const txt = new TextDecoder("latin1").decode(b.subarray(0, Math.min(b.length, 300000)));
  const m = txt.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
  let pw: number | undefined, ph: number | undefined;
  if (m) { pw = (parseFloat(m[3]) - parseFloat(m[1])) / 72; ph = (parseFloat(m[4]) - parseFloat(m[2])) / 72; }
  return { format: "PDF", parsed: true, is_vector: true, page_w_in: pw, page_h_in: ph, color_space: "unknown" };
}

async function analyzeRealFile(fileUrl: string): Promise<RealAnalysis | null> {
  try {
    let resp = await fetch(fileUrl, { headers: { Range: "bytes=0-3145727" } }); // first 3MB is plenty for headers
    if (!resp.ok && resp.status !== 206) resp = await fetch(fileUrl);
    if (!resp.ok && resp.status !== 206) return null;
    const b = new Uint8Array(await resp.arrayBuffer());
    if (b.length < 16) return null;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return parsePNG(b);
    if (b[0] === 0xFF && b[1] === 0xD8) return parseJPEG(b);
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A) || (b[0] === 0x4D && b[1] === 0x4D && b[3] === 0x2A)) return parseTIFF(b);
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return parsePDF(b);
    if (b[0] === 0x25 && b[1] === 0x21) return { format: "EPS", parsed: true, is_vector: true, color_space: "unknown" }; // %! PostScript
    return null;
  } catch (e) { console.error("[CheckArtwork] real analysis failed:", e); return null; }
}

// Turn the REAL parse + intended wrap size into a score + concrete findings.
function realFindings(ra: RealAnalysis, sqft: number | null): { score: number; issues: string[]; recommendations: string[]; good: string[] } {
  const issues: string[] = [], recommendations: string[] = [], good: string[] = [];
  let score = 6;
  if (ra.is_vector) { score += 3; good.push(`${ra.format} vector file — scales cleanly to any wrap size.`); recommendations.push("Confirm all fonts are outlined (converted to curves)."); }
  if (ra.width_px && ra.height_px) {
    good.push(`Actual dimensions: ${ra.width_px}×${ra.height_px}px${ra.embedded_dpi ? ` @ ${ra.embedded_dpi} DPI` : ""}.`);
    if (sqft && sqft > 0) {
      const dpi = Math.round(Math.sqrt((ra.width_px * ra.height_px) / (sqft * 144)));
      if (dpi >= 100) { score += 2; good.push(`≈${dpi} DPI across a ${sqft} sqft wrap — excellent for printing.`); }
      else if (dpi >= 72) { score += 1; good.push(`≈${dpi} DPI across a ${sqft} sqft wrap — good (wraps view at a distance).`); }
      else if (dpi >= 40) { score -= 1; issues.push(`Only ≈${dpi} DPI across a ${sqft} sqft wrap — a little soft up close. A Print-Ready Prep upscale fixes this.`); }
      else { score -= 3; issues.push(`Only ≈${dpi} DPI across a ${sqft} sqft wrap — too low, it will pixelate. Needs a Print-Ready Prep upscale.`); }
    }
  }
  if (ra.color_space === "CMYK") good.push("CMYK color space ✓ — print-ready color.");
  else if (ra.color_space === "RGB") { issues.push("Color space is RGB — we print in CMYK, so some colors can shift. We convert + proof before printing."); recommendations.push("Convert to CMYK for accurate wrap color."); }
  else if (ra.color_space === "Grayscale") issues.push("Grayscale color space — confirm that's intentional.");
  if (!ra.is_vector) recommendations.push("High-res raster prints great; vector (PDF/AI/EPS) is ideal if you have it.");
  recommendations.push('Include a 0.25" bleed on all edges.');
  return { score: Math.max(1, Math.min(10, score)), issues, recommendations, good };
}

// A structured checklist with the ACTUAL values, so the wizard/email can show
// each check (resolution, DPI, color space, format, size) with a pass/warn/fail.
type CheckStatus = "pass" | "warn" | "fail" | "info";
function buildChecks(real: RealAnalysis | null, ext: string, fileSize: number, sqft: number | null): Array<{ label: string; value: string; status: CheckStatus }> {
  const checks: Array<{ label: string; value: string; status: CheckStatus }> = [];
  const isVector = real?.is_vector ?? ["pdf", "ai", "eps", "svg"].includes(ext);
  const fmt = real?.format || (ext ? ext.toUpperCase() : "Unknown");
  checks.push({ label: "File format", value: `${fmt}${isVector ? " · vector" : real ? " · raster" : ""}`, status: isVector ? "pass" : "info" });

  if (real?.width_px && real?.height_px) {
    checks.push({ label: "Resolution", value: `${real.width_px} × ${real.height_px} px`, status: "info" });
    if (sqft && sqft > 0) {
      const dpi = Math.round(Math.sqrt((real.width_px * real.height_px) / (sqft * 144)));
      checks.push({ label: `Effective DPI @ ${sqft} sq ft`, value: `≈ ${dpi} DPI`, status: dpi >= 72 ? "pass" : dpi >= 40 ? "warn" : "fail" });
    } else if (real.embedded_dpi) {
      checks.push({ label: "Embedded DPI", value: `${real.embedded_dpi} DPI`, status: real.embedded_dpi >= 100 ? "pass" : "warn" });
    }
  } else if (isVector) {
    checks.push({ label: "Resolution", value: real?.page_w_in && real?.page_h_in ? `${real.page_w_in.toFixed(1)}" × ${real.page_h_in.toFixed(1)}" · scales` : "Vector — scales to any size", status: "pass" });
  } else {
    checks.push({ label: "Resolution", value: "Could not read from file", status: "info" });
  }

  if (real?.color_space) {
    checks.push({ label: "Color space", value: real.color_space, status: real.color_space === "CMYK" ? "pass" : real.color_space === "unknown" ? "info" : "warn" });
  }
  checks.push({ label: "File size", value: formatFileSize(fileSize || 0), status: "info" });
  return checks;
}

// Map the checklist to the exact ShopFlow service to run next. This is what makes
// the check PART OF the orchestration: it names the concrete fix + price so the
// flow goes check -> fix -> pay -> process without a human deciding.
function recommendFix(real: RealAnalysis | null, checks: Array<{ label: string; value: string; status: string }>, score: number): { service: string; label: string; price: number; reason: string } | null {
  const dpiCheck = checks.find((c) => c.label.startsWith("Effective DPI"));
  if (dpiCheck && (dpiCheck.status === "fail" || dpiCheck.status === "warn")) {
    return { service: "upscale", label: "Print-Ready Prep", price: 199, reason: `Your file is ${dpiCheck.value} at your wrap size — a Print-Ready Prep upscale makes it print sharp.` };
  }
  // Low-res raster with no wrap size given, but clearly small.
  if (real && !real.is_vector && real.width_px && real.width_px < 2000 && score < 6) {
    return { service: "upscale", label: "Print-Ready Prep", price: 199, reason: "Low resolution for a full wrap — a Print-Ready Prep upscale makes it print-ready." };
  }
  return null;
}

// WrapGuruAI print-readiness analysis. Metadata alone can't confirm color space,
// DPI, or font outlining, so we advise on them (matching the original WrapGuruAI
// customer email) and add format-specific guidance.
function buildPrintReadyAnalysis(ext: string, assessment: { score: number; quickIssues: string[] }) {
  const isRaster = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'psd'].includes(ext);
  const isVector = ['pdf', 'ai', 'eps'].includes(ext);

  const issues: string[] = [...assessment.quickIssues];
  const recommendations: string[] = [];

  if (isRaster) {
    issues.push('File appears to use RGB color space — CMYK is recommended for optimal vehicle wrap color accuracy');
    issues.push('Cannot determine resolution from the upload — verify DPI is adequate (100+ DPI at full size) for vehicle wrap printing');
    issues.push('Raster image format — vector formats (PDF, AI, EPS) provide better scalability for vehicle wraps');
    recommendations.push('Convert artwork to CMYK before final output');
    recommendations.push('Confirm the file is built at final size at 100+ DPI (or supply vector art)');
  }
  if (isVector) {
    recommendations.push('Verify all colors are set to CMYK');
    recommendations.push('Great choice on vector — it scales cleanly to full wrap size');
  }
  // Applies to every file — we can't see font state from metadata.
  issues.push('Cannot determine font status — verify all text is outlined / converted to curves for production');
  recommendations.push('Outline all fonts (convert text to curves)');
  recommendations.push('Include a 0.25" bleed on all edges');

  const printReady = assessment.score >= 7;
  const verdict = assessment.score >= 7
    ? 'Looks solid — likely print-ready once you confirm the items above.'
    : assessment.score >= 4
      ? 'Almost there — address the flagged items and we\'ll confirm print-readiness.'
      : 'Not print-ready yet — let\'s fix the flagged items. Our design team can help.';

  return { issues, recommendations, verdict, printReady };
}

// WrapGuruAI® customer-facing score email (restores the original "your file got
// the AI treatment! Score: X/10" experience).
function buildCustomerScoreEmailHTML(opts: {
  firstName: string;
  score: number;
  fileName: string;
  fileTypeLabel: string;
  fileSizeFormatted: string;
  issues: string[];
  recommendations: string[];
  verdict: string;
  printReady: boolean;
  checks?: Array<{ label: string; value: string; status: string }>;
  fix?: { label: string; price: number; reason: string; checkout_url?: string } | null;
}): string {
  const scoreColor = opts.score >= 7 ? '#22c55e' : opts.score >= 4 ? '#f59e0b' : '#ef4444';
  const dot = (s: string) => s === 'pass' ? '🟢' : s === 'warn' ? '🟡' : s === 'fail' ? '🔴' : '⚪';
  const checksHtml = (opts.checks && opts.checks.length)
    ? `<div style="padding:8px 24px;"><h3 style="font-size:16px;color:#f3f2fb;margin:16px 0 10px;">🔍 What we checked</h3>
       <table style="width:100%;border-collapse:collapse;font-size:14px;">${opts.checks.map(c => `
         <tr>
           <td style="padding:9px 0;color:#b9b6cf;border-bottom:1px solid #221d38;white-space:nowrap;">${dot(c.status)} ${c.label}</td>
           <td style="padding:9px 0;color:#f3f2fb;border-bottom:1px solid #221d38;text-align:right;font-weight:600;">${c.value}</td>
         </tr>`).join('')}</table></div>`
    : '';
  const issuesHtml = opts.issues.length
    ? opts.issues.map(i => `<div style="background:#2a1f1f;border-left:3px solid #ef4444;border-radius:8px;padding:14px 16px;margin:0 0 10px;color:#f3f2fb;font-size:14px;line-height:1.5;">🔸 ${i}</div>`).join('')
    : `<div style="color:#22c55e;">✓ No immediate issues detected</div>`;
  const recsHtml = opts.recommendations.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#cbd5e1;font-size:14px;line-height:1.7;">${opts.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '';
  const readyBadge = opts.printReady
    ? '<span style="background:#22c55e;color:#052e16;font-weight:700;padding:4px 12px;border-radius:999px;font-size:12px;">LIKELY PRINT-READY</span>'
    : '<span style="background:#f59e0b;color:#3a2a05;font-weight:700;padding:4px 12px;border-radius:999px;font-size:12px;">NEEDS A QUICK REVIEW</span>';

  return `
<div style="margin:0;padding:0;background:#0d0b1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#0d0b1a;color:#f3f2fb;">
    <div style="text-align:center;padding:36px 24px 12px;">
      <div style="font-size:40px;">🤖</div>
      <div style="font-size:26px;font-weight:800;margin-top:8px;">WrapGuruAI®</div>
      <div style="font-size:20px;font-weight:700;color:#d9c8ff;">Analysis Complete</div>
    </div>
    <div style="text-align:center;padding:8px 24px 24px;">
      <div style="font-size:15px;color:#b9b6cf;">Hey ${opts.firstName || 'there'}, your file got the AI treatment!</div>
      <div style="font-size:52px;font-weight:800;color:${scoreColor};margin:8px 0 4px;">${opts.score}/10</div>
      <div>${readyBadge}</div>
      <div style="font-size:13px;color:#8b88a3;margin-top:14px;">${opts.fileName} • ${opts.fileTypeLabel} • ${opts.fileSizeFormatted}</div>
    </div>
    ${checksHtml}
    <div style="padding:0 24px 8px;">
      <h3 style="font-size:16px;color:#f3f2fb;margin:16px 0 12px;">⚠️ Issues Found</h3>
      ${issuesHtml}
    </div>
    ${recsHtml ? `<div style="padding:8px 24px 8px;"><h3 style="font-size:16px;color:#f3f2fb;margin:16px 0 6px;">✅ Recommendations</h3>${recsHtml}</div>` : ''}
    <div style="padding:16px 24px 8px;">
      <div style="background:#161327;border:1px solid #2a2540;border-radius:12px;padding:16px;color:#e6e3f5;font-size:14px;line-height:1.6;">${opts.verdict}</div>
    </div>
    ${opts.fix && opts.fix.checkout_url ? `
    <div style="padding:8px 24px;">
      <div style="background:linear-gradient(135deg,#e6007e,#7c3aed);border-radius:14px;padding:20px;text-align:center;">
        <div style="font-size:16px;font-weight:800;color:#fff;">Fix it automatically — ${opts.fix.label} · $${opts.fix.price}</div>
        <div style="font-size:13px;color:#f3e8ff;margin:6px 0 14px;">${opts.fix.reason}</div>
        <a href="${opts.fix.checkout_url}" style="display:inline-block;background:#fff;color:#7c3aed;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Fix My File — $${opts.fix.price}</a>
        <div style="font-size:12px;color:#f3e8ff;margin-top:10px;">Pay once → we process it and email you the print-ready file.</div>
      </div>
    </div>` : ''}
    <div style="text-align:center;padding:20px 24px 32px;">
      <a href="https://weprintwraps.com/quote" style="display:inline-block;background:#e6007e;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Get My Wrap Quote</a>
      <div style="font-size:12px;color:#7a7790;margin-top:16px;">Our design team will follow up personally. Questions? Reply to this email.</div>
      <div style="font-size:12px;color:#7a7790;margin-top:6px;">⚡ Powered by WrapCommandAI</div>
    </div>
  </div>
</div>`;
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

    // Perform AI pre-check. Start with the metadata heuristic, then upgrade with
    // a REAL parse of the file bytes (true dimensions, DPI, color space, vector).
    const assessment = assessFileQuality(file_name, file_type || '', file_size || 0);
    const ext = (file_name.toLowerCase().split('.').pop() || '');
    let analysis = buildPrintReadyAnalysis(ext, assessment);

    const real = await analyzeRealFile(file_url);
    if (real?.parsed) {
      const sqft = vehicle_info?.sqft ? Number(vehicle_info.sqft) : null;
      const rf = realFindings(real, sqft);
      assessment.score = rf.score;                 // real score overrides the guess
      assessment.fileTypeLabel = real.format;
      analysis = { issues: rf.issues, recommendations: rf.recommendations, verdict:
        rf.score >= 7 ? "Looks print-ready — nice file." : rf.score >= 4 ? "Almost there — address the flagged items and we'll confirm." : "Not print-ready yet — let's fix the flagged items (our Print-Ready Prep upscale handles low resolution).",
        printReady: rf.score >= 7, real, good: rf.good };
      console.log('[CheckArtwork] REAL analysis:', JSON.stringify(real), 'score', rf.score);
    } else {
      console.log('[CheckArtwork] Real parse unavailable, used metadata heuristic.');
    }

    const sqftForChecks = vehicle_info?.sqft ? Number(vehicle_info.sqft) : null;
    const checks = buildChecks(real, ext, file_size || 0, sqftForChecks);

    // ORCHESTRATION: the check names the exact ShopFlow fix to run next, and — when
    // we have the customer's email — pre-creates the checkout so the result is a
    // one-click "Fix it" (check -> fix -> pay -> process -> deliver, one pipeline).
    let recommended_fix: any = recommendFix(real, checks, assessment.score);
    if (recommended_fix && customer_email) {
      try {
        const create = await fetch('https://kfapjdyythzyvnpdeghu.supabase.co/functions/v1/shopflow-bridge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create', service: recommended_fix.service, file_url, email: customer_email,
            vehicle: vehicle_info ? `${vehicle_info.year || ''} ${vehicle_info.make || ''} ${vehicle_info.model || ''}`.trim() : undefined,
            notes: `WrapGuru file check • score ${assessment.score}/10 • ${file_name}`,
            callback_url: `${supabaseUrl}/functions/v1/wrapguru-shopflow?action=callback`,
            return_url: 'https://weprintwraps.com/?shopflow=success',
          }),
        });
        const cj = await create.json().catch(() => ({}));
        if (cj.ok && cj.checkout_url) {
          recommended_fix = { ...recommended_fix, price: cj.price ?? recommended_fix.price, checkout_url: cj.checkout_url, job_id: cj.job_id };
          // Store the delivery mapping so the bridge callback can email the finished file.
          await supabase.from('ai_actions').insert({
            action_type: 'shopflow_job', organization_id: '031ac427-f078-4086-a9bc-7bdb78cc1c73', priority: 'high', resolved: false,
            action_payload: {
              job_id: cj.job_id, service: recommended_fix.service, price: cj.price, status: 'pending_payment',
              customer_email, customer_name: customer_name || null, file_name, file_url, session_id, source: 'file_check',
            },
          });
          console.log('[CheckArtwork] Pre-created ShopFlow job', cj.job_id, recommended_fix.service);
        }
      } catch (e) { console.error('[CheckArtwork] shopflow pre-create failed:', e); }
    }

    console.log('[CheckArtwork] Assessment:', assessment, 'Checks:', checks, 'Fix:', recommended_fix);

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
            quick_issues: analysis.issues,
            recommendations: analysis.recommendations,
            print_ready: analysis.printReady,
            verdict: analysis.verdict,
            file_type_ok: assessment.fileTypeOk,
            file_type_label: assessment.fileTypeLabel,
            size_assessment: assessment.sizeAssessment,
            // REAL parse results (null if the file couldn't be read)
            real_analysis: (analysis as any).real || null,
            positives: (analysis as any).good || [],
            checks,
            recommended_fix: recommended_fix || null
          },
          customer_email_sent: false,
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
    if (resendApiKey && !body.debug) {
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

    // Send the WrapGuruAI score email to the CUSTOMER (the original "your file got
    // the AI treatment! Score: X/10" experience). Only when we have their email.
    let customerEmailSent = false;
    if (resendApiKey && !body.debug && customer_email && !String(customer_email).includes('@capture.local')) {
      try {
        const resend = new Resend(resendApiKey);
        const firstName = (customer_name || '').split(' ')[0] || '';
        const customerHtml = buildCustomerScoreEmailHTML({
          firstName,
          score: assessment.score,
          fileName: file_name,
          fileTypeLabel: assessment.fileTypeLabel,
          fileSizeFormatted: formatFileSize(file_size || 0),
          issues: analysis.issues,
          recommendations: analysis.recommendations,
          verdict: analysis.verdict,
          printReady: analysis.printReady,
          checks,
          fix: recommended_fix || null,
        });
        await resend.emails.send({
          from: 'WrapGuruAI <hello@weprintwraps.com>',
          to: [customer_email],
          subject: `🚀 ${firstName ? firstName + ', ' : ''}your file got the AI treatment! Score: ${assessment.score}/10 ✨`,
          html: customerHtml,
        });
        customerEmailSent = true;
        console.log('[CheckArtwork] WrapGuruAI score email sent to customer:', customer_email);
        // Flag it on the ai_action so the admin knows the customer was notified.
        if (actionRecord?.id) {
          await supabase.from('ai_actions')
            .update({ action_payload: { ...actionRecord.action_payload, customer_email_sent: true } })
            .eq('id', actionRecord.id);
        }
      } catch (custErr) {
        console.error('[CheckArtwork] Customer score email failed:', custErr);
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
          print_ready: analysis.printReady,
          verdict: analysis.verdict,
          file_type_ok: assessment.fileTypeOk,
          file_type_label: assessment.fileTypeLabel,
          file_type_status: fileTypeStatus,
          quick_issues: analysis.issues,
          recommendations: analysis.recommendations,
          positives: (analysis as any).good || [],
          checks,
          recommended_fix: recommended_fix || null,
          real_analysis: (analysis as any).real || null,
          size_assessment: assessment.sizeAssessment,
          file_size_formatted: formatFileSize(file_size || 0)
        },
        recommended_fix: recommended_fix || null,
        customer_email_sent: customerEmailSent,
        message: `Got your file! Here's your WrapGuruAI analysis — Score: ${assessment.score}/10 ${scoreEmoji}\n\n${analysis.verdict}\n\n${analysis.issues.length > 0 ? '⚠️ Issues to check:\n' + analysis.issues.map(i => '• ' + i).join('\n') + '\n\n' : ''}${customerEmailSent ? '📧 I just emailed you the full breakdown.\n\n' : ''}Our design team will also review it personally and follow up. 💡 For instant sq ft pricing, use our quote tool at weprintwraps.com/quote.`,
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
