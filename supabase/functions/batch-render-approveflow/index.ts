import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Batch Render ApproveFlow — Prompt Injector Pipeline
 *
 * Fetches real WooCommerce order data from ApproveFlow projects,
 * injects customer instructions + uploaded inspo images into the
 * render prompt, then generates studio renders for multiple orders.
 *
 * Supports two modes:
 * 1. PREVIEW — Returns enriched prompt data without rendering (dry run)
 * 2. RENDER  — Generates studio renders via generate-studio-renders
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchRenderRequest {
  projectIds: string[];
  mode: 'preview' | 'render';
  // Optional overrides for prompt injection
  promptOverrides?: {
    styleDirective?: string;   // e.g., "Make it look aggressive and sporty"
    colorOverride?: string;    // e.g., "Override to Satin Black"
    additionalContext?: string; // Free-form text appended to prompt
  };
}

interface EnrichedProject {
  projectId: string;
  orderNumber: string;
  customerName: string;
  productType: string;
  designInstructions: string | null;
  vehicleInfo: {
    year?: string;
    make?: string;
    model?: string;
    type?: string;
  } | null;
  colorInfo: {
    color?: string;
    color_hex?: string;
    finish?: string;
  } | null;
  customerInspoImages: string[];
  customerUploadedFiles: Array<{
    url: string;
    filename: string;
    fileType: string;
  }>;
  latestVersionUrl: string | null;
  latestVersionId: string | null;
  injectedPrompt: string;
  status: string;
}

/**
 * Build the enriched prompt that injects WooCommerce order data
 * into the studio render prompt.
 */
