import { useState, useCallback } from "react";

export type BrandPackId = "wpw" | "pid" | "restyle" | "custom";

export interface OverlayElement {
  id: string;
  text: string;
  style: "bold_stroke" | "tag" | "corner_badge" | "grunge" | "modern" | "thin" | "custom";
  position: "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right";
  start: number;
  end: number;
  color?: string;
  gradient?: [string, string];
}

export interface BrandPack {
  id: BrandPackId;
  label: string;
  description: string;
  color: string;
  gradient?: [string, string];
  overlays: Omit<OverlayElement, "id" | "start" | "end">[];
}

export const BRAND_PACKS: Record<BrandPackId, BrandPack> = {
  wpw: {
    id: "wpw",
    label: "WPW Signature",
    description: "Bold block text, white stroke, magenta highlights",
    color: "#E1306C",
    overlays: [
      { text: "PREMIUM WRAP", style: "bold_stroke", position: "top-center", color: "#E1306C" },
      { text: "SUPERIOR PRINT", style: "tag", position: "bottom-center", color: "#E1306C" },
      { text: "WPW", style: "corner_badge", position: "bottom-right", color: "#E1306C" },
    ],
  },
  pid: {
    id: "pid",
    label: "Paint Is Dead",
    description: "Gritty textured text, black + neon green",
    color: "#00FF38",
    overlays: [
      { text: "DEAD CLEAN FINISH", style: "grunge", position: "center", color: "#00FF38" },
      { text: "PAINT IS DEAD", style: "tag", position: "bottom-center", color: "#00FF38" },
    ],
  },
  restyle: {
    id: "restyle",
    label: "RestylePro AI",
    description: "Sleek gradient overlays, modern typography",
    color: "#405DE6",
    gradient: ["#405DE6", "#E1306C"],
    overlays: [
      { text: "COLOR CHANGE", style: "modern", position: "top-center", gradient: ["#405DE6", "#E1306C"] },
      { text: "REVEAL", style: "thin", position: "bottom-center", gradient: ["#405DE6", "#E1306C"] },
    ],
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Create your own overlay style",
    color: "#888888",
    overlays: [],
  },
};

export function useReelOverlays() {
  const [overlays, setOverlays] = useState<OverlayElement[]>([]);
  const [activePack, setActivePack] = useState<BrandPackId | null>(null);

  const applyBrandPack = useCallback((packId: BrandPackId, totalDuration: number = 10) => {
    const pack = BRAND_PACKS[packId];
    if (!pack || packId === "custom") {
      setActivePack(null);
      return;
    }

    const newOverlays: OverlayElement[] = pack.overlays.map((overlay, i) => ({
      ...overlay,
      id: `overlay-${packId}-${i}-${Date.now()}`,
      start: i === 0 ? 0 : totalDuration * 0.3 * i,
      end: i === 0 ? totalDuration : Math.min(totalDuration, totalDuration * 0.3 * (i + 1) + 2),
    }));

    setOverlays(newOverlays);
    setActivePack(packId);
  }, []);

  const addOverlay = useCallback((overlay: Omit<OverlayElement, "id">) => {
    const newOverlay: OverlayElement = {
      ...overlay,
      id: `overlay-${Date.now()}`,
    };
    setOverlays((prev) => [...prev, newOverlay]);
    setActivePack("custom");
    return newOverlay;
  }, []);

  const updateOverlay = useCallback((id: string, updates: Partial<OverlayElement>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
    setActivePack("custom");
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const clearOverlays = useCallback(() => {
    setOverlays([]);
    setActivePack(null);
  }, []);

  const exportForRender = useCallback(() => {
    return overlays.map((overlay) => ({
      text: overlay.text,
      position: overlay.position,
      time: overlay.start,
      duration: overlay.end - overlay.start,
      style: overlay.style,
      color: overlay.color,
      gradient: overlay.gradient,
    }));
  }, [overlays]);

  return {
    overlays,
    activePack,
    applyBrandPack,
    addOverlay,
    updateOverlay,
    removeOverlay,
    clearOverlays,
    exportForRender,
  };
}
