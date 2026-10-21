import { ITEMS } from '../inventory/items';
import type { Inventory } from '../inventory/Inventory';
import { SPELLS, type SpellId } from '../magic/spells';
import type { Vocation } from '../player/vocations';
import { QUESTS, type QuestLog } from '../quests/quests';
import { buyPrice, NPCS } from './npcs';

export interface DialogueOption {
  label: string;
  action: string;
  disabled?: boolean;
}

export type DialoguePage = 'root' | 'trade' | 'bank' | 'spells' | `offer:${string}`;

export interface DialogueState {
  npcId: number;
  npcKey: string;
  npcName: string;
  page: DialoguePage;
  text: string;
}

export interface ShopView {
  sells: Array<{ id: string; price: number }>;
  buys: Array<{ id: string; price: number; have: number }>;
  gold: number;
}

export interface SpellOffer {
  id: SpellId;
  price: number;
  known: boolean;
  allowed: boolean;
  level: number;
}

export interface DialogueView {
  npcName: string;
  role: string;
  text: string;
  page: DialoguePage;
  options: DialogueOption[];
  shop?: ShopView;
  bank?: { balance: number; gold: number };
  spells?: SpellOffer[];
}

export interface DialogueContext {
  quests: QuestLog;
  inventory: Inventory;
  bank: number;
  level: number;
  vocation: Vocation;
  knownSpells: Set<string>;
}

/** Builds the current dialogue page from NPC data and the player's state. */
export function buildDialogue(d: DialogueState, ctx: DialogueContext): DialogueView {
  const npc = NPCS[d.npcKey];
  const options: DialogueOption[] = [];
  const view: DialogueView = { npcName: d.npcName, role: npc?.role ?? '', text: d.text, page: d.page, options };
  if (!npc) return view;
  const gold = ctx.inventory.count('gold');

  if (d.page === 'root') {
    if (npc.quests) {
      const mine = QUESTS.filter((q) => q.giver === npc.key);
      for (const q of mine) {
        if (ctx.quests.get(q.id).status === 'ready') options.push({ label: `The task is done. (${q.title})`, action: `turnin:${q.id}` });
      }
      const available = mine.find((q) => ctx.quests.get(q.id).status === 'available');
      if (available) options.push({ label: 'Do you have any work for me?', action: `page:offer:${available.id}` });
      for (const q of mine) {
        const s = ctx.quests.get(q.id);
        if (s.status === 'active') options.push({ label: `About "${q.title}" (${s.kills}/${q.count})…`, action: `progress:${q.id}` });
      }
    }
    if (npc.sells?.length || npc.buys?.length) options.push({ label: 'Let us trade.', action: 'page:trade' });
    if (npc.bank) options.push({ label: 'I would like to bank.', action: 'page:bank' });
    for (const t of npc.travel ?? []) options.push({ label: `Take me to ${t.name} (${t.price} gold).`, action: `travel:${t.key}`, disabled: gold < t.price });
    if (npc.spells?.length) options.push({ label: 'Teach me spells.', action: 'page:spells' });
    options.push({ label: 'Farewell.', action: 'bye' });
  } else if (d.page === 'trade') {
    view.shop = {
      sells: (npc.sells ?? []).map((e) => ({ id: e.id, price: e.price })),
      buys: (npc.buys ?? []).filter((id) => ITEMS[id] && buyPrice(id) > 0).map((id) => ({ id, price: buyPrice(id), have: ctx.inventory.count(id) })),
      gold,
    };
    const loot = view.shop.buys.filter((b) => b.have > 0 && ITEMS[b.id].kind === 'material');
    if (loot.length) {
      const value = loot.reduce((n, b) => n + b.price * b.have, 0);
      options.push({ label: `Sell all my loot — ${value} gold`, action: 'sellLoot' });
    }
    options.push({ label: 'Back.', action: 'page:root' });
  } else if (d.page === 'bank') {
    view.bank = { balance: ctx.bank, gold };
    options.push({ label: 'Deposit all my gold.', action: 'deposit:all', disabled: gold <= 0 });
    options.push({ label: 'Withdraw 100 gold.', action: 'withdraw:100', disabled: ctx.bank < 100 });
    options.push({ label: 'Withdraw 1000 gold.', action: 'withdraw:1000', disabled: ctx.bank < 1000 });
    options.push({ label: 'Withdraw everything.', action: 'withdraw:all', disabled: ctx.bank <= 0 });
    options.push({ label: 'Back.', action: 'page:root' });
  } else if (d.page === 'spells') {
    view.spells = (npc.spells ?? []).map((id) => {
      const sp = SPELLS[id];
      return { id, price: sp.price, known: ctx.knownSpells.has(id), allowed: sp.vocations.includes(ctx.vocation), level: sp.level };
    });
    options.push({ label: 'Back.', action: 'page:root' });
  } else if (d.page.startsWith('offer:')) {
    const id = d.page.slice(6);
    const q = QUESTS.find((x) => x.id === id);
    const tooLow = !!q?.minLevel && ctx.level < q.minLevel;
    options.push({ label: tooLow ? `I accept. (needs level ${q!.minLevel})` : 'I accept.', action: `accept:${id}`, disabled: tooLow });
    options.push({ label: 'Not now.', action: 'page:root' });
  }
  return view;
}
