import * as THREE from 'three';
import { Cell } from './builtAtlas';

/**
 * Painted style: gives a vertex-coloured merged model (the spawn plaza, the depot
 * halls) painted surface wear from the built atlas's neutral detail cells — wood
 * grain, chipped and mossy stone, scratched and rusty iron, worn cloth, leafy
 * mottling, rubbed gilt — chosen per triangle from its colour. Adds `uv` (world
 * box projection) and `aCell`; colours and draw calls stay as they were.
 */
const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

export function guessCell(r: number, g: number, b: number): Cell {
  _c.setRGB(r, g, b).getHSL(_hsl);
  const { h, s, l } = _hsl;
  if (s < 0.14) return l < 0.1 ? Cell.DMetal : Cell.DStone;
  if (h > 0.1 && h < 0.17 && s > 0.55 && l > 0.35) return Cell.DGold;
  if (h >= 0.02 && h <= 0.13 && l < 0.4) return Cell.DWood;
  if (h > 0.17 && h < 0.45) return Cell.DPlant;
  if (h >= 0.02 && h <= 0.16) return Cell.DStone;
  return Cell.DCloth;
}

export function paintDetail(geo: THREE.BufferGeometry, scale = 1.4): THREE.BufferGeometry {
  const P = geo.attributes.position.array as ArrayLike<number>;
  const C = geo.attributes.color?.array as ArrayLike<number> | undefined;
  const n = geo.attributes.position.count;
  const uv = new Float32Array(n * 2);
  const cell = new Float32Array(n);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const idx = geo.index;
  const tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.set(P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]);
    b.set(P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]).sub(a);
    d.set(P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]).sub(a);
    b.cross(d);
    const ax = Math.abs(b.x), ay = Math.abs(b.y), az = Math.abs(b.z);
    const k = C ? guessCell(C[i0 * 3], C[i0 * 3 + 1], C[i0 * 3 + 2]) : Cell.DStone;
    for (const i of [i0, i1, i2]) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = x; v = -z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
      cell[i] = k;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aCell', new THREE.BufferAttribute(cell, 1));
  return geo;
}
