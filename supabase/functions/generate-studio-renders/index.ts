import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * StudioRenderOS - Locked 6-View Studio Rendering System
 * 
 * Generates deterministic, photorealistic studio renders from a 2D proof.
 * Each view has locked camera angles, lighting, and environment.
 * 
 * PHASE 2: All renders are branded before storage - no raw renders leave the system.
 * 
 * Views:
 * 1. driver_side - 45° front-left, eye-level
 * 2. front - centered, slight elevation
 * 3. rear - centered, slight elevation  
 * 4. passenger_side - 45° front-right, eye-level
 * 5. top - overhead/drone view
 * 6. detail - macro crop of key design element
 */

interface StudioRenderRequest {
  projectId: string;
  versionId: string;
  panelUrl: string;
  vehicle: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleCategory?: string; // Explicit category from detection: "van", "truck", "car", "suv", etc.
  // orderNumber resolved internally from approveflow_projects - NEVER from request
}

// ============================================
// OS CONSTANTS — LOCKED (mirrored from src/lib/os-constants.ts)
// ============================================
const USE_BRANDED_RENDER_PIPELINE = true; // Phase 2 - uses Gemini for branding
const BRAND_LINE_1 = "WrapCommandAI™ for WPW";
const BRAND_LINE_2 = "ApproveFlow™";

// Locked studio environment - NEVER changes
const STUDIO_ENVIRONMENT = `
STUDIO ENVIRONMENT (LOCKED - DO NOT DEVIATE):
- Background: Seamless LIGHT GRAY cyclorama studio walls (specifically #D1D5DB - not white, not charcoal)
- Floor: Dark textured concrete with subtle grain and realistic contact shadows
- Lighting: Professional 3-point automotive photography setup
  - Key light: Large softbox front-left at 45°, soft neutral white
  - Fill light: Diffused front-right, 50% intensity
  - Rim light: Behind vehicle, subtle edge highlight
  - NO VISIBLE LIGHT FIXTURES - lights are implied, never rendered in the image
- Shadows: Realistic contact shadows under tires and body, soft ambient occlusion
- FORBIDDEN: No props, no scenery, no sky, no text overlays, no visible light fixtures or studio equipment
- Clean, professional automotive studio aesthetic - showroom quality
`;

// Locked camera positions for each view
const VIEW_CONFIGS = {
  driver_side: {
    label: "Driver Side",
    camera: "45-degree front-left three-quarter view, eye-level height (4 feet from ground), camera 15 feet from vehicle center",
    focus: "Full vehicle visible, driver side prominently displayed, slight upward angle"
  },
  front: {
    label: "Front",
    camera: "Straight-on front view, slightly elevated (5 feet height), centered on vehicle grille, camera 12 feet from bumper",
    focus: "Symmetrical front view, hood and front fascia clearly visible"
  },
  rear: {
    label: "Rear", 
    camera: "Straight-on rear view, slightly elevated (5 feet height), centered on tailgate/trunk, camera 12 feet from bumper",
    focus: "Symmetrical rear view, tailgate and rear fascia clearly visible"
  },
  passenger_side: {
    label: "Passenger Side",
    camera: "45-degree front-right three-quarter view, eye-level height (4 feet from ground), camera 15 feet from vehicle center",
    focus: "Full vehicle visible, passenger side prominently displayed, slight upward angle"
  },
  top: {
    label: "Top",
    camera: "Overhead drone-style view, camera directly above vehicle at 20 feet height, looking straight down",
    focus: "Full roof and hood visible, vehicle centered in frame, slight forward angle showing hood"
  },
  detail: {
    label: "Detail",
    camera: "Close-up macro shot of the most prominent design element (logo, main graphic, or key branding), camera 3 feet away",
    focus: "Sharp focus on the main design element, shallow depth of field, professional product photography"
  }
};

/**
 * Detect vehicle type from 2D proof using Gemini Vision
 * Called when vehicleYear/Make/Model are not provided (Mode 2: Auto-Detect)
 */
