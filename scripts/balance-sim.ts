/**
 * Balance simulator: headless fights with the real Game code (combat, spells,
 * runes, potions, monster AI, exp stages, loot), driven by a "competent player"
 * brain for each vocation. It measures, per hunting area and vocation:
 * experience per hour (after stages), gold and loot per hour, supply cost per
 * hour, damage taken per second and deaths; damage per second against a
 * training dummy (single target, 4 and 8 targets); duels between vocations at
 * equal level and gear; and the levelling time curve (best safe area per level).
 *
 *   npx tsx scripts/balance-sim.ts              full report (markdown on stdout, ~15 min)
 *   npx tsx scripts/balance-sim.ts --quick      CI sanity mode (a few seconds of work): small checks, exit 1 on failure
 *   options: --minutes=N (hunt length, default 8), --seed=N, --only=areas|dps|duels|curve|bosses (comma list)
 *
 * Everything is seeded (Math.random is replaced), so two runs of the same code agree.
 * Assumptions (gear, skills, the player's choices) are written down in BIBLE §7 "Balance".
 */
declare const process: { exit(code: number): never; argv: string[] };
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { VOCATION_IDS, type Vocation } from '../src/game/player/vocations';
import { expForLevel } from '../src/game/player/Player';
import type { EnemyKind } from '../src/game/world/WorldMap';
import {
  ARENA, areaList, clearMonsters, dps, DT, duel, fighter, FLOOR_BANDS, g, hunt, parkAll, resetFighter, seedRandom, setTally, spawnPack, step,
  targetHours, takeTally, typicalKit, W, type Fighter, type HuntResult,
} from './balance/engine';

// ------------------------------------------------------------------ options
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const opt = (k: string, d: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const HUNT_MIN = Number(opt('minutes', QUICK ? '1.5' : '8'));
const ONLY = new Set(opt('only', 'areas,dps,duels,curve,bosses').split(','));
seedRandom(Number(opt('seed', '12345')));

const out: string[] = [];
const T0 = Date.now();
const say = (s = '') => { out.push(s); console.log(s); };
const lap = (what: string) => console.error(`[${Math.round((Date.now() - T0) / 1000)} s] ${what}`);
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '—');
const f1 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '—');
const pct = (n: number) => `${Math.round(n * 100)}%`;

// ------------------------------------------------------------------ run
const LEVELS = QUICK ? [60] : [8, 20, 40, 60, 80, 100, 150, 200, 250, 300];
let failures = 0;
const check = (ok: boolean, label: string) => { if (!ok) failures++; say(`${ok ? '  ok  ' : '  FAIL'} ${label}`); };

say(`# Thornvale balance report`);
say('');
say(`Seeded run (seed ${opt('seed', '12345')}), hunts of ${HUNT_MIN} game minutes, season stages. Arena at ${ARENA.x},${ARENA.y}.`);
say('');

// --- typical skills and gear
say('## Typical character (skills from the target curve, gear: best full set and items, no legendary or boss uniques)');
say('');
say('| Level | ' + VOCATION_IDS.map((v) => `${v}: skill / ML / shield · set · weapon`).join(' | ') + ' |');
say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|');
for (const L of LEVELS) {
  const cells = VOCATION_IDS.map((v) => {
    const f = fighter(v, L);
    const ws = g.weaponSkill(f.s);
    const kit = typicalKit(v, L);
    return `${ws === 'magic' ? '—' : f.skills[ws].level} / ${f.skills.magic.level} / ${f.skills.shielding.level} · ${kit.set ?? '—'} · ${f.s.inventory.equipment.weapon?.id ?? '—'}`;
  });
  say(`| ${L} | ${cells.join(' | ')} |`);
}
say('');

lap('DPS vs dummy');
// --- DPS vs dummy
if (ONLY.has('dps')) {
  say('## Damage per second against a training dummy (armour = level/5)');
  say('');
  say('| Level | ' + VOCATION_IDS.map((v) => `${v} 1 / 4 / 8 (burst 1)`).join(' | ') + ' | single spread | 4-target spread K/S/D |');
  say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|---|');
  for (const L of LEVELS) {
    const res = VOCATION_IDS.map((v) => [...[1, 4, 8].map((n) => dps(fighter(v, L), n, Math.round(L / 5), QUICK ? 20 : 60)), dps(fighter(v, L), 1, Math.round(L / 5), QUICK ? 20 : 60, 'burst')]);
    const singles = res.map((r) => r[0]);
    const mean = singles.reduce((a, b) => a + b, 0) / singles.length;
    const spread = Math.max(...singles.map((x) => Math.abs(x / mean - 1)));
    const aoe = [res[0][1], res[2][1], res[3][1]];
    const am = aoe.reduce((a, b) => a + b, 0) / 3;
    say(`| ${L} | ${res.map((r) => `${r.slice(0, 3).map(f0).join(' / ')} (${f0(r[3])})`).join(' | ')} | ±${pct(spread)} | ±${pct(Math.max(...aoe.map((x) => Math.abs(x / am - 1))))} |`);
    if (QUICK) check(singles.every((x) => x > 0), `level ${L}: every vocation deals damage`);
  }
  say('');
}

