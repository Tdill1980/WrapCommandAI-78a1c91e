import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContentFile {
  id: string;
  organization_id: string | null;
  uploader_id: string | null;
  source: string;
  source_id: string | null;
  brand: string;
  file_type: string;
  file_url: string;
  thumbnail_url: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  tags: string[];
  ai_labels: Record<string, unknown>;
  transcript: string | null;
  dominant_colors: string[];
  vehicle_info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  processing_status: string;
  content_category: string | null;
  visual_tags: Record<string, unknown> | null;
  visual_analyzed_at: string | null;
  ai_parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentProject {
  id: string;
  organization_id: string | null;
  brand: string;
  project_type: string;
  content_file_ids: string[];
  goal: string;
  platform: string;
  ai_brief: string | null;
  ai_output: Record<string, unknown>;
  canva_export_json: Record<string, unknown> | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  published_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentCalendarEntry {
  id: string;
  organization_id: string | null;
  content_project_id: string | null;
  brand: string;
  platform: string;
  scheduled_date: string;
  scheduled_time: string;
  content_type: string;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  status: string;
  posted_at: string | null;
  post_url: string | null;
  engagement_stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VideoProcessResult {
  action: string;
  transcript?: string;
  captions_srt?: string;
  captions_vtt?: string;
  beat_sheet?: Array<{ timestamp: string; description: string; type: string }>;
  cut_recommendations?: Array<{ start: string; end: string; reason: string; score: number }>;
  trim_recommendation?: { start: string; end: string; reason: string };
  enhancement_suggestions?: string[];
}

export interface AdGenerationResult {
  headlines: string[];
  hooks: string[];
  captions: Record<string, string>;
  cta_variations: string[];
  carousel_slides?: Array<{ headline: string; body: string; cta: string }>;
}

export interface RepurposeResult {
  formats: Record<string, {
    script: string;
    hook: string;
    caption: string;
    hashtags: string[];
    thumbnail_titles: string[];
    duration_recommendation: string;
  }>;
}

export function useContentBox() {
  const queryClient = useQueryClient();

  // Fetch content files
  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ["content-files"],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from("content_files")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as ContentFile[];
    },
  });

  // Fetch content projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["content-projects"],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from("content_projects")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as ContentProject[];
    },
  });

  // Fetch calendar entries
  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: ["content-calendar"],
    queryFn: async () => {
      const { data, error } = await contentDB
        .from("content_calendar")
        .select("*")
        .order("scheduled_date", { ascending: true });
      
      if (error) throw error;
      return data as ContentCalendarEntry[];
    },
  });

  // Upload file mutation
  const uploadFile = useMutation({
    mutationFn: async ({ 
      file, 
      brand = 'wpw',
      tags = []
    }: { 
      file: File; 
      brand?: string;
      tags?: string[];
    }) => {
      const fileName = `${Date.now()}-${file.name}`;
      const filePath = `${brand}/${fileName}`;

      // Upload to media-library bucket
      const { error: uploadError } = await supabase.storage
        .from("media-library")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("media-library")
        .getPublicUrl(filePath);

      // Determine file type
      let fileType = 'image';
      if (file.type.startsWith('video/')) fileType = 'video';
      if (file.type.startsWith('audio/')) fileType = 'audio';

      // Insert into database
      const { data, error } = await contentDB
        .from("content_files")
        .insert({
          source: 'upload',
          brand,
          file_type: fileType,
          file_url: publicUrl,
          original_filename: file.name,
          file_size_bytes: file.size,
          tags,
          processing_status: fileType === 'video' ? 'pending' : 'completed'
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-analyze on upload (non-blocking, safe)
      const visualTags = data?.visual_tags as Record<string, unknown> | null;
      const metaObj = visualTags?.meta as Record<string, unknown> | undefined;
      const manualOverride = metaObj?.manual_override === true;
      
      if (
        data &&
        !data.visual_analyzed_at &&
        !manualOverride &&
        data.content_category !== 'inspo_reference'
      ) {
        if (fileType === 'video') {
          lovableFunctions.functions.invoke('ai-analyze-video-frame', {
            body: { video_id: data.id }
          }).catch(err => console.error('Auto-analyze video failed:', err));
        }

        if (fileType === 'image') {
          lovableFunctions.functions.invoke('ai-analyze-image', {
            body: { content_file_id: data.id }
          }).catch(err => console.error('Auto-analyze image failed:', err));
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-files"] });
      toast.success("File uploaded successfully");
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  // AI Video Processing mutation
  const processVideo = useMutation({
    mutationFn: async ({
      action,
      file_id,
      file_url,
      trim_start,
      trim_end,
      brand = 'wpw'
    }: {
      action: string;
      file_id: string;
      file_url: string;
      trim_start?: number;
      trim_end?: number;
      brand?: string;
    }): Promise<VideoProcessResult> => {
      const { data, error } = await lovableFunctions.functions.invoke("ai-video-process", {
        body: { action, file_id, file_url, trim_start, trim_end, brand }
      });

      if (error) throw error;
      return data as VideoProcessResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["content-files"] });
      toast.success(`Video processed: ${data.action}`);
    },
    onError: (error) => {
      toast.error(`Video processing failed: ${error.message}`);
    },
  });

  // AI Ad Generation mutation
  const generateAd = useMutation({
    mutationFn: async ({
      brand,
      objective,
      platform,
      format,
      media_urls,
      media_context,
      headline,
      cta
    }: {
      brand: string;
      objective: string;
      platform: string;
      format: string;
      media_urls: string[];
      media_context?: string;
      headline?: string;
      cta?: string;
    }): Promise<AdGenerationResult> => {
      const { data, error } = await lovableFunctions.functions.invoke("ai-generate-ad", {
        body: { brand, objective, platform, format, media_urls, media_context, headline, cta }
      });

      if (error) throw error;
      return data as AdGenerationResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-projects"] });
      toast.success("Ad variations generated!");
    },
    onError: (error) => {
      toast.error(`Ad generation failed: ${error.message}`);
    },
  });

  // AI Repurpose Content mutation
  const repurposeContent = useMutation({
    mutationFn: async ({
      brand,
      source_url,
      source_type,
      source_transcript,
      target_formats,
      enhancements
    }: {
      brand: string;
      source_url: string;
      source_type: string;
      source_transcript?: string;
      target_formats: string[];
      enhancements?: string[];
    }): Promise<RepurposeResult> => {
      const { data, error } = await lovableFunctions.functions.invoke("ai-repurpose-content", {
        body: { brand, source_url, source_type, source_transcript, target_formats, enhancements }
      });

      if (error) throw error;
      return data as RepurposeResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-projects"] });
      toast.success("Content repurposed to multiple formats!");
    },
    onError: (error) => {
      toast.error(`Repurposing failed: ${error.message}`);
    },
  });

  // Generate content mutation (legacy)
  const generateContent = useMutation({
    mutationFn: async ({
      brand,
      content_type,
      goal,
      platform,
      media_urls = [],
      transcript = '',
      tags = [],
      vehicle_info = {},
      additional_context = ''
    }: {
      brand: string;
      content_type: string;
      goal: string;
      platform: string;
      media_urls?: string[];
      transcript?: string;
      tags?: string[];
      vehicle_info?: Record<string, unknown>;
      additional_context?: string;
    }) => {
      const { data, error } = await lovableFunctions.functions.invoke("generate-social-content", {
        body: {
          brand,
          content_type,
          goal,
          platform,
          media_urls,
          transcript,
          tags,
          vehicle_info,
          additional_context
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["content-projects"] });
      toast.success("Content generated successfully");
    },
    onError: (error) => {
      toast.error(`Generation failed: ${error.message}`);
    },
  });

  // Sync Instagram mutation
  const syncInstagram = useMutation({
    mutationFn: async ({ brand = 'wpw' }: { brand?: string }) => {
      const { data, error } = await lovableFunctions.functions.invoke("sync-instagram-media", {
        body: { brand }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["content-files"] });
      toast.success(`Synced ${data.synced} new items from Instagram`);
    },
    onError: (error) => {
      toast.error(`Instagram sync failed: ${error.message}`);
    },
  });

  // Generate calendar mutation
  const generateCalendar = useMutation({
    mutationFn: async ({ weeks_ahead = 2 }: { weeks_ahead?: number }) => {
      const { data, error } = await lovableFunctions.functions.invoke("generate-content-calendar", {
        body: { weeks_ahead }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["content-calendar"] });
      toast.success(`Created ${data.entries_created} calendar entries`);
    },
    onError: (error) => {
      toast.error(`Calendar generation failed: ${error.message}`);
    },
  });

  return {
    files,
    projects,
    calendar,
    isLoading: filesLoading || projectsLoading || calendarLoading,
    uploadFile,
    generateContent,
    syncInstagram,
    generateCalendar,
    // New AI functions
    processVideo,
    generateAd,
    repurposeContent
  };
}
