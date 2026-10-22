import type { ItemDef } from '../game/inventory/items';
import { capeCss, capeLook, hemPoints, paintCapeFace } from '../render/models/capeLooks';

/**
 * Cape icons (item kind 'cape'), drawn in the 32×32 icon space like every other
 * equipment icon (gearIcons.ts calls this): a cape seen from behind, hanging
 * from a shoulder mantle with a clasp, painted with the same cloth, pattern,
 * trim and emblem as the 3D cape (render/models/capeLooks.ts).
 */
type Ctx = CanvasRenderingContext2D;
const OUT = '#0d0906';

export function drawCape(x: Ctx, d: ItemDef): void {
  const lk = capeLook(d.id);
  const top = 7, w = 22, h = 23, left = 5;
  // soft shadow
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.beginPath(); x.ellipse(16, 30.5, 11, 1.4, 0, 0, Math.PI * 2); x.fill();
  // the cape, a little wider at the hem: paint it into a box, then skew it outwards
  x.save();
  x.translate(left, top);
  paintCapeFace(x, lk, w, h, true);
  x.restore();
  // outline of the silhouette
  const hem = hemPoints(lk.hem, w, h);
  x.save();
  x.translate(left, top);
  x.beginPath();
  x.moveTo(0, 0); x.lineTo(w, 0);
  for (let i = 0; i < hem.length; i += 2) x.lineTo(hem[i], hem[i + 1]);
  x.closePath();
  x.strokeStyle = OUT; x.lineWidth = 1.1; x.lineJoin = 'round';
  x.stroke();
  x.restore();
  // shoulder mantle over the top of the cape
  x.beginPath();
  x.moveTo(6, 9.5); x.quadraticCurveTo(7, 4.5, 12, 3.6); x.lineTo(20, 3.6); x.quadraticCurveTo(25, 4.5, 26, 9.5);
  x.quadraticCurveTo(16, 11.5, 6, 9.5);
  x.closePath();
  const g = x.createLinearGradient(0, 3, 0, 11);
  g.addColorStop(0, capeCss(lk.main)); g.addColorStop(1, capeCss(lk.dark));
  x.fillStyle = g; x.fill();
  x.strokeStyle = OUT; x.lineWidth = 1; x.stroke();
  // collar
  if (lk.collar !== 'plain') {
    x.beginPath(); x.ellipse(16, 4.4, 5.6, 1.9, 0, 0, Math.PI * 2);
    x.fillStyle = lk.collar === 'fur' ? '#e8dcc4' : '#e8b232'; x.fill();
    x.strokeStyle = OUT; x.lineWidth = 0.8; x.stroke();
    if (lk.collar === 'fur') { x.fillStyle = 'rgba(120,100,70,0.6)'; for (let i = 0; i < 6; i++) x.fillRect(11.5 + i * 1.6, 4 + (i % 2) * 0.6, 0.7, 0.7); }
  }
  // mantle trim and the clasp
  x.strokeStyle = capeCss(lk.trim); x.lineWidth = 1;
  x.beginPath(); x.moveTo(6.6, 9.3); x.quadraticCurveTo(16, 11.2, 25.4, 9.3); x.stroke();
  x.beginPath(); x.arc(16, 7, 1.7, 0, Math.PI * 2);
  x.fillStyle = capeCss(lk.trim); x.fill();
  x.strokeStyle = OUT; x.lineWidth = 0.7; x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(15.2, 6.1, 0.8, 0.8);
}
