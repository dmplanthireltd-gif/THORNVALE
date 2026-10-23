import { Ground, type WorldMap } from '../game/world/WorldMap';
import { inSeaBox } from '../game/world/sea';
import { DUNGEON_BOSSES } from '../game/bosses/bosses';

/**
 * Which piece of music belongs where (pure logic: no DOM, no Web Audio, so it runs in tests).
 *
 * A *place* is a kind of location (town, forest, the Temple Court, a shop...). Each place has one or
 * more *tracks* (public/audio/music/<track>.m4a, rendered by scripts/music/render.ts). Places with
 * several tracks take turns: the next one plays when the current one reaches its end, or when the
 * player comes back to that place after a while. Tracks.ts plays what this file picks.
 */

export type Track =
  | 'title'
  | 'town' | 'town2' | 'fields' | 'fields2' | 'forest' | 'forest2' | 'deep' | 'deep2' | 'sea' | 'sea2'
  | 'jungle' | 'swamp' | 'snow' | 'desert' | 'volcano'
  | 'court' | 'reach' | 'crypt' | 'steppe' | 'boss'
  | 'shop' | 'hall' | 'temple' | 'smithy'
  | 'battle'
  // town themes
  | 'westmarch' | 'elderglen' | 'stonedeep' | 'highmoor' | 'millbrook' | 'valdrheim' | 'aurelion' | 'briarwatch'
  | 'harbour' | 'palmreach' | 'oasis' | 'isle'
  // hunting-ground themes
  | 'warcamp' | 'labyrinth' | 'mines' | 'dragon' | 'serpent' | 'tomb';

/** A town with a theme of its own (its protection zone and its harbour). */
export type TownPlace =
  | 'westmarch' | 'elderglen' | 'stonedeep' | 'highmoor' | 'millbrook' | 'valdrheim' | 'aurelion' | 'briarwatch'
  | 'harbour' | 'palmreach' | 'oasis' | 'isle';

export type Place =
  | 'title' | 'town' | 'court' | 'fields' | 'forest' | 'jungle' | 'swamp' | 'snow' | 'desert' | 'volcano'
  | 'deep' | 'sea' | 'reach' | 'crypt' | 'steppe' | 'boss' | 'shop' | 'hall' | 'temple' | 'smithy' | 'battle'
  | TownPlace
  | 'warcamp' | 'labyrinth' | 'elfwood' | 'mines' | 'icecave' | 'dragon' | 'serpent' | 'tomb';

/** The tracks of each place, in the order they take turns. */
export const PLACE_TRACKS: Record<Place, Track[]> = {
  title: ['title'],
  town: ['town', 'town2'],
  court: ['court'],
  fields: ['fields', 'fields2'],
  forest: ['forest', 'forest2'],
  jungle: ['jungle'],
  swamp: ['swamp'],
  snow: ['snow'],
  desert: ['desert'],
  volcano: ['volcano'],
  deep: ['deep', 'deep2'],
  sea: ['sea', 'sea2'],
  reach: ['reach'],
  crypt: ['crypt'],
  steppe: ['steppe'],
  boss: ['boss'],
  shop: ['shop'],
  hall: ['hall'],
  temple: ['temple'],
  smithy: ['smithy'],
  battle: ['battle'],
  westmarch: ['westmarch'],
  elderglen: ['elderglen'],
  stonedeep: ['stonedeep'],
  highmoor: ['highmoor'],
  millbrook: ['millbrook'],
  valdrheim: ['valdrheim'],
  aurelion: ['aurelion'],
  briarwatch: ['briarwatch'],
  harbour: ['harbour'],
  palmreach: ['palmreach'],
  oasis: ['oasis'],
  isle: ['isle'],
  warcamp: ['warcamp'],
  labyrinth: ['labyrinth'],
  elfwood: ['forest2'], // Mossbound: ocarina, flute and harp already sound elven
  mines: ['mines'],
  icecave: ['snow'], // Frostfang: celesta and harp over cold strings, glassy enough for the ice caves
  dragon: ['dragon'],
  serpent: ['serpent'],
  tomb: ['tomb'],
};

