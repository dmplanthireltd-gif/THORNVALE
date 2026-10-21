/**
 * Premium accounts and founder packs (render-agnostic rules and data).
 *
 * Premium belongs to an account (Supabase Auth user), so every character on it
 * shares it. It sells access and comfort, never power: the far regions, more
 * depot space and market offers, a seat when the server is full, faster
 * regeneration out of combat and two extra outfits. Founder packs add premium
 * days plus looks (title, cloak, an outfit), never stats.
 *
 * Nothing here ever deletes anything when premium ends: characters in a
 * premium region are walked back to a free temple, overfull depots keep every
 * item (only new items wait until there is room again).
 */
import { FERRIES, TOWNS } from '../world/townList';
import { ISLE_DEST } from '../world/tutorialIsle';
import { Ground, type WorldMap } from '../world/WorldMap';

// ------------------------------------------------------------------ limits

/** Depot slots: free accounts can fill this many… */
export const FREE_DEPOT_SLOTS = 60;
/** …premium accounts this many (the depot list always has room for the larger number). */
export const PREMIUM_DEPOT_SLOTS = 120;
/** Market offers at once (free / premium). */
export const FREE_MARKET_OFFERS = 20;
export const PREMIUM_MARKET_OFFERS = 40;
/** Out-of-combat regeneration multiplier for premium (never in a fight, never while PZ-locked). */
export const PREMIUM_REGEN = 1.5;
/** Share of the player limit kept for premium accounts when the server is nearly full. */
export const PREMIUM_RESERVED_SHARE = 0.1;
/** Players are warned in game when premium has less than this left. */
export const PREMIUM_WARN_MS = 3 * 24 * 3600 * 1000;

/** The heartland: these towns (and the land around them) are free forever. */
export const FREE_TOWNS = ['thornvale', 'westmarch', 'elderglen', 'stonedeep', 'highmoor', 'millbrook'] as const;

// ------------------------------------------------------------------ dates (UK winter time = UTC)

/** Grand opening: founder premium starts here (or at purchase, if later). */
export const LAUNCH_AT = Date.UTC(2027, 0, 1, 0, 0, 0);
/** Founder packs are sold in this window only. */
export const FOUNDER_SALE_FROM = Date.UTC(2026, 11, 1, 0, 0, 0);
export const FOUNDER_SALE_UNTIL = Date.UTC(2027, 1, 1, 0, 0, 0);
/** Numbered Legend packs on sale (the store hides the pack when they are gone). */
export const LEGEND_CAP = 300;

// ------------------------------------------------------------------ founder tiers

export type FounderTier = 'wayfarer' | 'warden' | 'legend';
export type CloakId = 'ember' | 'gold' | 'crimson';

export interface TierInfo {
  name: string;
  rank: number;
  cloak: CloakId;
  /** Extra character slots on the account. */
  extraSlots: number;
  /** May wear the founder-only Warden outfit. */
  wardenOutfit: boolean;
}

export const FOUNDER_TIERS: Record<FounderTier, TierInfo> = {
  wayfarer: { name: 'Wayfarer', rank: 1, cloak: 'ember', extraSlots: 0, wardenOutfit: false },
  warden: { name: 'Warden', rank: 2, cloak: 'gold', extraSlots: 1, wardenOutfit: true },
  legend: { name: 'Legend', rank: 3, cloak: 'crimson', extraSlots: 2, wardenOutfit: true },
};

export function isFounderTier(t: unknown): t is FounderTier {
  return t === 'wayfarer' || t === 'warden' || t === 'legend';
}

/** The better of two tiers (null = none). */
export function bestTier(a: FounderTier | null, b: FounderTier | null): FounderTier | null {
  if (!a) return b;
  if (!b) return a;
  return FOUNDER_TIERS[a].rank >= FOUNDER_TIERS[b].rank ? a : b;
}

/** Title shown under the name and in the Inspect window. */
export function founderTitle(tier: FounderTier | null, no = 0): string {
  if (tier === 'legend') return no > 0 ? `Legend #${String(no).padStart(3, '0')}` : 'Legend';
  if (tier === 'warden') return 'Founder Warden';
  if (tier === 'wayfarer') return 'Founder';
  return '';
}

