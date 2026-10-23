/**
 * Render style switch (owner request 2026-10-23: a "painted" look in the spirit of
 * classic hand-painted 2D clients, as a sample next to today's look).
 *
 * - `classic` (default): today's look — low-poly 3D drawn through the pixel-art pass.
 * - `painted` (sample, behind a switch): native resolution with smooth filtering,
 *   high-resolution hand-painted ground with organic borders, soft warm light, light
 *   pools, a thin dark outline around creatures, rounder rocks/bushes/canopies.
 *
 * Chosen once at load: the URL `?style=painted` (or `?style=classic`) wins, else the
 * hidden setting `localStorage['thornvale.style']`. Nothing changes for players
 * unless they ask for it.
 */
export type RenderStyle = 'classic' | 'painted';
export const STYLE_KEY = 'thornvale.style';

function readStyle(): RenderStyle {
  try {
    const q = new URLSearchParams(window.location.search).get('style');
    if (q === 'painted' || q === 'classic') return q;
    return window.localStorage.getItem(STYLE_KEY) === 'painted' ? 'painted' : 'classic';
  } catch {
    return 'classic';
  }
}

export const RENDER_STYLE: RenderStyle = typeof window === 'undefined' ? 'classic' : readStyle();
/** True when the painted sample look is on (read once at load). */
export const PAINTED = RENDER_STYLE === 'painted';

/** Stores the hidden setting (takes effect on the next load). */
export function storeStyle(s: RenderStyle): void {
  try { window.localStorage.setItem(STYLE_KEY, s); } catch { /* storage off */ }
}
