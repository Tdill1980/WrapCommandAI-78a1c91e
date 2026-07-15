import { supabase, contentDB } from '@/integrations/supabase/client';

export interface FinalizeRenderParams {
  sourceType: 'ai_creative' | 'video_edit_queue' | 'reel_builder';
  sourceId: string;
  videoBlob?: Blob;
  externalUrl?: string;
  metadata: {
    title: string;
    format?: string;
    duration?: number;
    width?: number;
    height?: number;
  };
}

export interface FinalizeResult {
  success: boolean;
  downloadUrl?: string;
  storageUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Finalize a render by uploading the video to storage and updating the source record.
 * This is the CRITICAL step that was missing - it ensures:
 * 1. Video file is actually saved to storage
 * 2. Download URL is generated and persisted
 * 3. Source record is updated with finalization data
 * 
 * Only after this step completes successfully should a download button be shown.
 */
export async function finalizeRender(params: FinalizeRenderParams): Promise<FinalizeResult> {
  const { sourceType, sourceId, videoBlob, externalUrl, metadata } = params;

  try {
    // Step 1: Determine the file to save
    let fileToUpload: Blob | null = null;
    let finalUrl: string | null = null;

    if (videoBlob) {
      fileToUpload = videoBlob;
    } else if (externalUrl) {
      // For external URLs (from the ffmpeg render worker), 
      // we can either download and re-upload, or just use the URL directly
      // For now, we'll use the external URL directly as the download URL
      finalUrl = externalUrl;
    }

    let storagePath: string | null = null;
    let storageUrl: string | null = null;

    // Step 2: Upload to storage if we have a blob
    if (fileToUpload) {
      const timestamp = Date.now();
      const sanitizedTitle = metadata.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      storagePath = `rendered/${sourceType}/${sourceId}/${sanitizedTitle}_${timestamp}.mp4`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media-library')
        .upload(storagePath, fileToUpload, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return {
          success: false,
          error: `Failed to upload video: ${uploadError.message}`,
        };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('media-library')
        .getPublicUrl(storagePath);

      storageUrl = urlData.publicUrl;
      finalUrl = storageUrl;
    }

    // Step 3: Update the source record with finalization data
    const finalizationData = {
      finalized_at: new Date().toISOString(),
      download_url: finalUrl,
      storage_path: storagePath,
    };

    if (sourceType === 'ai_creative') {
      const { error: updateError } = await supabase
        .from('ai_creatives')
        .update({
          output_url: finalUrl,
          status: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId);

      if (updateError) {
        console.error('Failed to update ai_creatives:', updateError);
        return {
          success: false,
          error: `Failed to update record: ${updateError.message}`,
        };
      }
    } else if (sourceType === 'video_edit_queue') {
      const { error: updateError } = await contentDB
        .from('video_edit_queue')
        .update({
          final_render_url: finalUrl,
          render_status: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId);

      if (updateError) {
        console.error('Failed to update video_edit_queue:', updateError);
        return {
          success: false,
          error: `Failed to update record: ${updateError.message}`,
        };
      }
    }

    // Step 4: Return success with download URL
    return {
      success: true,
      downloadUrl: finalUrl || undefined,
      storageUrl: storageUrl || undefined,
      storagePath: storagePath || undefined,
    };
  } catch (error) {
    console.error('Finalize render error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during finalization',
    };
  }
}

/**
 * Check if a render is finalized and has a valid download URL
 */
export async function isRenderFinalized(sourceType: 'ai_creative' | 'video_edit_queue', sourceId: string): Promise<{
  finalized: boolean;
  downloadUrl?: string;
}> {
  try {
    if (sourceType === 'ai_creative') {
      const { data, error } = await supabase
        .from('ai_creatives')
        .select('output_url, status')
        .eq('id', sourceId)
        .single();

      if (error || !data) {
        return { finalized: false };
      }

      return {
        finalized: data.status === 'complete' && !!data.output_url,
        downloadUrl: data.output_url || undefined,
      };
    } else if (sourceType === 'video_edit_queue') {
      const { data, error } = await contentDB
        .from('video_edit_queue')
        .select('final_render_url, render_status')
        .eq('id', sourceId)
        .single();

      if (error || !data) {
        return { finalized: false };
      }

      return {
        finalized: data.render_status === 'complete' && !!data.final_render_url,
        downloadUrl: data.final_render_url || undefined,
      };
    }

    return { finalized: false };
  } catch (error) {
    console.error('Check finalization error:', error);
    return { finalized: false };
  }
}
