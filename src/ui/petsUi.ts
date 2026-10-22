import type { Controller } from '../client/Controller';
import { describeItem, itemDef } from '../game/inventory/items';
import { PET_DEFS, PET_MAX_LEVEL, petLevelForXp, petProgress, petXpForLevel, POUCH_SLOTS } from '../game/pets/petDefs';
import { activePet, petLevel } from '../game/pets/PetSystem';
import { button, el, paintSlot } from './dom';
import { itemIcon } from './icons';
import './pets.css';

const SHOW_KEY = 'thornvale.showPets';

/** Settings: draw other players' pets (default on; per browser). */
export function showOtherPets(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) !== '0';
  } catch {
    return true;
  }
}

function setShowOtherPets(on: boolean): void {
  try {
    localStorage.setItem(SHOW_KEY, on ? '1' : '0');
  } catch {
    /* storage off: the choice lasts until reload */
  }
}

const fmt = (n: number) => Math.floor(n).toLocaleString('en-GB');

/**
 * Pet HUD: a "Pet" line in the character panel while a pet is out (click it to open the pet
 * window), the pet window (level, experience, perk, send away, the tortoise pouch with 8 slots —
 * click an item to take it, drag backpack items onto the window to put them in), and a Settings
 * row to hide other players' pets. Every action is a `pet` command through the controller.
 */
export class PetsUi {
  private strip: HTMLElement | null = null;
  private win: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private key = '';
  private timer = 0;
  private settingsDone = false;
  private wasPouchOpen = false;

  constructor(private readonly ctl: Controller, private readonly hudRoot: HTMLElement) {
    this.win = el('div', 'window pet-win', hudRoot);
    this.win.hidden = true;
    const head = el('div', 'win-head', this.win);
    el('span', 'win-title', head, 'Pet');
    button(head, '✕', () => this.toggle(false), 'btn tiny');
    this.body = el('div', 'win-body', this.win);
    this.win.addEventListener('mousedown', () => { this.win.style.zIndex = '60'; });
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.win.hidden = !open;
    if (open) this.win.style.zIndex = '60';
    this.key = '';
    this.render();
  }

  update(dt: number): void {
    this.timer -= Math.max(0, dt);
    if (this.timer > 0) return;
    this.timer = 0.2;
    if (!this.settingsDone) this.addSettings();
    const s = this.ctl.game.session(this.ctl.pid);
    if (!s) return;
    // putting something in the pouch (or the server opening it) shows the window
    if (s.pets.pouchOpen && !this.wasPouchOpen && !this.open) this.toggle(true);
    this.wasPouchOpen = s.pets.pouchOpen;
    this.renderStrip();
    this.render();
  }

  /** The "Pet" line under the character's bars. */
  private renderStrip(): void {
    const s = this.ctl.game.session(this.ctl.pid)!;
    const d = activePet(s.pets);
    if (!this.strip) {
      const status = this.hudRoot.querySelector('.panel.status .status-foot') ?? this.hudRoot.querySelector('.panel.status');
      if (!status) return;
      this.strip = el('div', 'pet-strip', status as HTMLElement);
      this.strip.title = 'Your pet. Click to open the pet window.';
      this.strip.addEventListener('click', () => this.toggle());
    }
    this.strip.hidden = !d;
    if (!d) return;
    const text = `${d.name} · pet level ${petLevel(s.pets, d.id)}`;
    if (this.strip.dataset.text !== text) {
      this.strip.dataset.text = text;
      this.strip.replaceChildren();
      const img = el('img', 'pet-strip-icon', this.strip);
      img.src = itemIcon(d.item);
      img.alt = '';
      el('span', '', this.strip, text);
    }
  }

  private render(): void {
    if (!this.open) return;
    const s = this.ctl.game.session(this.ctl.pid);
    if (!s) return;
    const key = JSON.stringify([s.pets.active, s.pets.xp, s.pets.pouch]);
    if (key === this.key) return;
    this.key = key;
    const b = this.body;
    b.replaceChildren();
    const d = activePet(s.pets);
    if (!d) {
      el('p', 'hint', b, 'No pet is with you. Use a pet item from your backpack to call it.');
    } else {
      const lvl = petLevel(s.pets, d.id);
      const xp = s.pets.xp[d.id] ?? 0;
      const top = el('div', 'pet-head', b);
      const slot = el('div', 'slot pet-slot', top);
      paintSlot(slot, { id: d.item, qty: 1 });
      slot.title = `${describeItem(itemDef(d.item))}\nClick: send it back to your backpack.`;
      slot.addEventListener('click', () => this.ctl.send({ c: 'pet', a: 'dismiss' }));
      const info = el('div', 'pet-info', top);
      el('div', 'pet-name', info, d.name);
      el('div', 'pet-level', info, `Pet level ${lvl}${lvl >= PET_MAX_LEVEL ? ' (highest)' : ''}`);
      const bar = el('div', 'bar pet-bar', info);
      el('div', 'bar-fill', bar).style.width = `${Math.round(petProgress(xp) * 100)}%`;
      bar.title = lvl >= PET_MAX_LEVEL ? `${fmt(xp)} pet experience` : `${fmt(xp)} / ${fmt(petXpForLevel(lvl + 1))} pet experience to level ${lvl + 1}`;
      el('p', 'hint pet-perk', b, d.perk);
      const row = el('div', 'pet-buttons', b);
      button(row, 'Send away', () => this.ctl.send({ c: 'pet', a: 'dismiss' }), 'btn');
      if (d.id === 'tortoise') {
        el('div', 'panel-title', b, `Pouch (${s.pets.pouch.filter(Boolean).length}/${POUCH_SLOTS})`);
        const grid = el('div', 'bag-grid pet-pouch', b);
        s.pets.pouch.forEach((it, i) => {
          const c = el('div', 'slot', grid);
          paintSlot(c, it);
          if (it) {
            c.title = `${describeItem(itemDef(it.id))}\nClick: take it.`;
            c.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              this.ctl.send({ c: 'pet', a: 'take', i });
            });
          }
        });
        el('p', 'hint', b, 'Drag items from your backpack onto this window to let the tortoise carry them. If you die, the pouch is left in your body like your backpack.');
      }
    }
    // every pet you have raised
    const raised = PET_DEFS.filter((p) => (s.pets.xp[p.id] ?? 0) > 0);
    if (raised.length) {
      el('div', 'panel-title', b, 'Your pets');
      for (const p of raised) {
        const r = el('div', 'pet-row', b);
        const img = el('img', 'pet-row-icon', r);
        img.src = itemIcon(p.item);
        img.alt = '';
        el('span', 'pet-row-name', r, p.name);
        el('span', 'pet-row-level', r, `level ${petLevelForXp(s.pets.xp[p.id] ?? 0)}`);
      }
    }
  }

  /** Adds a Pets row to the Settings window (once it exists). */
  private addSettings(): void {
    const body = this.hudRoot.querySelector('.settings-win .win-body');
    if (!body) return;
    this.settingsDone = true;
    el('div', 'panel-title', body as HTMLElement, 'Pets');
    const row = el('div', 'set-row', body as HTMLElement);
    const label = () => `Other players' pets: ${showOtherPets() ? 'shown' : 'hidden'}`;
    const b = button(row, label(), () => {
      setShowOtherPets(!showOtherPets());
      b.textContent = label();
    }, 'btn');
    b.title = 'Show or hide the pets that follow other players (yours always shows)';
  }
}
