/**
 * Every town of the world and the people who run it. Shared by the world
 * generator (which places them) and the NPC definitions (which give them
 * shops, banks and ships), so keys always match.
 */
export type StaffRole = 'smith' | 'mage' | 'outfit' | 'bank' | 'travel' | 'quest' | 'trainer';

export interface Staff {
  key: string;
  name: string;
}

export interface TownInfo {
  key: string;
  name: string;
  /** Rough centre, used for ship prices and quest text. */
  x: number;
  y: number;
  /** 'ship' for harbours, 'cart' for the inland mine-cart station. */
  travel: 'ship' | 'cart';
  staff: Partial<Record<StaffRole, Staff>> & { smith: Staff; mage: Staff; outfit: Staff; bank: Staff; travel: Staff };
  /** Short flavour for greetings. */
  flavour: string;
}

export const TOWNS: TownInfo[] = [
  {
    key: 'thornvale', name: 'Thornvale', x: 204, y: 312, travel: 'ship', flavour: 'the old village of Thornvale',
    staff: {
      smith: { key: 'brunhild', name: 'Brunhild' }, mage: { key: 'mirella', name: 'Mirella' }, outfit: { key: 'garrick', name: 'Garrick' },
      bank: { key: 'orwin', name: 'Orwin' }, travel: { key: 'hask', name: 'Ferryman Hask' }, quest: { key: 'aldric', name: 'Captain Aldric' },
      trainer: { key: 'elias', name: 'Master Elias' },
    },
  },
  {
    key: 'westmarch', name: 'Westmarch', x: 216, y: 492, travel: 'ship', flavour: 'the walled city of Westmarch',
    staff: {
      smith: { key: 'westmarch_smith', name: 'Gerda Ironhand' }, mage: { key: 'westmarch_mage', name: 'Quillon the Wise' },
      outfit: { key: 'westmarch_outfit', name: 'Rook' }, bank: { key: 'westmarch_bank', name: 'Ambrose' },
      travel: { key: 'westmarch_captain', name: 'Captain Wren' }, quest: { key: 'westmarch_marshal', name: 'Marshal Hale' },
      trainer: { key: 'westmarch_trainer', name: 'Sister Ilsa' },
    },
  },
  {
    key: 'elderglen', name: 'Elderglen', x: 428, y: 318, travel: 'ship', flavour: 'Elderglen under the old trees',
    staff: {
      smith: { key: 'elderglen_smith', name: 'Fennick' }, mage: { key: 'elderglen_mage', name: 'Lirael' },
      outfit: { key: 'elderglen_outfit', name: 'Thistle' }, bank: { key: 'elderglen_bank', name: 'Bramwell' },
      travel: { key: 'elderglen_captain', name: 'Captain Ashby' }, quest: { key: 'brann', name: 'Warden Brann' },
    },
  },
  {
    key: 'stonedeep', name: 'Stonedeep', x: 300, y: 366, travel: 'cart', flavour: 'the dwarf-halls of Stonedeep',
    staff: {
      smith: { key: 'stonedeep_smith', name: 'Durgan Anvilborn' }, mage: { key: 'stonedeep_mage', name: 'Runa Emberglass' },
      outfit: { key: 'stonedeep_outfit', name: 'Bolli' }, bank: { key: 'stonedeep_bank', name: 'Grimsby Coinwright' },
      travel: { key: 'stonedeep_carter', name: 'Hogni the Carter' }, quest: { key: 'stonedeep_thane', name: 'Thane Bardur' },
    },
  },
  {
    key: 'highmoor', name: 'Highmoor', x: 458, y: 428, travel: 'ship', flavour: 'the hill town of Highmoor',
    staff: {
      smith: { key: 'highmoor_smith', name: 'Edda' }, mage: { key: 'highmoor_mage', name: 'Corvin' },
      outfit: { key: 'highmoor_outfit', name: 'Pip Marlowe' }, bank: { key: 'highmoor_bank', name: 'Osric' },
      travel: { key: 'highmoor_captain', name: 'Captain Hollis' }, quest: { key: 'highmoor_reeve', name: 'Reeve Agatha' },
    },
  },
  {
    key: 'millbrook', name: 'Millbrook', x: 362, y: 506, travel: 'ship', flavour: 'the farming village of Millbrook',
    staff: {
      smith: { key: 'millbrook_smith', name: 'Barnaby' }, mage: { key: 'millbrook_mage', name: 'Mother Hesk' },
      outfit: { key: 'millbrook_outfit', name: 'Tobin' }, bank: { key: 'millbrook_bank', name: 'Wilma' },
      travel: { key: 'millbrook_captain', name: 'Skipper Nell' }, quest: { key: 'millbrook_elder', name: 'Elder Rowan' },
    },
  },
  {
    key: 'valdrheim', name: 'Valdrheim', x: 160, y: 48, travel: 'ship', flavour: 'Valdrheim of the frozen north',
    staff: {
      smith: { key: 'valdrheim_smith', name: 'Sigrun' }, mage: { key: 'valdrheim_mage', name: 'Eirik Runecarver' },
      outfit: { key: 'valdrheim_outfit', name: 'Ulla' }, bank: { key: 'valdrheim_bank', name: 'Hakon' },
      travel: { key: 'valdrheim_captain', name: 'Captain Bjarke' }, quest: { key: 'valdrheim_jarl', name: 'Jarl Ragnvald' },
    },
  },
  {
    key: 'aurelion', name: 'Aurelion', x: 392, y: 80, travel: 'ship', flavour: 'Aurelion, the crown city',
    staff: {
      smith: { key: 'aurelion_smith', name: 'Master Cassius' }, mage: { key: 'aurelion_mage', name: 'Archmage Velis' },
      outfit: { key: 'aurelion_outfit', name: 'Lucan' }, bank: { key: 'aurelion_bank', name: 'Lady Seraphine' },
      travel: { key: 'aurelion_captain', name: 'Admiral Corwin' }, quest: { key: 'aurelion_magistrate', name: 'High Magistrate Octavia' },
      trainer: { key: 'aurelion_trainer', name: 'Magister Doran' },
    },
  },
  {
    key: 'briarwatch', name: 'Briarwatch', x: 572, y: 152, travel: 'ship', flavour: 'the frontier town of Briarwatch',
    staff: {
      smith: { key: 'briarwatch_smith', name: 'Hedda' }, mage: { key: 'briarwatch_mage', name: 'Moss' },
      outfit: { key: 'briarwatch_outfit', name: 'Fletcher Ivo' }, bank: { key: 'briarwatch_bank', name: 'Penrose' },
      travel: { key: 'briarwatch_captain', name: 'Captain Selka' }, quest: { key: 'briarwatch_ranger', name: 'Ranger Kestrel' },
    },
  },
  {
    key: 'corvane', name: 'Corvane', x: 556, y: 318, travel: 'ship', flavour: 'the island town of Corvane',
    staff: {
      smith: { key: 'corvane_smith', name: 'Brega' }, mage: { key: 'corvane_mage', name: 'Ysolde' },
      outfit: { key: 'corvane_outfit', name: 'Nim' }, bank: { key: 'corvane_bank', name: 'Aldous' },
      travel: { key: 'corvane_captain', name: 'Captain Merrow' }, quest: { key: 'corvane_reeve', name: 'Reeve Tamsin' },
    },
  },
  {
    key: 'saltmere', name: 'Saltmere', x: 176, y: 684, travel: 'ship', flavour: 'Saltmere by the old ruins',
    staff: {
      smith: { key: 'saltmere_smith', name: 'Harrow' }, mage: { key: 'saltmere_mage', name: 'Sable' },
      outfit: { key: 'saltmere_outfit', name: 'Quint' }, bank: { key: 'saltmere_bank', name: 'Mercy' },
      travel: { key: 'saltmere_captain', name: 'Captain Dunmore' }, quest: { key: 'saltmere_abbot', name: 'Abbot Caelan' },
    },
  },
  {
    key: 'palmreach', name: 'Palmreach', x: 322, y: 690, travel: 'ship', flavour: 'Palmreach on the jungle delta',
    staff: {
      smith: { key: 'palmreach_smith', name: 'Oko' }, mage: { key: 'palmreach_mage', name: 'Nalani' },
      outfit: { key: 'zuri', name: 'Zuri' }, bank: { key: 'pell', name: 'Pell' },
      travel: { key: 'mara', name: 'Captain Mara' }, quest: { key: 'tomas', name: 'Old Tomas' },
    },
  },
  {
    key: 'sunspire', name: 'Sunspire', x: 536, y: 744, travel: 'ship', flavour: 'golden Sunspire of the dunes',
    staff: {
      smith: { key: 'sunspire_smith', name: 'Khepri' }, mage: { key: 'sunspire_mage', name: 'Nefer' },
      outfit: { key: 'sunspire_outfit', name: 'Sadiq' }, bank: { key: 'sunspire_bank', name: 'Imhotar' },
      travel: { key: 'sunspire_captain', name: 'Captain Rashid' }, quest: { key: 'sunspire_vizier', name: 'Vizier Amunet' },
    },
  },
  {
    key: 'dunewatch', name: 'Dunewatch', x: 572, y: 560, travel: 'ship', flavour: 'the desert outpost of Dunewatch',
    staff: {
      smith: { key: 'dunewatch_smith', name: 'Tariq' }, mage: { key: 'dunewatch_mage', name: 'Zahra' },
      outfit: { key: 'dunewatch_outfit', name: 'Faris' }, bank: { key: 'dunewatch_bank', name: 'Yusra' },
      travel: { key: 'dunewatch_captain', name: 'Captain Idris' }, quest: { key: 'dunewatch_sergeant', name: 'Sergeant Halima' },
    },
  },
];

