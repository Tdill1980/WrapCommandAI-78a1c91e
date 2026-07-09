/**
 * Media Selection Engine - Deterministic video selection based on tags
 * 
 * AI annotates → System selects. Never the other way around.
 * This is the core of reliable content creation.
 */

import { supabase, contentDB } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface ContentIntent {
  platform: 'meta_ad' | 'instagram' | 'tiktok' | 'youtube' | 'organic';
  goal?: 'conversion' | 'awareness' | 'engagement';
  angle?: 'risk_reversal' | 'authority' | 'identity' | 'transformation' | 'social_proof';
  brand: string;
  topic?: string;
  requiredTags: string[];
  forbiddenTags: string[];
  minMotion: number;
  minClips: number;
  maxClips: number;
  captionStyle: 'sabri' | 'dara' | 'clean';
  musicStyle: 'upbeat' | 'cinematic' | 'none';
}

export interface ScoredAsset {
  assetId: string;
  fileUrl: string;
  muxPlaybackId?: string;
  duration?: number;
  score: number;
  matchedTags: string[];
  analysis: MediaAnalysis | null;
  reason: string;
}

export interface MediaAnalysis {
  hasVehicle: boolean;
  hasPeople: boolean;
  hasInstall: boolean;
  hasBeforeAfter: boolean;
  hasReveal: boolean;
  hasMotion: boolean;
  environment: string | null;
  motionScore: number;
  energyLevel: string | null;
  detectedObjects: string[];
  detectedActions: string[];
  confidence: number;
}

export interface SelectionResult {
  success: boolean;
  assets: ScoredAsset[];
  totalCandidates: number;
  filteredOut: number;
  error?: string;
}

// ============================================
// INTENT PRESETS (Locked templates)
// ============================================

export const INTENT_PRESETS: Record<string, Partial<ContentIntent>> = {
  // Meta Ad Presets
  meta_conversion: {
    platform: 'meta_ad',
    goal: 'conversion',
    requiredTags: ['wrap_install', 'vehicle'],
    forbiddenTags: ['music_only', 'lifestyle', 'behind_scenes'],
    minMotion: 0.5,
    minClips: 4,
    maxClips: 6,
    captionStyle: 'dara',
  },
  meta_authority: {
    platform: 'meta_ad',
    goal: 'awareness',
    angle: 'authority',
    requiredTags: ['commercial', 'fleet'],
    forbiddenTags: ['personal', 'diy'],
    minMotion: 0.4,
    minClips: 3,
    maxClips: 5,
    captionStyle: 'dara',
  },
  
  // Organic Presets
  organic_reveal: {
    platform: 'organic',
    goal: 'engagement',
    requiredTags: ['reveal', 'vehicle'],
    forbiddenTags: [],
    minMotion: 0.6,
    minClips: 3,
    maxClips: 8,
    captionStyle: 'sabri',
  },
  organic_install: {
    platform: 'organic',
    goal: 'engagement',
    requiredTags: ['wrap_install'],
    forbiddenTags: [],
    minMotion: 0.3,
    minClips: 4,
    maxClips: 10,
    captionStyle: 'dara',
  },
};

// ============================================
// SYSTEM TAG ASSIGNMENT (From analysis facts)
// ============================================

export function assignSystemTags(analysis: MediaAnalysis): string[] {
  const tags: string[] = [];
  
  // Vehicle detection
  if (analysis.hasVehicle) {
    tags.push('vehicle');
    if (analysis.detectedObjects.some(o => ['truck', 'van', 'fleet'].includes(o.toLowerCase()))) {
      tags.push('commercial');
      tags.push('fleet');
    }
  }
  
  // Install detection
  if (analysis.hasInstall) {
    tags.push('wrap_install');
  }
  
  // Reveal detection
  if (analysis.hasReveal || analysis.hasBeforeAfter) {
    tags.push('reveal');
    if (analysis.hasBeforeAfter) tags.push('before_after');
  }
  
  // Environment
  if (analysis.environment) {
    tags.push(analysis.environment.toLowerCase());
    if (analysis.environment === 'shop') {
      tags.push('professional');
    }
  }
  
  // Motion/energy
  if (analysis.motionScore > 0.7) {
    tags.push('high_energy');
  } else if (analysis.motionScore > 0.4) {
    tags.push('medium_energy');
  } else {
    tags.push('low_energy');
  }
  
  // People
  if (analysis.hasPeople) {
    tags.push('people');
  }
  
  return [...new Set(tags)]; // Dedupe
}

// ============================================
// SCORING ENGINE (Deterministic)
// ============================================