async function detectVehicleFromProof(
  apiKey: string,
  panelUrl: string
): Promise<{ category: string; year: string; make: string; model: string; confidence: number; suggestedVehicle: string }> {

  const detectionPrompt = `Analyze this 2D vehicle wrap proof sheet.

TASK: Identify the EXACT vehicle shown in this proof.

VEHICLE TYPE RULES:
━━━━━━━━━━━━━━━━━━
🚐 VAN = tall boxy cargo body, sliding side door, NO open bed
   Examples: Ford Transit, Mercedes Sprinter, Ram ProMaster, Chevy Express

🛻 PICKUP TRUCK = open cargo bed in rear, cab + bed separate
   Examples: Ford F-150, Chevy Silverado, Ram 1500, Toyota Tundra

📦 BOX TRUCK = large box cargo area, cab-over style
   Examples: Isuzu NPR, Ford E-450 Box

🚗 CAR = sedan, coupe, hatchback - low profile

🚙 SUV = enclosed cargo, raised body, wagon-style
   Examples: Ford Explorer, Chevy Tahoe

LOOK AT THE SHAPE OF THE VEHICLE, NOT THE GRAPHICS.

Return ONLY valid JSON (no markdown):
{
  "category": "van" | "pickup_truck" | "box_truck" | "car" | "suv",
  "year": "2024",
  "make": "Ford",
  "model": "Transit",
  "confidence": 0.95,
  "suggestedVehicle": "2024 Ford Transit Cargo Van"
}`;

  try {
    // Fetch and convert image to base64
    let imageBase64: string;
    let mimeType = "image/png";

    if (panelUrl.startsWith('data:')) {
      const matches = panelUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBase64 = matches[2];
      } else {
        throw new Error("Invalid data URL format");
      }
    } else {
      const imgResponse = await fetch(panelUrl);
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

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: detectionPrompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }],
          temperature: 0.1,
          max_tokens: 512
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[StudioRenderOS] Vehicle detection API error:", response.status, error);
      return { category: "unknown", year: "", make: "", model: "", confidence: 0, suggestedVehicle: "" };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("[StudioRenderOS] Vehicle detected:", parsed);
      return {
        category: parsed.category || "unknown",
        year: parsed.year || "",
        make: parsed.make || "",
        model: parsed.model || "",
        confidence: parsed.confidence || 0,
        suggestedVehicle: parsed.suggestedVehicle || `${parsed.year || ''} ${parsed.make || ''} ${parsed.model || ''}`.trim()
      };
    }

    return { category: "unknown", year: "", make: "", model: "", confidence: 0, suggestedVehicle: "" };
  } catch (error) {
    console.error("[StudioRenderOS] Vehicle detection error:", error);
    return { category: "unknown", year: "", make: "", model: "", confidence: 0, suggestedVehicle: "" };
  }
}

async function generateSingleView(
  apiKey: string,
  vehicle: string,
  panelUrl: string,
  viewKey: string,
  viewConfig: typeof VIEW_CONFIGS.driver_side,
  vehicleCategory?: string
): Promise<string | null> {
  // Simple vehicle type detection
  const vehicleLower = vehicle.toLowerCase();
  const isVan = vehicleCategory === 'van' || vehicleLower.includes('van') || vehicleLower.includes('transit') || vehicleLower.includes('sprinter') || vehicleLower.includes('promaster');
  const isTruck = vehicleCategory === 'truck' || vehicleCategory === 'pickup_truck' || vehicleLower.includes('f-150') || vehicleLower.includes('silverado') || vehicleLower.includes('ram 1500');

  // Minimal vehicle type line
  let vehicleTypeLine = '';
  if (isVan) {
    vehicleTypeLine = `VEHICLE TYPE: Cargo Van (tall boxy body, sliding doors, NO open truck bed)`;
  } else if (isTruck) {
    vehicleTypeLine = `VEHICLE TYPE: Pickup Truck (cab + open bed in rear)`;
  }

  const prompt = `Generate a photorealistic 3D render of a ${vehicle} with this wrap design applied.

${vehicleTypeLine}

VIEW: ${viewConfig.label}
CAMERA: ${viewConfig.camera}

${STUDIO_ENVIRONMENT}

CRITICAL - WRAP MUST BE VISIBLE:
- The vehicle MUST display the wrap design from the 2D proof image
- DO NOT render a blank or unwrapped vehicle
- All graphics, logos, and text from the proof must appear on the vehicle
- If you cannot see the company name/logo on the render, it is WRONG

QUALITY REQUIREMENTS:
- Ultra high resolution, sharp details
- Every letter must be crisp and readable
- Professional wrap shop portfolio quality
- Good enough to email to a paying customer

TEXT RULES:
- Do NOT mirror or reverse any text
- All text must read correctly left-to-right
- Phone numbers, URLs, company names must be legible

OUTPUT: Single photorealistic studio photo of ${vehicle} with wrap applied.`;

  try {
    // Convert image URL to base64 (chunked to avoid stack overflow)
    let imageBase64 = panelUrl;
    let mimeType = "image/png";
    if (panelUrl.startsWith('http')) {
      const imgResponse = await fetch(panelUrl);
      if (!imgResponse.ok) throw new Error(`Failed to fetch panel image: ${imgResponse.status}`);
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
    } else if (panelUrl.startsWith('data:')) {
      const matches = panelUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBase64 = matches[2];
      }
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gemini-3-pro-image-preview",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
          }],
          modalities: ["image", "text"]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`View ${viewKey} failed:`, response.status, error);
      return null;
    }

    const data = await response.json();
    const imageUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (imageUrl) {
      return imageUrl;
    }

    console.error(`No image returned for ${viewKey}`);
    return null;
  } catch (error) {
    console.error(`Error generating ${viewKey}:`, error);
    return null;
  }
}