export const TRACKS: Track[] = [...new Set(Object.values(PLACE_TRACKS).flat())];

/** Inside buildings: the quiet themes (Settings → "Music: outdoors only" silences these). */
export const INDOOR_PLACES: ReadonlySet<Place> = new Set<Place>(['shop', 'hall', 'temple', 'smithy']);

/**
 * Exact loop length of every track in samples at 44.1 kHz. The AAC files carry a few hundred samples
 * of encoder padding after the loop point, so the player loops at this length instead of the file's end.
 * scripts/music-test.ts checks these against scripts/music/songs.ts.
 */
export const LOOP_SAMPLES: Record<Track, number> = {
  town: 2919724, fields: 2565818, jungle: 2870237, snow: 3681391, desert: 3256615, volcano: 2352000,
  deep: 4233600, sea: 2540160, forest: 3024000, swamp: 4456421, battle: 2016000,
  title: 3221217, town2: 2646000, fields2: 2822400, forest2: 2886545, deep2: 3175200, sea2: 2646000,
  court: 3024000, reach: 2886545, crypt: 3175200, steppe: 3342316, boss: 2646000,
  shop: 2646000, hall: 2646000, temple: 2822400, smithy: 2761043,
  westmarch: 3024000, elderglen: 3528000, stonedeep: 2886545, highmoor: 2761043, millbrook: 3528000, valdrheim: 3342316,
  aurelion: 3528000, briarwatch: 3136000, harbour: 3024000, palmreach: 3256615, oasis: 3386880, isle: 3175200,
  warcamp: 3386880, labyrinth: 3221217, mines: 2761043, dragon: 3528000, serpent: 3024000, tomb: 3848727,
};
export const loopSeconds = (t: Track): number => LOOP_SAMPLES[t] / 44100;

/** Which quiet theme a town building gets, from its name. */
export function indoorPlace(name: string): 'shop' | 'hall' | 'temple' | 'smithy' {
  if (/temple/i.test(name)) return 'temple';
  if (/smithy|forge/i.test(name)) return 'smithy';
  if (/depot|bank|hall|palace|longhouse|gallery|tower/i.test(name)) return 'hall';
  return 'shop'; // shops, outfitters, magic shops, homes, barns, the trading post
}

/**
 * Each town's own theme, by the name of its protection zone. "<Town> Harbour" plays its town's theme;
 * island landings and other protection zones keep the shared town themes. Thornvale has the Temple Court.
 */
export const TOWN_THEMES: Readonly<Record<string, TownPlace | 'court'>> = {
  Thornvale: 'court',
  Westmarch: 'westmarch', // stately citadel
  Elderglen: 'elderglen', // elven harp and flute
  Stonedeep: 'stonedeep', // dwarven low brass, anvils, deep drums
  Highmoor: 'highmoor', // highland pipes and fiddle
  Millbrook: 'millbrook', // pastoral farm town
  'Pearl Pier': 'millbrook', // Millbrook's pier out to the whirlpool
  Valdrheim: 'valdrheim', // the north: hardanger fiddle, throat drone, frame drum
  Aurelion: 'aurelion', // the crown city
  Briarwatch: 'briarwatch', // frontier stockade
  Corvane: 'harbour', // harbour towns: a shanty
  Saltmere: 'harbour',
  Palmreach: 'palmreach', // jungle port: steel pan and marimba
  Sunspire: 'oasis', // desert towns: oud, ney, darbuka
  Dunewatch: 'oasis',
  "Wayfarer's Rest": 'isle', // the tutorial isle
};

/** The theme of a protection zone's region (null = the shared town themes). */
export function townTheme(regionName: string): TownPlace | 'court' | null {
  return TOWN_THEMES[regionName] ?? TOWN_THEMES[regionName.replace(/ Harbour$/, '')] ?? null;
}

