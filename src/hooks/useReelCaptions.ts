import { useState, useCallback } from "react";
import { supabase, lovableFunctions } from "@/integrations/supabase/client";

export type CaptionStyle = "sabri" | "dara" | "clean";

export interface Caption {
  id: string;
  text: string;
  start: number;
  end: number;
  style: CaptionStyle;
  emoji?: string;
  emphasis?: boolean;
}

export interface CaptionSettings {
  style: CaptionStyle;
  fontSize: "small" | "medium" | "large";
  position: "top" | "center" | "bottom";
  animation: "none" | "fade" | "pop" | "slide";
}

export const CAPTION_STYLE_CONFIGS: Record<CaptionStyle, { name: string; description: string; example: string }> = {
  sabri: {
    name: "Sabri Suby",
    description: "Punchy, aggressive, uppercase hooks with urgency",
    example: "THIS WRAP LOOKS INSANE 🔥",
  },
  dara: {
    name: "Dara Denney",
    description: "Clean, conversion-optimized, relatable pacing",
    example: "wait for this reveal...",
  },
  clean: {
    name: "Clean Minimal",
    description: "Professional, simple, no emojis",
    example: "Premium wrap finish",
  },
};

export function useReelCaptions() {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CaptionSettings>({
    style: "sabri",
    fontSize: "large",
    position: "center",
    animation: "pop",
  });

  const generateCaptions = useCallback(
    async (
      videoUrl: string, 
      style: CaptionStyle = "sabri",
      options?: { duration?: number; concept?: string; hook?: string; cta?: string }
    ): Promise<Caption[]> => {
      setLoading(true);
      try {
        const { data, error } = await lovableFunctions.functions.invoke("ai-generate-captions", {
          body: { 
            video_url: videoUrl, 
            style,
            duration: options?.duration || 15,
            concept: options?.concept,
            hook: options?.hook,
            cta: options?.cta,
          },
        });

        if (error) {
          console.error("Caption generation error:", error);
          return [];
        }

        const generatedCaptions: Caption[] = (data.captions || []).map(
          (cap: { text: string; start: number; end: number; emoji?: string }, i: number) => ({
            id: `caption-${Date.now()}-${i}`,
            text: cap.text,
            start: cap.start,
            end: cap.end,
            style,
            emoji: cap.emoji,
            emphasis: style === "sabri",
          })
        );

        setCaptions(generatedCaptions);
        return generatedCaptions;
      } catch (err) {
        console.error("Failed to generate captions:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const addCaption = useCallback((caption: Omit<Caption, "id">) => {
    const newCaption: Caption = {
      ...caption,
      id: `caption-${Date.now()}`,
    };
    setCaptions((prev) => [...prev, newCaption]);
    return newCaption;
  }, []);

  const updateCaption = useCallback((id: string, updates: Partial<Caption>) => {
    setCaptions((prev) => prev.map((cap) => (cap.id === id ? { ...cap, ...updates } : cap)));
  }, []);

  const removeCaption = useCallback((id: string) => {
    setCaptions((prev) => prev.filter((cap) => cap.id !== id));
  }, []);

  const updateSettings = useCallback((updates: Partial<CaptionSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const exportForRender = useCallback(() => {
    return captions.map((cap) => ({
      text: cap.text,
      time: cap.start,
      duration: cap.end - cap.start,
      style: cap.style,
      animation: settings.animation,
      position: settings.position,
      fontSize: settings.fontSize,
    }));
  }, [captions, settings]);

  return {
    captions,
    loading,
    settings,
    generateCaptions,
    addCaption,
    updateCaption,
    removeCaption,
    updateSettings,
    exportForRender,
  };
}
