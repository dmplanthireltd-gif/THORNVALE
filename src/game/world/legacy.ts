import { Rng } from '../core/rng';
import { Builder } from './build';
import { Ground, Obj, WorldMap, FLOOR_MAX, FLOOR_MIN } from './WorldMap';

/**
 * Hand-made areas from the first version of the world, built on a scratch map
 * and stamped into the big world: Grimtusk Fortress, Cinderreach with the
 * Caldera, and the Ruins of Varkh with the Descent to the Demon Pit.
 */
const SW = 224, SH = 176;

/** Copies a box (all floors) from a scratch map into the world, shifted by (dx,dy). */
export function stamp(dst: WorldMap, src: WorldMap, x0: number, y0: number, x1: number, y1: number, dx: number, dy: number, opts: { z0Only?: boolean; underground?: [number, number, number, number] } = {}): void {
  const inBox = (x: number, y: number, z: number) => {
    if (z < 0 && opts.underground) {
      const [ux0, uy0, ux1, uy1] = opts.underground;
      return x >= ux0 && y >= uy0 && x <= ux1 && y <= uy1;
    }
    return x >= x0 && y >= y0 && x <= x1 && y <= y1;
  };
  for (let z = FLOOR_MIN; z <= FLOOR_MAX; z++) {
    const f = src.floors.get(z);
    if (!f) continue;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      if (!inBox(x, y, z)) continue;
      const i = y * src.width + x;
      const g = f.ground[i];
      if (z !== 0 && g === Ground.Void) continue;
      dst.setGround(x + dx, y + dy, g, z);
      dst.setObj(x + dx, y + dy, f.obj[i], z);
    }
  }
  for (const [k, l] of src.links) {
    const [x, y, z] = k.split(',').map(Number);
    if (!inBox(x, y, z)) continue;
    dst.addLink(x + dx, y + dy, z, l.kind, { x: l.to.x + dx, y: l.to.y + dy, z: l.to.z });
  }
  for (const s of src.spawns) if (inBox(s.x, s.y, s.z)) dst.spawns.push({ ...s, x: s.x + dx, y: s.y + dy });
  for (const n of src.npcs) if (inBox(n.x, n.y, n.z)) dst.npcs.push({ ...n, x: n.x + dx, y: n.y + dy });
  for (const c of src.chests) if (inBox(c.x, c.y, c.z)) dst.chests.push({ ...c, x: c.x + dx, y: c.y + dy, items: c.items.map((i) => ({ ...i })) });
  for (const h of src.houses) if (inBox(h.x, h.y, h.z)) dst.houses.push({ ...h, id: dst.houses.length, x: h.x + dx, y: h.y + dy });
}

function scratch(seed: number): Builder {
  const m = new WorldMap(SW, SH);
  return new Builder(m, new Rng(seed));
}

// ================================================================== Grimtusk Fortress (box 7..57 × 5..43)

