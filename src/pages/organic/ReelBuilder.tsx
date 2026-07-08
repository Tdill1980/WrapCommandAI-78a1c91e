import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Wand2,
  Music,
  Type,
  Sparkles,
  GripVertical,
  Trash2,
  Clock,
  Zap,
  Palette,
  Layers,
  Scissors,
  Loader2,
  Brain,
  Download,
  ChevronDown,
  Upload,
  Video,
  Settings,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { SceneBlueprint, SceneBlueprintScene, validateBlueprint, createTestBlueprint, FORMAT_TEMPLATE_MAP, OVERLAY_PACK_MAP } from "@/types/SceneBlueprint";
import { assertRenderable, checkRenderable, BlueprintNotRenderableError } from "@/lib/assertRenderable";
import { AutoCreateInput, AutoCreateNavigationState } from "@/types/AutoCreateInput";
import { ProducerJob, hasLockedProducerJob } from "@/types/ProducerJob";
import { CreativeAssembly } from "@/lib/editor-brain/creativeAssembler";
import { cn } from "@/lib/utils";
import { useReelBeatSync } from "@/hooks/useReelBeatSync";
import { useReelCaptions, CaptionStyle } from "@/hooks/useReelCaptions";
import { useReelOverlays, BrandPackId } from "@/hooks/useReelOverlays";
import { useEditorBrain } from "@/hooks/useEditorBrain";
import { useSmartAssist } from "@/hooks/useSmartAssist";
import { useAutoCreateReel, DaraFormatType } from "@/hooks/useAutoCreateReel";
import { useMightyEdit, RenderProgress } from "@/hooks/useMightyEdit";
import { RenderProgressBar } from "@/components/mighty-edit/RenderProgressBar";
import { RenderResult } from "@/components/mighty-edit/RenderResult";
import { BeatSyncPanel } from "@/components/reel/BeatSyncPanel";
import { CaptionsPanel } from "@/components/reel/CaptionsPanel";
import { BrandOverlayPanel } from "@/components/reel/BrandOverlayPanel";
import { SmartAssistPanel } from "@/components/reel-builder/SmartAssistPanel";
import { DaraFormatSelector } from "@/components/reel-builder/DaraFormatSelector";
import { MediaLibraryModal } from "@/components/media/MediaLibraryModal";
import { PostRenderModal } from "@/components/reel-builder/PostRenderModal";
import { ContentMetadataPanel, useContentMetadata, ContentMetadata } from "@/components/content/ContentMetadataPanel";
import { MediaFile } from "@/components/media/MediaLibrary";
import { DARA_FORMATS, DaraFormat } from "@/lib/dara-denney-formats";
import { supabase, lovableFunctions, contentDB } from "@/integrations/supabase/client";
import { downloadToDevice } from "@/lib/downloadUtils";
import { sanitizeForJson } from "@/lib/sanitizeForJson";
import { createCreativeWithTags, saveBlueprintSnapshot, updateCreative, replaceStatusTag, SourceType } from "@/lib/creativeVault";
import { finalizeRender } from "@/lib/finalizeRender";
import { REEL_RENDER_FN } from "@/lib/featureFlags";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Clip {
  id: string;
  name: string;
  url: string;
  duration: number;
  thumbnail?: string;
  trimStart: number;
  trimEnd: number;
  speed?: number;
  hookScore?: number;
  energyLevel?: number;
  suggestedOverlay?: string;
  reason?: string;
}