/**
 * Hunting grounds whose music the land mix and the cave rules can't work out, by region name, or
 * "name@floor" for one floor only. Checked after boss lairs, the Sunken Reach and protection zones.
 */
export const REGION_THEMES: Readonly<Record<string, Place>> = {
  // orc warcamps
  'Grimtusk Fortress': 'warcamp', 'Orc Ridge': 'warcamp',
  // the minotaur labyrinth
  'Minotaur Hold': 'labyrinth',
  // elven woods around Elderglen
  'Silverbough Woods': 'elfwood', 'Silverbough Fortress': 'elfwood', 'Glimmer Vale': 'elfwood',
  // dwarven mines under Stonedeep
  'Stonedeep Mines': 'mines', 'Deep Delvings': 'mines',
  // ice caves
  'Crystal Mines': 'icecave', 'Crystal Depths': 'icecave', 'Jotun Isle@-1': 'icecave',
  // dragon lairs
  'Dragon Lair': 'dragon', 'Dragonspire Plateau': 'dragon', 'The Caldera': 'dragon', 'Frost Dragon Lair': 'dragon',
  // jungle and lizard temples
  'Lizard Temple': 'serpent', 'Temple Undercroft': 'serpent', 'Scalemire Sanctum': 'serpent', 'Temple of the Sunken Eye': 'serpent',
  // swamps and mires (the caves under them too)
  'Hydra Bog': 'swamp', 'Mire Caves': 'swamp', 'Hydra Nest': 'swamp', 'Mangrove Mire': 'swamp',
  // desert tombs
  'Valley of Tombs': 'tomb', 'Pyramid of Kesh': 'tomb', 'Tomb of Kesh': 'tomb', 'Kesh Catacombs': 'tomb', "Pharaoh's Vault": 'tomb',
  // fire under the earth
  Emberhold: 'volcano', 'Burning Catacombs': 'volcano', 'Abyssal Halls': 'volcano', 'The Demon Pit': 'volcano', 'Infernal Rift': 'volcano', 'Ember Forge': 'volcano',
  // ruins of the dead in the open
  'Ruins of Varkh': 'crypt', 'Bonecrag@0': 'crypt',
  // smugglers' sea cave
  "Smugglers' Cove": 'sea',
  // the tutorial isle outside the refuge
  "Wayfarer's Isle@0": 'isle',
};

/** Underground regions that are tombs and haunts of the dead. */
const CRYPT_NAMES = /crypt|catacomb|tomb|vault|undercroft|bonecrag|abyssal/i;
/** Plains of the Gravewind Steppe (and the Silk Throne inside it). */
const STEPPE_NAMES = /gravewind|silk throne/i;
/** Boss music within this many tiles (any direction, same floor) of a dungeon boss's lair. */
export const BOSS_RADIUS = 7;
/** The spawn city with the Temple Court plaza. */
const COURT_TOWN = 'Thornvale';

export class PlaceFinder {
  private readonly bosses: Array<{ x: number; y: number; z: number }>;
  private readonly court: { x0: number; y0: number; x1: number; y1: number } | null;

  constructor(private readonly world: WorldMap) {
    const kinds = new Set<string>(DUNGEON_BOSSES.map((b) => b.kind));
    this.bosses = world.spawns.filter((s) => kinds.has(s.kind)).map((s) => ({ x: s.x, y: s.y, z: s.z }));
    const r = world.regions.find((g) => g.name === COURT_TOWN);
    this.court = r ? { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 } : null;
  }

