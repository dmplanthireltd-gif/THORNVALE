import type { Element } from '../inventory/items';
import type { BuffName } from '../player/Player';

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
  /** A spell shape that is not a circle (waves, beams, walls): flat list x0,y0,x1,y1… in order from the caster. */
  | { type: 'tiles'; z: number; tiles: number[]; effect: Effect }
  | { type: 'cast'; casterId: number; words: string }
  | { type: 'buff'; id: number; buff: BuffName; on: boolean }
  | { type: 'death'; id: number }
  | { type: 'spawn'; id: number }
  | { type: 'teleport'; id: number }
  /** Experience gained; `skill` names a gathering skill (otherwise character experience). */
  | { type: 'xp'; amount: number; atId: number; to: number; skill?: string }
  /** A player swings an axe at a tree; `got` = a log came loose, `felled` = the tree fell. */
  | { type: 'chop'; id: number; x: number; y: number; z: number; got: boolean; felled: boolean }
  /** A player casts a fishing line at a water tile; `got` = something bit and was landed. */
  | { type: 'fish'; id: number; x: number; y: number; z: number; got: boolean }
  /** A skill advanced (shown in the Skills panel). */
  | { type: 'skillUp'; skill: string; level: number; to: number }
  | { type: 'levelUp'; id: number; level: number }
  | { type: 'message'; text: string; kind: MessageKind; to: number }
  /** A pop-up from a game master that the player has to acknowledge. */
  | { type: 'adminNotice'; title: string; text: string; to: number }
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
  | { type: 'partyChanged'; to: number }
  | { type: 'friendsChanged'; to: number }
  | { type: 'spellsChanged'; to: number }
  | { type: 'marketChanged'; to: number }
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
