/**
 * EDITOR AI BRAIN
 * 
 * Central export for the tri-mode Editor AI Brain system:
 * - Video Intelligence Engine (VIE)
 * - Creative Assembly Engine (CAE)  
 * - Render Translation Layer (RTL)
 * 
 * Supports three modes:
 * 1. Smart Assist - AI suggests, user controls
 * 2. Auto Create - AI builds, user approves
 * 3. Autonomous - Full AI content department
 */

// Video Intelligence Engine
export {
  analyzeVideo,
  type VideoAnalysis,
  type AnalyzedScene,
  type VideoAnalyzerOptions,
} from "./videoAnalyzer";

// Creative Assembly Engine
export {
  assembleCreative,
  generateVariants,
  type CreativeAssembly,
  type CreativeOverlay,
  type CreativeSequence,
  type ContentFormat,
  type EditorMode,
  type Platform,
  type AssemblerOptions,
} from "./creativeAssembler";

// Render Translation Layer (native ffmpeg blueprint — NO Creatomate)
export {
  translateToBlueprint,
  type BlueprintClip,
  type BlueprintTranslatorOptions,
} from "./blueprintTranslator";

// Combined pipeline function for convenience
import { analyzeVideo, VideoAnalyzerOptions, VideoAnalysis } from "./videoAnalyzer";
import { assembleCreative, CreativeAssembly, EditorMode, Platform } from "./creativeAssembler";
import { translateToBlueprint, BlueprintClip } from "./blueprintTranslator";
import { SceneBlueprint } from "@/types/SceneBlueprint";

export interface EditorBrainPipelineOptions {
  videoUrl: string;
  playbackUrl?: string;
  muxPlaybackId?: string;
  existingTranscript?: string;
  duration?: number;
  mode?: EditorMode;
  platform?: Platform;
  clipId?: string;
  brand?: string;
  musicUrl?: string;
  voiceProfile?: {
    tone?: string;
    vocabulary?: string[];
    cta_style?: string;
    brand_name?: string;
  };
}

export interface EditorBrainResult {
  analysis: VideoAnalysis;
  creative: CreativeAssembly;
  blueprint: SceneBlueprint;
}

/**
 * Full pipeline: Analyze → Assemble → Translate to native blueprint.
 * Use this for one-shot content generation. The blueprint renders on the
 * self-hosted ffmpeg worker (render-reel-ffmpeg) — there is no Creatomate step.
 */
export async function runEditorBrainPipeline(
  options: EditorBrainPipelineOptions
): Promise<EditorBrainResult> {
  const videoUrl = options.videoUrl;

  // Step 1: Analyze video
  const analysis = await analyzeVideo({
    playbackUrl: options.playbackUrl || videoUrl,
    muxPlaybackId: options.muxPlaybackId,
    existingTranscript: options.existingTranscript,
    duration: options.duration,
  });

  // Step 2: Assemble creative
  const creative = assembleCreative({
    analysis,
    mode: options.mode || "auto_create",
    platform: options.platform || "instagram",
    voiceProfile: options.voiceProfile,
  });

  // Step 3: Translate to a native, renderable SceneBlueprint
  const clips: BlueprintClip[] = [
    { id: options.clipId || "clip_1", url: videoUrl, duration: options.duration },
  ];
  const blueprint = translateToBlueprint({
    creative,
    clips,
    platform: options.platform || "instagram",
    brand: options.brand,
    source: options.mode === "smart_assist" ? "smart_assist" : "ai",
  });

  return {
    analysis,
    creative,
    blueprint,
  };
}
