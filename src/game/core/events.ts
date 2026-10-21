import type { Element } from '../inventory/items';

/**
 * Game events emitted by the simulation. Rendering and UI subscribe to these;
 * the simulation never calls into rendering directly.
 *
 * Events carrying `to` concern one player only (their messages, backpack,
 * quests, dialogue). A multiplayer server routes those to that player and
 * broadcasts the rest.
 */
export type MessageKind = 'info' | 'combat' | 'loot' | 'quest' | 'warn' | 'level' | 'npc' | 'chat' | 'trade';

export type Effect =
  | 'physical' | 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy'
  | 'arrow' | 'bolt' | 'spear' | 'star' | 'stone' | 'heal' | 'haste' | 'shield' | 'light' | 'blood';

export type GameEvent =
  | { type: 'attack'; attackerId: number; targetId: number }
  | { type: 'damage'; targetId: number; sourceId: number; amount: number; result: 'hit' | 'miss' | 'blocked'; element: Element; manaShield?: number }
  | { type: 'heal'; targetId: number; amount: number }
  | { type: 'mana'; targetId: number; amount: number; to: number }
  | { type: 'projectile'; fromId: number; toId: number; effect: Effect }
  | { type: 'area'; x: number; y: number; z: number; radius: number; effect: Effect }
  | { type: 'cast'; casterId: number; words: string }
  | { type: 'buff'; id: number; buff: 'haste' | 'magicShield' | 'light' | 'berserk' | 'bullseye' | 'mastermind'; on: boolean }
  | { type: 'death'; id: number }
  | { type: 'spawn'; id: number }
  | { type: 'teleport'; id: number }
  | { type: 'xp'; amount: number; atId: number; to: number }
  | { type: 'levelUp'; id: number; level: number }
  | { type: 'message'; text: string; kind: MessageKind; to: number }
  | { type: 'chat'; id: number; name: string; text: string }
  | { type: 'bagCreated'; bagId: number; x: number; y: number; z: number }
  | { type: 'bagRemoved'; bagId: number }
  | { type: 'tileChanged'; x: number; y: number; z: number }
  | { type: 'playerJoined'; id: number }
  | { type: 'playerLeft'; id: number }
  | { type: 'playerRespawn'; id: number }
  | { type: 'inventoryChanged'; to: number }
  | { type: 'equipmentChanged'; id: number }
  | { type: 'outfitChanged'; id: number }
  | { type: 'questChanged'; to: number }
  | { type: 'dialogueClosed'; to: number }
  | { type: 'dialogueOpened'; npcId: number; to: number }
  | { type: 'depotChanged'; to: number }
  | { type: 'tradeChanged'; to: number }
  | { type: 'spellsChanged'; to: number }
  | { type: 'gameLoaded'; to: number };

type Listener = (e: GameEvent) => void;

export class EventBus {
  private listeners: Listener[] = [];
  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }
}

/** The player an event is private to, if any. */
export function eventRecipient(e: GameEvent): number | null {
  return 'to' in e ? e.to : null;
}
