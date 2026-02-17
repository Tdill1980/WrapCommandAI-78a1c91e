import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export interface InspoFile {
  id: string;
  file_url: string;
  thumbnail_url: string | null;
  file_type: string;
  original_filename: string | null;
  tags: string[];
  created_at: string;
  duration_seconds: number | null;
  content_category: string | null;
}

export function useInspoLibrary() {
  const queryClient = useQueryClient();
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ current: number; total: number } | null>(null);

  // Fetch all uploaded inspo content from content_files
  const { data: library, isLoading } = useQuery({
    queryKey: ["inspo-library"],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from("content_files")
        .select("id, file_url, thumbnail_url, file_type, original_filename, tags, created_at, duration_seconds, content_category")
        .in("file_type", ["image", "video"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as InspoFile[];
    },
  });

  // Upload file to storage and create record, then auto-analyze for style extraction
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get organization ID
      let organizationId: string | null = null;
      if (user) {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .single();
        organizationId = orgMember?.organization_id || null;
      }

      // Determine file type
      const isVideo = file.type.startsWith("video/");
      const fileType = isVideo ? "video" : "image";
      
      // Upload to storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const storagePath = `inspo/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("media-library")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media-library")
        .getPublicUrl(storagePath);

      // Insert record into content_files with proper tags for template recognition
      const { data, error } = await contentDB
        .from("content_files")
        .insert({
          organization_id: organizationId,
          file_url: urlData.publicUrl,
          file_type: fileType,
          original_filename: file.name,
          source: "inspo_upload",
          content_category: "inspo_reference",
          tags: ["inspo", "reference", "template", fileType],
        })
        .select()
        .single();

      if (error) throw error;

      // AUTO-ANALYZE: Trigger style extraction for both images and videos
      if (organizationId) {
        console.log("[useInspoLibrary] Auto-analyzing uploaded template for style extraction");
        
        const functionName = fileType === "video" ? "analyze-inspo-video" : "analyze-inspo-image";
        const bodyPayload = fileType === "video" 
          ? { videoUrl: urlData.publicUrl, platform: "upload", organizationId }
          : { imageUrl: urlData.publicUrl, organizationId, contentFileId: data.id };
        
        lovableFunctions.functions.invoke(functionName, { body: bodyPayload })
          .then(({ data: analysisData, error: analysisError }) => {
            if (analysisError) {
              console.error("[useInspoLibrary] Auto-analysis failed:", analysisError);
            } else {
              console.log("[useInspoLibrary] Style extracted:", analysisData?.analysis?.styleName || "Complete");
              toast.success("Style extracted from your template!", {
                description: `Your ${fileType} style will be used for video rendering`,
              });
            }
          });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspo-library"] });
      toast.success("File uploaded! Extracting style...");
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast.error("Failed to upload file");
    },
  });

  // Re-analyze all existing files to extract styles
  const reanalyzeAll = async () => {
    if (!library || library.length === 0) {
      toast.error("No files to analyze");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please log in first");
      return;
    }

    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    
    const organizationId = orgMember?.organization_id;
    if (!organizationId) {
      toast.error("No organization found");
      return;
    }

    setReanalyzeProgress({ current: 0, total: library.length });
    toast.info(`Re-analyzing ${library.length} files to extract your style...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < library.length; i++) {
      const file = library[i];
      setReanalyzeProgress({ current: i + 1, total: library.length });

      try {
        const isVideo = file.file_type === "video";
        const functionName = isVideo ? "analyze-inspo-video" : "analyze-inspo-image";
        const bodyPayload = isVideo
          ? { videoUrl: file.file_url, platform: "library", organizationId }
          : { imageUrl: file.file_url, organizationId, contentFileId: file.id };

        const { error } = await lovableFunctions.functions.invoke(functionName, { body: bodyPayload });
        
        if (error) {
          console.error(`Failed to analyze ${file.original_filename}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`Error analyzing ${file.original_filename}:`, err);
        errorCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setReanalyzeProgress(null);
    
    if (successCount > 0) {
      toast.success(`Style extracted from ${successCount} files!`, {
        description: errorCount > 0 ? `${errorCount} files failed` : "Your style profile has been updated",
      });
    } else {
      toast.error("Failed to analyze files");
    }
  };

  // Delete file
  const deleteFile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await contentDB
        .from("content_files")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspo-library"] });
      toast.success("File deleted");
    },
  });

  return {
    library: library || [],
    isLoading,
    uploadFile: uploadFile.mutateAsync,
    isUploading: uploadFile.isPending,
    deleteFile: deleteFile.mutate,
    reanalyzeAll,
    reanalyzeProgress,
  };
}