function buildInjectedPrompt(
  project: {
    design_instructions?: string | null;
    vehicle_info?: any;
    color_info?: any;
    product_type?: string;
  },
  inspoImages: string[],
  uploadedFiles: Array<{ url: string; filename: string; fileType: string }>,
  overrides?: BatchRenderRequest['promptOverrides']
): string {
  const sections: string[] = [];

  // Section 1: Customer Design Instructions
  if (project.design_instructions) {
    sections.push(`CUSTOMER DESIGN INSTRUCTIONS (from WooCommerce order):
"""
${project.design_instructions}
"""`);
  }

  // Section 2: Vehicle Information
  const vi = project.vehicle_info;
  if (vi && (vi.year || vi.make || vi.model)) {
    sections.push(`VEHICLE: ${[vi.year, vi.make, vi.model].filter(Boolean).join(' ')}${vi.type ? ` (${vi.type})` : ''}`);
  }

  // Section 3: Color/Finish Information
  const ci = project.color_info;
  if (ci && (ci.color || ci.finish || ci.color_hex)) {
    const colorParts = [];
    if (ci.color) colorParts.push(`Color: ${ci.color}`);
    if (ci.finish) colorParts.push(`Finish: ${ci.finish}`);
    if (ci.color_hex) colorParts.push(`Code: ${ci.color_hex}`);
    sections.push(`WRAP COLOR/FINISH: ${colorParts.join(' | ')}`);
  }

  // Section 4: Customer Inspiration Images
  if (inspoImages.length > 0) {
    sections.push(`CUSTOMER INSPIRATION IMAGES (${inspoImages.length} uploaded):
${inspoImages.map((url, i) => `  [Inspo ${i + 1}]: ${url}`).join('\n')}
INSTRUCTION: Reference these inspiration images for style, color palette, and design direction.`);
  }

  // Section 5: Other Customer Uploaded Files
  const nonInspoFiles = uploadedFiles.filter(f => !inspoImages.includes(f.url));
  if (nonInspoFiles.length > 0) {
    sections.push(`CUSTOMER REFERENCE FILES (${nonInspoFiles.length}):
${nonInspoFiles.map((f, i) => `  [File ${i + 1}]: ${f.filename} (${f.fileType}) — ${f.url}`).join('\n')}`);
  }

  // Section 6: Product Type Context
  if (project.product_type) {
    sections.push(`PRODUCT TYPE: ${project.product_type}`);
  }

  // Section 7: Optional Overrides
  if (overrides?.styleDirective) {
    sections.push(`STYLE DIRECTIVE (designer override): ${overrides.styleDirective}`);
  }
  if (overrides?.colorOverride) {
    sections.push(`COLOR OVERRIDE (designer override): ${overrides.colorOverride}`);
  }
  if (overrides?.additionalContext) {
    sections.push(`ADDITIONAL CONTEXT: ${overrides.additionalContext}`);
  }

  return sections.join('\n\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectIds, mode, promptOverrides } = await req.json() as BatchRenderRequest;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      throw new Error('projectIds array is required');
    }

    if (projectIds.length > 20) {
      throw new Error('Maximum 20 projects per batch');
    }

    const SUPABASE_URL = Deno.env.get('EXTERNAL_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log(`[BatchRenderOS] Mode: ${mode}, Projects: ${projectIds.length}`);

    // Step 1: Fetch all projects with their data
    const enrichedProjects: EnrichedProject[] = [];
    const errors: Array<{ projectId: string; error: string }> = [];

    for (const projectId of projectIds) {
      try {
        // Fetch project
        const { data: project, error: projErr } = await supabase
          .from('approveflow_projects')
          .select('*')
          .eq('id', projectId)
          .single();

        if (projErr || !project) {
          errors.push({ projectId, error: `Project not found: ${projErr?.message || 'unknown'}` });
          continue;
        }

        // Fetch customer-uploaded assets (inspo + files)
        const { data: assets } = await supabase
          .from('approveflow_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false });

        const customerAssets = (assets || []).filter((a: any) => a.source === 'woocommerce');

        // Separate inspiration images from other files
        const inspoImages: string[] = [];
        const uploadedFiles: Array<{ url: string; filename: string; fileType: string }> = [];

        for (const asset of customerAssets) {
          const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(asset.file_url || '');
          const isInspo = asset.file_type === 'customer_inspiration' ||
                          asset.file_type === 'customer_upload' && isImage;

          if (isInspo && isImage) {
            inspoImages.push(asset.file_url);
          }

          uploadedFiles.push({
            url: asset.file_url,
            filename: asset.original_filename || 'unknown',
            fileType: asset.file_type || 'customer_upload',
          });
        }

        // Fetch latest design version (2D proof)
        const { data: versions } = await supabase
          .from('approveflow_versions')
          .select('id, file_url, version_number')
          .eq('project_id', projectId)
          .order('version_number', { ascending: false })
          .limit(1);

        const latestVersion = versions?.[0] || null;

        // Build enriched prompt
        const injectedPrompt = buildInjectedPrompt(
          project,
          inspoImages,
          uploadedFiles,
          promptOverrides
        );

        enrichedProjects.push({
          projectId,
          orderNumber: project.order_number,
          customerName: project.customer_name,
          productType: project.product_type,
          designInstructions: project.design_instructions,
          vehicleInfo: project.vehicle_info as any,
          colorInfo: project.color_info as any,
          customerInspoImages: inspoImages,
          customerUploadedFiles: uploadedFiles,
          latestVersionUrl: latestVersion?.file_url || null,
          latestVersionId: latestVersion?.id || null,
          injectedPrompt,
          status: project.status,
        });

        console.log(`[BatchRenderOS] Enriched project ${project.order_number}: ${inspoImages.length} inspo, ${uploadedFiles.length} files, instructions: ${(project.design_instructions?.length || 0)} chars`);
      } catch (err: any) {
        errors.push({ projectId, error: err.message });
      }
    }

    // Mode: PREVIEW — Return enriched data without rendering
    if (mode === 'preview') {
      console.log(`[BatchRenderOS] Preview complete: ${enrichedProjects.length} enriched, ${errors.length} errors`);

      return new Response(JSON.stringify({
        success: true,
        mode: 'preview',
        projects: enrichedProjects,
        errors: errors.length > 0 ? errors : undefined,
        stats: {
          total: projectIds.length,
          enriched: enrichedProjects.length,
          withInstructions: enrichedProjects.filter(p => p.designInstructions).length,
          withInspo: enrichedProjects.filter(p => p.customerInspoImages.length > 0).length,
          withProof: enrichedProjects.filter(p => p.latestVersionUrl).length,
          failed: errors.length,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mode: RENDER — Generate studio renders for each project
    console.log(`[BatchRenderOS] Starting batch render for ${enrichedProjects.length} projects...`);

    const renderResults: Array<{
      projectId: string;
      orderNumber: string;
      success: boolean;
      generatedViews?: number;
      error?: string;
    }> = [];

    // Process renders sequentially to avoid rate limiting
    for (const project of enrichedProjects) {
      if (!project.latestVersionUrl) {
        renderResults.push({
          projectId: project.projectId,
          orderNumber: project.orderNumber,
          success: false,
          error: 'No 2D proof uploaded — cannot generate renders',
        });
        continue;
      }

      try {
        console.log(`[BatchRenderOS] Rendering order #${project.orderNumber}...`);

        // Build vehicle description
        const vi = project.vehicleInfo;
        const vehicleDesc = vi ? [vi.year, vi.make, vi.model].filter(Boolean).join(' ') : '';

        // Call generate-studio-renders with the full context
        const renderResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-studio-renders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: project.projectId,
            versionId: project.latestVersionId,
            panelUrl: project.latestVersionUrl,
            vehicle: vehicleDesc,
            vehicleYear: vi?.year,
            vehicleMake: vi?.make,
            vehicleModel: vi?.model,
            vehicleCategory: vi?.type,
          }),
        });

        const renderData = await renderResponse.json();

        if (!renderResponse.ok || !renderData?.success) {
          renderResults.push({
            projectId: project.projectId,
            orderNumber: project.orderNumber,
            success: false,
            error: renderData?.error || 'Render generation failed',
          });
        } else {
          renderResults.push({
            projectId: project.projectId,
            orderNumber: project.orderNumber,
            success: true,
            generatedViews: renderData.generatedViews,
          });
        }

        // Rate limit pause between renders
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err: any) {
        renderResults.push({
          projectId: project.projectId,
          orderNumber: project.orderNumber,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = renderResults.filter(r => r.success).length;
    console.log(`[BatchRenderOS] Batch complete: ${successCount}/${renderResults.length} succeeded`);

    return new Response(JSON.stringify({
      success: true,
      mode: 'render',
      results: renderResults,
      enrichedProjects,
      errors: errors.length > 0 ? errors : undefined,
      stats: {
        total: projectIds.length,
        rendered: successCount,
        failed: renderResults.length - successCount,
        skipped: errors.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[BatchRenderOS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