lap('duels');
// --- duels
if (ONLY.has('duels')) {
  const DL = QUICK ? [60] : [20, 60, 100, 150, 200];
  const N = QUICK ? 2 : 16;
  say(`## Duels (equal level and gear, ${N} fights per pair, 30 potions and runes of each kind each; a 5-minute fight without a death goes to the healthier side)`);
  say('');
  say('| Level | ' + VOCATION_IDS.flatMap((a, i) => VOCATION_IDS.slice(i + 1).map((b) => `${a[0].toUpperCase()} v ${b[0].toUpperCase()}`)).join(' | ') + ' |');
  say('|---|' + VOCATION_IDS.flatMap((_a, i) => VOCATION_IDS.slice(i + 1).map(() => '---')).join('|') + '|');
  for (const L of DL) {
    const cells: string[] = [];
    for (let i = 0; i < VOCATION_IDS.length; i++) for (let j = i + 1; j < VOCATION_IDS.length; j++) {
      const A = fighter(VOCATION_IDS[i], L), B = fighter(VOCATION_IDS[j], L);
      let w = 0;
      for (let k = 0; k < N; k++) w += k % 2 ? 1 - duel(B, A, 300) : duel(A, B, 300);
      cells.push(pct(w / N));
    }
    say(`| ${L} | ${cells.join(' | ')} |`);
  }
  say('');
  say('(share of fights won by the first-named vocation: K knight, P paladin, S sorcerer, D druid)');
  say('');
}

