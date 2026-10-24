import { CAPES } from '../inventory/capes';
import { NONCOMBAT_IDS } from '../gathering/skills';
import { fishFor } from '../gathering/fishing';
import { oreAt } from '../gathering/mining';
import { treeAt } from '../gathering/woodcutting';
import { NPCS } from '../npc/npcs';
import { SLAYER_MASTERS } from '../trades/slayer';
import type { MapSpot, TradeLayout } from '../trades/layout';
import { Ground, Obj, type WorldMap } from './WorldMap';

/**
 * Training spots of the skills that were there before the trade skills (mines, forests, fishing
 * waters, smithies, stoves, tanning racks) and of every skill master, for the minimap and the
 * world map (MapSpot, TradeLayout.spots). Read from the finished world, so nothing moves.
 * No DOM, no three.js.
 */

const TREE_SPOT: Partial<Record<Obj, string>> = { [Obj.Tree]: 'Woodland', [Obj.Pine]: 'Pine forest', [Obj.Palm]: 'Palm grove', [Obj.JungleTree]: 'Teak forest' };
const STATION_SPOT: Partial<Record<Obj, [skill: string, what: string]>> = {
  [Obj.Furnace]: ['smithing', 'Smithy'], [Obj.Anvil]: ['smithing', 'Smithy'], [Obj.Stove]: ['cooking', 'Stove'], [Obj.TanningRack]: ['crafting', 'Tanning rack'],
};

interface Group { skill: string; what: string; place: string; z: number; xs: number; ys: number; n: number; lo: number; hi: number; best: { x: number; y: number; d: number } | null; pts: Array<[number, number]> }

const range = (lo: number, hi: number) => (lo === hi ? String(lo) : `${lo}–${hi}`);

/** The tile of a group nearest its middle (so the icon sits on a real rock, tree or stove). */
function middle(g: Group): { x: number; y: number } {
  const cx = g.xs / g.n, cy = g.ys / g.n;
  let best = g.pts[0], bd = Infinity;
  for (const [x, y] of g.pts) {
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return { x: best[0], y: best[1] };
}

export function addSkillSpots(m: WorldMap, l: TradeLayout): void {
  const groups = new Map<string, Group>();
  const add = (skill: string, what: string, place: string, x: number, y: number, z: number, level: number) => {
    const k = `${skill}|${what}|${place}|${z}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { skill, what, place, z, xs: 0, ys: 0, n: 0, lo: level, hi: level, best: null, pts: [] }));
    g.xs += x; g.ys += y; g.n++;
    g.lo = Math.min(g.lo, level); g.hi = Math.max(g.hi, level);
    if (g.pts.length < 400) g.pts.push([x, y]);
  };
  for (const [z, f] of m.floors) {
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const o = f.obj[y * m.width + x] as Obj;
      if (o === Obj.None) continue;
      const ore = oreAt(o);
      const tree = ore ? null : treeAt(o);
      const st = ore || tree ? null : STATION_SPOT[o];
      if (!ore && !tree && !st) continue;
      const r = m.regionAt(x, y, z);
      if (!r) continue;
      if (ore) add('mining', 'Mine', r.name, x, y, z, ore.level);
      else if (tree && z === 0) add('woodcutting', TREE_SPOT[o] ?? 'Woodland', r.name, x, y, z, tree.level);
      else if (st) add(st[0], st[1], r.name, x, y, z, 1);
    }
  }
  const out: MapSpot[] = [];
  for (const g of groups.values()) {
    // a few rocks or trees are not a training spot; every smithy, stove and rack is
    const min = g.skill === 'mining' ? 4 : g.skill === 'woodcutting' ? (g.what === 'Woodland' ? 60 : 30) : 1;
    if (g.n < min) continue;
    const at = middle(g);
    out.push({ skill: g.skill, x: at.x, y: at.y, z: g.z, what: g.what, place: g.place, level: g.skill === 'smithing' || g.skill === 'cooking' || g.skill === 'crafting' ? undefined : range(g.lo, g.hi) });
  }
  // fishing: every harbour and landing pier, and every lake or river region with plenty of open water
  const fishLevels = (x: number, y: number): string | undefined => {
    const list = fishFor(m, x, y, 0, 99);
    return list.length ? range(Math.min(...list.map((f) => f.level)), Math.max(...list.map((f) => f.level))) : undefined;
  };
  const harbourNames = new Set(l.moorings.map((mo) => mo.name));
  for (const name of harbourNames) {
    const mo = l.moorings.find((x) => x.name === name)!;
    out.push({ skill: 'fishing', x: mo.dockX, y: mo.dockY, z: 0, what: 'Fishing', place: name, level: fishLevels(mo.x, mo.y) });
  }
  const water = new Map<string, Group>();
  const f0 = m.floors.get(0)!;
  for (let y = 0; y < m.height; y += 2) for (let x = 0; x < m.width; x += 2) {
    if (f0.ground[y * m.width + x] !== Ground.Water || f0.obj[y * m.width + x] !== Obj.None) continue;
    const r = m.regionAt(x, y, 0);
    if (!r || harbourNames.has(r.name) || r.safe) continue;
    let g = water.get(r.name);
    if (!g) water.set(r.name, (g = { skill: 'fishing', what: 'Fishing', place: r.name, z: 0, xs: 0, ys: 0, n: 0, lo: 0, hi: 0, best: null, pts: [] }));
    g.xs += x; g.ys += y; g.n++;
    if (g.pts.length < 400) g.pts.push([x, y]);
  }
  for (const g of [...water.values()].filter((g) => g.n >= 20).sort((a, b) => b.n - a.n).slice(0, 30)) {
    const at = middle(g);
    out.push({ skill: 'fishing', x: at.x, y: at.y, z: 0, what: 'Fishing', place: g.place, level: fishLevels(at.x, at.y) });
  }
  // the masters: whoever sells a trade skill's cape (and the four slayer masters)
  const masters = new Map<string, string[]>();
  for (const c of CAPES) {
    if (c.kind !== 'skill' || !c.skill || !c.seller || !(NONCOMBAT_IDS as string[]).includes(c.skill)) continue;
    const list = masters.get(c.seller) ?? [];
    if (!list.includes(c.skill)) list.push(c.skill);
    masters.set(c.seller, list);
  }
  for (const sm of SLAYER_MASTERS) if (!masters.get(sm.npc)?.includes('slayer')) masters.set(sm.npc, [...(masters.get(sm.npc) ?? []), 'slayer']);
  for (const [key, skills] of masters) {
    const sp = m.npcs.find((n) => n.key === key);
    const def = NPCS[key];
    if (!sp || !def) continue;
    skills.forEach((skill, i) => out.push({ skill, x: sp.x + i, y: sp.y, z: sp.z, what: def.name, place: def.role }));
  }
  l.spots.push(...out);
}