function scoreAsset(
  asset: { 
    id: string; 
    file_url: string;
    mux_playback_id?: string;
    duration_seconds?: number;
  },
  analysis: MediaAnalysis | null,
  matchedTags: string[],
  intent: ContentIntent
): ScoredAsset {
  let score = 0;
  const reasons: string[] = [];
  
  // Tag matching (primary)
  const tagBonus = matchedTags.length * 3;
  score += tagBonus;
  if (matchedTags.length > 0) {
    reasons.push(`Matched ${matchedTags.length} required tags: ${matchedTags.join(', ')}`);
  }
  
  if (analysis) {
    // Motion score
    if (analysis.motionScore >= intent.minMotion) {
      const motionBonus = Math.floor(analysis.motionScore * 3);
      score += motionBonus;
      reasons.push(`Motion score ${(analysis.motionScore * 100).toFixed(0)}% meets threshold`);
    }
    
    // High-value content types
    if (analysis.hasInstall) {
      score += 4;
      reasons.push('Contains installation footage');
    }
    if (analysis.hasReveal) {
      score += 3;
      reasons.push('Contains reveal moment');
    }
    if (analysis.hasVehicle) {
      score += 2;
      reasons.push('Features vehicle');
    }
    if (analysis.hasPeople && intent.platform !== 'meta_ad') {
      score += 1;
      reasons.push('Shows people');
    }
    
    // Environment bonus for professional settings
    if (analysis.environment === 'shop') {
      score += 2;
      reasons.push('Professional shop environment');
    }
    
    // Confidence factor
    if (analysis.confidence > 0.8) {
      score += 1;
    }
  }
  
  return {
    assetId: asset.id,
    fileUrl: asset.file_url,
    muxPlaybackId: asset.mux_playback_id || undefined,
    duration: asset.duration_seconds || undefined,
    score,
    matchedTags,
    analysis,
    reason: reasons.length > 0 ? reasons.join('. ') : 'Selected based on availability',
  };
}

// ============================================
// MAIN SELECTION FUNCTION
// ============================================

export async function selectMediaForIntent(
  intent: ContentIntent,
  organizationId: string
): Promise<SelectionResult> {
  console.log('[SelectionEngine] Starting selection with intent:', intent);
  
  // Step 1: Get all video assets for the organization
  // Select real source footage: exclude AI outputs and inspo references, and
  // require a playable file_url (the ffmpeg renderer downloads it directly).
  // Do NOT require mux_playback_id or a strict 'raw' category — that hid every
  // uploaded/imported clip that was never ingested into Mux or wasn't tagged 'raw'.
  const { data: allAssets, error: assetError } = await contentDB
    .from('content_files')
    .select('id, file_url, mux_playback_id, duration_seconds, brand, content_category')
    .eq('organization_id', organizationId)
    .eq('file_type', 'video')
    // Exclude AI output + inspo references but KEEP NULL-category rows.
    // PostgREST `.neq()` drops NULLs (NULL != x → NULL → excluded), which hid
    // every uploaded clip that was never categorized.
    .or('content_category.is.null,and(content_category.neq.ai_output,content_category.neq.inspo_reference)')
    .not('file_url', 'is', null);
  
  if (assetError) {
    console.error('[SelectionEngine] Failed to fetch assets:', assetError);
    return {
      success: false,
      assets: [],
      totalCandidates: 0,
      filteredOut: 0,
      error: `Database error: ${assetError.message}`,
    };
  }
  
  if (!allAssets || allAssets.length === 0) {
    // Check if there are videos but in wrong category
    const { count: totalVideos } = await contentDB
      .from('content_files')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('file_type', 'video');
    
    if (totalVideos && totalVideos > 0) {
      return {
        success: false,
        assets: [],
        totalCandidates: 0,
        filteredOut: 0,
        error: `No source footage found. You have ${totalVideos} videos but they may be categorized as AI outputs or inspiration. Check your Media Library and move videos to "Source" category.`,
      };
    }
    
    return {
      success: false,
      assets: [],
      totalCandidates: 0,
      filteredOut: 0,
      error: 'No video assets found in your library. Please upload videos first.',
    };
  }
  
  console.log(`[SelectionEngine] Found ${allAssets.length} source footage videos (excluding AI outputs and inspo)`);
  
  // Step 2: Filter by brand if specified
  let filteredAssets = allAssets;
  if (intent.brand) {
    const brandFiltered = allAssets.filter(a => 
      !a.brand || a.brand.toLowerCase() === intent.brand.toLowerCase()
    );
    if (brandFiltered.length > 0) {
      filteredAssets = brandFiltered;
    }
  }
  
  // Step 3: Get tags and analysis for filtered assets
  const assetIds = filteredAssets.map(a => a.id);
  
  const [tagsResult, analysisResult] = await Promise.all([
    supabase
      .from('media_tags')
      .select('asset_id, tag, locked')
      .in('asset_id', assetIds),
    supabase
      .from('media_analysis')
      .select('*')
      .in('asset_id', assetIds),
  ]);
  
  // Build lookup maps
  const tagsByAsset = new Map<string, string[]>();
  if (tagsResult.data) {
    for (const row of tagsResult.data) {
      const existing = tagsByAsset.get(row.asset_id) || [];
      existing.push(row.tag);
      tagsByAsset.set(row.asset_id, existing);
    }
  }
  
  const analysisByAsset = new Map<string, MediaAnalysis>();
  if (analysisResult.data) {
    for (const row of analysisResult.data) {
      analysisByAsset.set(row.asset_id, {
        hasVehicle: row.has_vehicle,
        hasPeople: row.has_people,
        hasInstall: row.has_install,
        hasBeforeAfter: row.has_before_after,
        hasReveal: row.has_reveal,
        hasMotion: row.has_motion,
        environment: row.environment,
        motionScore: row.motion_score,
        energyLevel: row.energy_level,
        detectedObjects: row.detected_objects || [],
        detectedActions: row.detected_actions || [],
        confidence: row.confidence,
      });
    }
  }
  
  // Step 4: Filter and score assets
  const candidates: ScoredAsset[] = [];
  let filteredOut = 0;
  
  for (const asset of filteredAssets) {
    const assetTags = tagsByAsset.get(asset.id) || [];
    const analysis = analysisByAsset.get(asset.id) || null;
    
    // Check forbidden tags
    const hasForbidden = intent.forbiddenTags.some(ft => assetTags.includes(ft));
    if (hasForbidden) {
      filteredOut++;
      continue;
    }
    
    // Check required tags (at least one must match)
    const matchedRequired = intent.requiredTags.filter(rt => assetTags.includes(rt));
    
    // Check motion requirement
    if (analysis && analysis.motionScore < intent.minMotion) {
      filteredOut++;
      continue;
    }
    
    // Score the asset
    const scored = scoreAsset(asset, analysis, matchedRequired, intent);
    
    // Only include if has at least one matching tag OR no required tags
    if (matchedRequired.length > 0 || intent.requiredTags.length === 0) {
      candidates.push(scored);
    } else {
      filteredOut++;
    }
  }
  
  // Step 5: Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  // Step 6: Check minimum requirement
  if (candidates.length < intent.minClips) {
    return {
      success: false,
      assets: candidates.slice(0, intent.maxClips),
      totalCandidates: allAssets.length,
      filteredOut,
      error: `Not enough relevant clips found. Need at least ${intent.minClips}, found ${candidates.length}. ` +
        `Try adding more videos with tags: ${intent.requiredTags.join(', ')} or adjust your requirements.`,
    };
  }
  
  // Step 7: Return top clips
  const selected = candidates.slice(0, intent.maxClips);
  
  console.log(`[SelectionEngine] Selected ${selected.length} clips from ${candidates.length} candidates`);
  
  return {
    success: true,
    assets: selected,
    totalCandidates: allAssets.length,
    filteredOut,
  };
}