lap('hunting areas');
// --- hunting areas
const areas = areaList();
const areaRes = new Map<string, Map<string, HuntResult>>();
if (ONLY.has('areas')) {
  const list = QUICK ? areas.filter((a) => a.band >= 40 && a.band <= 60).slice(0, 2) : areas;
  say('## Hunting areas at their recommended level (best safe pull: 1, 2 or 4 monsters; exp after stages)');
  say('');
  say('| Area | Band | Monsters | ' + VOCATION_IDS.map((v) => `${v} exp/h · profit/h · dmg/s · deaths/h`).join(' | ') + ' | exp spread | at band−20: deaths/h K/P/S/D |');
  say('|---|---|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|---|');
  for (const a of list) {
    const L = Math.max(8, a.band);
    const row = new Map<string, HuntResult>();
    for (const v of VOCATION_IDS) {
      const f = fighter(v, L);
      // a competent player pulls as many as is safe (no deaths) and pays best: 1, 2 or 4 at a time
      let best = hunt(f, a, 1, HUNT_MIN);
      for (const n of [2, 4]) {
        const r = hunt(f, a, n, HUNT_MIN);
        if (r.deathsH < 0.5 && r.expH > best.expH) best = r;
      }
      row.set(v, best);
    }
    areaRes.set(a.name, row);
    const exps = VOCATION_IDS.map((v) => row.get(v)!.expH);
    const mean = exps.reduce((x, y) => x + y, 0) / exps.length;
    const spread = Math.max(...exps.map((x) => Math.abs(x / mean - 1)));
    let low = '—';
    if (!QUICK && a.band >= 28) {
      low = VOCATION_IDS.map((v) => f1(hunt(fighter(v, Math.max(8, a.band - 20)), a, 4, HUNT_MIN / 2).deathsH)).join(' / ');
    }
    const mons = [...a.kinds.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}×${n}`).join(' ');
    say(`| ${a.name} | ${a.band}+ | ${mons} | ${VOCATION_IDS.map((v) => { const r = row.get(v)!; return `${f0(r.expH)}${r.capped ? '*' : ''} · ${f0(r.profitH)} · ${f0(r.dtps)} · ${f1(r.deathsH)}`; }).join(' | ')} | ±${pct(spread)} | ${low} |`);
    if (QUICK) check(exps.every((x) => x > 0), `${a.name}: every vocation earns experience`);
  }
  say('');
  say('(* = capped by how fast the area respawns)');
  say('');
}


lap('levelling curve');
// --- levelling curve
/** Sim hunts are ideal (no walks to the depot, no breaks): a real hunting hour gets about 80% of it. */
const PLAY_EFF = 1.25;
if (ONLY.has('curve') && !QUICK) {
  say(`## Levelling time (best safe area for the level: no deaths, profit ≥ −20% of loot; season stages)`);
  say('');
  say(`Hours are played hours: simulated hunting time × ${PLAY_EFF} (walks, refills, breaks). Gold = profit banked on the way (loot at trader prices).`);
  say('');
  const grid = [8, 14, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 225, 250, 275, 300];
  const perVoc = new Map<Vocation, Array<{ exp: number; profit: number; area: string }>>();
  for (const v of VOCATION_IDS) {
    const rates: Array<{ exp: number; profit: number; area: string }> = [];
    for (const L of grid) {
      const cands = areas.filter((a) => a.band <= L + 5).sort((x, y) => y.band - x.band).slice(0, 6);
      let best = { exp: 0, profit: 0, area: '—' };
      for (const a of cands) {
        const f = fighter(v, L);
        const r = [1, 2, 4].map((n) => hunt(f, a, n, HUNT_MIN / 2)).filter((x) => x.deathsH < 0.3 && x.profitH > -0.2 * (x.goldH + x.lootH));
        for (const x of r) if (x.expH > best.exp) best = { exp: x.expH, profit: x.profitH, area: a.name };
      }
      rates.push(best);
    }
    perVoc.set(v, rates);
  }
  say('| Level | ' + VOCATION_IDS.map((v) => `${v} exp/h · hours · gold`).join(' | ') + ' | target hours | best area (knight) |');
  say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|---|');
  const hours = new Map<Vocation, number>(VOCATION_IDS.map((v) => [v, 0]));
  const bank = new Map<Vocation, number>(VOCATION_IDS.map((v) => [v, 0]));
  for (let i = 0; i < grid.length; i++) {
    const L = grid[i];
    const cells = VOCATION_IDS.map((v) => {
      const rates = perVoc.get(v)!;
      if (i > 0) {
        // integrate level by level between grid points with the rate interpolated
        for (let l = grid[i - 1]; l < L; l++) {
          const t = (l - grid[i - 1]) / (L - grid[i - 1]);
          const rate = rates[i - 1].exp * (1 - t) + rates[i].exp * t;
          const profit = rates[i - 1].profit * (1 - t) + rates[i].profit * t;
          const dh = rate > 0 ? (expForLevel(l + 1) - expForLevel(l)) / rate : Infinity;
          hours.set(v, hours.get(v)! + dh * PLAY_EFF);
          bank.set(v, bank.get(v)! + dh * profit);
        }
      } else hours.set(v, targetHours(L));
      return `${f0(rates[i].exp)} · ${f1(hours.get(v)!)} · ${f0(bank.get(v)!)}`;
    });
    say(`| ${L} | ${cells.join(' | ')} | ${f1(targetHours(L))} | ${perVoc.get('knight')![i].area} |`);
  }
  say('');
}

lap('bosses: solo');
// --- bosses: solo should fail, a group of four should win
if (ONLY.has('bosses') && !QUICK) {
  say('## Bosses (solo at boss level + 20 vs a party of four, one of each vocation, at the boss level; world bosses: four at 200 should fail, they are for 10+ players)');
  say('');
  say('| Boss | Level | Solo knight / paladin / sorcerer / druid | Party of four |');
  say('|---|---|---|---|');
  const bossLevel: Array<[EnemyKind, number]> = [];
  for (const sp of W.spawns) {
    const d = ENEMIES[sp.kind];
    if (d.boss !== 'dungeon' || bossLevel.some(([k]) => k === sp.kind)) continue;
    const r = W.regionAt(sp.x, sp.y, sp.z);
    // a dungeon boss is made for a party ten levels above its dungeon's floor
    const band = r ? FLOOR_BANDS[`${r.name}|${sp.z}`] ?? (parseInt(r.level, 10) || 50) : 50;
    bossLevel.push([sp.kind, Math.max(20, band + 10)]);
  }
  // the rare colossus and the raid bosses (levels of the raids' monsters)
  for (const [k, L] of [['gravesilk_colossus', 110], ['raid_tusk_warlord', 40], ['raid_grave_warden', 25], ['raid_frost_jarl', 80], ['raid_swarm_queen', 55]] as Array<[EnemyKind, number]>) bossLevel.push([k, L]);
  for (const k of ['wb_mountain', 'wb_storm_serpent', 'wb_blight_mother'] as EnemyKind[]) bossLevel.push([k, 200]);
  for (const [k, L] of bossLevel) {
    const fight = (fs: Fighter[], sec: number) => {
      setTally(fs.map((f) => f.s.id));
      parkAll();
      for (const f of fs) f.brain.mode = 'burst';
      fs.forEach((f, i) => resetFighter(f, { x: ARENA.x + (i % 2) * 2, y: ARENA.y + Math.floor(i / 2) * 2 }));
      clearMonsters();
      const b = spawnPack([k], ARENA, 6)[0];
      let t = 0, deaths = 0;
      while (b && !b.dead && t < sec && fs.some((f) => !f.s.player.dead)) {
        step(fs);
        t += DT;
      }
      deaths = takeTally().deaths;
      const won = !!b?.dead;
      const hp = b ? b.hp / b.maxHp : 1;
      clearMonsters();
      fs.forEach((f) => { resetFighter(f); f.brain.mode = 'hunt'; });
      return `${won ? 'won' : `lost (${pct(hp)} left)`} ${f0(t)} s${deaths ? `, ${deaths} died` : ''}`;
    };
    const solo = VOCATION_IDS.map((v) => fight([fighter(v, L + 20)], 300).replace(/ s.*$/, ' s'));
    const party = fight(VOCATION_IDS.map((v) => fighter(v, L)), 600);
    say(`| ${ENEMIES[k].name} | ${L} | ${solo.join(' / ')} | ${party} |`);
  }
  say('');
}

if (QUICK) {
  say(failures ? `${failures} balance sanity check(s) failed` : 'balance sanity: ok');
  process.exit(failures ? 1 : 0);
}