/** Cloak colours (main, trim), used by the renderer and icons. */
export const CLOAK_LOOK: Record<CloakId, { main: number; trim: number; name: string }> = {
  ember: { main: 0xc8642a, trim: 0x5a2a12, name: 'Ember cloak' },
  gold: { main: 0xd9b45a, trim: 0x6a4a1a, name: 'Gold cloak' },
  crimson: { main: 0x8a1c22, trim: 0xe3c27a, name: 'Crimson and gold cloak' },
};

// ------------------------------------------------------------------ products

export type ProductId =
  | 'premium_30' | 'premium_90' | 'premium_180' | 'premium_365'
  | 'founder_wayfarer' | 'founder_warden' | 'founder_legend'
  | 'upgrade_wayfarer_warden' | 'upgrade_wayfarer_legend' | 'upgrade_warden_legend';

export interface Product {
  id: ProductId;
  name: string;
  kind: 'premium' | 'founder' | 'upgrade';
  /** Premium days it adds. */
  days: number;
  /** Founder tier it gives (founder packs and upgrades). */
  tier?: FounderTier;
  /** Upgrades: the tier you move up from. */
  from?: FounderTier;
  /** Shown price in pence (the payment company charges the price set there). */
  pence: number;
}

export const PRODUCTS: Record<ProductId, Product> = {
  premium_30: { id: 'premium_30', name: 'Premium, 30 days', kind: 'premium', days: 30, pence: 599 },
  premium_90: { id: 'premium_90', name: 'Premium, 90 days', kind: 'premium', days: 90, pence: 1599 },
  premium_180: { id: 'premium_180', name: 'Premium, 180 days', kind: 'premium', days: 180, pence: 2999 },
  premium_365: { id: 'premium_365', name: 'Premium, 365 days', kind: 'premium', days: 365, pence: 5499 },
  founder_wayfarer: { id: 'founder_wayfarer', name: 'Founder Pack: Wayfarer', kind: 'founder', days: 60, tier: 'wayfarer', pence: 999 },
  founder_warden: { id: 'founder_warden', name: 'Founder Pack: Warden', kind: 'founder', days: 180, tier: 'warden', pence: 2499 },
  founder_legend: { id: 'founder_legend', name: 'Founder Pack: Legend', kind: 'founder', days: 365, tier: 'legend', pence: 4999 },
  upgrade_wayfarer_warden: { id: 'upgrade_wayfarer_warden', name: 'Upgrade: Wayfarer to Warden', kind: 'upgrade', days: 120, tier: 'warden', from: 'wayfarer', pence: 1500 },
  upgrade_wayfarer_legend: { id: 'upgrade_wayfarer_legend', name: 'Upgrade: Wayfarer to Legend', kind: 'upgrade', days: 305, tier: 'legend', from: 'wayfarer', pence: 4000 },
  upgrade_warden_legend: { id: 'upgrade_warden_legend', name: 'Upgrade: Warden to Legend', kind: 'upgrade', days: 185, tier: 'legend', from: 'warden', pence: 2500 },
};

export function isProductId(x: unknown): x is ProductId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(PRODUCTS, x);
}

/**
 * When the premium days of a purchase start counting. Founder days never start
 * before opening day, so nobody spends them while the server is still in testing.
 */
export function premiumStart(p: Product, now: number, launchAt = LAUNCH_AT): number {
  return p.kind === 'premium' ? now : Math.max(now, launchAt);
}

/** New premium end after adding a purchase: days go on top of whatever is left. */
export function extendPremium(currentUntil: number, p: Product, now: number, launchAt = LAUNCH_AT): number {
  return Math.max(currentUntil, premiumStart(p, now, launchAt)) + p.days * 24 * 3600 * 1000;
}

/** What one account has (stored in the `account_perks` table). */
export interface AccountPerks {
  /** Premium until this wall-clock time in ms (0 = never had any). */
  premiumUntil: number;
  founderTier: FounderTier | null;
  /** Legend number (1–LEGEND_CAP), 0 otherwise. */
  founderNo: number;
  /** Extra character slots on top of the server's normal limit. */
  extraSlots: number;
  /** Name shown on the website's Founders page and the Founders' Stone. */
  founderName: string;
  /** Set when a chargeback came in, so the owner can have a look. */
  flagged: boolean;
}