export function legacyGrimtusk(): WorldMap {
  const b = scratch(101);
  const m = b.m;
  const x0 = 8, y0 = 6, x1 = 56, y1 = 42;
  b.clear(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  b.rect(x0, y0, x1, y1, (x, y) => b.g(x, y, b.rng.chance(0.65) ? Ground.Dirt : Ground.DarkGrass));
  b.outline(x0, y0, x1, y1, Obj.StoneWall);
  for (const x of [32, 33]) { b.o(x, y1, Obj.None); b.g(x, y1, Ground.Path); }
  for (const y of [22, 23]) { b.o(x1, y, Obj.None); b.g(x1, y, Ground.Path); }

  // corner towers: 5×5 stone, ladder to an open platform with railings
  const towers: Array<[number, number, [number, number]]> = [[x0 + 1, y0 + 1, [x0 + 3, y0 + 5]], [x1 - 5, y0 + 1, [x1 - 3, y0 + 5]], [x0 + 1, y1 - 5, [x0 + 3, y1 - 5]], [x1 - 5, y1 - 5, [x1 - 3, y1 - 5]]];
  for (const [tx, ty, door] of towers) {
    b.building(tx, ty, 5, 5, { name: 'Orc Tower', stone: true, doors: [door], noRoof: true });
    b.fill(tx, ty, tx + 4, ty + 4, Ground.Stone, 1);
    b.outline(tx, ty, tx + 4, ty + 4, Obj.Railing, 1);
    b.ladder(tx + 2, ty + 2, 0, [0, 1]);
    b.spawn('orc_spearman', tx + 1, ty + 1, 1);
  }

  // the keep: two floors above ground and chambers below
  const kx = 22, ky = 14, kw = 21, kh = 17;
  b.building(kx, ky, kw, kh, { name: 'Grimtusk Keep', stone: true, doors: [[kx + 10, ky + kh - 1]], floor: Ground.Stone, noRoof: true });
  for (const [px, py] of [[kx + 5, ky + 5], [kx + 15, ky + 5], [kx + 5, ky + 11], [kx + 15, ky + 11]]) b.o(px, py, Obj.Pillar);
  for (const [px, py] of [[kx + 1, ky + 2], [kx + kw - 2, ky + 2]]) b.o(px, py, Obj.Torch);
  b.building(kx, ky, kw, kh, { z: 1, name: 'Keep Upper Hall', stone: true, floor: Ground.Stone, roof: 0x5a4a3a });
  b.stairs({ x: kx + 2, y: ky + 2, z: 0 }, { x: kx + 2, y: ky + 2, z: 1 }, [1, 1], [1, 1]);
  b.o(kx + kw - 3, ky + 2, Obj.Table, 1);
  b.chest('grimtusk_hall', kx + kw - 2, ky + 1, 1, [{ id: 'orc_warhelm', qty: 1 }, { id: 'gold', qty: 300 }]);
  b.spawn('orc_leader', kx + 8, ky + 6, 1);
  b.spawn('orc_leader', kx + 14, ky + 10, 1);
  b.spawn('orc_shaman', kx + 5, ky + 12, 1);
  const sx = kx + kw - 3, sy = ky + kh - 3;
  const rooms = b.dungeon(12, 9, 52, 40, -1, 7, Ground.Stone);
  b.stairs({ x: sx, y: sy, z: -1 }, { x: sx, y: sy, z: 0 }, [-1, 0], [-1, 0]);
  b.tunnel(sx - 1, sy, rooms[0].x, rooms[0].y, -1, Ground.Stone);
  const last = rooms[rooms.length - 1];
  b.spawn('orc_warlord', last.x, last.y, -1);
  b.chest('grimtusk_treasury', last.x + 2, last.y - 1, -1, [{ id: 'double_axe', qty: 1 }, { id: 'tower_shield', qty: 1 }, { id: 'gold', qty: 800 }]);
  for (let i = 1; i < rooms.length - 1; i++) {
    b.spawn(i % 2 ? 'orc_berserker' : 'orc_leader', rooms[i].x, rooms[i].y, -1);
    b.spawn('orc_warrior', rooms[i].x + 1, rooms[i].y + 1, -1);
  }
  b.rect(12, 9, 52, 40, (x, y) => { if (m.getGround(x, y, -1) === Ground.Stone && b.rng.chance(0.02)) b.o(x, y, Obj.Bones, -1); });

  for (const [hx, hy, door] of [[11, 26, [13, 26]], [47, 26, [49, 26]], [17, 33, [19, 33]]] as Array<[number, number, [number, number]]>) {
    b.building(hx, hy, 6, 5, { name: 'Orc Barracks', roof: 0x8a6a3e, wallColor: 0x6e4f33, doors: [door] });
  }
  for (const [x, y] of [[30, 36], [44, 10], [15, 18]]) b.o(x, y, Obj.Campfire);
  b.scatter(x0 + 1, y0 + 1, x1 - 1, y1 - 1, [[Obj.Bones, 0.01], [Obj.Barrel, 0.004], [Obj.Crate, 0.004]]);

  b.spawnMany('orc', 7, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_warrior', 5, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_spearman', 3, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_shaman', 3, x0 + 2, y0 + 7, x1 - 2, y1 - 2);
  b.spawnMany('orc_berserker', 2, kx + 1, ky + 1, kx + kw - 2, ky + kh - 2);
  return m;
}

// ================================================================== Cinderreach & the Caldera (box 170..220 × 60..93)

export function legacyCinderreach(): WorldMap {
  const b = scratch(202);
  const x0 = 170, y0 = 60, x1 = 220, y1 = 93;
  b.rect(x0, y0, x1, y1, (x, y) => {
    b.o(x, y, Obj.None);
    b.g(x, y, Ground.Ash);
    if (x <= x0 + 1 || x >= x1 || y <= y0 || y >= y1 - 1) b.o(x, y, Obj.Cliff);
  });
  for (const y of [72, 73]) for (const x of [x0, x0 + 1]) { b.o(x, y, Obj.None); b.g(x, y, Ground.Path); }
  const blob = (cx: number, cy: number, r: number, g: Ground | null, o: Obj | null) => {
    b.rect(cx - r, cy - r, cx + r, cy + r, (x, y) => {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + b.rng.next() * 2) {
        if (g !== null) b.g(x, y, g);
        if (o !== null) b.o(x, y, o);
      }
    });
  };
  blob(182, 66, 2, Ground.Lava, Obj.None);
  blob(188, 86, 3, Ground.Lava, Obj.None);
  blob(178, 84, 1, null, Obj.Cliff);
  blob(186, 76, 1, null, Obj.Cliff);
  b.scatter(x0 + 2, y0 + 1, 198, y1 - 2, [[Obj.Rock, 0.03], [Obj.Bones, 0.04], [Obj.FireField, 0.01]], 0, [Ground.Ash]);
  const cx0 = 200, cy0 = 63, cx1 = 218, cy1 = 89;
  b.rect(cx0, cy0, cx1, cy1, (x, y) => {
    b.o(x, y, x === cx0 || y === cy0 || x === cx1 || y === cy1 ? Obj.Cliff : Obj.None);
    b.g(x, y, Ground.Ash);
  });
  for (const y of [75, 76]) b.o(cx0, y, Obj.None);
  blob(210, 70, 2, Ground.Lava, Obj.None);
  blob(212, 83, 2, Ground.Lava, Obj.None);
  for (const [x, y] of [[204, 68], [214, 76], [206, 85]]) b.o(x, y, Obj.Bones);
  b.chest('caldera_hoard', 216, 65, 0, [{ id: 'dragonhide_pack', qty: 1 }, { id: 'small_ruby', qty: 4 }, { id: 'gold', qty: 2000 }]);
  b.spawnMany('dragon', 6, x0 + 3, y0 + 2, cx0 - 2, y1 - 3);
  b.spawnMany('dragon_lord', 3, cx0 + 2, cy0 + 2, cx1 - 2, cy1 - 2);
  return b.m;
}

// ================================================================== Ruins of Varkh & the Descent (surface 14..52 × 108..140, below 6..72 × 98..162)

export function legacyDescent(): WorldMap {
  const b = scratch(303);
  const m = b.m;
  const rx0 = 14, ry0 = 108, rx1 = 52, ry1 = 140;
  b.rect(rx0, ry0, rx1, ry1, (x, y) => {
    b.o(x, y, Obj.None);
    b.g(x, y, b.rng.chance(0.4) ? Ground.Dirt : b.rng.chance(0.5) ? Ground.Stone : Ground.DarkGrass);
  });
  for (const [x, y, w, h] of [[18, 112, 9, 7], [36, 114, 10, 8], [22, 127, 12, 9], [40, 128, 8, 8]]) {
    b.rect(x, y, x + w - 1, y + h - 1, (xx, yy) => {
      const border = xx === x || yy === y || xx === x + w - 1 || yy === y + h - 1;
      if (border && b.rng.chance(0.65)) b.o(xx, yy, Obj.StoneWall);
    });
  }
  b.scatter(rx0, ry0, rx1, ry1, [[Obj.Pillar, 0.015], [Obj.DeadTree, 0.015], [Obj.Bones, 0.03], [Obj.Grave, 0.01]]);
  b.spawnMany('skeleton', 6, rx0, ry0, rx1, ry1);
  b.spawnMany('ghoul', 2, rx0, ry0 + 10, rx1, ry1);

  const area: [number, number, number, number] = [6, 98, 72, 162];
  const themes: Array<{ z: number; ground: Ground; rooms: number }> = [
    { z: -1, ground: Ground.Stone, rooms: 9 },
    { z: -2, ground: Ground.Ash, rooms: 9 },
    { z: -3, ground: Ground.Cave, rooms: 8 },
    { z: -4, ground: Ground.Ash, rooms: 6 },
  ];
  let entry = { x: 33, y: 124 };
  b.clear(32, 123, 35, 126);
  let prevLast: { x: number; y: number } | null = null;
  for (const t of themes) {
    const rooms = b.dungeon(area[0], area[1], area[2], area[3], t.z, t.rooms, t.ground);
    b.stairs({ x: entry.x, y: entry.y, z: t.z }, { x: entry.x, y: entry.y, z: t.z + 1 }, [1, 0], [1, 0]);
    b.fill(entry.x - 1, entry.y - 1, entry.x + 2, entry.y + 1, t.ground, t.z);
    b.o(entry.x, entry.y, Obj.StairsUp, t.z);
    b.tunnel(entry.x + 1, entry.y, rooms[0].x, rooms[0].y, t.z, t.ground);
    if (prevLast === null) b.o(entry.x, entry.y, Obj.StairsDown, t.z + 1);
    const last = rooms[rooms.length - 1];
    prevLast = last;
    entry = { x: last.x, y: last.y };
    b.rect(area[0], area[1], area[2], area[3], (x, y) => {
      if (m.getGround(x, y, t.z) === Ground.Void) return;
      if (m.getObj(x, y, t.z) !== Obj.None) return;
      const r = b.rng.next();
      if (t.z === -1 && r < 0.02) b.o(x, y, Obj.Bones, t.z);
      else if (t.z === -1 && r < 0.025) b.o(x, y, Obj.Grave, t.z);
      else if (t.z === -2 && r < 0.035) b.o(x, y, Obj.FireField, t.z);
      else if (t.z === -3 && r < 0.03) b.o(x, y, Obj.Stalagmite, t.z);
      else if (t.z === -4 && r < 0.02) b.o(x, y, Obj.FireField, t.z);
      else if (r < 0.006) b.o(x, y, Obj.Torch, t.z);
    });
    if (t.z <= -2) {
      for (let i = 2; i < rooms.length - 1; i += 2) {
        const c = rooms[i];
        b.rect(c.x - 1, c.y - 1, c.x + 1, c.y + 1, (x, y) => { if (b.rng.chance(0.7)) b.g(x, y, Ground.Lava, t.z); });
      }
    }
    const inner = rooms.slice(1);
    const roster: Record<number, Array<[Parameters<Builder['spawn']>[0], number]>> = {
      [-1]: [['ghoul', 2], ['skeleton', 1]],
      [-2]: [['fire_elemental', 2], ['ghoul', 1]],
      [-3]: [['behemoth', 1], ['fire_elemental', 1]],
      [-4]: [['demon', 1]],
    };
    inner.forEach((c, i) => {
      for (const [kind, n] of roster[t.z]) {
        if (t.z === -4 && i === 0) continue;
        b.spawnMany(kind, n, c.x - 3, c.y - 2, c.x + 3, c.y + 2, t.z);
      }
    });
  }
  if (prevLast) {
    b.chest('abyss_hoard', prevLast.x + 1, prevLast.y - 1, -4, [{ id: 'demon_shield', qty: 1 }, { id: 'gold', qty: 5000 }]);
    b.chest('abyss_reliquary', prevLast.x - 2, prevLast.y + 1, -4, [{ id: 'demonbone_amulet', qty: 1 }, { id: 'small_diamond', qty: 5 }]);
  }
  const secret = findOpen(m, -2, area);
  if (secret) {
    b.digSpot(secret.x, secret.y, -2);
    b.fill(secret.x - 2, secret.y - 2, secret.x + 2, secret.y + 2, Ground.Stone, -3);
    b.ropeSpot(secret.x - 1, secret.y - 1, -3, [-1, -1]);
    b.chest('descent_secret', secret.x + 1, secret.y + 1, -3, [{ id: 'emberwalk_boots', qty: 1 }, { id: 'fireball_rune', qty: 20 }]);
  }
  return m;
}

function findOpen(m: WorldMap, z: number, area: [number, number, number, number]): { x: number; y: number } | null {
  for (let y = area[1] + 6; y < area[3] - 6; y++) {
    for (let x = area[0] + 6; x < area[2] - 6; x++) {
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!m.isWalkable(x + dx, y + dy, z) || m.getObj(x + dx, y + dy, z) !== Obj.None) { ok = false; break; }
      }
      if (ok && m.getGround(x, y, z - 1) === Ground.Void) return { x, y };
    }
  }
  return null;
}
