import type { EnemyKind } from '../world/WorldMap';

/**
 * Bosses, world bosses and raids: the schedule numbers and where everything
 * happens. Monster stats live in enemies/enemyDefs.ts (kinds `boss_*`, `wb_*`,
 * `raid_*`); the running state lives in bosses/WorldEvents.ts. Every time here
 * is game-clock seconds (Game.time), so tests can fast-forward.
 */

/** A world boss leaves again if nobody kills it within 45 minutes. */
export const WORLD_BOSS_LIFETIME = 45 * 60;
/** Seconds from one world boss (or server start) to the next: random in this range. */
export const WORLD_BOSS_INTERVAL: [number, number] = [3 * 3600, 6 * 3600];
/** Seconds from one raid (or server start) to the next: random in this range. At most one raid at a time. */
export const RAID_INTERVAL: [number, number] = [2 * 3600, 4 * 3600];
/** The warning goes out this long before the first wave. */
export const RAID_WARNING = 5 * 60;
/** Warning time when a game master starts a raid with /raid. */
export const GM_RAID_WARNING = 30;
/** A raid ends this long after its first wave; leftover raid monsters leave. */
export const RAID_DURATION = 20 * 60;
/** Monsters spawned by /boss leave after this long if still alive. */
export const GM_BOSS_LIFETIME = 30 * 60;
/** Summoned helpers leave after this long (they also fall with their master). */
export const SUMMON_LIFETIME = 10 * 60;
/** Healing counts towards a world boss share when the healed player fought it within this many seconds. */
export const ENGAGE_SECONDS = 30;
/** A point of healing on a world boss fighter counts like this many points of damage (healers deal little damage). */
export const HEAL_WEIGHT = 2;
/** Smallest share of a world boss fight that still earns a loot bag. */
export const WORLD_BOSS_MIN_SHARE = 0.005;
/** Smallest share of a raid's defence that still earns a reward. */
export const RAID_MIN_SHARE = 0.01;
/** Share of the raiders' experience that the defenders get again as the raid reward (on top of their kills). */
export const RAID_REWARD_SHARE = 0.3;
/** Task seals for a full share of a won raid (each defender gets at least one; the top three two more). */
export const RAID_SEALS = 6;
/** Dungeon boss respawn times vary by ±10% so they cannot be timed to the second. */
export const BOSS_RESPAWN_JITTER = 0.1;