  /** The place for a tile (the player's position, sampled about once a second). */
  placeAt(x: number, y: number, z: number): Place {
    const w = this.world;
    const safe = w.isSafe(x, y, z);
    // inside a town building
    const house = w.houseAt(x, y, z);
    if (house && safe) return indoorPlace(house.name);
    // a dungeon boss's lair (Ulmaroth's in the Sunken Reach too)
    if (!safe && this.bosses.some((b) => b.z === z && Math.abs(b.x - x) <= BOSS_RADIUS && Math.abs(b.y - y) <= BOSS_RADIUS)) return 'boss';
    // the sea floor of the Sunken Reach (Pearl Grotto too)
    if (inSeaBox(x, y, z) && w.getGround(x, y, z) !== Ground.Void) return 'reach';
    const name = w.regionAt(x, y, z)?.name ?? '';
    const c = this.court;
    if (z >= 0 && c && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return /graveyard/i.test(name) ? 'crypt' : 'court';
    if (safe) return townTheme(name) ?? 'town';
    const theme = REGION_THEMES[`${name}@${z}`] ?? REGION_THEMES[name];
    if (theme) return theme;
    if (z < 0) {
      const land = this.surroundings(x, y, z);
      if (land === 'volcano') return 'volcano';
      return CRYPT_NAMES.test(name) ? 'crypt' : 'deep';
    }
    if (STEPPE_NAMES.test(name)) return 'steppe';
    if (/graveyard/i.test(name)) return 'crypt';
    return this.surroundings(x, y, z);
  }

  /** The kind of land within 4 tiles: snow, lava, sand, jungle, swamp, forest or water when they dominate. */
  surroundings(cx: number, cy: number, z: number): Place {
    const w = this.world;
    let snow = 0, hot = 0, sand = 0, wild = 0, bog = 0, wood = 0, water = 0, n = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const gr = w.getGround(cx + dx, cy + dy, z);
        if (gr === Ground.Void) continue;
        n++;
        if (gr === Ground.Snow || gr === Ground.Ice) snow++;
        else if (gr === Ground.Lava || gr === Ground.Ash) hot++;
        else if (gr === Ground.Sand) sand++;
        else if (gr === Ground.Jungle) wild++;
        else if (gr === Ground.Swamp) bog++;
        else if (gr === Ground.DarkGrass) wood++;
        else if (gr === Ground.Water || gr === Ground.DeepWater || gr === Ground.Seabed) water++;
      }
    }
    if (!n) return 'fields';
    if (snow / n >= 0.25) return 'snow';
    if (hot / n >= 0.2) return 'volcano';
    if (sand / n >= 0.35) return 'desert';
    if (bog / n >= 0.3) return 'swamp';
    if (wild / n >= 0.3 || (wild + bog) / n >= 0.35) return 'jungle';
    if (water / n >= 0.4) return 'sea';
    if (wood / n >= 0.35) return 'forest';
    return 'fields';
  }
}

/** Coming back to a place after at least this long plays its next track. */
export const REROTATE_MS = 45_000;

/**
 * Takes turns between the tracks of a place. `enter` is called when the music moves to a place,
 * `advance` when the playing track has reached its end.
 */
export class MusicPicker {
  private readonly turn = new Map<Place, number>();
  private readonly left = new Map<Place, number>();
  private place: Place | null = null;

  /** The track for `place` when the music moves there at `now` (ms). Battle never counts as leaving. */
  enter(place: Place, now: number): Track {
    if (place === 'battle') return 'battle';
    if (place !== this.place) {
      if (this.place) this.left.set(this.place, now);
      const away = this.left.get(place);
      if (away !== undefined && now - away >= REROTATE_MS) this.bump(place);
      this.place = place;
    }
    return this.track(place);
  }

  /** The playing track of `place` ended: the next one (the same one when the place has only one). */
  advance(place: Place): Track {
    this.bump(place);
    return this.track(place);
  }

  /** The track `place` is on now. */
  track(place: Place): Track {
    const list = PLACE_TRACKS[place];
    return list[(this.turn.get(place) ?? 0) % list.length];
  }

  private bump(place: Place): void {
    this.turn.set(place, (this.turn.get(place) ?? 0) + 1);
  }
}