/** Small ferry landings on islands without a town: key → boatman and the harbour it returns to. */
export const FERRIES: Array<{ key: string; name: string; npc: Staff; home: string }> = [
  { key: 'frostholm', name: 'Frostholm', npc: { key: 'ferry_frostholm', name: 'Boatman Geir' }, home: 'valdrheim' },
  { key: 'fernwick', name: 'Fernwick', npc: { key: 'ferry_fernwick', name: 'Boatwoman Lark' }, home: 'westmarch' },
  { key: 'cinder_isle', name: 'Cinder Isle', npc: { key: 'ferry_cinder', name: 'Boatman Ash' }, home: 'saltmere' },
  { key: 'gull_isle', name: 'Gull Isle', npc: { key: 'ferry_gull', name: 'Boatman Tern' }, home: 'corvane' },
  { key: 'cyclops_isle', name: 'Cyclops Isle', npc: { key: 'ferry_cyclops', name: 'Boatman Oskar' }, home: 'thornvale' },
  { key: 'bonecrag', name: 'Bonecrag', npc: { key: 'ferry_bonecrag', name: 'Boatman Grell' }, home: 'saltmere' },
  { key: 'dune_isles', name: 'Dune Isles', npc: { key: 'ferry_dunes', name: 'Boatman Sefu' }, home: 'sunspire' },
  { key: 'jotun_isle', name: 'Jotun Isle', npc: { key: 'ferry_jotun', name: 'Boatman Halvar' }, home: 'valdrheim' },
];

/** Ship fare between two places: grows with distance. */
export function fare(ax: number, ay: number, bx: number, by: number): number {
  return Math.round((40 + Math.hypot(ax - bx, ay - by) * 0.45) / 10) * 10;
}

export function townByKey(key: string): TownInfo | undefined {
  return TOWNS.find((t) => t.key === key);
}
