/**
 * Render style switch (owner request 2026-10-23: a "painted" look in the spirit of
 * classic hand-painted 2D clients; made the default 2026-10-24).
 *
 * - `painted` (default): native resolution with smooth filtering, high-resolution
 *   hand-painted ground with organic borders, soft warm light, light pools, a thin dark
 *   outline around creatures, rounder rocks/bushes/canopies, the grim models.
 * - `classic`: the earlier look — low-poly 3D drawn through the pixel-art pass.
 *
 * Chosen once at load: the URL `?style=painted` (or `?style=classic`) wins, else the
 * setting `localStorage['thornvale.style']` (Settings → Look), else painted. Changing it
 * takes effect after a reload (every model, texture and shader is built for one style).
 */
export type RenderStyle = 'classic' | 'painted';
export const STYLE_KEY = 'thornvale.style';
/** The look for everyone who has not picked one. */
export const DEFAULT_STYLE: RenderStyle = 'painted';

/** Picks the style from the URL query value and the stored setting (pure, for tests). */
export function pickStyle(query: string | null, stored: string | null): RenderStyle {
  if (query === 'painted' || query === 'classic') return query;
  if (stored === 'painted' || stored === 'classic') return stored;
  return DEFAULT_STYLE;
}

function readStyle(): RenderStyle {
  let q: string | null = null;
  let stored: string | null = null;
  try { q = new URLSearchParams(window.location.search).get('style'); } catch { /* no URL */ }
  try { stored = window.localStorage.getItem(STYLE_KEY); } catch { /* storage off */ }
  return pickStyle(q, stored);
}

/**
 * Node (tests, tools) has no window: the models are built in the classic style there, as the
 * logic tests expect; the browser default is painted.
 */
export const RENDER_STYLE: RenderStyle = typeof window === 'undefined' ? 'classic' : readStyle();
/** True when the painted look is on (read once at load). */
export const PAINTED = RENDER_STYLE === 'painted';

/** The setting stored in this browser (what Settings shows), or the default. */
export function storedStyle(): RenderStyle {
  try { return pickStyle(null, window.localStorage.getItem(STYLE_KEY)); } catch { return DEFAULT_STYLE; }
}

/** Stores the setting (takes effect on the next load). */
export function storeStyle(s: RenderStyle): void {
  try { window.localStorage.setItem(STYLE_KEY, s); } catch { /* storage off */ }
}
