import { petForItem, type PetId } from '../game/pets/petDefs';

/**
 * Inventory icons of the pet items: each pet's portrait, hand-drawn in the 32×32 icon space with
 * the same dark outline and soft highlight as every other item icon (ui/icons.ts calls this for
 * items of kind 'pet'). Muted natural colours, big friendly eyes.
 */
type Ctx = CanvasRenderingContext2D;
const OUT = '#120e0a';

function path(x: Ctx, fill: string, line = 1.3): void {
  x.fillStyle = fill;
  x.fill();
  x.strokeStyle = OUT;
  x.lineWidth = line;
  x.stroke();
}

function ell(x: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, rot = 0, line = 1.3): void {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  path(x, fill, line);
}

function poly(x: Ctx, pts: number[], fill: string, line = 1.3): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  path(x, fill, line);
}

/** A big friendly eye with a glint. */
function eye(x: Ctx, cx: number, cy: number, r: number, iris = '#1a1410'): void {
  ell(x, cx, cy, r, r, iris, 0, 0.8);
  x.fillStyle = '#fff4d8';
  x.beginPath();
  x.arc(cx + r * 0.35, cy - r * 0.35, r * 0.38, 0, Math.PI * 2);
  x.fill();
}

/** Soft light from the top left, like the other icons. */
function sheen(x: Ctx, cx: number, cy: number, r: number): void {
  const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 0, cx - r * 0.4, cy - r * 0.5, r);
  g.addColorStop(0, 'rgba(255,240,210,0.28)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = g;
  x.fillRect(cx - r * 1.5, cy - r * 1.5, r * 3, r * 3);
}

