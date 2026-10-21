import type { Game } from '../Game';

const KEY = 'thornvale.save.v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Thin persistence layer over localStorage (or any key/value store). */
export class SaveSystem {
  constructor(private readonly store: KeyValueStore | null = SaveSystem.defaultStore()) {}

  static defaultStore(): KeyValueStore | null {
    try {
      const s = (globalThis as { localStorage?: KeyValueStore }).localStorage;
      if (!s) return null;
      const probe = '__thornvale_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch {
      return null;
    }
  }

  get available(): boolean {
    return this.store !== null;
  }

  hasSave(): boolean {
    try {
      return !!this.store?.getItem(KEY);
    } catch {
      return false;
    }
  }

  savedAt(): number | null {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as { savedAt?: number };
      return typeof d.savedAt === 'number' ? d.savedAt : null;
    } catch {
      return null;
    }
  }

  /** Who is saved here, without loading the game. */
  peek(): { name: string; level: number; vocation: string } | null {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as { player?: { name?: unknown; level?: unknown; vocation?: unknown } };
      const p = d.player;
      if (!p) return null;
      return {
        name: typeof p.name === 'string' ? p.name : 'Adventurer',
        level: typeof p.level === 'number' ? p.level : 1,
        vocation: typeof p.vocation === 'string' ? p.vocation : 'knight',
      };
    } catch {
      return null;
    }
  }

  save(game: Game, pid: number): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(KEY, JSON.stringify(game.serialize(pid)));
      return true;
    } catch {
      return false;
    }
  }

  load(game: Game, pid: number): boolean {
    if (!this.store) return false;
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return false;
      return game.applySave(pid, JSON.parse(raw), { resetWorld: true });
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.store?.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
