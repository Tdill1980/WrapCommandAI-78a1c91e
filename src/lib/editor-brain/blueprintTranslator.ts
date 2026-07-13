/**
 * BLUEPRINT TRANSLATION LAYER (native, ffmpeg)
 *
 * Converts a CreativeAssembly (from the Creative Assembly Engine) into the
 * authoritative SceneBlueprint that the SELF-HOSTED ffmpeg renderer consumes
 * (render-reel-ffmpeg → worker/reel-renderer). This is the ONLY render target —
 * there is no Creatomate in this pipeline.
 *
 * Replaces the old renderTranslator.ts (translateToCreatomate), which produced
 * a Creatomate timeline that nothing in the app ever consumed.
 */

import { CreativeAssembly } from "./creativeAssembler";
import {
  SceneBlueprint,
  SceneBlueprintScene,
  FORMAT_TEMPLATE_MAP,
  OVERLAY_PACK_MAP,
} from "@/types/SceneBlueprint";

export interface BlueprintClip {
  id: string;
  url: string;
  duration?: number;
}

export interface BlueprintTranslatorOptions {
  creative: CreativeAssembly;
  clips: BlueprintClip[];
  platform?: SceneBlueprint["platform"];
  brand?: string;
  format?: "reel" | "story" | "short";
  overlayPack?: string;
  source?: SceneBlueprint["source"];
}

/**
 * Translate a creative assembly into a renderable SceneBlueprint.
 */
export function translateToBlueprint(options: BlueprintTranslatorOptions): SceneBlueprint {
  const {
    creative,
    clips,
    platform = "instagram",
    brand,
    format = "reel",
    overlayPack = "wpw_signature",
    source = "smart_assist",
  } = options;

  if (!clips.length) {
    throw new Error("translateToBlueprint requires at least one clip");
  }

  const scenes: SceneBlueprintScene[] = creative.sequence.map((seq, index) => {
    const clip = clips[index] || clips[0];
    const purpose: SceneBlueprintScene["purpose"] =
      index === 0
        ? "hook"
        : index === creative.sequence.length - 1
        ? "cta"
        : "b_roll";

    // Overlay whose timing falls inside this scene
    const overlay = creative.overlays.find((o) => o.start >= seq.start && o.start < seq.end);
    // Map overlay animation → scene animation (transition types are a different
    // enum and must not leak in as invalid animation values).
    const rawAnim = overlay?.animation;
    const animation: SceneBlueprintScene["animation"] =
      rawAnim === "slide" || rawAnim === "fade" || rawAnim === "pop" ? rawAnim : "pop";

    return {
      sceneId: `sa_${index + 1}`,
      clipId: clip.id,
      clipUrl: clip.url,
      start: seq.start,
      end: seq.end,
      purpose,
      text: overlay?.text,
      textPosition: overlay?.position || "center",
      animation,
      cutReason: seq.label || `AI scene ${index + 1}`,
    };
  });

  const totalDuration = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);
  const overlayDef = OVERLAY_PACK_MAP[overlayPack] || OVERLAY_PACK_MAP["wpw_signature"];

  return {
    id: `bp_${source}_${clips[0].id}`,
    platform,
    totalDuration,
    scenes,
    endCard: {
      duration: 3,
      text: creative.cta || "Follow for more",
      cta: creative.cta || "Follow for more",
    },
    createdAt: new Date().toISOString(),
    source,
    brand,
    caption: creative.caption,
    // Format lock — 9:16 reel by default
    format,
    aspectRatio: FORMAT_TEMPLATE_MAP[format]?.aspectRatio || "9:16",
    templateId: FORMAT_TEMPLATE_MAP[format]?.templateId || "ig_reel_v1",
    overlayPack,
    font: overlayDef?.font || "Inter Black",
    textStyle: overlayDef?.textStyle || "bold",
  };
}
