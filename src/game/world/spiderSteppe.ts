import { Rng } from '../core/rng';
import { Gen } from './genKit';
import { fbm } from './terrain';
import { Ground, Obj, type EnemyKind } from './WorldMap';

/**
 * The Gravewind Steppe: the wide, dead plain on the north of the Briarwatch
 * isle (it swallowed the old Charwood). Dread weavers nest in web-choked
 * hollows between ruins, burnt camps and bone fields; ghouls, skeletons,
 * orcs and cyclopes roam between them, and in the far north-east the rare
 * Gravesilk Colossus broods over its Silk Throne. A road runs north to it
 * from Briarwatch's north gate.
 *
 * Built after every town and area with its own random numbers, so the rest
 * of the world comes out exactly as before.
 */
export const STEPPE = { x0: 528, y0: 14, x1: 614, y1: 108 };
/** The Silk Throne: the colossus's nest. */
export const SILK_THRONE = { x: 597, y: 33 };

type Pt = { x: number; y: number };

export function buildSpiderSteppe(main: Gen, seed: number): void {
  const g = new Gen(main.m, new Rng(seed ^ 0x51c4a7e), main.biome, main.land);
  const { m, b, rng } = g;
  const { x0, y0, x1, y1 } = STEPPE;
  const land = (x: number, y: number) => {
    const gr = m.getGround(x, y, 0);
    return gr !== Ground.Water && gr !== Ground.DeepWater && gr !== Ground.Void && gr !== Ground.Lava;
  };

  // 1. a dead plain: dry earth and scorched grass, the woods cut down to a few dead trunks
  b.rect(x0, y0, x1, y1, (x, y) => {
    const gr = m.getGround(x, y, 0);
    if (gr !== Ground.Grass && gr !== Ground.DarkGrass && gr !== Ground.Dirt) return;
    // patchy: dry earth with tufts of dead grass and scorched spots, broken up tile by tile
    const n = fbm(x, y, 7101, 9) + (rng.next() - 0.5) * 0.22;
    m.setGround(x, y, n > 0.63 ? Ground.Ash : n < 0.3 && rng.chance(0.5) ? Ground.DarkGrass : rng.chance(0.06) ? Ground.DarkGrass : Ground.Dirt, 0);
    const o = m.getObj(x, y, 0);
    if (o === Obj.Tree || o === Obj.Pine || o === Obj.Bush || o === Obj.JungleTree) m.setObj(x, y, rng.chance(0.14) ? Obj.DeadTree : Obj.None, 0);
    else if (o === Obj.Flowers || o === Obj.Fern) m.setObj(x, y, Obj.None, 0);
  });

  // 2. the road from Briarwatch's north gate up to the middle of the steppe
  const gate = northGate(g);
  const hub = { x: 574, y: 70 };
  if (gate) g.route(gate.x, gate.y, hub.x, hub.y);
  g.route(hub.x, hub.y, 556, 42);

  const clearOf = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!land(x + dx, y + dy)) return false;
      if (m.getGround(x + dx, y + dy, 0) === Ground.Path) return false;
    }
    return true;
  };
  /** Nearest spot (spiral) around p whose surroundings are dry land away from the road. */
  const settle = (p: Pt, r: number): Pt => g.nearest(p.x, p.y, (x, y) => clearOf(x, y, r), 14) ?? p;

  // 3. ruins: broken walls and pillars of some older keep
  const ruins: Pt[] = [{ x: 582, y: 80 }, { x: 552, y: 64 }, { x: 606, y: 54 }].map((p) => settle(p, 5));
  for (const r of ruins) ruin(g, r.x, r.y);

  // 4. a burnt-out camp (ghouls) and an orc war camp watching the river
  const burnt = settle({ x: 541, y: 30 }, 4);
  burntCamp(g, burnt.x, burnt.y);
  const orcs = settle({ x: 592, y: 97 }, 5);
  warCamp(g, orcs.x, orcs.y);

  // 5. dread weaver nests and the Silk Throne
  const nests: Pt[] = [{ x: 560, y: 90 }, { x: 601, y: 80 }, { x: 576, y: 52 }, { x: 547, y: 47 }, { x: 586, y: 66 }].map((p) => settle(p, 3));
  for (const n of nests) nest(g, n.x, n.y, 5 + rng.int(0, 2));
  const throne = settle(SILK_THRONE, 3);
  nest(g, throne.x, throne.y, 8);
  m.setObj(throne.x, throne.y - 4, Obj.Altar, 0);

  // 6. bones, rocks, dead trees and webs everywhere
  b.rect(x0, y0, x1, y1, (x, y) => {
    if (m.getObj(x, y, 0) !== Obj.None || !land(x, y) || m.getGround(x, y, 0) === Ground.Path) return;
    const r = rng.next();
    if (r < 0.02) m.setObj(x, y, Obj.Bones, 0);
    else if (r < 0.034) m.setObj(x, y, Obj.Rock, 0);
    else if (r < 0.046) m.setObj(x, y, Obj.DeadTree, 0);
    else if (r < 0.058) m.setObj(x, y, Obj.Cobweb, 0);
    else if (r < 0.06) m.setObj(x, y, Obj.Grave, 0);
  });

  // 7. who lives here
  const near = (p: Pt, r: number): [number, number, number, number] => [p.x - r, p.y - r, p.x + r, p.y + r];
  const put = (kind: EnemyKind, n: number, box: [number, number, number, number]) => g.spawn(kind, n, box[0], box[1], box[2], box[3], 0);
  for (const n of nests) put('dread_weaver', 3, near(n, 5));
  put('dread_weaver', 2, near(throne, 7));
  put('dread_weaver', 2, [x0 + 4, y0 + 4, x1 - 4, y1 - 20]);
  g.b.spawn('gravesilk_colossus', throne.x, throne.y, 0);
  for (const r of ruins) put('cyclops', 2, near(r, 6));
  put('ghoul', 3, near(burnt, 6));
  put('skeleton', 2, near(burnt, 7));
  put('orc_warrior', 3, near(orcs, 6));
  put('orc_berserker', 3, near(orcs, 6));
  put('orc_shaman', 1, near(orcs, 4));

  // 8. the region (it replaces the Charwood, which the steppe swallowed)
  const old = m.regions.findIndex((r) => r.name === 'Charwood');
  if (old >= 0) m.regions.splice(old, 1);
  b.region({ name: 'Gravewind Steppe', x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1, level: '60+' });
  b.region({ name: 'The Silk Throne', x0: throne.x - 9, y0: throne.y - 9, x1: throne.x + 9, y1: throne.y + 9, level: '100+' });
}