export default function ReelBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const autoCreateState = location.state as AutoCreateNavigationState | undefined;
  const producerJobState = location.state as { 
    producerJob?: ProducerJob; 
    skipAutoCreate?: boolean;
    content_calendar_id?: string;  // 🔧 FIX: Accept calendar ID from agent flow
  } | undefined;
  
  // Extract content_calendar_id for linking render results back to calendar
  const contentCalendarId = producerJobState?.content_calendar_id;
  
  // ============ DETERMINISTIC AUTO-CREATE FLAG ============
  // Prevents double-execution when coming from MightyTask/Calendar
  const hasAutoCreatedFromInput = useRef(false);
  const hasLoadedProducerJob = useRef(false);

  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("clip");
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceClipId, setReplaceClipId] = useState<string | null>(null);
  const [reelConcept, setReelConcept] = useState<string | null>(null);
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);
  const [showPostRenderModal, setShowPostRenderModal] = useState(false);
  const [savedVideoUrl, setSavedVideoUrl] = useState<string | null>(null);
  const [extractedInspoStyle, setExtractedInspoStyle] = useState<any>(null);
  const [suggestedHook, setSuggestedHook] = useState<string | null>(null);
  const [suggestedCta, setSuggestedCta] = useState<string | null>(null);
  const [selectedDaraFormat, setSelectedDaraFormat] = useState<DaraFormat | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [contentMetadata, setContentMetadata] = useContentMetadata("wpw");
  
  // FINALIZATION: Track guaranteed download URL (only set after finalization succeeds)
  const [finalizedDownloadUrl, setFinalizedDownloadUrl] = useState<string | null>(null);
  const [isFinalizingRender, setIsFinalizingRender] = useState(false);
  const [lastCreativeId, setLastCreativeId] = useState<string | null>(null);
  // ============ SCENE BLUEPRINT AUTHORITY ============
  // This is the ONLY object that controls rendering.
  // If this is null, NOTHING renders. Period.
  const [sceneBlueprint, setSceneBlueprint] = useState<SceneBlueprint | null>(null);
  const [blueprintValidation, setBlueprintValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: false, errors: ['No blueprint created yet'] });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadVideoRef = useRef<HTMLVideoElement>(null);

  const beatSync = useReelBeatSync();
  const captionsEngine = useReelCaptions();
  const overlaysEngine = useReelOverlays();
  const editorBrain = useEditorBrain();
  const smartAssist = useSmartAssist();
  const { executeEdits, renderProgress, isExecuting, stopPolling } = useMightyEdit();
  const [isRenderingReel, setIsRenderingReel] = useState(false);
  const autoCreateReel = useAutoCreateReel();
  
  // ✅ RUN 2 + RUN 3: Track queue ID for diagnostics panel
  const [lastQueueId, setLastQueueId] = useState<string | null>(null);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);

  // Validate blueprint whenever it changes
  useEffect(() => {
    const validation = validateBlueprint(sceneBlueprint);
    setBlueprintValidation(validation);
    if (sceneBlueprint) {
      console.log('[ReelBuilder] Blueprint updated:', sceneBlueprint);
      console.log('[ReelBuilder] Blueprint validation:', validation);
    }
  }, [sceneBlueprint]);

  // ============ BUILD BLUEPRINT FROM SMART ASSIST ============
  // Converts CreativeAssembly + Clips into authoritative SceneBlueprint
  const buildBlueprintFromSmartAssist = useCallback((
    creative: CreativeAssembly,
    sourceClips: Clip[],
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' = 'instagram'
  ): SceneBlueprint => {
    const scenes: SceneBlueprintScene[] = creative.sequence.map((seq, index) => {
      const clip = sourceClips[index] || sourceClips[0];
      const purpose: SceneBlueprintScene['purpose'] = 
        index === 0 ? 'hook' : 
        index === creative.sequence.length - 1 ? 'cta' : 
        'b_roll';
      
      // Find overlay that falls within this scene's timing
      const overlay = creative.overlays.find(o => o.start >= seq.start && o.start < seq.end);
      
      return {
        sceneId: `smart_${index + 1}`,
        clipId: clip.id,
        clipUrl: clip.url,
        start: seq.start,
        end: seq.end,
        purpose,
        text: overlay?.text,
        textPosition: overlay?.position || 'center',
        animation: overlay?.animation === 'typewriter' ? 'pop' : (overlay?.animation || seq.transition || 'pop') as SceneBlueprintScene['animation'],
        cutReason: seq.label || `Smart Assist scene ${index + 1}`,
      };
    });

    const totalDuration = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);

    return {
      id: `bp_smart_${Date.now()}`,
      platform,
      totalDuration,
      scenes,
      endCard: {
        duration: 3,
        text: creative.cta || 'Follow for more',
        cta: creative.cta || 'Follow for more',
      },
      createdAt: new Date().toISOString(),
      source: 'smart_assist',
      // ============ DEFAULT FORMAT LOCK ============
      format: 'reel',
      aspectRatio: '9:16',
      templateId: FORMAT_TEMPLATE_MAP['reel']?.templateId || 'ig_reel_v1',
      overlayPack: 'wpw_signature',
      font: OVERLAY_PACK_MAP['wpw_signature']?.font || 'Inter Black',
      textStyle: OVERLAY_PACK_MAP['wpw_signature']?.textStyle || 'bold',
    };
  }, []);

  // ============ BUILD BLUEPRINT FROM AUTO-CREATE ============
  // Converts AutoCreateResult + Clips into authoritative SceneBlueprint
  const buildBlueprintFromAutoCreate = useCallback((
    sourceClips: Clip[],
    autoResult: { suggested_cta?: string; reel_concept?: string },
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' = 'instagram'
  ): SceneBlueprint => {
    const scenes: SceneBlueprintScene[] = sourceClips.map((clip, index) => {
      const purpose: SceneBlueprintScene['purpose'] = 
        index === 0 ? 'hook' : 
        index === sourceClips.length - 1 ? 'cta' : 
        'b_roll';
      
      return {
        sceneId: `auto_${index + 1}`,
        clipId: clip.id,
        clipUrl: clip.url,
        start: clip.trimStart,
        end: clip.trimEnd,
        purpose,
        text: clip.suggestedOverlay,
        textPosition: 'center',
        animation: 'pop',
        cutReason: clip.reason || `AI selected clip ${index + 1}`,
      };
    });

    const totalDuration = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);

    return {
      id: `bp_auto_${Date.now()}`,
      platform,
      totalDuration,
      scenes,
      endCard: {
        duration: 3,
        text: autoResult.suggested_cta || 'Follow for more',
        cta: autoResult.suggested_cta || 'Follow for more',
      },
      createdAt: new Date().toISOString(),
      source: 'ai',
      // ============ DEFAULT FORMAT LOCK ============
      format: 'reel',
      aspectRatio: '9:16',
      templateId: FORMAT_TEMPLATE_MAP['reel']?.templateId || 'ig_reel_v1',
      overlayPack: 'wpw_signature',
      font: OVERLAY_PACK_MAP['wpw_signature']?.font || 'Inter Black',
      textStyle: OVERLAY_PACK_MAP['wpw_signature']?.textStyle || 'bold',
      caption: autoResult.reel_concept,
    };
  }, []);

  // ============ LOAD PRODUCER JOB FROM AGENT ============
  // When an agent (like Noah) creates a locked ProducerJob, load it directly
  // NO auto-create runs, NO AI re-selection - clips and overlays are exactly as specified
  useEffect(() => {
    if (hasLoadedProducerJob.current) return;

    if (producerJobState?.skipAutoCreate && producerJobState?.producerJob?.lock) {
      const job = producerJobState.producerJob;
      console.log('[ReelBuilder] 🔒 Loading LOCKED ProducerJob from agent:', job);
      hasLoadedProducerJob.current = true;

      // Convert ProducerJob clips to ReelBuilder clips
      const newClips: Clip[] = job.clips.map((clip, index) => ({
        id: clip.id,
        name: clip.reason || `Clip ${index + 1}`,
        url: clip.url,
        duration: clip.duration,
        thumbnail: clip.thumbnail,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        speed: 1,
        suggestedOverlay: clip.suggestedOverlay,
        reason: clip.reason,
      }));

      // Authoritative state
      setClips(newClips);
      setSuggestedHook(job.hook || null);
      setSuggestedCta(job.cta || null);
      setReelConcept(job.hook || 'Agent-created reel');

      // ✅ Music: Creatomate requires a publicly reachable URL.
      // For now we ONLY allow absolute http(s) URLs (no local /audio/* placeholders).
      const resolveMusicUrl = (j: ProducerJob): string | null => {
        const url = j.musicUrl || null;
        if (!url) return null;
        return /^https?:\/\//i.test(url) ? url : null;
      };
      setAudioUrl(resolveMusicUrl(job));

      // Reset any previous overlays so we don't accidentally render a giant paragraph blob
      overlaysEngine.clearOverlays();

      // Build a blueprint that uses ProducerJob overlays (NOT clip.suggestedOverlay)
      const timelineOverlays = Array.isArray(job.overlays) ? job.overlays : [];

      let cursor = 0;
      const scenes: SceneBlueprintScene[] = newClips.map((clip, index) => {
        // ✅ FIX #1: Handle undefined trimEnd by falling back to clip.duration
        const clipStart = clip.trimStart ?? 0;
        const clipEnd = clip.trimEnd ?? clipStart + (clip.duration ?? 5); // default 5s if no duration
        const clipDuration = Math.max(0.5, clipEnd - clipStart); // minimum 0.5s scene
        const sceneStart = cursor;
        const sceneEnd = cursor + clipDuration;
        cursor = sceneEnd;

        const purpose: SceneBlueprintScene['purpose'] =
          index === 0 ? 'hook' : index === newClips.length - 1 ? 'cta' : 'b_roll';

        const overlay = timelineOverlays.find(o => o.start >= sceneStart && o.start < sceneEnd);

        // Also keep overlays in the overlay engine for UI visibility/editing
        if (overlay) {
          overlaysEngine.addOverlay({
            text: overlay.text,
            style: 'modern',
            position:
              overlay.position === 'top'
                ? 'top-center'
                : overlay.position === 'bottom'
                  ? 'bottom-center'
                  : 'center',
            start: overlay.start,
            end: overlay.start + overlay.duration,
            color: '#E1306C',
          });
        }

        return {
          sceneId: `producer_${index + 1}`,
          clipId: clip.id,
          clipUrl: clip.url,
          start: clipStart,
          end: clipEnd,
          purpose,
          text: overlay?.text,
          textPosition: overlay?.position || 'center',
          animation: 'pop',
          cutReason: clip.reason || 'ProducerJob locked clip',
        };
      });

      const totalDuration = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);

      const blueprint: SceneBlueprint = {
        id: `bp_producer_${Date.now()}`,
        platform: job.platform,
        totalDuration,
        scenes,
        endCard: {
          duration: 3,
          text: job.cta || 'Follow for more',
          cta: job.cta || 'Follow for more',
        },
        createdAt: new Date().toISOString(),
        source: 'manual',
        // ============ DEFAULT FORMAT LOCK ============
        format: job.contentType === 'story' ? 'story' : job.contentType === 'short' ? 'short' : 'reel',
        aspectRatio: '9:16',
        templateId: FORMAT_TEMPLATE_MAP[job.contentType === 'story' ? 'story' : job.contentType === 'short' ? 'short' : 'reel']?.templateId || 'ig_reel_v1',
        overlayPack: job.style || 'wpw_signature',
        font: OVERLAY_PACK_MAP[job.style || 'wpw_signature']?.font || 'Inter Black',
        textStyle: OVERLAY_PACK_MAP[job.style || 'wpw_signature']?.textStyle || 'bold',
        caption: job.caption,
      };

      setSceneBlueprint(blueprint);

      toast.success(`Loaded ${newClips.length} clips (locked)`, {
        description: `${timelineOverlays.length} timed overlays • ${job.musicUrl ? 'music attached' : 'no music URL'}`,
      });
    }
  }, [producerJobState, overlaysEngine]);

  // Generate test blueprint from clips (for verification)
  const handleCreateTestBlueprint = useCallback(() => {
    if (clips.length === 0) {
      toast.error('Add clips first to create a test blueprint');
      return;
    }
    
    const testBlueprint = createTestBlueprint(
      clips.map(c => ({ id: c.id, url: c.url, duration: c.duration }))
    );
    setSceneBlueprint(testBlueprint);
    toast.success('Test blueprint created!', {
      description: `${testBlueprint.scenes.length} scenes, ${testBlueprint.totalDuration.toFixed(1)}s total`,
    });
  }, [clips]);

  // ✅ RUN 2: Test Render - Creates hardcoded blueprint and triggers render
  const handleTestRender = useCallback(async () => {
    if (clips.length === 0) {
      toast.error('Add at least 1 clip first');
      return;
    }

    setIsRenderingReel(true);
    toast.info('Test render starting...');

    try {
      const firstClipUrl = clips[0].url;
      
      // Create hardcoded test blueprint with 2 scenes
      const testScenes = [
        {
          order: 1,
          scene_id: 'test_1',
          clip_id: clips[0].id,
          clip_url: firstClipUrl,
          start_time: 0,
          end_time: 1.5,
          purpose: 'hook',
          label: 'hook',
          text: 'OLD LOOK',
          text_overlay: 'OLD LOOK',
          text_position: 'center',
          animation: 'pop',
          cut_reason: 'Test hook scene',
        },
        {
          order: 2,
          scene_id: 'test_2',
          clip_id: clips[0].id,
          clip_url: firstClipUrl,
          start_time: 1.5,
          end_time: 3.0,
          purpose: 'b_roll',
          label: 'b_roll',
          text: 'NEW VIBE',
          text_overlay: 'NEW VIBE',
          text_position: 'center',
          animation: 'pop',
          cut_reason: 'Test b-roll scene',
        },
      ];

      // First create content_files entry
      const { data: contentFile, error: cfError } = await contentDB
        .from('content_files')
        .insert({
          file_url: firstClipUrl,
          file_type: 'video',
          source: 'test_render',
          original_filename: 'Test Render Upload',
        })
        .select('id')
        .single();

      if (cfError) {
        console.error('[TestRender] Failed to create content file:', cfError);
        toast.error('Failed to prepare test video');
        setIsRenderingReel(false);
        return;
      }

      // Create queue entry with hardcoded blueprint
      const { data: queueEntry, error: queueError } = await contentDB
        .from('video_edit_queue')
        .insert({
          content_file_id: contentFile.id,
          source_url: firstClipUrl,
          title: 'Test Render - OLD LOOK → NEW VIBE',
          ai_edit_suggestions: {
            blueprint_id: 'test',
            blueprint_source: 'test',
            scenes: testScenes,
            end_card: null,
          },
          render_status: 'pending',
          status: 'ready_for_review',
        })
        .select('id')
        .single();

      if (queueError) {
        console.error('[TestRender] Failed to create queue entry:', queueError);
        toast.error('Failed to start test render');
        setIsRenderingReel(false);
        return;
      }

      console.log('[TestRender] ✅ Created queue entry:', queueEntry.id);
      setLastQueueId(queueEntry.id);
      setDiagnosticsOpen(true);
      
      toast.success('Test render started!', { description: `Queue ID: ${queueEntry.id.slice(0, 8)}...` });

      // Call executeEdits
      await executeEdits(queueEntry.id, 'full');
      
    } catch (err) {
      console.error('[TestRender] Failed:', err);
      toast.error('Test render failed', { 
        description: err instanceof Error ? err.message : 'Unknown error' 
      });
    } finally {
      setIsRenderingReel(false);
    }
  }, [clips, executeEdits]);

  // ✅ RUN 3: Refresh diagnostics data from queue
  const handleRefreshDiagnostics = useCallback(async () => {
    if (!lastQueueId) return;
    
    setIsLoadingDiagnostics(true);
    try {
      const { data, error } = await contentDB
        .from('video_edit_queue')
        .select('*')
        .eq('id', lastQueueId)
        .single();
      
      if (error) {
        console.error('[Diagnostics] Fetch error:', error);
        toast.error('Failed to fetch diagnostics');
      } else {
        setDiagnosticsData(data);
        console.log('[Diagnostics] Data refreshed:', data);
      }
    } catch (err) {
      console.error('[Diagnostics] Exception:', err);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }, [lastQueueId]);

  // Single video upload handler - uploads video, then AI analyzes and finds best scenes
  const handleVideoUpload = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    toast.info("Uploading video...");

    try {
      // Upload to Supabase storage
      const fileName = `reel-source-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media-library')
        .upload(`uploads/${fileName}`, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('media-library')
        .getPublicUrl(`uploads/${fileName}`);

      const videoUrl = urlData.publicUrl;
      setUploadedVideoUrl(videoUrl);

      // Get video duration
      const videoDuration = await new Promise<number>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          resolve(video.duration);
        };
        video.onerror = () => resolve(60); // Default 60s if can't read
        video.src = videoUrl;
      });

      toast.success("Video uploaded! AI analyzing...");
      setIsAutoProcessing(true);

      // Call AI to analyze this single video and find best scenes
      const result = await autoCreateReel.autoCreate({
        videoUrl: videoUrl,
        videoDuration: videoDuration,
        daraFormat: selectedDaraFormat as DaraFormatType | undefined,
      });

      if (result && result.selected_videos && result.selected_videos.length > 0) {
        // Convert AI scene cuts into clips (all from same source video)
        const newClips: Clip[] = result.selected_videos
          .sort((a, b) => a.order - b.order)
          .map((scene) => ({
            id: scene.id,
            name: scene.reason || `Scene ${scene.order}`,
            url: videoUrl, // All clips use the same source video
            duration: (scene.trim_end || 5) - (scene.trim_start || 0),
            trimStart: scene.trim_start || 0,
            trimEnd: scene.trim_end || 5,
            speed: 1,
            suggestedOverlay: scene.suggested_overlay,
            reason: scene.reason,
          }));

        setClips(newClips);
        setReelConcept(result.reel_concept);
        setSuggestedHook(result.suggested_hook);
        setSuggestedCta(result.suggested_cta);

        // Apply hook overlay
        if (result.suggested_hook) {
          overlaysEngine.addOverlay({
            text: result.suggested_hook,
            style: "modern",
            position: "top-center",
            start: 0,
            end: 3,
            color: "#E1306C",
          });
        }

        toast.success(`AI found ${newClips.length} best scenes!`, {
          description: result.reel_concept,
        });
      } else {
        toast.error("AI couldn't find good scenes. Try a different video.");
      }
    } catch (error) {
      console.error("Upload/analysis failed:", error);
      toast.error("Failed to process video");
    } finally {
      setIsUploading(false);
      setIsAutoProcessing(false);
    }
  }, [selectedDaraFormat, autoCreateReel, overlaysEngine]);

  // Dropzone for single video upload
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleVideoUpload,
    accept: { 'video/*': ['.mp4', '.mov', '.webm', '.avi'] },
    maxFiles: 1,
    disabled: isUploading || isAutoProcessing,
  });

  // AI Auto-Create handler - uses inspo styles, format, and picks best videos
  const handleAIAutoCreate = async (format?: DaraFormat) => {
    const useFormat = format || selectedDaraFormat;
    setIsAutoProcessing(true);
    const result = await autoCreateReel.autoCreate({
      maxVideos: 50,
      daraFormat: useFormat as DaraFormatType | undefined,
    });
    
    if (result && result.selected_videos && result.selected_videos.length > 0) {
      // Load the AI-selected clips directly
      const newClips: Clip[] = result.selected_videos
        .sort((a, b) => a.order - b.order)
        .map((video) => ({
          id: video.id,
          name: video.original_filename || `Clip ${video.order}`,
          url: video.file_url || "",
          duration: video.duration_seconds || 10,
          thumbnail: video.thumbnail_url,
          trimStart: video.trim_start || 0,
          trimEnd: video.trim_end || (video.duration_seconds || 10),
          speed: 1,
          suggestedOverlay: video.suggested_overlay,
          reason: video.reason,
        }));

      setClips(newClips);
      setReelConcept(result.reel_concept);
      setSuggestedHook(result.suggested_hook);
      setSuggestedCta(result.suggested_cta);
      
      // Store extracted visual style for rendering
      if (result.extracted_style) {
        setExtractedInspoStyle(result.extracted_style);
        console.log("Using inspo style:", result.extracted_style);
      }

      // ============ AUTO-CREATE BLUEPRINT FROM AI-SELECTED CLIPS ============
      const blueprint = buildBlueprintFromAutoCreate(newClips, result, 'instagram');
      setSceneBlueprint(blueprint);
      console.log("Blueprint created from AI auto-create:", blueprint.id);

      // Apply the suggested hook as overlay with inspo colors
      if (result.suggested_hook) {
        overlaysEngine.addOverlay({
          text: result.suggested_hook,
          style: "modern",
          position: "top-center",
          start: 0,
          end: 3,
          color: result.extracted_style?.text_color || "#E1306C",
        });
      }

      // ============ AUTO-GENERATE CAPTIONS ============
      const totalDuration = newClips.reduce((sum, clip) => sum + (clip.trimEnd - clip.trimStart), 0);
      const captionsVideoUrl = blueprint.scenes?.[0]?.clipUrl || newClips[0]?.url || "";

      captionsEngine
        .generateCaptions(captionsVideoUrl, captionsEngine.settings.style, {
          duration: totalDuration,
          concept: result.reel_concept,
          hook: result.suggested_hook,
          cta: result.suggested_cta,
        })
        .then((captions) => {
          if (captions.length > 0) {
            toast.success(`Auto-generated ${captions.length} captions`, {
              description: "Adjust timing in the Captions tab",
            });
          }
        });

      const formatInfo = useFormat ? DARA_FORMATS[useFormat] : null;
      toast.success(`AI created reel with ${newClips.length} clips + blueprint!`, {
        description: `${result.reel_concept}${formatInfo ? ` • ${formatInfo.emoji} ${formatInfo.name}` : ''}${result.extracted_style ? ' • Style matched!' : ''}`,
      });
    }
    setIsAutoProcessing(false);
  };

  // Handle play/pause with ref
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Auto-save when render succeeds via renderProgress
  useEffect(() => {
    const saveRenderedVideo = async () => {
      if (renderProgress?.status === 'complete' && renderProgress.outputUrl && !isFinalizingRender) {
        setIsFinalizingRender(true);
        
        try {
          // 🔧 FIX: Use correct sources for hook/cta - prioritize producerJob, then suggestedHook state, then autoCreateState
          const effectiveHook = suggestedHook 
            ?? producerJobState?.producerJob?.hook 
            ?? autoCreateState?.suggestedHook 
            ?? reelConcept;
          const effectiveCta = suggestedCta 
            ?? producerJobState?.producerJob?.cta 
            ?? autoCreateState?.suggestedCta;
          const effectiveCaption = producerJobState?.producerJob?.caption 
            ?? effectiveHook 
            ?? reelConcept;
          const effectiveHashtags = producerJobState?.producerJob?.hashtags ?? [];

          // Save to content_files (Media Library)
          const { data: fileData, error: fileError } = await contentDB
            .from('content_files')
            .insert({
              file_url: renderProgress.outputUrl,
              file_type: 'video',
              source: 'ai_reel_builder',
              brand: contentMetadata.brand,
              tags: ['ai-created', 'reel', 'auto-generated'],
              original_filename: `AI-Reel-${Date.now()}.mp4`,
              ai_labels: {
                concept: reelConcept,
                clips_used: clips.length,
                hook: effectiveHook,
                cta: effectiveCta,
              },
            })
            .select()
            .single();

          if (fileError) throw fileError;

          // Save to content_queue (for scheduling/review) with metadata
          const { error: queueError } = await contentDB
            .from('content_queue')
            .insert({
              content_type: 'reel',
              status: 'draft',
              output_url: renderProgress.outputUrl,
              caption: effectiveCaption,
              hashtags: effectiveHashtags,
              brand: contentMetadata.brand,
              channel: contentMetadata.channel,
              content_purpose: contentMetadata.contentPurpose,
              platform: contentMetadata.platform,
              ad_placement: contentMetadata.adPlacement,
              ai_metadata: {
                concept: reelConcept,
                clips_used: clips.map(c => c.id),
                generated_at: new Date().toISOString(),
                source: contentCalendarId ? 'agent_flow' : 'manual',
              },
              mode: 'auto',
            });

          if (queueError) throw queueError;

          // 🔧 FIX: Update linked content_calendar entry if we have one
          if (contentCalendarId) {
            try {
              const { error: calError } = await contentDB
                .from('content_calendar')
                .update({
                  caption: effectiveCaption,
                  hashtags: effectiveHashtags,
                  title: effectiveHook,
                  status: 'draft',
                  // Store render URL in engagement_stats for reference
                  engagement_stats: { render_url: renderProgress.outputUrl },
                })
                .eq('id', contentCalendarId);

              if (calError) {
                console.error('[ReelBuilder] Failed to update calendar entry:', calError);
              } else {
                console.log('[ReelBuilder] ✅ Updated calendar entry with render result');
              }
            } catch (calErr) {
              console.error('[ReelBuilder] Calendar update exception:', calErr);
            }
          }

          // ============ PHASE 5: FINALIZATION CONTRACT ============
          // This is the CRITICAL step that guarantees downloads work
          // We call finalizeRender to ensure the video is properly stored
          // and the download URL is persisted in the database
          if (lastCreativeId) {
            console.log('[ReelBuilder] 🔒 Finalizing render for creative:', lastCreativeId);
            
            const finalizationResult = await finalizeRender({
              sourceType: 'ai_creative',
              sourceId: lastCreativeId,
              externalUrl: renderProgress.outputUrl,
              metadata: {
                title: effectiveCaption || 'Reel Builder Export',
                format: sceneBlueprint?.format || 'reel',
                duration: sceneBlueprint?.totalDuration,
              },
            });

            if (finalizationResult.success && finalizationResult.downloadUrl) {
              console.log('[ReelBuilder] ✅ Finalization complete, download URL:', finalizationResult.downloadUrl);
              setFinalizedDownloadUrl(finalizationResult.downloadUrl);
            } else {
              console.error('[ReelBuilder] Finalization failed:', finalizationResult.error);
              // Still allow download from render URL as fallback
              setFinalizedDownloadUrl(renderProgress.outputUrl);
            }
          } else {
            // No creative ID, use render URL directly
            setFinalizedDownloadUrl(renderProgress.outputUrl);
          }

          setSavedVideoUrl(renderProgress.outputUrl);
          setShowPostRenderModal(true);
          toast.success('Reel saved to library and queue!');
        } catch (error) {
          console.error('Failed to save rendered video:', error);
          toast.error('Render complete but failed to save');
          // Still allow download from render URL
          setFinalizedDownloadUrl(renderProgress.outputUrl);
        } finally {
          setIsFinalizingRender(false);
        }
      }
    };

    saveRenderedVideo();
  }, [renderProgress?.status, renderProgress?.outputUrl, contentMetadata, suggestedHook, suggestedCta, producerJobState, contentCalendarId, lastCreativeId, sceneBlueprint, isFinalizingRender]);

  // Handle render reel - REQUIRES SCENE BLUEPRINT (Authority enforced)
  const handleRenderReel = async () => {
    // ============ PREFLIGHT: FAIL FAST ============
    try {
      assertRenderable(sceneBlueprint);
      console.log('[ReelBuilder] ✅ Blueprint passed preflight validation');
    } catch (e) {
      if (e instanceof BlueprintNotRenderableError) {
        toast.error('Blueprint not ready to render', {
          description: e.errors.map(err => err.message).join(', '),
        });
        console.error('[ReelBuilder] BLOCKED: Preflight failed', e.errors);
      } else {
        toast.error('Cannot render', { description: String(e) });
      }
      return;
    }

    console.log('[ReelBuilder] ✅ Rendering with AUTHORITATIVE BLUEPRINT:', sceneBlueprint.id);

    setIsRenderingReel(true);

    try {
      // ============ DETERMINE SOURCE TYPE ============
      let sourceType: SourceType = 'manual';
      let sourceId: string | null = null;
      
      if (producerJobState?.producerJob?.taskId) {
        sourceType = 'mighty_task';
        sourceId = producerJobState.producerJob.taskId;
      } else if (autoCreateState?.autoCreateInput?.taskId) {
        sourceType = 'mighty_task';
        sourceId = autoCreateState.autoCreateInput.taskId;
      } else if (autoCreateState?.autoCreateInput?.calendarId) {
        sourceType = 'content_calendar';
        sourceId = autoCreateState.autoCreateInput.calendarId;
      }

      // ============ CREATE AI_CREATIVE RECORD ============
      const creative = await createCreativeWithTags({
        title: reelConcept || 'Reel Builder Export',
        description: `Created from ${sceneBlueprint.scenes.length} scenes`,
        sourceType,
        sourceId,
        toolSlug: 'multi_clip_reel',
        formatSlug: sceneBlueprint.format === 'story' ? 'story' : sceneBlueprint.format === 'short' ? 'short' : 'reel',
        brand: sceneBlueprint.brand || contentMetadata.brand,
        channel: contentMetadata.channel,
        platform: contentMetadata.platform,
        createdBy: 'user',
        metadata: {
          overlayPack: sceneBlueprint.overlayPack,
          font: sceneBlueprint.font,
          aspectRatio: sceneBlueprint.aspectRatio,
        },
      });

      console.log('[ReelBuilder] ✅ Created ai_creative:', creative.id);
      
      // Store creative ID for finalization after render completes
      setLastCreativeId(creative.id);

      // ============ SAVE BLUEPRINT SNAPSHOT ============
      await saveBlueprintSnapshot(creative.id, sceneBlueprint as unknown as Record<string, never>);
      console.log('[ReelBuilder] ✅ Saved blueprint snapshot');

      // Collect primary clip URL from BLUEPRINT
      const primaryClipUrl = sceneBlueprint.scenes[0]?.clipUrl;
      if (!primaryClipUrl) {
        toast.error('No video URLs in blueprint');
        setIsRenderingReel(false);
        return;
      }

      // Create a content_files entry for tracking
      const { data: contentFile, error: cfError } = await contentDB
        .from('content_files')
        .insert({
          file_url: primaryClipUrl,
          file_type: 'video',
          source: 'reel_builder',
          original_filename: 'ReelBuilder Export',
        })
        .select('id')
        .single();

      if (cfError) {
        console.error('[ReelBuilder] Failed to create content file:', cfError);
        toast.error('Failed to prepare video for rendering');
        setIsRenderingReel(false);
        return;
      }

      // Create video_edit_queue entry with creative link
      const { data: queueEntry, error: queueError } = await contentDB
        .from('video_edit_queue')
        .insert({
          content_file_id: contentFile.id,
          source_url: primaryClipUrl,
          title: reelConcept || 'Reel Builder Export',
          selected_music_url: audioUrl,
          render_status: 'pending',
          status: 'ready_for_review',
          ai_creative_id: creative.id,
        })
        .select('id')
        .single();

      if (queueError) {
        console.error('[ReelBuilder] ❌ Failed to create queue entry:', queueError);
        toast.error('Failed to start render');
        setIsRenderingReel(false);
        return;
      }

      console.log('[ReelBuilder] ✅ Queue entry created:', queueEntry.id);
      setLastQueueId(queueEntry.id);

      // ============ UPDATE CREATIVE STATUS TO RENDERING ============
      await updateCreative(creative.id, { 
        status: 'rendering',
        latest_render_job_id: queueEntry.id,
      });
      await replaceStatusTag(creative.id, 'rendering');

      // ============ CALL THE RENDER FUNCTION WITH BLUEPRINT ============
      // REEL_RENDER_FN selects the engine: 'render-reel-ffmpeg' (self-hosted,
      // VITE_REEL_RENDERER=ffmpeg) or the legacy 'render-reel' (Creatomate).
      // Both share the same request/response contract.
      const { data, error } = await lovableFunctions.functions.invoke(REEL_RENDER_FN, {
        body: {
          job_id: queueEntry.id,
          blueprint: sceneBlueprint,
          music_url: audioUrl,
          creative_id: creative.id,
          captions: captionsEngine.exportForCreatomate(),
        },
      });

      if (error) {
        console.error('[ReelBuilder] Render function error:', error);
        await updateCreative(creative.id, { status: 'failed' });
        await replaceStatusTag(creative.id, 'failed');
        toast.error('Render failed', { description: error.message });
        return;
      }

      if (!data?.ok) {
        console.error('[ReelBuilder] Render failed:', data?.error);
        await updateCreative(creative.id, { status: 'failed' });
        await replaceStatusTag(creative.id, 'failed');
        toast.error('Render failed', { description: data?.error || 'Unknown error' });
        return;
      }

      console.log('[ReelBuilder] ✅ Render complete:', data);

      // ============ UPDATE CREATIVE WITH OUTPUT ============
      await updateCreative(creative.id, {
        status: 'complete',
        output_url: data.final_url,
        thumbnail_url: data.thumbnail_url,
      });
      await replaceStatusTag(creative.id, 'complete');

      toast.success('Render complete!', { 
        description: `Creative: ${creative.id}` 
      });

      // Update UI with the final URL
      if (data.final_url) {
        setSavedVideoUrl(data.final_url);
        setShowPostRenderModal(true);
      }
      
    } catch (err) {
      console.error('[ReelBuilder] Render failed:', err);
      toast.error('Render failed', { 
        description: err instanceof Error ? err.message : 'Unknown error' 
      });
    } finally {
      setIsRenderingReel(false);
    }
  };

  const handleDownloadVideo = () => {
    // Prioritize finalized URL (guaranteed to work), fall back to saved URL
    const downloadUrl = finalizedDownloadUrl || savedVideoUrl;
    if (downloadUrl) {
      const filename = `reel-${Date.now()}.mp4`;
      downloadToDevice(downloadUrl, filename);
    } else {
      toast.error('Download not ready yet');
    }
  };

  const handleViewInLibrary = () => {
    setShowPostRenderModal(false);
    navigate('/contentbox');
  };

  const handleSchedule = () => {
    setShowPostRenderModal(false);
    navigate('/content-schedule');
  };

  const handleSendToReview = () => {
    setShowPostRenderModal(false);
    navigate('/content-schedule');
    toast.success('Video ready for review in Content Schedule');
  };

  // Handle auto-created clips from ContentBox - FULL AUTO PROCESSING
  useEffect(() => {
    const runAutoProcess = async () => {
      // 🔒 CRITICAL: Skip if a locked ProducerJob exists - agent takes authority
      if (producerJobState?.skipAutoCreate && producerJobState?.producerJob?.lock) {
        console.log('[ReelBuilder] Skipping auto-process - ProducerJob is locked');
        return;
      }
      
      if (!autoCreateState?.autoCreatedClips || autoCreateState.autoCreatedClips.length === 0) {
        return;
      }

      setIsAutoProcessing(true);

      // Step 1: Load clips with AI-suggested trims already applied
      const newClips: Clip[] = autoCreateState.autoCreatedClips
        .sort((a, b) => a.order - b.order)
        .map((ac) => ({
          id: ac.id,
          name: ac.original_filename || `Clip ${ac.order}`,
          url: ac.file_url || "",
          duration: ac.duration_seconds || 10,
          thumbnail: ac.thumbnail_url,
          trimStart: ac.trim_start || 0,
          trimEnd: ac.trim_end || (ac.duration_seconds || 10),
          speed: 1,
          suggestedOverlay: ac.suggested_overlay,
          reason: ac.reason,
        }));

      setClips(newClips);
      setReelConcept(autoCreateState.reelConcept || null);

      toast.success(`AI editing ${newClips.length} clips...`, {
        description: autoCreateState.reelConcept,
      });

      // Step 2: Run Smart Assist to analyze and create creative plan
      // Pass the reel concept as userPrompt for relevant captions/hooks
      if (autoCreateState.autoRunSmartAssist && newClips.length > 0) {
        const result = await smartAssist.runSmartAssist(newClips, autoCreateState.reelConcept);

        // Step 3: Auto-apply the AI plan
        if (result?.creative?.sequence) {
          const editedClips: Clip[] = result.creative.sequence.map((seq, idx) => {
            const originalClip = newClips[idx] || newClips[0];
            return {
              ...originalClip,
              id: originalClip?.id || `ai_${idx}`,
              name: seq.label?.replace(/_/g, " ") || originalClip.name,
              url: originalClip?.url || newClips[0].url,
              duration: seq.end - seq.start,
              trimStart: seq.start,
              trimEnd: seq.end,
              speed: seq.speed || 1,
            };
          });

          setClips(editedClips);
          
          // ============ AUTO-CREATE BLUEPRINT FROM SMART ASSIST ============
          const blueprint = buildBlueprintFromSmartAssist(result.creative, editedClips, 'instagram');
          setSceneBlueprint(blueprint);
          
          // Step 4: Apply brand overlays if available
          if (autoCreateState.suggestedHook) {
            overlaysEngine.addOverlay({
              text: autoCreateState.suggestedHook,
              style: "modern",
              position: "top-center",
              start: 0,
              end: 3,
              color: "#E1306C",
            });
          }

          toast.success("AI Reel Created!", {
            description: `${editedClips.length} clips + blueprint ready to render`,
          });
        }
      }

      setIsAutoProcessing(false);
      // Clear location state to prevent re-triggering
      window.history.replaceState({}, document.title);
    };

    runAutoProcess();
  }, [autoCreateState]);

  // ============ DETERMINISTIC AUTO-CREATE FROM MIGHTYTASK/CALENDAR ============
  // This fires ONCE when autoCreate + autoCreateInput is passed from navigation
  // No guessing, no defaults - uses the exact contract from the source
  useEffect(() => {
    // 🔒 CRITICAL: Skip if a locked ProducerJob exists - agent takes authority
    if (producerJobState?.skipAutoCreate && producerJobState?.producerJob?.lock) {
      console.log('[ReelBuilder] Skipping deterministic auto-create - ProducerJob is locked');
      return;
    }
    
    const input = autoCreateState?.autoCreateInput;
    const shouldAutoCreate = autoCreateState?.autoCreate;

    // Skip if not a deterministic auto-create request
    if (!shouldAutoCreate || !input) return;
    // Prevent double-execution
    if (hasAutoCreatedFromInput.current) return;
    
    hasAutoCreatedFromInput.current = true;
    
    console.log('🚀 DETERMINISTIC AUTO-CREATE STARTING WITH INPUT:', input);
    
    // Set the format based on input.style - validate it exists in DARA_FORMATS
    const format = input.style as DaraFormat;
    const isValidFormat = format && format in DARA_FORMATS;
    setSelectedDaraFormat(isValidFormat ? format : null);
    
    // Set content metadata from input
    setContentMetadata({
      brand: input.brand || 'wpw',
      channel: '',
      contentPurpose: 'organic',
      platform: input.platform,
      contentType: input.contentType,
    });
    
    // Set UI state from input
    setReelConcept(input.topic);
    setSuggestedHook(input.hook || null);
    setSuggestedCta(input.cta || null);
    
    // Run the auto-create with the input
    handleAIAutoCreateWithInput(input);
    
  }, [autoCreateState]);

  // ============ HANDLE AUTO-CREATE WITH DETERMINISTIC INPUT ============
  // This reads the contract and configures everything - no defaults, no guessing
  const handleAIAutoCreateWithInput = async (input: AutoCreateInput) => {
    setIsAutoProcessing(true);
    
    try {
      console.log('🎬 Running auto-create with input:', input);
      
      // Run AI auto-create with the style from input
      const result = await autoCreateReel.autoCreate({
        maxVideos: 50,
        daraFormat: input.style as DaraFormatType,
      });
      
      if (result && result.selected_videos && result.selected_videos.length > 0) {
        // Load the AI-selected clips directly
        const newClips: Clip[] = result.selected_videos
          .sort((a, b) => a.order - b.order)
          .map((video) => ({
            id: video.id,
            name: video.original_filename || `Clip ${video.order}`,
            url: video.file_url || "",
            duration: video.duration_seconds || 10,
            thumbnail: video.thumbnail_url,
            trimStart: video.trim_start || 0,
            trimEnd: video.trim_end || (video.duration_seconds || 10),
            speed: 1,
            suggestedOverlay: video.suggested_overlay,
            reason: video.reason,
          }));

        setClips(newClips);
        
        // Store extracted visual style for rendering
        if (result.extracted_style) {
          setExtractedInspoStyle(result.extracted_style);
        }

        // ============ AUTO-CREATE BLUEPRINT FROM AI-SELECTED CLIPS ============
        const blueprint = buildBlueprintFromAutoCreate(newClips, {
          suggested_cta: input.cta || result.suggested_cta,
          reel_concept: input.topic, // Use the exact topic from calendar
        }, input.platform);
        setSceneBlueprint(blueprint);
        console.log("✅ Blueprint created from deterministic input:", blueprint.id);

        // Apply the hook from INPUT (not AI-generated) as overlay
        if (input.hook) {
          overlaysEngine.clearOverlays();
          overlaysEngine.addOverlay({
            text: input.hook,
            style: "modern",
            position: "top-center",
            start: 0,
            end: 3,
            color: result.extracted_style?.text_color || "#E1306C",
          });
        }

        // ============ AUTO-GENERATE CAPTIONS WITH INPUT CONTEXT ============
        const totalDuration = newClips.reduce((sum, clip) => sum + (clip.trimEnd - clip.trimStart), 0);
        const captionStyle = (input.captionStyle || 'dara') as CaptionStyle;
        
        captionsEngine.generateCaptions("", captionStyle, {
          duration: totalDuration,
          concept: input.topic,
          hook: input.hook,
          cta: input.cta,
        }).then((captions) => {
          if (captions.length > 0) {
            toast.success(`Auto-generated ${captions.length} captions`, {
              description: "Adjust timing in the Captions tab",
            });
          }
        });

        toast.success(`Auto-created reel for: ${input.topic}`, {
          description: `${newClips.length} clips • Blueprint ready • From ${input.source}`,
        });
      } else {
        toast.error("AI couldn't find suitable clips", {
          description: "Try adjusting filters or adding more videos to your library",
        });
      }
    } catch (error) {
      console.error("Auto-create with input failed:", error);
      toast.error("Auto-create failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsAutoProcessing(false);
      // Clear navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  };

  const handleRunSmartAssist = async () => {
    // Pass reelConcept as userPrompt for context-aware captions/hooks
    await smartAssist.runSmartAssist(clips, reelConcept || undefined);
  };

  const handleApplyAIPlan = () => {
    if (!smartAssist.creative) return;

    const newClips: Clip[] = smartAssist.creative.sequence.map((seq, idx) => {
      const originalClip = clips[idx] || clips[0];
      return {
        ...originalClip,
        id: originalClip?.id || `ai_${idx}`,
        name: seq.label?.replace(/_/g, " ") || `Scene ${idx + 1}`,
        url: originalClip?.url || clips[0].url,
        duration: seq.end - seq.start,
        trimStart: seq.start,
        trimEnd: seq.end,
        speed: seq.speed || 1,
      };
    });

    setClips(newClips);

    // ============ CREATE AUTHORITATIVE BLUEPRINT ============
    const blueprint = buildBlueprintFromSmartAssist(smartAssist.creative, newClips, 'instagram');
    setSceneBlueprint(blueprint);
    
    toast.success("AI Timeline + Blueprint Applied!", {
      description: `${blueprint.scenes.length} scenes ready to render`,
    });
  };

  const handleAddClipsFromLibrary = (files: MediaFile[]) => {
    const videoFiles = files.filter((f) => f.file_type === "video");
    const newClips: Clip[] = videoFiles.map((file) => ({
      id: file.id,
      name: file.original_filename || "Untitled",
      url: file.file_url,
      duration: file.duration_seconds || 10,
      thumbnail: file.thumbnail_url || undefined,
      trimStart: 0,
      trimEnd: file.duration_seconds || 10,
      speed: 1,
    }));
    setClips((prev) => [...prev, ...newClips]);
    toast.success(`Added ${newClips.length} clip(s)`);
  };

  const handleRemoveClip = (id: string) => {
    setClips(clips.filter((c) => c.id !== id));
    if (selectedClip === id) setSelectedClip(null);
  };

  const handleAnalyzeBeats = async () => {
    if (!audioUrl) return;
    const result = await beatSync.analyzeMusic(audioUrl);
    if (result) {
      toast.success(`Detected ${result.bpm} BPM with ${result.beats.length} beats`);
    }
  };

  const handleApplyBeatSync = () => {
    const syncedClips = beatSync.applyBeatSync(clips);
    setClips(syncedClips as Clip[]);
    toast.success("Beat sync applied to clips!");
  };

  const handleGenerateCaptions = async (style: CaptionStyle) => {
    const duration = clips.reduce((sum, clip) => sum + (clip.trimEnd - clip.trimStart), 0);
    const videoUrl =
      sceneBlueprint?.scenes?.[0]?.clipUrl || clips[0]?.url || uploadedVideoUrl || "";

    const captions = await captionsEngine.generateCaptions(videoUrl, style, {
      duration: duration || 15,
      concept: reelConcept || sceneBlueprint?.caption,
      hook: suggestedHook || undefined,
      cta: suggestedCta || undefined,
    });

    if (captions.length > 0) {
      toast.success(`Generated ${captions.length} captions`);
    } else {
      toast.error("No captions generated", {
        description: "Try a different style or make sure a clip is loaded.",
      });
    }
  };

  const handleApplyBrandPack = (packId: BrandPackId) => {
    overlaysEngine.applyBrandPack(packId, totalDuration);
    // ✅ WIRE TO BLUEPRINT: Set overlay pack styling
    const packConfig = OVERLAY_PACK_MAP[packId] || OVERLAY_PACK_MAP['wpw_signature'];
    setSceneBlueprint(prev => prev ? {
      ...prev,
      overlayPack: packId,
      font: packConfig.font,
      textStyle: packConfig.textStyle,
    } : prev);
    toast.success(`Applied ${packId.toUpperCase()} overlay pack`);
  };

  const totalDuration = clips.reduce(
    (acc, clip) => acc + (clip.trimEnd - clip.trimStart) / (clip.speed || 1),
    0
  );

  return (
    <div className="min-h-screen bg-background relative">
      {/* AI Processing Overlay */}
      {(isAutoProcessing || smartAssist.loading) && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 animate-pulse" />
              <Loader2 className="w-10 h-10 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
            </div>
            <div className="max-w-md">
              <h2 className="text-xl font-bold text-foreground">AI Creating Your Reel</h2>
              <p className="text-muted-foreground mt-1">
                {reelConcept || "Analyzing clips • Choosing best scenes • Editing timeline"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/organic")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="font-semibold text-lg">Multi-Clip Reel Builder</h1>
              <p className="text-xs text-muted-foreground">
                {clips.length} clips • {totalDuration.toFixed(1)}s total
                {reelConcept && <span className="ml-2 text-primary">• {reelConcept}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Content Metadata Toggle */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setMetadataOpen(!metadataOpen)}
              className={metadataOpen ? "bg-primary/10 border-primary/40" : ""}
            >
              <Settings className="w-4 h-4 mr-1.5" />
              {contentMetadata.brand.toUpperCase()} • {contentMetadata.contentPurpose === 'paid' ? '💰' : '🌱'}
            </Button>
            
            {/* Dara Format Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-[140px]">
                  {selectedDaraFormat && DARA_FORMATS[selectedDaraFormat] ? (
                    <>
                      {DARA_FORMATS[selectedDaraFormat].emoji} {DARA_FORMATS[selectedDaraFormat].name}
                    </>
                  ) : (
                    "Select Format"
                  )}
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => {
                  setSelectedDaraFormat(null);
                  // ✅ WIRE TO BLUEPRINT: Reset to default format
                  if (sceneBlueprint) {
                    const defaultFormat = FORMAT_TEMPLATE_MAP['reel'];
                    setSceneBlueprint(prev => prev ? {
                      ...prev,
                      format: 'reel',
                      aspectRatio: defaultFormat.aspectRatio,
                      templateId: defaultFormat.templateId,
                    } : prev);
                  }
                }}>
                  <span className="text-muted-foreground">Auto (AI Chooses)</span>
                </DropdownMenuItem>
                {Object.values(DARA_FORMATS).map((format) => (
                  <DropdownMenuItem 
                    key={format.id} 
                    onClick={() => {
                      setSelectedDaraFormat(format.id);
                      // ✅ WIRE TO BLUEPRINT: Set format, aspectRatio, templateId
                      if (sceneBlueprint) {
                        const templateMapping = FORMAT_TEMPLATE_MAP[format.id] || FORMAT_TEMPLATE_MAP['reel'];
                        setSceneBlueprint(prev => prev ? {
                          ...prev,
                          format: 'reel',
                          aspectRatio: templateMapping.aspectRatio,
                          templateId: format.id, // Use format ID as template identifier
                        } : prev);
                      }
                    }}
                    className={selectedDaraFormat === format.id ? "bg-primary/10" : ""}
                  >
                    <span className="mr-2">{format.emoji}</span>
                    {format.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Auto-Create - The main action button */}
            <Button 
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={() => handleAIAutoCreate()}
              disabled={autoCreateReel.loading || isAutoProcessing}
            >
              {autoCreateReel.loading || isAutoProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  AI Auto-Create
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                editorBrain.extractBestScenes(clips, setClips);
                // ✅ WIRE TO BLUEPRINT: Optimize scenes in blueprint
                if (sceneBlueprint && sceneBlueprint.scenes.length > 0) {
                  const priorityOrder: Record<string, number> = { hook: 0, cta: 1, proof: 2, payoff: 3, pattern_interrupt: 4, reveal: 5, b_roll: 6 };
                  const optimized = [...sceneBlueprint.scenes]
                    .sort((a, b) => (priorityOrder[a.purpose] || 99) - (priorityOrder[b.purpose] || 99))
                    .slice(0, 5);
                  setSceneBlueprint(prev => prev ? {
                    ...prev,
                    scenes: optimized,
                    totalDuration: optimized.reduce((sum, s) => sum + (s.end - s.start), 0),
                  } : prev);
                  toast.success('Optimized to best 5 scenes');
                }
              }}
              disabled={clips.length === 0 || editorBrain.isAnalyzing}
            >
              <Scissors className="w-4 h-4 mr-1.5" />
              Best Scenes
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                editorBrain.autoSequence(clips, setClips);
                // ✅ WIRE TO BLUEPRINT: Resequence timing in blueprint
                if (sceneBlueprint && sceneBlueprint.scenes.length >= 2) {
                  const sliceDuration = sceneBlueprint.totalDuration / sceneBlueprint.scenes.length;
                  const resequenced = sceneBlueprint.scenes.map((scene, i) => ({
                    ...scene,
                    start: i * sliceDuration,
                    end: (i + 1) * sliceDuration,
                  }));
                  setSceneBlueprint(prev => prev ? {
                    ...prev,
                    scenes: resequenced,
                  } : prev);
                  toast.success('Scenes resequenced with even timing');
                }
              }}
              disabled={clips.length < 2 || editorBrain.isSequencing}
            >
              {editorBrain.isSequencing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Layers className="w-4 h-4 mr-1.5" />
              )}
              AI Sequence
            </Button>
            
            {/* Test Blueprint Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateTestBlueprint}
              disabled={clips.length === 0}
              className={sceneBlueprint ? "border-green-500/50 bg-green-500/10" : ""}
            >
              {sceneBlueprint ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-500" />
                  Blueprint Ready
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-500" />
                  Create Test Blueprint
                </>
              )}
            </Button>
            
            {/* ✅ RUN 2: Test Render Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestRender}
              disabled={clips.length === 0 || isRenderingReel || isExecuting}
              className="border-amber-500/50 hover:bg-amber-500/10"
              title="Quick test render with hardcoded overlays"
            >
              <Zap className="w-4 h-4 mr-1.5 text-amber-500" />
              Test Render
            </Button>
            
            <Button
              size="sm"
              className="bg-gradient-to-r from-[#405DE6] to-[#E1306C]"
              disabled={clips.length === 0 || isRenderingReel || isExecuting || !sceneBlueprint}
              onClick={handleRenderReel}
              title={!sceneBlueprint ? "Create a blueprint first" : "Render with blueprint"}
            >
              {isRenderingReel || isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Rendering...
                </>
              ) : (
                'Render Reel'
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Content Metadata Panel (Collapsible) */}
      {metadataOpen && (
        <div className="max-w-7xl mx-auto px-4 py-3 border-b border-border/30 bg-card/30">
          <ContentMetadataPanel 
            metadata={contentMetadata} 
            onChange={(newMetadata) => {
              setContentMetadata(newMetadata);
              // ✅ WIRE TO BLUEPRINT: Sync brand to blueprint
              if (newMetadata.brand !== contentMetadata.brand && sceneBlueprint) {
                setSceneBlueprint(prev => prev ? {
                  ...prev,
                  brand: newMetadata.brand,
                } : prev);
              }
            }}
          />
        </div>
      )}

      {/* ✅ RUN 3: Render Diagnostics Panel */}
      {lastQueueId && (
        <div className="max-w-7xl mx-auto px-4 py-2">
          <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Render Diagnostics
                  <Badge variant="outline" className="ml-2 text-xs">
                    {lastQueueId.slice(0, 8)}...
                  </Badge>
                </span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", diagnosticsOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Queue Entry: {lastQueueId.slice(0, 12)}...</CardTitle>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleRefreshDiagnostics}
                      disabled={isLoadingDiagnostics}
                    >
                      {isLoadingDiagnostics ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Refresh'
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {diagnosticsData ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">render_status:</span>{' '}
                          <Badge variant={diagnosticsData.render_status === 'complete' ? 'default' : diagnosticsData.render_status === 'failed' ? 'destructive' : 'secondary'}>
                            {diagnosticsData.render_status}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">status:</span>{' '}
                          <Badge variant="outline">{diagnosticsData.status}</Badge>
                        </div>
                      </div>
                      
                      {diagnosticsData.error_message && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
                          <p className="text-xs font-medium text-destructive">Error:</p>
                          <p className="text-xs text-muted-foreground mt-1">{diagnosticsData.error_message}</p>
                        </div>
                      )}
                      
                      {diagnosticsData.final_render_url && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                          <p className="text-xs font-medium text-green-500">Render URL:</p>
                          <a 
                            href={diagnosticsData.final_render_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline break-all"
                          >
                            {diagnosticsData.final_render_url}
                          </a>
                        </div>
                      )}
                      
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                            debug_payload
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="text-[10px] bg-muted/50 p-2 rounded overflow-auto max-h-40 mt-1">
                            {JSON.stringify(diagnosticsData.debug_payload, null, 2) || 'null'}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                      
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                            ai_edit_suggestions
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="text-[10px] bg-muted/50 p-2 rounded overflow-auto max-h-40 mt-1">
                            {JSON.stringify(diagnosticsData.ai_edit_suggestions, null, 2) || 'null'}
                          </pre>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">Click "Refresh" to load diagnostics</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* SCENE BLUEPRINT STATUS PANEL */}
      <div className="max-w-7xl mx-auto px-4 py-2">
        <Alert variant={blueprintValidation.valid ? "default" : "destructive"} className="border-l-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {blueprintValidation.valid ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
              <div>
                <AlertTitle className="text-sm font-semibold">
                  {blueprintValidation.valid ? 'Blueprint Ready' : 'No Blueprint - Cannot Render'}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  {blueprintValidation.valid 
                    ? `${sceneBlueprint?.scenes.length} scenes • ${sceneBlueprint?.totalDuration.toFixed(1)}s • Source: ${sceneBlueprint?.source}`
                    : blueprintValidation.errors.join(' • ')
                  }
                </AlertDescription>
              </div>
            </div>
            {sceneBlueprint && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  console.log('[ReelBuilder] Current Blueprint:', JSON.stringify(sceneBlueprint, null, 2));
                  toast.info('Blueprint logged to console');
                }}
              >
                View JSON
              </Button>
            )}
          </div>
        </Alert>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Preview + Timeline */}
          <div className="lg:col-span-2 space-y-4">
            {/* Empty State - AI Auto-Create from Library (Primary) */}
            {clips.length === 0 && (
              <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5">
                <CardContent className="p-8">
                  {isAutoProcessing ? (
                    <div className="aspect-[9/16] max-h-[500px] mx-auto rounded-xl flex flex-col items-center justify-center bg-background/50">
                      <div className="text-center space-y-4">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 animate-pulse" />
                          <Loader2 className="w-12 h-12 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
                        </div>
                        <div className="max-w-xs">
                          <p className="font-bold text-xl text-foreground">AI Creating Your Reel</p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {reelConcept || "Scanning your library • Selecting best clips • Learning your style"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[9/16] max-h-[500px] mx-auto rounded-xl flex flex-col items-center justify-center bg-background/30">
                      <div className="text-center space-y-6 max-w-sm">
                        {/* Primary Action - AI Create from Library */}
                        <div className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/30">
                          <Brain className="w-12 h-12 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-2xl text-foreground">AI Auto-Create</h3>
                          <p className="text-muted-foreground mt-2">
                            AI will scan your uploaded videos, pick the best clips, and create a scroll-stopping reel
                          </p>
                        </div>
                        
                        {/* Format Selection */}
                        <div className="space-y-2">
                          <DaraFormatSelector 
                            value={selectedDaraFormat} 
                            onChange={setSelectedDaraFormat}
                          />
                        </div>

                        {/* Main CTA */}
                        <Button 
                          size="lg"
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg py-6"
                          onClick={() => handleAIAutoCreate()}
                          disabled={autoCreateReel.loading}
                        >
                          <Sparkles className="w-5 h-5 mr-2" />
                          Create Reel from My Library
                        </Button>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span>Powered by Dara Denney AI + Your Inspiration</span>
                        </div>

                        {/* Divider */}
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-border/50" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">or</span>
                          </div>
                        </div>

                        {/* Secondary Actions */}
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => setShowLibraryModal(true)}
                          >
                            <Video className="w-4 h-4 mr-1.5" />
                            Pick Clips
                          </Button>
                          <div {...getRootProps()} className="flex-1">
                            <input {...getInputProps()} />
                            <Button variant="outline" className="w-full" disabled={isUploading}>
                              <Upload className="w-4 h-4 mr-1.5" />
                              Upload New
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* RENDERED VIDEO OUTPUT - Shows when render is complete */}
            {((renderProgress?.status === 'complete' && renderProgress.outputUrl) || savedVideoUrl) && (
              <Card className="border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Your Reel is Ready!
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RenderResult
                    renderUrl={renderProgress?.outputUrl || savedVideoUrl}
                    status="complete"
                    title="AI-Generated Reel"
                    duration={sceneBlueprint?.totalDuration}
                  />
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => {
                        setSavedVideoUrl(null);
                        stopPolling();
                        setClips([]);
                        setSceneBlueprint(null);
                        setReelConcept(null);
                        setSuggestedHook(null);
                        setSuggestedCta(null);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Another Reel
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => navigate('/organic?tab=content-queue')}
                    >
                      View in Queue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* RENDER FAILED - Shows when render fails */}
            {renderProgress?.status === 'failed' && (
              <Card className="border-2 border-destructive/30 bg-gradient-to-br from-destructive/10 to-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Render Failed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground bg-destructive/5 p-3 rounded-lg border border-destructive/20 max-h-32 overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {renderProgress.error || "Something went wrong during rendering. Please try again."}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={handleRenderReel}
                      disabled={isExecuting || !blueprintValidation.valid}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Retry Render
                    </Button>
                    <Button 
                      variant="ghost"
                      onClick={() => {
                        const debugPayload = {
                          blueprint: sceneBlueprint,
                          clips: clips.map(c => ({ id: c.id, url: c.url, trimStart: c.trimStart, trimEnd: c.trimEnd })),
                          audioUrl,
                          error: renderProgress.error,
                        };
                        navigator.clipboard.writeText(JSON.stringify(debugPayload, null, 2));
                        toast.success('Debug payload copied to clipboard');
                      }}
                    >
                      Copy Debug
                    </Button>
                    <Button 
                      variant="ghost"
                      onClick={() => stopPolling()}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview - Shows when clips exist */}
            {clips.length > 0 && !(renderProgress?.status === 'complete' && renderProgress.outputUrl) && !savedVideoUrl && (
              <Card>
                <CardContent className="p-4">
                  {/* Grid Style Preview - 2x2 grid layout */}
                  {selectedDaraFormat === 'grid_style' ? (
                    <div className="aspect-[9/16] max-h-[500px] mx-auto bg-black rounded-xl relative overflow-hidden">
                      {/* 2x2 Grid of clips */}
                      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 p-1">
                        {clips.slice(0, 4).map((clip, idx) => (
                          <div 
                            key={clip.id} 
                            className={cn(
                              "relative overflow-hidden rounded-md cursor-pointer transition-all",
                              selectedClip === clip.id && "ring-2 ring-primary"
                            )}
                            onClick={() => setSelectedClip(clip.id)}
                          >
                            <video
                              src={clip.url}
                              className="w-full h-full object-cover"
                              loop
                              muted
                              playsInline
                              autoPlay={isPlaying}
                            />
                            {/* Overlay text for each cell */}
                            {clip.suggestedOverlay && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <p className="text-white font-bold text-xs sm:text-sm text-center px-2 drop-shadow-lg">
                                  {clip.suggestedOverlay}
                                </p>
                              </div>
                            )}
                            {/* Cell number indicator */}
                            <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-primary/80 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-white">{idx + 1}</span>
                            </div>
                          </div>
                        ))}
                        {/* Fill empty cells if less than 4 clips */}
                        {clips.length < 4 && Array.from({ length: 4 - clips.length }).map((_, idx) => (
                          <div 
                            key={`empty-${idx}`}
                            className="bg-muted/20 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => setShowLibraryModal(true)}
                          >
                            <Plus className="w-6 h-6 text-muted-foreground/50" />
                          </div>
                        ))}
                      </div>
                      {/* Center overlay message */}
                      {suggestedHook && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-black/60 backdrop-blur-sm px-4 py-3 rounded-xl">
                            <p className="text-white font-bold text-lg sm:text-xl text-center drop-shadow-lg">
                              {suggestedHook}
                            </p>
                          </div>
                        </div>
                      )}
                      {/* Play/Pause overlay button */}
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute bottom-4 right-4 z-10"
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      </Button>
                    </div>
                  ) : (
                    /* Standard single video preview */
                    <div className="aspect-[9/16] max-h-[400px] mx-auto bg-black rounded-xl flex items-center justify-center relative overflow-hidden">
                      <video
                        ref={videoRef}
                        key={selectedClip || clips[0]?.id}
                        src={selectedClip ? clips.find(c => c.id === selectedClip)?.url : clips[0]?.url}
                        className="absolute inset-0 w-full h-full object-cover"
                        loop
                        muted
                        playsInline
                        onEnded={() => setIsPlaying(false)}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute z-10"
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Timeline
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setShowLibraryModal(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Clips
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {clips.length === 0 ? (
                  <div
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => setShowLibraryModal(true)}
                  >
                    <Plus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to add clips</p>
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {clips.map((clip, index) => (
                      <div
                        key={clip.id}
                        className={cn(
                          "shrink-0 w-32 rounded-lg border-2 cursor-pointer transition-all",
                          selectedClip === clip.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                        onClick={() => setSelectedClip(clip.id)}
                      >
                        <div className="aspect-video bg-muted rounded-t-md flex items-center justify-center relative group overflow-hidden">
                          {clip.thumbnail ? (
                            <img src={clip.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : clip.url ? (
                            <video src={clip.url} className="w-full h-full object-cover" muted />
                          ) : (
                            <span className="text-lg font-bold text-primary">{index + 1}</span>
                          )}
                          <GripVertical className="w-4 h-4 text-white drop-shadow absolute top-1 left-1 opacity-0 group-hover:opacity-100" />

                          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="w-5 h-5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplaceClipId(clip.id);
                                setShowReplaceModal(true);
                              }}
                              title="Replace clip"
                            >
                              <Video className="w-3 h-3" />
                            </Button>

                            <Button
                              size="icon"
                              variant="destructive"
                              className="w-5 h-5"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveClip(clip.id);
                              }}
                              title="Remove clip"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Show suggested overlay text */}
                          {clip.suggestedOverlay && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                              <p className="text-[8px] text-white font-bold leading-tight truncate">
                                {clip.suggestedOverlay}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="p-1.5">
                          <p className="text-[10px] font-medium truncate">{clip.name}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {(clip.trimEnd - clip.trimStart).toFixed(1)}s
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Smart Assist Panel */}
            <SmartAssistPanel
              analysis={smartAssist.analysis}
              creative={smartAssist.creative}
              loading={smartAssist.loading}
              onRunAnalysis={handleRunSmartAssist}
              onApply={handleApplyAIPlan}
              hasClips={clips.length > 0}
            />
          </div>

          {/* Right: Editor Panels */}
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="ai" className="text-xs"><Brain className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="clip" className="text-xs"><Wand2 className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="audio" className="text-xs"><Music className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="captions" className="text-xs"><Type className="w-3 h-3" /></TabsTrigger>
                <TabsTrigger value="overlays" className="text-xs"><Palette className="w-3 h-3" /></TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="mt-4">
                <SmartAssistPanel
                  analysis={smartAssist.analysis}
                  creative={smartAssist.creative}
                  loading={smartAssist.loading}
                  onRunAnalysis={handleRunSmartAssist}
                  onApply={handleApplyAIPlan}
                  hasClips={clips.length > 0}
                />
              </TabsContent>

              <TabsContent value="clip" className="mt-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">{selectedClip ? "Edit Clip" : "Select Clip"}</CardTitle></CardHeader>
                  <CardContent>
                    {selectedClip ? (
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs text-muted-foreground">Speed</label>
                          <div className="flex gap-2 mt-1">
                            {["0.5x", "1x", "1.5x", "2x"].map((speed) => (
                              <Button key={speed} size="sm" variant={speed === "1x" ? "default" : "outline"} className="flex-1">{speed}</Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">Select a clip to edit</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="audio" className="mt-4">
                <BeatSyncPanel audioUrl={audioUrl} beats={beatSync.beats} bpm={beatSync.bpm} loading={beatSync.loading} onSelectAudio={() => setAudioUrl("https://example.com/audio.mp3")} onAnalyze={handleAnalyzeBeats} onApplyBeatSync={handleApplyBeatSync} />
              </TabsContent>

              <TabsContent value="captions" className="mt-4">
                <CaptionsPanel 
                  captions={captionsEngine.captions} 
                  settings={captionsEngine.settings} 
                  loading={captionsEngine.loading} 
                  onGenerateCaptions={handleGenerateCaptions} 
                  onUpdateSettings={captionsEngine.updateSettings} 
                  onRemoveCaption={captionsEngine.removeCaption}
                  jobId={lastQueueId || undefined}
                  concept={reelConcept}
                  onSceneTextChange={(sceneId, text) => {
                    setSceneBlueprint((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        scenes: prev.scenes.map((s) =>
                          s.sceneId === sceneId
                            ? { ...s, text: text || undefined }
                            : s
                        ),
                      };
                    });
                  }}
                  scenes={sceneBlueprint?.scenes.map(s => ({
                    sceneId: s.sceneId,
                    text: typeof s.text === 'string' ? s.text : '',
                    start: s.start,
                    end: s.end,
                    textPosition: s.textPosition,
                    animation: s.animation,
                    purpose: s.purpose,
                  })) || []}
                  onOverlaysApproved={() => toast.success("Text overlays will be applied during render")}
                />
              </TabsContent>

              <TabsContent value="overlays" className="mt-4">
                <BrandOverlayPanel overlays={overlaysEngine.overlays} activePack={overlaysEngine.activePack} totalDuration={totalDuration} onApplyPack={handleApplyBrandPack} onAddOverlay={() => overlaysEngine.addOverlay({ text: "Custom", style: "modern", position: "center", start: 0, end: 3, color: "#E1306C" })} onRemoveOverlay={overlaysEngine.removeOverlay} onClearOverlays={overlaysEngine.clearOverlays} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Media Library Modal (Add clips) */}
      <MediaLibraryModal
        open={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        multiSelect
        onMultiSelect={handleAddClipsFromLibrary}
        filterType="video"
      />

      {/* Media Library Modal (Replace a clip) */}
      <MediaLibraryModal
        open={showReplaceModal}
        onClose={() => {
          setShowReplaceModal(false);
          setReplaceClipId(null);
        }}
        onSelect={(file) => {
          if (!replaceClipId) return;

          const nextClipId = file.id;
          const nextUrl = file.file_url || "";

          setClips((prev) =>
            prev.map((c) =>
              c.id === replaceClipId
                ? {
                    ...c,
                    id: nextClipId,
                    url: nextUrl,
                    thumbnail: file.thumbnail_url || c.thumbnail,
                    name: file.original_filename || c.name,
                    duration: file.duration_seconds || c.duration,
                  }
                : c
            )
          );

          setSceneBlueprint((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              scenes: prev.scenes.map((s) =>
                s.clipId === replaceClipId
                  ? {
                      ...s,
                      clipId: nextClipId,
                      clipUrl: nextUrl,
                    }
                  : s
              ),
            };
          });

          if (selectedClip === replaceClipId) setSelectedClip(nextClipId);

          toast.success("Clip replaced");
          setShowReplaceModal(false);
          setReplaceClipId(null);
        }}
        filterType="video"
      />

      {/* Post-Render Modal */}
      <PostRenderModal
        open={showPostRenderModal}
        onClose={() => setShowPostRenderModal(false)}
        videoUrl={savedVideoUrl || ''}
        onDownload={handleDownloadVideo}
        onViewInLibrary={handleViewInLibrary}
        onSchedule={handleSchedule}
        onSendToReview={handleSendToReview}
      />

      {/* Render Progress Bar - Shows during Mux rendering */}
      {renderProgress && (
        <div className="fixed bottom-4 right-4 z-50 w-96">
          <RenderProgressBar 
            progress={renderProgress}
            onDismiss={stopPolling}
          />
        </div>
      )}
    </div>
  );
}