export const NO_PERKS: AccountPerks = { premiumUntil: 0, founderTier: null, founderNo: 0, extraSlots: 0, founderName: '', flagged: false };

// ------------------------------------------------------------------ outfits

/** Outfits only premium accounts may wear. */
export const PREMIUM_OUTFITS = ['warlord', 'mystic'] as const;
/** Founder-only outfit (Warden and Legend packs). */
export const FOUNDER_OUTFITS = ['warden'] as const;

// ------------------------------------------------------------------ the map

/**
 * Which tiles are premium land. The six free towns share the central continent;
 * every other town is on its own island or continent, reached by ship. Land is
 * every surface tile that is not deep sea (rivers and shallows join their
 * island), each island is free when a free town or a free town's ferry is on it,
 * and sea and underground tiles belong to the nearest island.
 */
export class PremiumZone {
  private readonly premium: Uint8Array;

  constructor(private readonly width: number, private readonly height: number, premium: Uint8Array) {
    this.premium = premium;
  }

  static build(world: WorldMap): PremiumZone {
    const W = world.width, H = world.height;
    const f = world.floor(0);
    const zone = new Uint8Array(W * H);
    if (!f) return new PremiumZone(W, H, zone);
    const label = new Int32Array(W * H).fill(-1);
    const queue = new Int32Array(W * H);
    let islands = 0;
    for (let i = 0; i < W * H; i++) {
      if (label[i] !== -1 || f.ground[i] === Ground.DeepWater) continue;
      let head = 0, tail = 0;
      queue[tail++] = i;
      label[i] = islands;
      while (head < tail) {
        const c = queue[head++];
        const x = c % W, y = (c / W) | 0;
        if (x > 0) tail = visitLand(c - 1, islands, f.ground, label, queue, tail);
        if (x < W - 1) tail = visitLand(c + 1, islands, f.ground, label, queue, tail);
        if (y > 0) tail = visitLand(c - W, islands, f.ground, label, queue, tail);
        if (y < H - 1) tail = visitLand(c + W, islands, f.ground, label, queue, tail);
      }
      islands++;
    }
    const free = new Set<number>();
    const mark = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] >= 0) free.add(label[y * W + x]);
    };
    for (const t of TOWNS) if ((FREE_TOWNS as readonly string[]).includes(t.key)) mark(t.x, t.y);
    // the tutorial island is free land: every new character starts there
    const isle = world.destinations[ISLE_DEST];
    if (isle) mark(isle.x, isle.y);
    for (const fr of FERRIES) {
      const d = world.destinations[fr.key];
      if (d && (FREE_TOWNS as readonly string[]).includes(fr.home)) mark(d.x, d.y);
    }
    // sea tiles take the label of the nearest island (breadth-first from every coast at once)
    let head = 0, tail = 0;
    for (let i = 0; i < W * H; i++) if (label[i] >= 0) queue[tail++] = i;
    while (head < tail) {
      const c = queue[head++];
      const x = c % W, y = (c / W) | 0;
      const l = label[c];
      if (x > 0 && label[c - 1] < 0) { label[c - 1] = l; queue[tail++] = c - 1; }
      if (x < W - 1 && label[c + 1] < 0) { label[c + 1] = l; queue[tail++] = c + 1; }
      if (y > 0 && label[c - W] < 0) { label[c - W] = l; queue[tail++] = c - W; }
      if (y < H - 1 && label[c + W] < 0) { label[c + W] = l; queue[tail++] = c + W; }
    }
    for (let i = 0; i < W * H; i++) zone[i] = label[i] >= 0 && !free.has(label[i]) ? 1 : 0;
    return new PremiumZone(W, H, zone);
  }

  /** True when this tile (any floor) is premium land. */
  premiumAt(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.premium[y * this.width + x] === 1;
  }
}

function visitLand(j: number, l: number, ground: Uint8Array, label: Int32Array, queue: Int32Array, tail: number): number {
  if (label[j] !== -1 || ground[j] === Ground.DeepWater) return tail;
  label[j] = l;
  queue[tail] = j;
  return tail + 1;
}
