/**
 * Built-in music library for reel rendering
 * These are resolved from style hints like "upbeat" to actual URLs
 */

export interface MusicTrack {
  id: string;
  label: string;
  url: string;
  style: string;
  bpm?: number;
  duration?: number;
}

export const MUSIC_LIBRARY: MusicTrack[] = [
  { 
    id: "upbeat-industrial", 
    label: "Upbeat Industrial", 
    url: "/audio/upbeat-industrial.mp3",
    style: "upbeat",
    bpm: 120
  },
  { 
    id: "modern-hiphop", 
    label: "Modern Hip Hop", 
    url: "/audio/modern-hiphop.mp3",
    style: "hiphop",
    bpm: 95
  },
  { 
    id: "cinematic-epic", 
    label: "Cinematic Epic", 
    url: "/audio/cinematic-epic.mp3",
    style: "cinematic",
    bpm: 80
  },
  { 
    id: "clean-tech", 
    label: "Clean Tech", 
    url: "/audio/clean-tech.mp3",
    style: "tech",
    bpm: 110
  },
  { 
    id: "energetic-rock", 
    label: "Energetic Rock", 
    url: "/audio/energetic-rock.mp3",
    style: "rock",
    bpm: 140
  },
];

/**
 * Resolve a music style hint to a concrete URL
 */
export function resolveMusicUrl(styleOrUrl: string | null | undefined): string | null {
  if (!styleOrUrl) return null;

  // Only absolute URLs are renderable by the ffmpeg worker (and playable reliably in-app).
  if (/^https?:\/\//i.test(styleOrUrl)) {
    return styleOrUrl;
  }
  
  // Try to match by style
  const styleLower = styleOrUrl.toLowerCase();
  const match = MUSIC_LIBRARY.find(
    track => track.style === styleLower || track.id.includes(styleLower)
  );
  
  if (match) return match.url;
  
  // Fallback mappings for common style hints
  if (styleLower.includes('upbeat') || styleLower.includes('energetic')) {
    return MUSIC_LIBRARY[0].url;
  }
  if (styleLower.includes('hip') || styleLower.includes('rap')) {
    return MUSIC_LIBRARY[1].url;
  }
  if (styleLower.includes('cine') || styleLower.includes('epic') || styleLower.includes('dramatic')) {
    return MUSIC_LIBRARY[2].url;
  }
  
  return null;
}

/**
 * Get a track by ID
 */
export function getMusicTrack(id: string): MusicTrack | undefined {
  return MUSIC_LIBRARY.find(t => t.id === id);
}