// ============================================
// HELPER: Build intent from user inputs
// ============================================

export function buildIntent(
  preset: keyof typeof INTENT_PRESETS | null,
  overrides: Partial<ContentIntent>
): ContentIntent {
  const base: ContentIntent = {
    platform: 'organic',
    brand: '',
    requiredTags: [],
    forbiddenTags: [],
    minMotion: 0.3,
    minClips: 3,
    maxClips: 8,
    captionStyle: 'dara',
    musicStyle: 'upbeat',
  };
  
  const presetValues = preset ? INTENT_PRESETS[preset] : {};
  
  return {
    ...base,
    ...presetValues,
    ...overrides,
  };
}

// ============================================
// HELPER: Topic to tags mapping
// ============================================

export function topicToTags(topic: string): string[] {
  const topicLower = topic.toLowerCase();
  const tags: string[] = [];
  
  // Wrap-related
  if (topicLower.includes('wrap') || topicLower.includes('install')) {
    tags.push('wrap_install');
  }
  if (topicLower.includes('fleet') || topicLower.includes('commercial')) {
    tags.push('fleet', 'commercial');
  }
  if (topicLower.includes('reveal') || topicLower.includes('transformation')) {
    tags.push('reveal');
  }
  if (topicLower.includes('before') && topicLower.includes('after')) {
    tags.push('before_after');
  }
  if (topicLower.includes('color change') || topicLower.includes('color-change')) {
    tags.push('color_change', 'reveal');
  }
  if (topicLower.includes('chrome') || topicLower.includes('metallic')) {
    tags.push('specialty_film');
  }
  if (topicLower.includes('truck') || topicLower.includes('van')) {
    tags.push('commercial', 'fleet');
  }
  
  // If no specific matches, use generic
  if (tags.length === 0) {
    tags.push('vehicle');
  }
  
  return [...new Set(tags)];
}
