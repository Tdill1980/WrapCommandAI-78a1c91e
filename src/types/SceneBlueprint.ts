/**
 * SCENE BLUEPRINT - THE AUTHORITATIVE RENDERING OBJECT
 * 
 * This object is LAW. If it doesn't exist, NOTHING RENDERS.
 * No fallbacks. No defaults. No templates.
 * 
 * The native ffmpeg renderer (MightyEdit) MUST render this EXACTLY as specified.
 */

export interface SceneBlueprint {
  id: string;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook';
  totalDuration: number;
  
  scenes: SceneBlueprintScene[];
  
  endCard?: {
    duration: number;
    text: string;
    cta: string;
  };
  
  // Metadata for tracking
  createdAt?: string;
  source?: 'ai' | 'manual' | 'hardcoded' | 'smart_assist';
  
  // ============ BRAND CONTEXT ============
  // Which brand/channel this content is for
  brand?: string;
  
  // ============ TARGET LOCK (Select Format) ============
  // These define the render contract - what the renderer will produce
  format?: 'reel' | 'story' | 'short';
  aspectRatio?: '9:16' | '1:1' | '16:9';
  templateId?: string;
  
  // ============ STYLE BINDING (Overlay Pack) ============
  // Brand overlay configuration - applied to all scenes
  overlayPack?: string;
  font?: string;
  textStyle?: 'bold' | 'minimal' | 'modern';
  
  // ============ CAPTION STYLE ============
  // Controls how captions/overlays are formatted
  // sabri: UPPERCASE, bold, punchy
  // dara: Sentence case, professional, no emoji
  // clean: lowercase, minimal, light
  captionStyle?: 'sabri' | 'dara' | 'clean';
  
  // ============ CAPTION (Auto Captions) ============
  // Global caption for the entire reel
  caption?: string;
}

export interface SceneBlueprintScene {
  sceneId: string;
  clipId: string;
  clipUrl: string;
  
  // EXACT timing - no estimation
  start: number;
  end: number;
  
  // Editorial purpose - this drives the edit
  purpose: 'hook' | 'pattern_interrupt' | 'proof' | 'payoff' | 'cta' | 'b_roll' | 'reveal';
  
  // Text overlay (optional)
  text?: string;
  textPosition?: 'top' | 'center' | 'bottom';
  animation?: 'pop' | 'slide' | 'fade' | 'punch' | 'typewriter';
  
  // Editorial reasoning (for debugging)
  cutReason?: string;
}

// ============ FORMAT → TEMPLATE MAPPING ============
// Maps format + aspectRatio to renderer template IDs
export const FORMAT_TEMPLATE_MAP: Record<string, { aspectRatio: '9:16' | '1:1' | '16:9'; templateId: string }> = {
  'reel': { aspectRatio: '9:16', templateId: 'ig_reel_v1' },
  'story': { aspectRatio: '9:16', templateId: 'ig_story_v1' },
  'short': { aspectRatio: '9:16', templateId: 'yt_short_v1' },
  'post': { aspectRatio: '1:1', templateId: 'ig_post_v1' },
  'landscape': { aspectRatio: '16:9', templateId: 'yt_landscape_v1' },
};

// ============ OVERLAY PACK DEFINITIONS ============
export const OVERLAY_PACK_MAP: Record<string, { font: string; textStyle: 'bold' | 'minimal' | 'modern' }> = {
  'wpw_signature': { font: 'Inter Black', textStyle: 'bold' },
  'modern-clean': { font: 'Inter', textStyle: 'modern' },
  'minimal': { font: 'SF Pro', textStyle: 'minimal' },
  'bold-impact': { font: 'Impact', textStyle: 'bold' },
};

/**
 * Validates that a blueprint is complete and renderable
 */
