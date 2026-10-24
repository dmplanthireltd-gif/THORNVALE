/**
 * Render style choice and the painted perf merges (render/style.ts, models/rigMerge.ts skinRig,
 * paintProps.ts joinCrown). Runs headless: three.js geometry only, no WebGL.
 *   tsx scripts/style-test.ts
 */
import * as THREE from 'three';
import { DEFAULT_STYLE, pickStyle } from '../src/render/style';
import { mergeRig, skinRig } from '../src/render/models/rigMerge';
import { buildEnemy, buildNpc } from '../src/render/models/rigs';
import { buildPlayerRig } from '../src/render/models/playerModel';
import { joinCrown } from '../src/render/paintProps';
import { DEFAULT_APPEARANCE } from '../src/game/player/appearance';
import { NPCS } from '../src/game/npc/npcs';
import type { Rig } from '../src/render/models/rigs';

declare const process: { exit(code: number): never };

let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('FAIL', msg); } };

// --- the style: painted for everyone unless the URL or the Settings choice says classic
ok(DEFAULT_STYLE === 'painted', 'painted is the default look');
ok(pickStyle(null, null) === 'painted', 'no query, no setting → painted');
ok(pickStyle('classic', null) === 'classic', '?style=classic → classic');
ok(pickStyle(null, 'classic') === 'classic', "localStorage 'thornvale.style' = classic → classic");
ok(pickStyle('painted', 'classic') === 'painted', 'the URL wins over the setting');
ok(pickStyle('classic', 'painted') === 'classic', 'the URL wins over the setting (classic)');
ok(pickStyle('bogus', 'nonsense') === 'painted', 'unknown values fall back to painted');
ok(pickStyle(null, 'painted') === 'painted', 'stored painted → painted');

// --- skinRig: the whole character in fewer meshes, every vertex exactly where it was
function pose(rig: Rig, t: number): void {
  rig.root.position.set(3, 0, 5);
  rig.root.rotation.y = 0.7;
  rig.body.rotation.x = 0.2 * t;
  if (rig.type === 'biped') {
    rig.armR.rotation.x = -2.1 * t;
    rig.armL.rotation.x = 0.6 * t;
    rig.legL.rotation.x = 0.5 * t;
    rig.head.rotation.y = -0.3 * t;
    rig.torso.rotation.y = 0.1 * t;
  } else {
    rig.legs.forEach((l, i) => { l.rotation.x = (i & 1 ? -0.6 : 0.6) * t; });
    rig.head.rotation.x = 0.4 * t;
    rig.tail.rotation.y = 0.5 * t;
  }
  rig.root.updateMatrixWorld(true);
}

const _v = new THREE.Vector3();
/** World-space vertex statistics of every visible mesh (sum and count), skinned meshes through their bones. */
function stats(rig: Rig): { n: number; sx: number; sy: number; sz: number; meshes: number } {
  let n = 0, sx = 0, sy = 0, sz = 0, meshes = 0;
  rig.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || me === rig.hitbox) return;
    let vis = true;
    for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) vis = false;
    if (!vis) return;
    meshes++;
    const g = me.geometry;
    const idx = g.index;
    const cnt = idx ? idx.count : g.attributes.position.count;
    const sk = (me as THREE.SkinnedMesh).isSkinnedMesh ? (me as THREE.SkinnedMesh) : null;
    if (sk) sk.skeleton.update();
    for (let i = 0; i < cnt; i++) {
      const vi = idx ? idx.getX(i) : i;
      if (sk) sk.getVertexPosition(vi, _v);
      else _v.fromBufferAttribute(g.attributes.position as THREE.BufferAttribute, vi);
      _v.applyMatrix4(me.matrixWorld);
      n++; sx += _v.x; sy += _v.y; sz += _v.z;
    }
  });
  return { n, sx, sy, sz, meshes };
}

const cases: Array<[string, () => Rig]> = [
  ['player', () => buildPlayerRig(DEFAULT_APPEARANCE)],
  ['captain aldric', () => buildNpc(NPCS.aldric)],
  ['wolf', () => buildEnemy('wolf')],
  ['skeleton', () => buildEnemy('skeleton')],
  ['dragon', () => buildEnemy('dragon')],
];
for (const [name, make] of cases) {
  const a = make();
  mergeRig(a);
  pose(a, 1);
  const before = stats(a);
  const b = make();
  mergeRig(b);
  skinRig(b);
  pose(b, 1);
  const after = stats(b);
  ok(after.meshes < before.meshes, `${name}: fewer meshes after skinRig (${before.meshes} → ${after.meshes})`);
  ok(after.n === before.n, `${name}: same triangles (${before.n} vs ${after.n} corners)`);
  const d = Math.max(Math.abs(after.sx - before.sx), Math.abs(after.sy - before.sy), Math.abs(after.sz - before.sz)) / Math.max(1, before.n);
  ok(d < 1e-4, `${name}: every corner in the same place in a swing pose (mean drift ${d.toExponential(2)})`);
  ok(b.materials.length > 0 && b.materials.every((m) => !!m), `${name}: material list for flashes and fading`);
  b.root.traverse((o) => {
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh) ok(!!sk.boundingSphere && sk.boundingSphere.radius > 0.3, `${name}: skinned mesh has culling bounds`);
  });
  ok(typeof b.root.userData.coverR === 'number', `${name}: see-through reach measured before merging`);
}
// monsters of one kind share one skinned geometry
{
  const w1 = buildEnemy('wolf'); mergeRig(w1); skinRig(w1);
  const w2 = buildEnemy('wolf'); mergeRig(w2); skinRig(w2);
  const geos = (r: Rig) => { const s: THREE.BufferGeometry[] = []; r.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) s.push((o as THREE.Mesh).geometry); }); return s; };
  const g1 = geos(w1), g2 = geos(w2);
  ok(g1.length > 0 && g1.every((g, i) => g === g2[i] && g.userData.shared), 'wolves share their skinned geometry (and it is never disposed per wolf)');
}

// --- joinCrown: one geometry, pieces placed and brightened as the separate batches were
{
  const a = new THREE.BoxGeometry(1, 1, 1), b = new THREE.SphereGeometry(0.5, 6, 4);
  const crown = joinCrown([[a, new THREE.Matrix4().makeTranslation(0, 1, 0), 1], [b, new THREE.Matrix4().makeTranslation(0, 2, 0), 1.12]]);
  ok(crown.attributes.position.count === a.attributes.position.count + b.attributes.position.count, 'crown keeps every vertex');
  crown.computeBoundingBox();
  ok(Math.abs(crown.boundingBox!.min.y - 0.5) < 1e-6 && Math.abs(crown.boundingBox!.max.y - 2.5) < 1e-6, 'crown pieces sit where they were placed');
  const col = crown.attributes.color;
  ok(col.getX(0) === 1 && Math.abs(col.getX(col.count - 1) - 1.12) < 1e-6, 'crown pieces keep their brightness');
}

if (fails) {
  console.log(`style test: ${fails} failure(s)`);
  process.exit(1);
}
console.log('style test: all checks passed');
