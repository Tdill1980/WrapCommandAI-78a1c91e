/**
 * useSceneBlueprint - Centralized Blueprint State Management
 * 
 * THE RULE: Every button on ReelBuilder MUST either:
 * - (A) Call updateBlueprint() to mutate the blueprint
 * - (B) Call replaceBlueprint() to create a new one
 * - (C) Use the blueprint for read-only operations (render)
 * 
 * Buttons NEVER talk directly to rendering or AI.
 * They only mutate the single source of truth.
 */

import { useState, useCallback } from 'react';
import { SceneBlueprint, SceneBlueprintScene, validateBlueprint } from '@/types/SceneBlueprint';

export interface BlueprintValidation {
  valid: boolean;
  errors: string[];
}

export interface UseSceneBlueprintReturn {
  // State
  blueprint: SceneBlueprint | null;
  validation: BlueprintValidation;
  
  // Mutations
  updateBlueprint: (mutator: (draft: SceneBlueprint) => SceneBlueprint) => void;
  replaceBlueprint: (next: SceneBlueprint) => void;
  clearBlueprint: () => void;
  
  // Target Lock (Select Format)
  setFormat: (format: 'reel' | 'story' | 'short', aspectRatio: '9:16' | '1:1' | '16:9', templateId: string) => void;
  
  // Style Binding (Overlay Pack)
  setOverlayPack: (pack: string, font: string, textStyle: 'bold' | 'minimal' | 'modern') => void;
  
  // Caption (Auto Captions)
  setCaption: (caption: string) => void;
  setSceneText: (sceneTexts: string[]) => void;
  
  // Optimization (Best Scenes) - swaps scenes without changing structure
  optimizeScenes: (optimizer: (scenes: SceneBlueprintScene[]) => SceneBlueprintScene[]) => void;
  
  // Resequencing (AI Sequence) - adjusts timing only
  resequenceScenes: (resequencer: (scenes: SceneBlueprintScene[], totalDuration: number) => SceneBlueprintScene[]) => void;
}

export function useSceneBlueprint(initialBlueprint: SceneBlueprint | null = null): UseSceneBlueprintReturn {
  const [blueprint, setBlueprint] = useState<SceneBlueprint | null>(initialBlueprint);
  const [validation, setValidation] = useState<BlueprintValidation>({ valid: false, errors: ['No blueprint created yet'] });
  
  // Validate whenever blueprint changes
  const updateValidation = useCallback((bp: SceneBlueprint | null) => {
    const result = validateBlueprint(bp);
    setValidation(result);
  }, []);
  
  // Generic mutation - preserves structure, modifies specific fields
  const updateBlueprint = useCallback((mutator: (draft: SceneBlueprint) => SceneBlueprint) => {
    setBlueprint(prev => {
      if (!prev) return prev;
      const next = mutator(prev);
      updateValidation(next);
      console.log('[useSceneBlueprint] Blueprint updated:', next.id);
      return next;
    });
  }, [updateValidation]);
  
  // Full replacement - for AI Auto-Create only
  const replaceBlueprint = useCallback((next: SceneBlueprint) => {
    setBlueprint(next);
    updateValidation(next);
    console.log('[useSceneBlueprint] Blueprint replaced:', next.id);
  }, [updateValidation]);
  
  // Clear blueprint
  const clearBlueprint = useCallback(() => {
    setBlueprint(null);
    setValidation({ valid: false, errors: ['Blueprint cleared'] });
    console.log('[useSceneBlueprint] Blueprint cleared');
  }, []);
  
  // ============ SELECT FORMAT (Target Lock) ============
  // Sets the render contract - what the renderer will produce
  const setFormat = useCallback((
    format: 'reel' | 'story' | 'short',
    aspectRatio: '9:16' | '1:1' | '16:9',
    templateId: string
  ) => {
    updateBlueprint(bp => ({
      ...bp,
      format,
      aspectRatio,
      templateId,
    }));
    console.log('[useSceneBlueprint] Format locked:', { format, aspectRatio, templateId });
  }, [updateBlueprint]);
  
  // ============ OVERLAY PACK (Style Binding) ============
  // Binds brand overlays to the blueprint
  const setOverlayPack = useCallback((
    pack: string,
    font: string,
    textStyle: 'bold' | 'minimal' | 'modern'
  ) => {
    updateBlueprint(bp => ({
      ...bp,
      overlayPack: pack,
      font,
      textStyle,
    }));
    console.log('[useSceneBlueprint] Overlay pack set:', { pack, font, textStyle });
  }, [updateBlueprint]);
  
  // ============ AUTO CAPTIONS (Text Population) ============
  // Sets global caption
  const setCaption = useCallback((caption: string) => {
    updateBlueprint(bp => ({
      ...bp,
      caption,
    }));
    console.log('[useSceneBlueprint] Caption set:', caption.substring(0, 50) + '...');
  }, [updateBlueprint]);
  
  // Sets per-scene text overlays
  const setSceneText = useCallback((sceneTexts: string[]) => {
    updateBlueprint(bp => ({
      ...bp,
      scenes: bp.scenes.map((scene, i) => ({
        ...scene,
        text: sceneTexts[i] ?? scene.text,
      })),
    }));
    console.log('[useSceneBlueprint] Scene text set for', sceneTexts.length, 'scenes');
  }, [updateBlueprint]);
  
  // ============ BEST SCENES (Optimize In Place) ============
  // Refines scene selection without nuking structure
  const optimizeScenes = useCallback((
    optimizer: (scenes: SceneBlueprintScene[]) => SceneBlueprintScene[]
  ) => {
    updateBlueprint(bp => ({
      ...bp,
      scenes: optimizer(bp.scenes),
    }));
    console.log('[useSceneBlueprint] Scenes optimized');
  }, [updateBlueprint]);
  
  // ============ AI SEQUENCE (Timing Only) ============
  // Adjusts scene order and timing without changing clips
  const resequenceScenes = useCallback((
    resequencer: (scenes: SceneBlueprintScene[], totalDuration: number) => SceneBlueprintScene[]
  ) => {
    updateBlueprint(bp => {
      const newScenes = resequencer(bp.scenes, bp.totalDuration);
      const newDuration = newScenes.reduce((sum, s) => sum + (s.end - s.start), 0);
      return {
        ...bp,
        scenes: newScenes,
        totalDuration: newDuration,
      };
    });
    console.log('[useSceneBlueprint] Scenes resequenced');
  }, [updateBlueprint]);
  
  return {
    blueprint,
    validation,
    updateBlueprint,
    replaceBlueprint,
    clearBlueprint,
    setFormat,
    setOverlayPack,
    setCaption,
    setSceneText,
    optimizeScenes,
    resequenceScenes,
  };
}