export function validateBlueprint(blueprint: SceneBlueprint | null): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!blueprint) {
    errors.push('No blueprint provided');
    return { valid: false, errors };
  }
  
  if (!blueprint.id) {
    errors.push('Blueprint missing ID');
  }
  
  if (!blueprint.platform) {
    errors.push('Blueprint missing platform');
  }
  
  if (!blueprint.scenes || blueprint.scenes.length === 0) {
    errors.push('Blueprint has no scenes');
  }
  
  if (blueprint.scenes) {
    blueprint.scenes.forEach((scene, idx) => {
      if (!scene.clipUrl) {
        errors.push(`Scene ${idx + 1} missing clipUrl`);
      }
      if (scene.start === undefined || scene.end === undefined) {
        errors.push(`Scene ${idx + 1} missing timing`);
      }
      if (scene.end <= scene.start) {
        errors.push(`Scene ${idx + 1} has invalid timing (end <= start)`);
      }
    });
  }
  
  // Warn but don't fail if format not set (for backwards compat)
  if (!blueprint.format && !blueprint.templateId) {
    console.warn('[validateBlueprint] No format or templateId set - using defaults');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a hardcoded test blueprint for verification
 * Use this to verify the ffmpeg renderer renders correctly BEFORE using AI
 */
export function createTestBlueprint(clips: Array<{ id: string; url: string; duration: number }>): SceneBlueprint {
  if (clips.length === 0) {
    throw new Error('Cannot create test blueprint without clips');
  }
  
  const scenes: SceneBlueprintScene[] = [];
  let currentTime = 0;
  
  // Scene 1: Hook (first 1.2 seconds of first clip)
  if (clips[0]) {
    scenes.push({
      sceneId: '1',
      clipId: clips[0].id,
      clipUrl: clips[0].url,
      start: 0,
      end: Math.min(1.2, clips[0].duration),
      purpose: 'hook',
      text: 'WATCH THIS',
      textPosition: 'center',
      animation: 'pop',
      cutReason: 'Hardcoded hook - verify this renders exactly',
    });
    currentTime = 1.2;
  }
  
  // Scene 2: B-Roll (2.5 seconds)
  if (clips.length > 1 && clips[1]) {
    scenes.push({
      sceneId: '2',
      clipId: clips[1].id,
      clipUrl: clips[1].url,
      start: 0,
      end: Math.min(2.5, clips[1].duration),
      purpose: 'b_roll',
      text: 'THIS IS THE PROOF',
      textPosition: 'bottom',
      animation: 'slide',
      cutReason: 'Hardcoded b-roll - verify timing is exact',
    });
    currentTime += 2.5;
  } else if (clips[0]) {
    // Reuse first clip if only one
    scenes.push({
      sceneId: '2',
      clipId: clips[0].id,
      clipUrl: clips[0].url,
      start: 1.2,
      end: Math.min(3.7, clips[0].duration),
      purpose: 'b_roll',
      text: 'THIS IS THE PROOF',
      textPosition: 'bottom',
      animation: 'slide',
      cutReason: 'Hardcoded b-roll - same clip different segment',
    });
    currentTime += 2.5;
  }
  
  // Scene 3: CTA (1.5 seconds)
  const lastClip = clips[clips.length - 1];
  if (lastClip) {
    scenes.push({
      sceneId: '3',
      clipId: lastClip.id,
      clipUrl: lastClip.url,
      start: Math.max(0, lastClip.duration - 2),
      end: lastClip.duration,
      purpose: 'cta',
      text: 'FOLLOW FOR MORE',
      textPosition: 'center',
      animation: 'punch',
      cutReason: 'Hardcoded CTA - end of reel',
    });
    currentTime += 2;
  }
  
  return {
    id: `test-blueprint-${Date.now()}`,
    platform: 'instagram',
    totalDuration: currentTime,
    scenes,
    endCard: {
      duration: 2,
      text: 'WrapPriceWizard',
      cta: 'Book Now',
    },
    createdAt: new Date().toISOString(),
    source: 'hardcoded',
    // ============ NEW: Default format lock ============
    format: 'reel',
    aspectRatio: '9:16',
    templateId: 'ig_reel_v1',
    overlayPack: 'wpw_signature',
    font: 'Inter Black',
    textStyle: 'bold',
  };
}
