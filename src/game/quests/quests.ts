import type { EnemyKind } from '../world/WorldMap';
import type { ItemStack } from '../inventory/items';

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  /** Any of these monsters count. */
  targets: EnemyKind[];
  /** Words used in progress messages. */
  targetName: string;
  count: number;
  requires: string | null;
  minLevel?: number;
  offer: string;
  progress: string;
  complete: string;
  rewardExp: number;
  rewardItems: ItemStack[];
}

export const QUESTS: QuestDef[] = [
  {
    id: 'vermin', title: 'Vermin in the Fields', giver: 'aldric', targets: ['rat'], targetName: 'rats', count: 6, requires: null,
    offer: "Rats have overrun Miller's farm east of the plaza and they're into the grain stores. Slay six of them and I'll see you paid.",
    progress: 'The rats still swarm the farm. Come back when you have slain six.',
    complete: "Six fewer mouths on the grain! Here's your pay, and a couple of potions for the road.",
    rewardExp: 120, rewardItems: [{ id: 'gold', qty: 40 }, { id: 'health_potion', qty: 2 }, { id: 'backpack', qty: 1 }],
  },
  {
    id: 'restless', title: 'The Restless Dead', giver: 'aldric', targets: ['skeleton'], targetName: 'skeletons', count: 4, requires: 'vermin',
    offer: 'The dead in the old graveyard south-west of the plaza are walking. Put four skeletons back in the ground and my old kite shield is yours.',
    progress: 'The graveyard is still restless. Four skeletons.',
    complete: 'The dead lie quiet again. Take my shield — it served me well at the Pass of Greywood.',
    rewardExp: 450, rewardItems: [{ id: 'gold', qty: 120 }, { id: 'iron_shield', qty: 1 }, { id: 'rope', qty: 1 }],
  },
  {
    id: 'grimtusk', title: 'Tusks of Grimtusk', giver: 'aldric', targets: ['orc', 'orc_spearman', 'orc_warrior', 'orc_berserker', 'orc_shaman', 'orc_leader'], targetName: 'orcs', count: 15, requires: 'restless', minLevel: 8,
    offer: 'Orcs hold a fortress north-west of here — Grimtusk Fortress. Their raiders grow bolder each week. Cut down fifteen of them and I will give you Frostbrand, the blade my father carried.',
    progress: 'Grimtusk still stands strong. Fifteen orcs.',
    complete: 'Fifteen orcs! They will think twice before raiding us. Frostbrand is yours — keep its edge clean.',
    rewardExp: 2500, rewardItems: [{ id: 'gold', qty: 400 }, { id: 'frostbrand', qty: 1 }],
  },
  {
    id: 'warlord', title: 'Head of the Horde', giver: 'aldric', targets: ['orc_warlord'], targetName: 'orc warlords', count: 1, requires: 'grimtusk', minLevel: 25,
    offer: 'Their warlord hides in the chambers beneath the Grimtusk keep. Go down there and end him.',
    progress: 'The warlord still lives beneath the keep.',
    complete: 'The horde is broken. Thornvale owes you more than gold — but gold is what I have.',
    rewardExp: 6000, rewardItems: [{ id: 'gold', qty: 1500 }, { id: 'ring_of_might', qty: 1 }],
  },
  {
    id: 'wings', title: 'Wings of Ruin', giver: 'aldric', targets: ['dragon'], targetName: 'dragons', count: 3, requires: 'warlord', minLevel: 35,
    offer: 'Smoke rises from Cinderreach beyond the eastern mountains. Dragons nest there, and something older dwells in the Caldera. Slay three dragons.',
    progress: 'Three dragons. Bring potions, and stay out of the fire.',
    complete: 'You have done what no one in Thornvale dared. Take this mail of dragon scale, Dragonslayer.',
    rewardExp: 12000, rewardItems: [{ id: 'gold', qty: 3000 }, { id: 'dragon_scale_mail', qty: 1 }],
  },
  {
    id: 'abyss', title: 'Into the Abyss', giver: 'aldric', targets: ['demon'], targetName: 'demons', count: 1, requires: 'wings', minLevel: 80,
    offer: 'Beneath the Ruins of Varkh, south-west of town, stairs lead down into the earth — four floors down, they say, demons walk. Prove it. Slay one.',
    progress: 'The abyss is still open. One demon.',
    complete: 'By the light… you came back. Take the King\'s Edge. No one deserves it more.',
    rewardExp: 50000, rewardItems: [{ id: 'gold', qty: 20000 }, { id: 'kings_edge', qty: 1 }],
  },
  {
    id: 'silverbough', title: 'Trouble in Silverbough', giver: 'brann', targets: ['elf', 'elf_scout', 'elf_arcanist'], targetName: 'elves', count: 12, requires: null, minLevel: 12,
    offer: 'The elves of Silverbough Fortress shoot anyone who comes near the north-east woods. Thin their ranks — twelve of them — and the road stays open.',
    progress: 'Twelve elves, and mind the archers on the platforms.',
    complete: 'The road is quiet again. Here — elven make, taken from one of their scouts.',
    rewardExp: 3500, rewardItems: [{ id: 'gold', qty: 800 }, { id: 'composite_bow', qty: 1 }, { id: 'traveler_boots', qty: 1 }],
  },
  {
    id: 'warden', title: 'The Grove Warden', giver: 'brann', targets: ['elf_warden'], targetName: 'elf wardens', count: 1, requires: 'silverbough', minLevel: 30,
    offer: 'Their warden commands from the high platforms in the heart of the fortress. Bring him down.',
    progress: 'The warden still watches from the canopy.',
    complete: 'Without their warden the elves will scatter. Take this circlet, and my thanks.',
    rewardExp: 8000, rewardItems: [{ id: 'gold', qty: 1500 }, { id: 'elven_circlet', qty: 1 }],
  },
  {
    id: 'crocs', title: 'Snapping Jaws', giver: 'tomas', targets: ['crocodile'], targetName: 'crocodiles', count: 8, requires: null, minLevel: 20,
    offer: 'The river crocodiles take a fisherman every month. Eight of them, and I will tell you where the hydras nest.',
    progress: 'The river is still full of teeth. Eight crocodiles.',
    complete: 'Good. Listen: the hydras nest in the Mire Caves — east of town, down through the old temple ruins.',
    rewardExp: 3000, rewardItems: [{ id: 'gold', qty: 600 }, { id: 'strong_health_potion', qty: 5 }],
  },
  {
    id: 'hydras', title: 'Seven Heads, One Hunter', giver: 'tomas', targets: ['hydra'], targetName: 'hydras', count: 5, requires: 'crocs', minLevel: 45,
    offer: 'The hydras killed my brother. Five of them, from the Mire Caves. Then I can rest.',
    progress: 'Five hydras. Fire hurts them more than you would think.',
    complete: 'Five… thank you, hunter. Take the legs I had made from the first one I ever killed.',
    rewardExp: 20000, rewardItems: [{ id: 'gold', qty: 5000 }, { id: 'hydra_legs', qty: 1 }, { id: 'frost_pendant', qty: 1 }],
  },
];

