/**
 * Settings → Display → Graphics: High / Medium / Low (saved as `thornvale.gfx`).
 * High is the full look (the default). Medium and Low trade small details for
 * speed on weak computers; the world, the camera and every system stay the same.
 */
export type GraphicsQuality = 'high' | 'medium' | 'low';
export const GRAPHICS_KEY = 'thornvale.gfx';

export interface GraphicsLevel {
  /** The sun casts shadows at all. */
  shadows: boolean;
  /** Shadow map size in texels. */
  shadowMap: number;
  /** Small props (berries, fence rails, table legs, hoops, torch sticks…) cast shadows. */
  smallShadows: boolean;
  /** Purely decorative extras: grass tufts, berries, cave dust motes. */
  decor: boolean;
  /** Share of the weather particles (rain, snow, sand). */
  particles: number;
  /** Highest device pixel ratio used when the pixel-art look is off. */
  maxPixelRatio: number;
  /** How many of the farthest zoom-out steps are left out (a shorter view distance). */
  zoomOutCut: number;
}

export const GRAPHICS: Record<GraphicsQuality, GraphicsLevel> = {
  high: { shadows: true, shadowMap: 2048, smallShadows: true, decor: true, particles: 1, maxPixelRatio: 2, zoomOutCut: 0 },
  medium: { shadows: true, shadowMap: 1024, smallShadows: false, decor: true, particles: 1, maxPixelRatio: 1.5, zoomOutCut: 0 },
  low: { shadows: false, shadowMap: 1024, smallShadows: false, decor: false, particles: 0.5, maxPixelRatio: 1, zoomOutCut: 1 },
};

export const GRAPHICS_NAMES: Record<GraphicsQuality, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function storedGraphics(): GraphicsQuality {
  try {
    const v = localStorage.getItem(GRAPHICS_KEY);
    return v === 'medium' || v === 'low' ? v : 'high';
  } catch {
    return 'high';
  }
}

export function storeGraphics(q: GraphicsQuality): void {
  try { localStorage.setItem(GRAPHICS_KEY, q); } catch { /* storage off */ }
}

/**
 * Watches the frame rate. When the game runs below `SLOW_FPS` for `SLOW_SECONDS`
 * in a row (after the first seconds of loading), it says so once, so the HUD
 * can suggest a lower graphics setting. It never changes the setting itself.
 */
export const SLOW_FPS = 30;
export const SLOW_SECONDS = 10;
export class FpsWatch {
  private last = 0;
  private slowFor = 0;
  private warm = 15;
  private fired = false;

  /** Call once a frame with `performance.now()`; true once when the game has been slow. */
  frame(now: number): boolean {
    const gap = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    // a hidden tab or a breakpoint is not slowness
    if (this.fired || gap <= 0 || gap > 1) return false;
    if (this.warm > 0) { this.warm -= gap; return false; }
    if (gap > 1 / SLOW_FPS) this.slowFor += gap;
    else this.slowFor = Math.max(0, this.slowFor - gap * 2);
    if (this.slowFor < SLOW_SECONDS) return false;
    this.fired = true;
    return true;
  }
}
