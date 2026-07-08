/**
 * Feature Flags for Single Path Enforcement
 * 
 * When SINGLE_PATH_MODE is true:
 * - Only ReelBuilder and MightyEdit are authorized for content creation
 * - All other generation entry points are hidden (not deleted)
 * - Media Library, Calendar viewing, and existing systems remain intact
 * 
 * To disable and restore all entry points, set to false.
 */
export const SINGLE_PATH_MODE = true;

/**
 * Authorized creation path when SINGLE_PATH_MODE is true:
 * Upload → ReelBuilder → MightyEdit → Render → content_files with tags
 */
export const AUTHORIZED_CREATION_PATHS = [
  '/organic/reel-builder',
  '/mighty-edit',
] as const;

/**
 * Reel render engine selector.
 * - 'ffmpeg'  → self-hosted worker (render-reel-ffmpeg edge fn) — no vendor.
 * - anything else / unset → legacy Creatomate (render-reel).
 * Set VITE_REEL_RENDERER=ffmpeg in the Vercel env to switch the frontend.
 */
export const REEL_RENDER_FN =
  (import.meta as any).env?.VITE_REEL_RENDERER === "ffmpeg"
    ? "render-reel-ffmpeg"
    : "render-reel";