export interface Spot {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface WorldBossDef {
  kind: EnemyKind;
  /** Helpers that rise with it. */
  adds: Array<[EnemyKind, number]>;
  /** It appears at one of these, chosen at random. */
  spots: Spot[];
}

export const WORLD_BOSSES: WorldBossDef[] = [
  {
    kind: 'wb_mountain', adds: [['cyclops', 4], ['behemoth', 1]],
    spots: [
      { name: 'Highmoor Downs', x: 466, y: 474, z: 0 },
      { name: 'the Greyspine Mountains', x: 265, y: 372, z: 0 },
      { name: 'the Scorched Crags', x: 490, y: 662, z: 0 },
    ],
  },
  {
    kind: 'wb_storm_serpent', adds: [['crocodile', 4], ['hydra', 1]],
    spots: [
      { name: 'the Saltmere Shore', x: 168, y: 714, z: 0 },
      { name: 'the Mangrove Mire', x: 360, y: 760, z: 0 },
      { name: 'Corvane Grove', x: 556, y: 352, z: 0 },
    ],
  },
  {
    kind: 'wb_blight_mother', adds: [['tarantula', 6], ['crystal_spider', 1]],
    spots: [
      { name: 'the Mistwood', x: 168, y: 512, z: 0 },
      { name: 'Spider Glade', x: 328, y: 530, z: 0 },
      { name: 'the Palmreach Jungle', x: 380, y: 690, z: 0 },
    ],
  },
];

export interface RaidWave {
  /** Seconds after the first wave. */
  at: number;
  monsters: Array<[EnemyKind, number]>;
}

export interface RaidDef {
  id: string;
  name: string;
  /** Town shown in messages and on the world map. */
  town: string;
  /**
   * Where monsters appear: `ring` = the outskirts around this region (a town's
   * protection zone), `inside` = inside it (e.g. a graveyard that is not safe ground).
   */
  area: { region: string; mode: 'ring' | 'inside' };
  /** Region whose middle the raiders march towards (they stop at protection zones). */
  target: string;
  warning: string;
  start: string;
  victory: string;
  end: string;
  waves: RaidWave[];
  /** Comes with the last wave. */
  boss: EnemyKind;
}

export const RAIDS: RaidDef[] = [
  {
    id: 'orc_warband', name: 'Orc Warband', town: 'Westmarch', area: { region: 'Westmarch', mode: 'ring' }, target: 'Westmarch',
    warning: 'You hear war drums in the west… an orc warband is marching on Westmarch!',
    start: 'The orcs of the Burning Tusk are attacking Westmarch!',
    victory: 'Grashnak Tuskbreaker has fallen! The orc warband breaks before the walls of Westmarch.',
    end: 'The orc warband withdraws from Westmarch.',
    waves: [
      { at: 0, monsters: [['orc', 8], ['orc_spearman', 4]] },
      { at: 300, monsters: [['orc_warrior', 6], ['orc_shaman', 3], ['orc_berserker', 2]] },
      { at: 600, monsters: [['orc_berserker', 4], ['orc_leader', 2], ['orc_warrior', 3]] },
    ],
    boss: 'raid_tusk_warlord',
  },
  {
    id: 'restless_dead', name: 'The Restless Dead', town: 'Thornvale', area: { region: 'Old Graveyard', mode: 'inside' }, target: 'Temple Plaza',
    warning: 'A cold wind blows through the Old Graveyard of Thornvale… the dead are stirring.',
    start: 'The dead rise from the Old Graveyard of Thornvale!',
    victory: 'Sexton Morrow crumbles to dust. The dead of Thornvale lie still again.',
    end: 'The last of the dead sink back into the Old Graveyard.',
    waves: [
      { at: 0, monsters: [['skeleton', 8]] },
      { at: 240, monsters: [['skeleton', 6], ['ghoul', 4]] },
      { at: 480, monsters: [['ghoul', 6], ['skeleton', 4]] },
    ],
    boss: 'raid_grave_warden',
  },
  {
    id: 'frost_march', name: 'The Frostmarch', town: 'Valdrheim', area: { region: 'Valdrheim', mode: 'ring' }, target: 'Valdrheim',
    warning: 'The mountains shake with heavy footsteps… frost giants are marching on Valdrheim!',
    start: 'The Frostmarch has reached Valdrheim!',
    victory: 'Hjalmvar Rimeborn is slain! The Frostmarch scatters into the snow.',
    end: 'The frost giants turn back towards the mountains.',
    waves: [
      { at: 0, monsters: [['barbarian_raider', 6], ['winter_wolf', 4]] },
      { at: 300, monsters: [['frost_giant', 3], ['frost_giantess', 3], ['barbarian_skullhunter', 2]] },
      { at: 600, monsters: [['frost_giant', 4], ['ice_golem', 2]] },
    ],
    boss: 'raid_frost_jarl',
  },
  {
    id: 'scarab_swarm', name: 'Scarab Swarm', town: 'Sunspire', area: { region: 'Sunspire', mode: 'ring' }, target: 'Sunspire',
    warning: 'The sand around Sunspire begins to crawl…',
    start: 'A scarab swarm rises from the dunes around Sunspire!',
    victory: 'Ixtara, Queen of the Swarm, is crushed! The swarm sinks back into the sand.',
    end: 'The swarm burrows back into the dunes around Sunspire.',
    waves: [
      { at: 0, monsters: [['scarab', 10]] },
      { at: 300, monsters: [['scarab', 8], ['scorpion', 6]] },
      { at: 600, monsters: [['scarab', 6], ['mummy', 4]] },
    ],
    boss: 'raid_swarm_queen',
  },
  // more towns (2026-10-24, world events): led by the strongest of their own kind
  {
    id: 'bandit_riders', name: 'Bandit Riders', town: 'Millbrook', area: { region: 'Millbrook', mode: 'ring' }, target: 'Millbrook',
    warning: 'Dust clouds on the roads round Millbrook… bandit riders are coming for the harvest!',
    start: 'Bandit riders are raiding the farms of Millbrook!',
    victory: 'The valkyrie who led them has fallen! The bandit riders scatter from Millbrook.',
    end: 'The bandit riders ride off with what they could carry.',
    waves: [
      { at: 0, monsters: [['bandit', 8], ['amazon', 3]] },
      { at: 300, monsters: [['bandit', 6], ['amazon', 4], ['valkyrie', 2]] },
      { at: 600, monsters: [['valkyrie', 4], ['amazon', 4]] },
    ],
    boss: 'valkyrie',
  },
  {
    id: 'minotaur_stampede', name: 'Minotaur Stampede', town: 'Highmoor', area: { region: 'Highmoor', mode: 'ring' }, target: 'Highmoor',
    warning: 'The hills round Highmoor shake with hooves… a minotaur stampede is coming!',
    start: 'The minotaur stampede crashes into Highmoor!',
    victory: 'The cyclops driving the herd is down! The minotaurs flee back into the hills.',
    end: 'The minotaurs thunder back into the hills round Highmoor.',
    waves: [
      { at: 0, monsters: [['minotaur', 8]] },
      { at: 300, monsters: [['minotaur', 5], ['minotaur_archer', 4]] },
      { at: 600, monsters: [['minotaur_mage', 4], ['minotaur', 4]] },
    ],
    boss: 'cyclops',
  },
];

/** Dungeon bosses and the region each guards (placed on the map by world/areas.ts). */
export const DUNGEON_BOSSES: Array<{ kind: EnemyKind; region: string }> = [
  { kind: 'boss_ironjaw', region: 'Grimtusk Fortress' },
  { kind: 'boss_bonebound', region: 'Westmarch Catacombs' },
  { kind: 'boss_delving_king', region: 'Deep Delvings' },
  { kind: 'boss_labyrinth_lord', region: 'Minotaur Hold' },
  { kind: 'boss_venom_oracle', region: 'Temple Undercroft' },
  { kind: 'boss_ember_matriarch', region: 'Dragon Lair' },
  { kind: 'boss_sand_king', region: "Pharaoh's Vault" },
  { kind: 'boss_mire_hydra', region: 'Hydra Nest' },
  { kind: 'boss_rime_wyrm', region: 'Frost Dragon Lair' },
  { kind: 'boss_ashen_sovereign', region: 'The Demon Pit' },
  { kind: 'boss_drowned_tyrant', region: 'The Drowned Crown' },
];

/** A marker for the world map: an active world boss or raid. */
export interface WorldMark {
  kind: 'worldboss' | 'raid';
  name: string;
  x: number;
  y: number;
  z: number;
}

/** Finds a raid by id, name or town ("orc", "westmarch", "scarab_swarm"). */
export function findRaid(q: string): RaidDef | null {
  const n = q.trim().toLowerCase().replace(/\s+/g, '_');
  if (!n) return null;
  return RAIDS.find((r) => r.id === n) ?? RAIDS.find((r) => r.id.includes(n) || r.name.toLowerCase().replace(/\s+/g, '_').includes(n) || r.town.toLowerCase() === n) ?? null;
}