/** The walkable tile just outside Briarwatch's north wall where the road leaves the town. */
function northGate(g: Gen): Pt | null {
  const { m } = g;
  // the town wall runs along y = 140 (townSites: Briarwatch at 552,140, 44 × 28); find its north gap
  for (let x = 566; x <= 584; x++) {
    if (m.isWalkable(x, 140, 0) && m.isWalkable(x, 139, 0)) return { x, y: 138 };
  }
  return g.nearest(574, 136, (x, y) => m.isWalkable(x, y, 0) && y < 140, 8);
}

/** Broken walls of an old keep: three sides standing in parts, pillars, rubble and an altar. */
function ruin(g: Gen, cx: number, cy: number): void {
  const { m, rng, b } = g;
  const w = 5, h = 4;
  b.rect(cx - w, cy - h, cx + w, cy + h, (x, y) => {
    if (m.getGround(x, y, 0) === Ground.Path) return;
    m.setGround(x, y, rng.chance(0.6) ? Ground.Stone : Ground.Dirt, 0);
    m.setObj(x, y, Obj.None, 0);
    const edge = x === cx - w || x === cx + w || y === cy - h || y === cy + h;
    if (edge && y !== cy + h && rng.chance(0.55)) m.setObj(x, y, Obj.StoneWall, 0);
    else if (!edge && rng.chance(0.05)) m.setObj(x, y, Obj.Bones, 0);
  });
  for (const [px, py] of [[cx - 2, cy - 1], [cx + 2, cy - 1], [cx - 2, cy + 2], [cx + 2, cy + 2]]) if (rng.chance(0.75)) m.setObj(px, py, Obj.Pillar, 0);
  m.setObj(cx, cy - h + 1, Obj.Altar, 0);
}

/** A camp burnt to the ground: a cold fire ring, broken crates and the bones of whoever camped here. */
function burntCamp(g: Gen, cx: number, cy: number): void {
  const { m, rng } = g;
  g.disc(cx, cy, 4.5, (x, y) => {
    if (m.getGround(x, y, 0) === Ground.Path) return;
    m.setGround(x, y, rng.chance(0.5) ? Ground.Ash : Ground.Dirt, 0);
    m.setObj(x, y, rng.chance(0.08) ? Obj.Bones : Obj.None, 0);
  });
  m.setObj(cx, cy, Obj.Campfire, 0);
  for (const [dx, dy, o] of [[-3, -2, Obj.Crate], [3, -1, Obj.Barrel], [-2, 3, Obj.Crate], [2, 3, Obj.Cobweb], [-3, 1, Obj.Bones]] as const) m.setObj(cx + dx, cy + dy, o, 0);
}

/** An orc war camp: a palisade ring with two gaps, a fire and supplies. */
function warCamp(g: Gen, cx: number, cy: number): void {
  const { m, rng } = g;
  g.disc(cx, cy, 6.5, (x, y, d) => {
    if (m.getGround(x, y, 0) === Ground.Path) return;
    m.setGround(x, y, rng.chance(0.25) ? Ground.DarkGrass : Ground.Dirt, 0);
    const gap = Math.abs(y - cy) <= 1 || Math.abs(x - cx) <= 1;
    m.setObj(x, y, d > 5.5 && !gap ? Obj.Palisade : Obj.None, 0);
  });
  m.setObj(cx, cy, Obj.Campfire, 0);
  for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, 2]]) m.setObj(cx + dx, cy + dy, rng.pick([Obj.Barrel, Obj.Crate]), 0);
}

/** A web-choked hollow: webs on most tiles, egg sacs, bones of the prey. */
function nest(g: Gen, cx: number, cy: number, r: number): void {
  const { m, rng } = g;
  g.disc(cx, cy, r, (x, y, d) => {
    const gr = m.getGround(x, y, 0);
    if (gr === Ground.Path || gr === Ground.Water || gr === Ground.DeepWater || gr === Ground.Lava) return;
    m.setGround(x, y, d < r * 0.6 ? Ground.Ash : rng.chance(0.5) ? Ground.Dirt : Ground.Ash, 0);
    const o = m.getObj(x, y, 0);
    if (o !== Obj.None && o !== Obj.Rock && o !== Obj.DeadTree && o !== Obj.Bones) return;
    const k = rng.next();
    const dense = 1 - d / r;
    if (k < 0.12 + dense * 0.25) m.setObj(x, y, Obj.Cobweb, 0);
    else if (k < 0.18 + dense * 0.3) m.setObj(x, y, d < r * 0.55 ? Obj.EggSacs : Obj.Bones, 0);
    else if (o === Obj.Rock && rng.chance(0.5)) m.setObj(x, y, Obj.None, 0);
  });
}