const DRAW: Record<PetId, (x: Ctx) => void> = {
  tortoise(x) {
    for (const [lx, ly] of [[8, 24], [14, 26], [21, 26], [25, 23]]) ell(x, lx, ly, 2.6, 2.4, '#6e7650');
    ell(x, 27, 18, 4.2, 3.6, '#7a8458'); // head
    eye(x, 28.4, 17, 1.4);
    x.beginPath();
    x.moveTo(6, 22);
    x.quadraticCurveTo(7, 7, 17, 7);
    x.quadraticCurveTo(26, 7, 26, 22);
    x.closePath();
    path(x, '#5a5236');
    for (const [px, py, r] of [[16, 13, 3.6], [10.5, 17.5, 3], [21.5, 17.5, 3], [16, 19.5, 2.6]]) ell(x, px, py, r, r * 0.8, '#8a7a4e', 0, 0.9);
    ell(x, 12, 9.5, 2.4, 1.2, '#4a6a2a', 0, 0.8); // moss
    // war harness: a red saddle cloth with a saddle, bone spikes on the rim, a torn banner
    ell(x, 17, 8.2, 5, 1.8, '#6a1612', 0, 0.95);
    x.fillStyle = '#3a2416';
    x.fillRect(14.5, 6, 5, 2.2);
    x.fillStyle = '#cabd98';
    for (const [sx, sy, dx] of [[7.5, 15, -2], [24.6, 15, 2], [11, 9, -1.4], [22.5, 9.5, 1.4]]) {
      x.beginPath(); x.moveTo(sx, sy - 1.2); x.lineTo(sx + dx, sy - 2.6); x.lineTo(sx, sy + 1.2); x.closePath(); x.fill();
    }
    x.fillStyle = '#3a2a1a';
    x.fillRect(20, 0.5, 1, 7);
    x.fillStyle = '#8a1a14';
    x.beginPath(); x.moveTo(21, 0.8); x.lineTo(27, 0.8); x.lineTo(25.5, 2.4); x.lineTo(27, 4.2); x.lineTo(21, 4.2); x.closePath(); x.fill();
    x.strokeStyle = '#2e2a1c';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(6, 22);
    x.lineTo(26, 22);
    x.stroke();
    sheen(x, 16, 13, 10);
  },
  fox(x) {
    poly(x, [6, 4, 13, 12, 7, 15], '#a8541e'); // ears
    poly(x, [26, 4, 19, 12, 25, 15], '#a8541e');
    poly(x, [7.5, 7, 11, 11.5, 8, 12.5], '#2a1a12', 0.6);
    poly(x, [24.5, 7, 21, 11.5, 24, 12.5], '#2a1a12', 0.6);
    x.beginPath();
    x.moveTo(5, 13);
    x.quadraticCurveTo(16, 6, 27, 13);
    x.quadraticCurveTo(26, 22, 16, 29);
    x.quadraticCurveTo(6, 22, 5, 13);
    path(x, '#b85e22');
    x.beginPath();
    x.moveTo(6, 17);
    x.quadraticCurveTo(12, 19, 16, 29);
    x.quadraticCurveTo(20, 19, 26, 17);
    x.quadraticCurveTo(22, 26, 16, 29);
    x.quadraticCurveTo(10, 26, 6, 17);
    path(x, '#e6dcc8', 0.9); // white cheeks
    eye(x, 11.5, 15, 1.9);
    eye(x, 20.5, 15, 1.9);
    ell(x, 16, 26.5, 2, 1.5, '#1a1210', 0, 0.6);
    sheen(x, 16, 14, 10);
  },
  owl(x) {
    poly(x, [8, 3, 11, 10, 6, 10], '#3e3022'); // ear tufts
    poly(x, [24, 3, 21, 10, 26, 10], '#3e3022');
    ell(x, 16, 18, 11, 12, '#7a6448');
    ell(x, 16, 23, 6.5, 6, '#c8b48c', 0, 0.8);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#7a6448'; x.fillRect(12, 20.5 + i * 2.6, 8, 0.9); }
    ell(x, 11, 13.5, 4.4, 4.4, '#c8b48c', 0, 0.9);
    ell(x, 21, 13.5, 4.4, 4.4, '#c8b48c', 0, 0.9);
    eye(x, 11, 13.5, 2.8, '#e0a020');
    eye(x, 21, 13.5, 2.8, '#e0a020');
    ell(x, 11, 13.5, 1.2, 1.2, '#1a1410', 0, 0.3);
    ell(x, 21, 13.5, 1.2, 1.2, '#1a1410', 0, 0.3);
    poly(x, [14.5, 16, 17.5, 16, 16, 19.5], '#3a3020', 0.8);
    sheen(x, 16, 16, 11);
  },
  beaver(x) {
    ell(x, 24, 25, 6, 3, '#2e2a28', -0.3); // flat tail
    x.strokeStyle = '#1a1816';
    x.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(20 + i * 2.5, 23); x.lineTo(21 + i * 2.5, 27); x.stroke(); }
    ell(x, 14, 17, 10, 10, '#6a4428');
    ell(x, 6.5, 9, 2.6, 2.6, '#3a2416');
    ell(x, 21.5, 9, 2.6, 2.6, '#3a2416');
    ell(x, 14, 20.5, 5.8, 4.4, '#8a6040', 0, 0.9);
    ell(x, 14, 18, 2, 1.4, '#1a1210', 0, 0.6);
    x.fillStyle = OUT;
    x.fillRect(11.8, 21.6, 4.4, 4.6);
    x.fillStyle = '#e08a2a';
    x.fillRect(12.4, 22, 1.5, 3.8);
    x.fillRect(14.1, 22, 1.5, 3.8);
    eye(x, 9.8, 13.5, 1.8);
    eye(x, 18.2, 13.5, 1.8);
    sheen(x, 14, 15, 10);
  },
  mole(x) {
    ell(x, 15, 18, 12, 9, '#3a3640');
    for (const s of [-1, 1]) {
      ell(x, 16 + s * 10, 25, 4, 2.6, '#d08a8a', s * 0.3);
      for (let i = 0; i < 3; i++) poly(x, [16 + s * (11 + i * 1.3), 26.5, 16 + s * (12 + i * 1.3), 26.5, 16 + s * (11.6 + i * 1.3), 29.5], '#e8d8c0', 0.5);
    }
    ell(x, 25, 16, 4, 3.2, '#5a4a50');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ell(x, 28.5 + Math.cos(a) * 1.7, 16 + Math.sin(a) * 1.7, 1, 1, '#d08a8a', 0, 0.4); }
    ell(x, 28.5, 16, 1, 1, '#e0a0a0', 0, 0.3);
    eye(x, 21.5, 13, 1);
    sheen(x, 15, 15, 11);
  },
  otter(x) {
    x.beginPath();
    x.moveTo(26, 28);
    x.quadraticCurveTo(30, 18, 22, 14);
    x.lineTo(19, 18);
    x.quadraticCurveTo(25, 21, 23, 28);
    x.closePath();
    path(x, '#3a2414'); // tail curl
    ell(x, 15, 21, 8, 7.5, '#5a3a22');
    ell(x, 14, 22.5, 4.5, 5, '#b09878', 0, 0.8);
    ell(x, 14, 11, 7.5, 6.5, '#5a3a22');
    ell(x, 14, 13.5, 5, 3.5, '#b09878', 0, 0.8);
    ell(x, 7.5, 7, 1.6, 1.6, '#5a3a22', 0, 0.8);
    ell(x, 20.5, 7, 1.6, 1.6, '#5a3a22', 0, 0.8);
    ell(x, 14, 12.2, 1.6, 1.1, '#1a1210', 0, 0.5);
    eye(x, 10.6, 9.6, 1.5);
    eye(x, 17.4, 9.6, 1.5);
    x.strokeStyle = '#efe6d6';
    x.lineWidth = 0.5;
    for (const s of [-1, 1]) for (const dy of [-0.6, 0.8]) { x.beginPath(); x.moveTo(14 + s * 3, 14 + dy); x.lineTo(14 + s * 8, 13 + dy * 2); x.stroke(); }
    sheen(x, 14, 13, 10);
  },
  whelp(x) {
    poly(x, [3, 20, 10, 9, 12, 21], '#5a1e12'); // wing behind
    poly(x, [29, 20, 22, 9, 20, 21], '#5a1e12');
    ell(x, 16, 23, 8, 6.5, '#7a2a18');
    ell(x, 16, 24.5, 4.5, 4, '#c89050', 0, 0.8);
    ell(x, 16, 24.5, 1.6, 1.6, '#ffb040', 0, 0.4); // belly ember
    poly(x, [10, 9, 8, 2, 12.5, 7], '#d8c8a0', 0.9); // horns
    poly(x, [22, 9, 24, 2, 19.5, 7], '#d8c8a0', 0.9);
    ell(x, 16, 12, 8.5, 6.8, '#8a3020');
    ell(x, 16, 16, 4.5, 2.8, '#7a2a18', 0, 0.9); // snout
    ell(x, 14.4, 16.4, 0.7, 0.7, '#1a0a06', 0, 0.2);
    ell(x, 17.6, 16.4, 0.7, 0.7, '#1a0a06', 0, 0.2);
    eye(x, 12.3, 11, 2.2, '#ffb030');
    eye(x, 19.7, 11, 2.2, '#ffb030');
    ell(x, 12.3, 11.2, 0.6, 1.4, '#1a1410', 0, 0.2);
    ell(x, 19.7, 11.2, 0.6, 1.4, '#1a1410', 0, 0.2);
    sheen(x, 16, 14, 10);
  },
  raven(x) {
    poly(x, [4, 22, 10, 18, 8, 27], '#0c0c10'); // tail
    ell(x, 14, 19, 9, 7, '#1c1c24', -0.2);
    x.beginPath();
    x.moveTo(8, 18);
    x.quadraticCurveTo(14, 14, 21, 21);
    x.quadraticCurveTo(13, 24, 8, 18);
    path(x, '#0c0c10', 0.9); // folded wing
    ell(x, 21, 11, 6, 5.5, '#1c1c24');
    poly(x, [25, 9, 31, 12.5, 25, 14], '#2a2a2e', 1); // beak
    eye(x, 22, 10, 1.6, '#2a3040');
    x.fillStyle = '#3a3a4c';
    x.fillRect(18, 7.5, 3, 0.8);
    for (const lx of [12, 16]) { x.strokeStyle = '#4a4a4e'; x.lineWidth = 1; x.beginPath(); x.moveTo(lx, 25); x.lineTo(lx, 29); x.lineTo(lx + 2, 29.5); x.stroke(); }
    sheen(x, 16, 14, 10);
  },
};

/** Paints a pet item's icon; false when the item is not a pet. */
export function drawPetIcon(x: Ctx, itemId: string): boolean {
  const d = petForItem(itemId);
  if (!d) return false;
  x.save();
  DRAW[d.id](x);
  x.restore();
  return true;
}
