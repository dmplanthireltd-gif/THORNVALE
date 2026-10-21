/**
 * Exp stages (server rates): preset tables, level/skill boundaries, gold, env parsing and the
 * Game hooks (monster kills, party share, quests, combat skills, magic, trade skills, gold loot).
 *   npx tsx scripts/stages-test.ts   (part of npm run test:logic)
 */
declare const process: { exit(code: number): never };
import { Game } from '../src/game/Game';
import {
  CLASSIC_STAGES, combatSkillRate, expRate, expStageLine, gatheringRate, isClassic, parseStages, scaleAmount, SEASON_STAGES, stagedGold, stagesFromEnv,
} from '../src/game/progression/stages';
import { expForLevel } from '../src/game/player/Player';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

console.log('Exp stages: tables');
{
  const S = SEASON_STAGES;
  check(expRate(S, 1) === 10 && expRate(S, 50) === 10, 'levels 1–50: ×10');
  check(expRate(S, 51) === 6 && expRate(S, 100) === 6, 'levels 51–100: ×6');
  check(expRate(S, 101) === 3 && expRate(S, 150) === 3, 'levels 101–150: ×3');
  check(expRate(S, 151) === 1.5 && expRate(S, 900) === 1.5, 'level 151+: ×1.5');
  check(combatSkillRate(S, 'sword', 10) === 5 && combatSkillRate(S, 'sword', 59) === 5 && combatSkillRate(S, 'sword', 60) === 3, 'combat skills ×5 below 60, ×3 from 60');
  check(combatSkillRate(S, 'shielding', 59) === 5 && combatSkillRate(S, 'distance', 100) === 3, 'shielding and distance use the combat table');
  check(combatSkillRate(S, 'magic', 0) === 5 && combatSkillRate(S, 'magic', 39) === 5 && combatSkillRate(S, 'magic', 40) === 3, 'magic level ×5 below 40, ×3 from 40');
  check(gatheringRate(S, 1) === 5 && gatheringRate(S, 59) === 5 && gatheringRate(S, 60) === 3 && gatheringRate(S, 99) === 3, 'trade skills ×5 below 60, ×3 from 60');
  check(S.gold === 1.5, 'gold from monsters ×1.5');
  const C = CLASSIC_STAGES;
  check([1, 50, 51, 151, 999].every((l) => expRate(C, l) === 1) && combatSkillRate(C, 'club', 90) === 1 && combatSkillRate(C, 'magic', 3) === 1 && gatheringRate(C, 70) === 1 && C.gold === 1, 'classic preset is ×1 everywhere');
  check(isClassic(C) && !isClassic(S), 'classic is recognised (no rates line)');
  check(expStageLine(S, 1) === 'Exp ×10 (level 1–50)' && expStageLine(S, 151) === 'Exp ×1.5 (level 151+)', `rates line: "${expStageLine(S, 1)}"`);
  // fractions are a chance: 1 × 1.5 averages 1.5
  let sum = 0;
  for (let i = 0; i < 4000; i++) sum += scaleAmount(1, 1.5);
  check(Math.abs(sum / 4000 - 1.5) < 0.05, `fractions average out (${(sum / 4000).toFixed(3)})`);
  check(stagedGold(S, 10, () => 0.99) === 15 && stagedGold(S, 3, () => 0) === 5 && stagedGold(S, 3, () => 0.99) === 4, 'gold roll ×1.5 (3 → 4 or 5, 10 → 15)');
  check(stagedGold(C, 7) === 7, 'classic gold unchanged');
}

console.log('Exp stages: server env');
{
  check(stagesFromEnv({}).stages.name === 'season', 'default preset is season');
  check(stagesFromEnv({ STAGES: 'classic' }).stages === CLASSIC_STAGES, 'STAGES=classic');
  const bad = stagesFromEnv({ STAGES: 'turbo' });
  check(bad.stages.name === 'season' && !!bad.warning, 'unknown preset → season with a warning');
  const j = stagesFromEnv({ SEASON_STAGES: '{"gold":2,"exp":[{"from":1,"to":20,"rate":20},{"from":21,"rate":2}]}' });
  check(j.stages.gold === 2 && expRate(j.stages, 20) === 20 && expRate(j.stages, 21) === 2 && gatheringRate(j.stages, 1) === 5 && j.stages.name === 'custom', 'SEASON_STAGES JSON overrides parts of the preset');
  const broken = stagesFromEnv({ SEASON_STAGES: '{oops' });
  check(broken.stages.name === 'season' && !!broken.warning, 'bad JSON is ignored with a warning');
  check(parseStages({ gold: 5000, exp: [{ from: 1, rate: -3 }] }, SEASON_STAGES).gold === 100 && expRate(parseStages({ exp: [{ from: 1, rate: -3 }] }, SEASON_STAGES), 1) === 10, 'rates are capped at ×100 and bad bands fall back');
  check(JSON.stringify(parseStages(JSON.parse(JSON.stringify(SEASON_STAGES)))) === JSON.stringify(SEASON_STAGES), 'the table survives the network (welcome message)');
}

