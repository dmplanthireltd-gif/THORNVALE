import type { ItemDef } from '../game/inventory/items';

/**
 * Icons of the festival items (liveops/liveItems.ts): the hollow pumpkin, the frost
 * bauble, the sweets and the two costumes. Same 32×32 space and dark outline as
 * ui/icons.ts (which calls `drawLiveIcon` first). Kept apart so the main painter
 * stays as it was.
 */
type Ctx = CanvasRenderingContext2D;
const OUT = '#120e0a';

function paint(x: Ctx, fill: string, line = 1.4): void {
  x.fillStyle = fill;
  x.fill();
  if (line > 0) {
    x.strokeStyle = OUT;
    x.lineWidth = line;
    x.stroke();
  }
}

function ellipse(x: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, line = 1.4): void {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  paint(x, fill, line);
}

function poly(x: Ctx, pts: number[], fill: string, line = 1.4): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  paint(x, fill, line);
}

function pumpkin(x: Ctx): void {
  // three lobes, a stalk, a carved grin lit from inside
  ellipse(x, 10, 19, 6.5, 8.5, '#c85e10');
  ellipse(x, 22, 19, 6.5, 8.5, '#c85e10');
  ellipse(x, 16, 19, 7, 9, '#e8801e');
  poly(x, [15, 11, 17, 11, 19, 5, 17, 4], '#4a6a2a', 1.1);
  poly(x, [11, 16, 14, 16, 12.5, 13], '#ffd860', 0.8);
  poly(x, [18, 16, 21, 16, 19.5, 13], '#ffd860', 0.8);
  poly(x, [10, 21, 22, 21, 20, 25, 18, 23, 16, 25, 14, 23, 12, 25], '#ffd860', 0.8);
}

function bauble(x: Ctx): void {
  x.beginPath();
  x.arc(16, 19, 10, 0, Math.PI * 2);
  paint(x, '#5aa8d8');
  x.beginPath();
  x.arc(16, 19, 10, Math.PI * 1.1, Math.PI * 1.6);
  x.strokeStyle = '#e8f6ff';
  x.lineWidth = 2;
  x.stroke();
  // a frost star painted inside
  x.strokeStyle = '#f4fbff';
  x.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    x.beginPath();
    x.moveTo(16 + Math.cos(a) * 6, 19 + Math.sin(a) * 6);
    x.lineTo(16 - Math.cos(a) * 6, 19 - Math.sin(a) * 6);
    x.stroke();
  }
  poly(x, [13, 9, 19, 9, 19, 6, 13, 6], '#c9a24a', 1.1);
}

function apple(x: Ctx): void {
  poly(x, [16, 3, 16.8, 3, 16.8, 9, 16, 9], '#c8a070', 0.8);
  ellipse(x, 16, 18, 9, 9, '#c8202a');
  x.beginPath();
  x.ellipse(13, 15, 3, 4, -0.5, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,220,200,0.55)';
  x.fill();
  // a drip of candy at the bottom
  poly(x, [9, 22, 23, 22, 21, 27, 18, 25, 15, 28, 12, 25], '#e8a040', 1);
}

function gingerbread(x: Ctx): void {
  const c = '#b8742a';
  ellipse(x, 16, 8, 5, 5, c);
  poly(x, [10, 13, 22, 13, 25, 18, 21, 19, 21, 23, 24, 29, 19, 29, 16, 24, 13, 29, 8, 29, 11, 23, 11, 19, 7, 18], c);
  x.fillStyle = '#f4f0e8';
  for (const [px, py] of [[14, 7], [18, 7], [16, 16], [16, 20]]) {
    x.beginPath();
    x.arc(px, py, 1, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#c8202a';
  x.beginPath();
  x.arc(16, 13.8, 1.2, 0, Math.PI * 2);
  x.fill();
}

function guise(x: Ctx, frost: boolean): void {
  // a folded costume with its mask on top
  poly(x, [5, 18, 27, 18, 25, 29, 7, 29], frost ? '#e8f0f8' : '#4a4038');
  poly(x, [5, 18, 27, 18, 24, 22, 8, 22], frost ? '#c8d8e8' : '#2e2620', 1);
  if (frost) {
    ellipse(x, 16, 11, 7, 7, '#f6fbff');
    poly(x, [16, 11, 22, 12.5, 16, 13.5], '#e8801e', 0.9);
    x.fillStyle = OUT;
    for (const px of [13, 19]) {
      x.beginPath();
      x.arc(px, 9, 1.1, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    // a bleached skull mask
    ellipse(x, 16, 11, 7, 7.5, '#e8e0c8');
    poly(x, [13, 16, 19, 16, 18, 19, 14, 19], '#e8e0c8', 1);
    x.fillStyle = OUT;
    ellipse(x, 13, 10.5, 2, 2.2, OUT, 0);
    ellipse(x, 19, 10.5, 2, 2.2, OUT, 0);
    poly(x, [16, 12.5, 17, 14.5, 15, 14.5], OUT, 0);
  }
}

/** Festival materials for icons.ts's material table (their pictures are drawn by drawLiveIcon). */
export const LIVE_MATERIAL_SHAPES: Record<string, [string, string]> = {
  hollow_pumpkin: ['orb', '#e07a1a'], frost_bauble: ['orb', '#9ad0f0'],
};

/** Draws a festival item's icon; false for anything else. */
export function drawLiveIcon(x: Ctx, d: ItemDef): boolean {
  switch (d.id) {
    case 'hollow_pumpkin': pumpkin(x); return true;
    case 'frost_bauble': bauble(x); return true;
    case 'candied_apple': apple(x); return true;
    case 'gingerbread_knight': gingerbread(x); return true;
    case 'hollow_guise': guise(x, false); return true;
    case 'snowfellow_guise': guise(x, true); return true;
  }
  return false;
}
