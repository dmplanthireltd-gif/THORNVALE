/**
 * Shield models and the block animation (render/models/shields3d.ts, render/anim/blockAnim.ts).
 * Runs headless: three.js geometry only, no WebGL.
 *   tsx scripts/shields-test.ts
 */
import * as THREE from 'three';
import { ITEMS } from '../src/game/inventory/items';
import { gearLook } from '../src/render/models/gearLooks';
import { makeShield } from '../src/render/models/weapons';
import { SHIELD_HOLD, SHIELD_SIZE } from '../src/render/models/shields3d';
import { BLOCK_HOLD, BLOCK_LOWER, BLOCK_RAISE, BlockAnim } from '../src/render/anim/blockAnim';

declare const process: { exit(code: number): never };

let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('FAIL', msg); } };

// every shield item builds a big, readable shield with a posable hold
const shields = Object.values(ITEMS).filter((d) => d.kind === 'shield');
ok(shields.length > 10, 'shield items exist');
const styles = new Set<string>();
for (const d of shields) {
  const g = makeShield(d.id);
  ok(!!g, `${d.id} builds`);
  if (!g) continue;
  const lk = gearLook(d);
  styles.add(lk.shield);
  const hold = g.getObjectByName(SHIELD_HOLD);
  ok(!!hold, `${d.id} has a hold`);
  const box = new THREE.Box3().setFromObject(hold!.children[0]);
  const size = box.getSize(new THREE.Vector3());
  const tall = Math.max(size.x, size.y, size.z);
  const [, h] = SHIELD_SIZE[lk.shield];
  if (lk.shield !== 'book') {
    // was ~0.5 tall before; forearm (0.32) to shoulder needs >= 0.5, towers >= 1.1, bucklers readable
    const min = lk.shield === 'tower' ? 1.1 : lk.shield === 'buckler' ? 0.48 : 0.75;
    ok(tall >= min, `${d.id} (${lk.shield}) is big enough: ${tall.toFixed(2)} >= ${min}`);
    ok(tall <= h * 1.3 + 0.1, `${d.id} not oversized: ${tall.toFixed(2)}`);
    // front face (+Z) carries the boss/emblem: more geometry in front of the rim than behind
    ok(box.max.z > 0.06 && box.min.z > -0.12, `${d.id} face out, straps behind`);
  }
}
for (const s of ['round', 'kite', 'heater', 'tower', 'buckler', 'spiked']) ok(styles.has(s), `some shield uses the ${s} shape`);

// block animation timing: up in 0.25-0.35 s, then back down, guard holds higher
const b = new BlockAnim();
ok(b.weight() === 0 && !b.active, 'idle');
b.start(0);
b.tick(BLOCK_RAISE * 0.5);
ok(b.weight() > 0.5 && b.weight() < 1, 'raising');
b.tick(BLOCK_RAISE * 0.5 + 0.01);
ok(b.weight() === 1, 'up at the end of the raise');
ok(BLOCK_RAISE >= 0.25 && BLOCK_RAISE <= 0.35, 'raise time 0.25-0.35 s');
b.tick(BLOCK_HOLD + BLOCK_LOWER);
ok(!b.active && b.weight() === 0, 'lowered again');

// the pose: a rig with a shield turns the hold away from rest while blocking, and back after
const armL = new THREE.Group(), armR = new THREE.Group(), body = new THREE.Group();
const shieldMount = new THREE.Group();
armL.add(shieldMount);
shieldMount.add(makeShield('iron_shield')!);
const rig = { type: 'biped', armL, armR, body, gear: { shieldMount, weaponMount: new THREE.Group() } } as never;
const hold = shieldMount.getObjectByName(SHIELD_HOLD)!;
const rest = hold.quaternion.clone();
const anim = new BlockAnim();
anim.apply(rig, 0, null, false);
ok(hold.quaternion.angleTo(rest) < 1e-6, 'rest pose untouched');
anim.start(Math.PI / 4);
anim.tick(BLOCK_RAISE);
anim.apply(rig, 0, null, false);
ok(hold.quaternion.angleTo(rest) > 0.5, 'shield turns up to block');
ok(armL.rotation.x < -1, 'shield arm comes forward');
ok(Math.abs(body.rotation.y) > 0.1, 'body turns toward the attacker');
anim.tick(5);
anim.apply(rig, 0, null, false);
ok(hold.quaternion.angleTo(rest) < 1e-6 && body.rotation.y === 0 && armL.rotation.z === 0, 'back to rest');
anim.guard = 1;
for (let i = 0; i < 60; i++) anim.tick(1 / 30);
anim.apply(rig, 0, null, false);
ok(hold.quaternion.angleTo(rest) > 0.2, 'Defensive guard holds the shield higher');

// no shield: the weapon arm parries
const armR2 = new THREE.Group();
const rig2 = { type: 'biped', armL: new THREE.Group(), armR: armR2, body: new THREE.Group(), gear: { shieldMount: new THREE.Group(), weaponMount: new THREE.Group() } } as never;
const p = new BlockAnim();
p.start(null);
p.tick(BLOCK_RAISE);
p.apply(rig2, 0, null, false);
ok(armR2.rotation.x < -1.5, 'weapon parry without a shield');

console.log(fails ? `shields-test: ${fails} FAILED` : `shields-test: all OK (${shields.length} shields)`);
process.exit(fails ? 1 : 0);