console.log('Exp stages: game hooks');
{
  const g = new Game({ stages: SEASON_STAGES });
  const a = g.addPlayer('Stager', { vocation: 'knight' });
  const at = [a.player.x, a.player.y] as const;
  const Ctor = g.enemies[0].constructor as new (id: number, kind: string, x: number, y: number, z: number) => (typeof g.enemies)[number];
  const kill = (kind = 'wolf') => {
    const foe = new Ctor(990000 + Math.floor(Math.random() * 9000), kind, at[0] + 1, at[1] + 1, 0);
    g.enemies.push(foe);
    foe.damageBy.set(a.id, foe.maxHp);
    (g as unknown as { killEnemy(e: unknown): void }).killEnemy(foe);
    return foe;
  };
  const setLevel = (l: number) => { a.player.level = l; a.player.exp = expForLevel(l); };
  setLevel(10);
  let e0 = a.player.exp;
  const wolf = kill();
  check(a.player.exp - e0 === wolf.def.exp * 10, `level 10 kill: ${wolf.def.exp} × 10 = ${a.player.exp - e0}`);
  setLevel(120);
  e0 = a.player.exp;
  kill();
  check(a.player.exp - e0 === Math.round(wolf.def.exp * 3), 'level 120 kill: ×3');
  setLevel(200);
  e0 = a.player.exp;
  kill();
  check(a.player.exp - e0 === Math.round(wolf.def.exp * 1.5), 'level 200 kill: ×1.5');
  // quest exp goes through the same path
  setLevel(60);
  e0 = a.player.exp;
  (g as unknown as { grantExp(s: unknown, n: number, at: number, why: string): void }).grantExp(a, 100, a.id, 'for a test quest');
  check(a.player.exp - e0 === 600, 'quest reward exp at level 60: 100 × 6');

  // combat skills: one attack = 5 tries below 60
  const sw = a.skills.sword;
  sw.level = 30; sw.tries = 0;
  g.trainSkill(a, 'sword', 1);
  check(sw.tries === 5, `sword 30: 1 try counts 5 (${sw.tries})`);
  sw.level = 70; sw.tries = 0;
  g.trainSkill(a, 'sword', 2);
  check(sw.tries === 6, 'sword 70: 2 tries count 6');
  a.skills.magic.level = 10; a.skills.magic.tries = 0;
  g.trainSkill(a, 'magic', 10);
  check(a.skills.magic.tries === 50, 'magic 10: 10 mana counts 50');
  a.skills.magic.level = 45; a.skills.magic.tries = 0;
  g.trainSkill(a, 'magic', 10);
  check(a.skills.magic.tries === 30, 'magic 45: 10 mana counts 30');

  // trade skills
  a.gathering.mining = 0;
  g.gainSkill(a, 'mining', 18, a.id);
  check(a.gathering.mining === 90, 'mining 1: copper 18 xp × 5 = 90');
  a.gathering.fishing = 300_000; // level 60+
  g.gainSkill(a, 'fishing', 100, a.id);
  check(a.gathering.fishing === 300_300, 'fishing 60+: 100 xp × 3');

  // gold loot ×1.5 on average (rat table rolled many times)
  const goldOf = (stages: typeof SEASON_STAGES) => {
    g.stages = stages;
    let gold = 0;
    for (let i = 0; i < 400; i++) {
      g.bags.length = 0;
      kill('orc');
      for (const b of g.bags) for (const it of b.items) if (it.id === 'gold') gold += it.qty;
    }
    g.bags.length = 0;
    return gold;
  };
  const cg = goldOf(CLASSIC_STAGES);
  const sg = goldOf(SEASON_STAGES);
  check(cg > 0 && sg / cg > 1.3 && sg / cg < 1.7, `monster gold ×1.5 (classic ${cg}, season ${sg})`);

  // classic: exact ×1
  g.stages = CLASSIC_STAGES;
  setLevel(10);
  e0 = a.player.exp;
  kill();
  check(a.player.exp - e0 === wolf.def.exp, 'classic: kill exp ×1');
  sw.level = 30; sw.tries = 0;
  g.trainSkill(a, 'sword', 1);
  check(sw.tries === 1, 'classic: 1 try = 1');
}

if (failures) {
  console.log(`\n${failures} stage check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll stage checks passed.');