/**
 * PHASE 2: Apply branding overlay to a render
 * Calls the apply-render-branding edge function
 * 
 * OS RULE: If branding fails, the entire render fails (no unbranded renders stored)
 */
async function applyBrandingToRender(
  supabaseUrl: string,
  supabaseKey: string,
  imageUrl: string,
  orderNumber: string,
  viewLabel: string
): Promise<string | null> {
  try {
    console.log(`[StudioRenderOS] Applying branding to ${viewLabel}...`);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/apply-render-branding`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imageUrl,
        orderNumber,
        viewLabel
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[StudioRenderOS] Branding failed for ${viewLabel}:`, response.status, error);
      return null;
    }

    const data = await response.json();
    
    if (!data.success || !data.brandedUrl) {
      console.error(`[StudioRenderOS] Branding returned no URL for ${viewLabel}:`, data);
      return null;
    }

    console.log(`[StudioRenderOS] ✓ Branding applied to ${viewLabel}`);
    return data.brandedUrl;
  } catch (error) {
    console.error(`[StudioRenderOS] Branding error for ${viewLabel}:`, error);
    return null;
  }
}

async function uploadBase64ToStorage(
  supabase: any,
  projectId: string,
  versionId: string,
  viewKey: string,
  base64Data: string,
  orderNumber: string
): Promise<string | null> {
  try {
    // Extract the actual base64 content
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    
    // OS-consistent storage path: approveflow_3d/{orderNumber}/{projectId}/v1/{viewKey}.png
    const filePath = `${orderNumber}/${projectId}/v1/${viewKey}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('approveflow-files')
      .upload(filePath, binaryData, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error(`Upload error for ${viewKey}:`, uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('approveflow-files')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error(`Storage error for ${viewKey}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, versionId, panelUrl, vehicle, vehicleYear, vehicleMake, vehicleModel, vehicleCategory } =
      await req.json() as StudioRenderRequest;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase credentials");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 🔒 OS RULE: Resolve orderNumber internally from source of truth
    const { data: project, error: projectErr } = await supabase
      .from('approveflow_projects')
      .select('order_number')
      .eq('id', projectId)
      .single();

    if (projectErr || !project?.order_number) {
      console.error('[StudioRenderOS] Missing order number for project', projectErr);
      throw new Error('Order number not found for this project');
    }

    const orderNumber = project.order_number;

    // Build vehicle description - with auto-detection fallback
    let vehicleDesc = [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(' ');
    let detectedCategory = vehicleCategory; // May be passed from frontend, or we detect here

    // If no vehicle info provided, auto-detect from 2D proof (MODE 2: Auto-Detect)
    if (!vehicleDesc || vehicleDesc.trim() === '') {
      console.log("[StudioRenderOS] ⚠️ No vehicle info provided - detecting from 2D proof...");

      const detected = await detectVehicleFromProof(GEMINI_API_KEY, panelUrl);

      if (detected.confidence > 0.5) {
        vehicleDesc = detected.suggestedVehicle || `${detected.year} ${detected.make} ${detected.model}`.trim();
        detectedCategory = detected.category;
        console.log(`[StudioRenderOS] ✅ Auto-detected vehicle: ${vehicleDesc}`);
        console.log(`[StudioRenderOS] ✅ Category: ${detectedCategory} (confidence: ${detected.confidence})`);
      } else {
        console.warn("[StudioRenderOS] ⚠️ Vehicle detection low confidence, using generic fallback");
        vehicleDesc = vehicle || "vehicle";
      }
    } else {
      console.log(`[StudioRenderOS] Using provided vehicle info: ${vehicleDesc}`);
    }

    // Fallback if still empty
    if (!vehicleDesc || vehicleDesc.trim() === '') {
      vehicleDesc = vehicle || "vehicle";
    }

    console.log(`[StudioRenderOS] Starting 6-view generation for: ${vehicleDesc}`);
    console.log(`[StudioRenderOS] Vehicle Category: ${detectedCategory || 'not specified'}`);
    console.log(`[StudioRenderOS] Project: ${projectId}, Version: ${versionId}, Order: ${orderNumber} (resolved from DB)`);
    console.log(`[StudioRenderOS] USE_BRANDED_RENDER_PIPELINE: ${USE_BRANDED_RENDER_PIPELINE}`);

    // Generate all 6 views in parallel (but staggered to avoid rate limits)
    const viewKeys = Object.keys(VIEW_CONFIGS) as (keyof typeof VIEW_CONFIGS)[];
    const renderUrls: Record<string, string> = {};
    const errors: string[] = [];

    // Process views in batches of 2 to avoid rate limiting
    for (let i = 0; i < viewKeys.length; i += 2) {
      const batch = viewKeys.slice(i, i + 2);

      const batchPromises = batch.map(async (viewKey) => {
        console.log(`[StudioRenderOS] Generating: ${viewKey} (category: ${detectedCategory || 'none'})`);

        // Step 1: Generate raw render
        const base64Image = await generateSingleView(
          GEMINI_API_KEY,
          vehicleDesc,
          panelUrl,
          viewKey,
          VIEW_CONFIGS[viewKey],
          detectedCategory // Pass detected/provided category for enforcement
        );

        if (!base64Image) {
          errors.push(`Failed to generate ${viewKey}`);
          return;
        }

        // Step 2: Upload raw render to storage (temporary if branding is enabled)
        const rawPublicUrl = await uploadBase64ToStorage(
          supabase,
          projectId,
          versionId,
          viewKey,
          base64Image,
          orderNumber
        );

        if (!rawPublicUrl) {
          errors.push(`Failed to upload ${viewKey}`);
          return;
        }

        // Step 3: Apply branding if enabled (PHASE 2)
        if (USE_BRANDED_RENDER_PIPELINE) {
          const brandedUrl = await applyBrandingToRender(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            rawPublicUrl,
            orderNumber,
            VIEW_CONFIGS[viewKey].label
          );

          if (!brandedUrl) {
            // OS RULE: Hard fail if branding fails - no unbranded renders stored
            errors.push(`BRANDING FAILED for ${viewKey} - render rejected`);
            console.error(`[StudioRenderOS] ❌ HARD FAIL: Branding failed for ${viewKey}, render not stored`);
            return;
          }

          // Store the branded URL (branding function returns the branded image URL)
          renderUrls[viewKey] = brandedUrl;
          console.log(`[StudioRenderOS] ✓ ${viewKey} complete (branded)`);
        } else {
          // Legacy path: store raw URL (Phase 2 disabled)
          renderUrls[viewKey] = rawPublicUrl;
          console.log(`[StudioRenderOS] ✓ ${viewKey} complete (raw - branding disabled)`);
        }
      });

      await Promise.all(batchPromises);
      
      // Small delay between batches
      if (i + 2 < viewKeys.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // OS RULE: If no renders succeeded, fail the entire operation
    if (Object.keys(renderUrls).length === 0) {
      throw new Error("All renders failed - no images generated or branded successfully");
    }

    // Save to approveflow_3d table - check if exists first, then update or insert
    const { data: existing } = await supabase
      .from('approveflow_3d')
      .select('id')
      .eq('project_id', projectId)
      .eq('version_id', versionId)
      .maybeSingle();

    let dbError;
    if (existing) {
      // Update existing record
      const { error } = await supabase
        .from('approveflow_3d')
        .update({
          render_urls: renderUrls,
          created_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      dbError = error;
    } else {
      // Insert new record
      const { error } = await supabase
        .from('approveflow_3d')
        .insert({
          project_id: projectId,
          version_id: versionId,
          render_urls: renderUrls,
          created_at: new Date().toISOString()
        });
      dbError = error;
    }

    if (dbError) {
      console.error('[StudioRenderOS] DB save error:', dbError);
      throw new Error(`Failed to save renders to database: ${dbError.message}`);
    }

    // Read-after-write verification (CRITICAL - ensures data was persisted)
    const { data: verify, error: verifyErr } = await supabase
      .from('approveflow_3d')
      .select('id, render_urls')
      .eq('project_id', projectId)
      .eq('version_id', versionId)
      .maybeSingle();

    if (verifyErr || !verify?.render_urls) {
      console.error('[StudioRenderOS] Verification failed:', verifyErr);
      throw new Error('3D render was generated but could not be persisted to approveflow_3d');
    }

    const successCount = Object.keys(renderUrls).length;
    const verifiedCount = Object.keys(verify.render_urls as Record<string, string>).length;
    console.log(`[StudioRenderOS] Complete: ${successCount}/6 views generated, ${verifiedCount} verified in DB`);
    console.log(`[StudioRenderOS] Branding: ${USE_BRANDED_RENDER_PIPELINE ? 'APPLIED' : 'DISABLED'}`);

    return new Response(JSON.stringify({ 
      success: true,
      renderUrls: verify.render_urls, // Return verified data from DB
      generatedViews: verifiedCount,
      branded: USE_BRANDED_RENDER_PIPELINE,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('[StudioRenderOS] Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