export interface QuestProgress {
  status: QuestStatus;
  kills: number;
}

export class QuestLog {
  state: Record<string, QuestProgress> = {};

  constructor() {
    this.reset();
  }

  reset(): void {
    this.state = {};
    for (const q of QUESTS) this.state[q.id] = { status: q.requires ? 'locked' : 'available', kills: 0 };
  }

  get(id: string): QuestProgress {
    return this.state[id];
  }

  onKill(kind: EnemyKind): QuestDef[] {
    const changed: QuestDef[] = [];
    for (const q of QUESTS) {
      const s = this.state[q.id];
      if (s.status === 'active' && q.targets.includes(kind)) {
        s.kills = Math.min(q.count, s.kills + 1);
        if (s.kills >= q.count) s.status = 'ready';
        changed.push(q);
      }
    }
    return changed;
  }

  accept(id: string): boolean {
    const s = this.state[id];
    if (!s || s.status !== 'available') return false;
    s.status = 'active';
    s.kills = 0;
    return true;
  }

  complete(id: string): boolean {
    const s = this.state[id];
    if (!s || s.status !== 'ready') return false;
    s.status = 'done';
    for (const q of QUESTS) {
      if (q.requires === id && this.state[q.id].status === 'locked') this.state[q.id].status = 'available';
    }
    return true;
  }

  load(data: Record<string, QuestProgress>): void {
    this.reset();
    for (const q of QUESTS) {
      const d = data?.[q.id];
      if (d && ['locked', 'available', 'active', 'ready', 'done'].includes(d.status)) {
        this.state[q.id] = { status: d.status, kills: Math.max(0, Math.min(q.count, d.kills | 0)) };
      }
    }
    // unlock follow-ups of quests completed before they existed
    for (const q of QUESTS) {
      if (q.requires && this.state[q.requires]?.status === 'done' && this.state[q.id].status === 'locked') this.state[q.id].status = 'available';
    }
  }
}
