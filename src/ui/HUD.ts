import { sessionOf, type Controller } from '../client/Controller';
import type { GameEvent, MessageKind } from '../game/core/events';
import type { Session } from '../game/Game';
import { DEPOT_SLOTS, POCKET_SLOTS } from '../game/inventory/Inventory';
import { describeItem, equipSlotFor, ITEMS, itemDef, type EquipSlot, type ItemStack } from '../game/inventory/items';
import { GROUP_COOLDOWN, isSpellId, SPELL_LIST, SPELLS, type CooldownGroup, type SpellDef, type SpellId } from '../game/magic/spells';
import { NPCS } from '../game/npc/npcs';
import { OUTFIT_PARTS, OUTFIT_TYPES, PALETTE, PALETTE_COLS, PALETTE_ROWS, type Outfit, type OutfitPart } from '../game/player/outfits';
import { expForLevel } from '../game/player/Player';
import { VOCATIONS } from '../game/player/vocations';
import { QUESTS } from '../game/quests/quests';
import { hpColor } from '../render/Overlay';
import type { Renderer } from '../render/Renderer';
import { button, el, fmtGold, paintSlot } from './dom';
import { itemIcon, spellIcon } from './icons';
import type { Sfx } from '../audio/Sfx';
import { Minimap } from './Minimap';
import { WorldMapView } from './WorldMapView';
import { OutfitPreview } from './OutfitPreview';

/** Where a dragged item comes from. */
export type DragSrc = { kind: 'inv'; index: number } | { kind: 'eq'; slot: EquipSlot } | { kind: 'bag'; id: number };

export type HotbarEntry = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: string } | null;

const HOTBAR_SIZE = 12;
const HOTKEY_LABELS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

/** Tibia-style equipment layout, three columns. */
const EQUIP_LAYOUT: Array<{ slot: EquipSlot; ph: string; name: string }> = [
  { slot: 'amulet', ph: 'amulet_of_warding', name: 'Amulet' }, { slot: 'head', ph: 'iron_helmet', name: 'Helmet' }, { slot: 'backpack', ph: 'backpack', name: 'Backpack' },
  { slot: 'weapon', ph: 'iron_sword', name: 'Weapon' }, { slot: 'armor', ph: 'chain_armor', name: 'Armour' }, { slot: 'shield', ph: 'wooden_shield', name: 'Shield / off-hand' },
  { slot: 'ring', ph: 'ring_of_vigor', name: 'Ring' }, { slot: 'legs', ph: 'chain_legs', name: 'Legs' }, { slot: 'ammo', ph: 'arrow', name: 'Ammunition' },
  { slot: null as unknown as EquipSlot, ph: '', name: '' }, { slot: 'feet', ph: 'leather_boots', name: 'Boots' }, { slot: null as unknown as EquipSlot, ph: '', name: '' },
];

interface Bar {
  fill: HTMLDivElement;
  text: HTMLSpanElement;
  last: string;
}

interface Win {
  root: HTMLDivElement;
  body: HTMLDivElement;
  open: boolean;
}

interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** All DOM UI. Reads game state and sends commands through the controller; owns no game rules. */
export class HUD {
  readonly root: HTMLDivElement;
  private hp!: Bar;
  private mp!: Bar;
  private xp!: Bar;
  private nameEl!: HTMLSpanElement;
  private levelEl!: HTMLSpanElement;
  private capEl!: HTMLDivElement;
  private buffsEl!: HTMLDivElement;
  private regionEl!: HTMLDivElement;
  private floorEl!: HTMLDivElement;
  private statsEl!: HTMLDivElement;
  private equipEls = new Map<EquipSlot, HTMLDivElement>();
  private bagGrid!: HTMLDivElement;
  private bagTitle!: HTMLDivElement;
  private pocketGrid!: HTMLDivElement;
  private slotEls: HTMLDivElement[] = [];
  private targetEl!: HTMLDivElement;
  private targetName!: HTMLSpanElement;
  private targetFill!: HTMLDivElement;
  private hotbar: HotbarEntry[] = new Array(HOTBAR_SIZE).fill(null);
  private hotbarEls: Array<{ btn: HTMLButtonElement; icon: HTMLImageElement; count: HTMLSpanElement; cd: HTMLDivElement; secs: HTMLSpanElement }> = [];
  private cdBars = new Map<CooldownGroup, { item: HTMLDivElement; fill: HTMLDivElement; secs: HTMLSpanElement }>();
  private assigning: HotbarEntry = null;
  private logEl!: HTMLDivElement;
  private chatInput!: HTMLInputElement;
  private statusLine!: HTMLDivElement;
  private deathEl!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private toastTimer = 0;
  private menuEl!: HTMLDivElement;
  private minimap!: Minimap;
  private colA!: HTMLDivElement;
  private colB!: HTMLDivElement;
  private bottom!: HTMLDivElement;
  private battleEl!: HTMLDivElement;
  private battleRows = new Map<number, { row: HTMLDivElement; fill: HTMLDivElement; name: HTMLSpanElement }>();
  private battleTimer = 0;
  private worldMap!: WorldMapView;
  private lastRegion = '';
  private wins: Record<'dialog' | 'depot' | 'trade' | 'outfit' | 'spells' | 'quests' | 'help' | 'dev', Win> = {} as never;
  private outfitDraft: Outfit | null = null;
  private outfitPart: OutfitPart = 'head';
  private preview: OutfitPreview | null = null;
  private pixelBtn!: HTMLButtonElement;
  private disconnectEl!: HTMLDivElement;

  constructor(private readonly ctl: Controller, private readonly renderer: Renderer, container: HTMLElement, private readonly sfx: Sfx) {
    this.root = el('div', 'hud', container);
    // classic client layout: game view top left, two side columns on the right, action bar and console below
    const side = el('div', 'sidebar', this.root);
    this.colA = el('div', 'side-col', side);
    this.colB = el('div', 'side-col', side);
    this.bottom = el('div', 'bottom', this.root);
    this.buildSidebar();
    this.buildHotbar();
    this.buildConsole();
    this.buildWindows();
    this.worldMap = new WorldMapView(this.root, this.ctl, this.minimap);
    this.regionEl = el('div', 'region-banner', this.root);
    this.deathEl = el('div', 'death-screen', this.root);
    el('div', 'death-title', this.deathEl, 'You are dead');
    el('div', 'death-sub', this.deathEl, 'You will wake in your home temple…');
    this.toastEl = el('div', 'toast', this.root);
    this.menuEl = el('div', 'ctx-menu', this.root);
    this.menuEl.hidden = true;
    this.disconnectEl = el('div', 'disconnect', this.root);
    this.disconnectEl.hidden = true;
    // capture phase: close an open menu before the click can open a new one
    window.addEventListener('mousedown', (e) => {
      if (!this.menuEl.hidden && !this.menuEl.contains(e.target as Node)) this.menuEl.hidden = true;
    }, true);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => this.onDragMove(e));
    window.addEventListener('mouseup', (e) => this.onDragEnd(e));

    this.loadHotbar();
    for (const e of ctl.takeBacklog()) this.onEvent(e);
    ctl.game.events.on((e) => this.onEvent(e));
    ctl.onDisconnect = (why) => this.showDisconnect(why);
    this.renderInventory();
    this.renderHotbar();
  }

  private get s(): Session {
    return sessionOf(this.ctl);
  }

  // ================================================================ events

  private onEvent(e: GameEvent): void {
    const me = this.ctl.pid;
    switch (e.type) {
      case 'message':
        if (e.to === me) this.log(e.text, e.kind);
        if (e.to === me && (e.kind === 'level' || e.kind === 'quest')) this.toast(e.text);
        break;
      case 'chat':
        this.log(`${e.name}: ${e.text}`, 'chat');
        break;
      case 'inventoryChanged':
        if (e.to !== me) break;
        this.renderInventory();
        this.renderHotbar();
        if (this.wins.dialog.open) this.renderDialog();
        if (this.wins.trade.open) this.renderTrade();
        break;
      case 'equipmentChanged':
        if (e.id === me) this.renderInventory();
        break;
      case 'questChanged':
        if (e.to === me && this.wins.quests.open) this.renderQuests();
        if (e.to === me && this.wins.dialog.open) this.renderDialog();
        break;
      case 'dialogueOpened':
      case 'dialogueClosed':
        if (e.to === me) this.renderDialog();
        break;
      case 'depotChanged':
        if (e.to === me) this.renderDepot();
        break;
      case 'tradeChanged':
        if (e.to === me) this.renderTrade();
        break;
      case 'spellsChanged':
        if (e.to === me) {
          if (this.wins.spells.open) this.renderSpells();
          if (this.wins.dialog.open) this.renderDialog();
        }
        break;
      case 'tileChanged':
        this.minimap.invalidate(e.z);
        break;
      case 'gameLoaded':
        if (e.to !== me) break;
        this.renderInventory();
        this.renderDialog();
        this.loadHotbar();
        this.renderHotbar();
        break;
      default:
        break;
    }
  }

  // ================================================================ status (top left)

  private makeBar(parent: HTMLElement, cls: string, label: string): Bar {
    const row = el('div', `bar-row ${cls}`, parent);
    el('span', 'bar-label', row, label);
    const bar = el('div', 'bar', row);
    const fill = el('div', 'bar-fill', bar);
    const text = el('span', 'bar-text', bar);
    return { fill, text, last: '' };
  }

  private buildStatus(): void {
    const panel = el('div', 'panel status', this.colA);
    const head = el('div', 'status-head', panel);
    this.nameEl = el('span', 'char-name', head);
    this.levelEl = el('span', 'char-level', head);
    this.hp = this.makeBar(panel, 'hp', 'HP');
    this.mp = this.makeBar(panel, 'mp', 'MP');
    this.xp = this.makeBar(panel, 'xp', 'XP');
    const foot = el('div', 'status-foot', panel);
    this.capEl = el('div', 'cap', foot);
    this.buffsEl = el('div', 'buffs', foot);
    this.floorEl = el('div', 'floor-ind', panel);

    this.targetEl = el('div', 'panel target', this.root);
    const tr = el('div', 'target-row', this.targetEl);
    this.targetName = el('span', 'target-name', tr);
    button(tr, '✕', () => this.ctl.send({ c: 'clearTarget' }), 'btn tiny');
    const tb = el('div', 'bar target-bar', this.targetEl);
    this.targetFill = el('div', 'bar-fill', tb);
  }

  private setBar(b: Bar, frac: number, text: string): void {
    const key = `${frac.toFixed(3)}|${text}`;
    if (key === b.last) return;
    b.last = key;
    b.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    b.text.textContent = text;
  }

  // ================================================================ sidebar (right)

  private buildSidebar(): void {
    const col = this.colA;
    const mp = el('div', 'panel minimap-panel', col);
    this.minimap = new Minimap(mp, this.ctl);
    button(mp, 'World map (M)', () => this.toggleWorldMap(), 'btn small wm-open');
    this.buildStatus();

    const tools = el('div', 'panel toolbar', col);
    button(tools, 'Spells', () => this.toggleWin('spells'), 'btn tool');
    button(tools, 'Quests', () => this.toggleWin('quests'), 'btn tool');
    button(tools, 'Outfit', () => this.toggleWin('outfit'), 'btn tool');
    this.pixelBtn = button(tools, 'Pixels: on', () => this.togglePixels(), 'btn tool');
    if (!this.ctl.online) {
      button(tools, 'Save', () => this.saveNow(), 'btn tool');
    }
    button(tools, 'Help', () => this.toggleWin('help'), 'btn tool');
    const snd = button(tools, this.sfx.muted ? 'Sound: off' : 'Sound: on', () => {
      snd.textContent = this.sfx.toggleMute() ? 'Sound: off' : 'Sound: on';
    }, 'btn tool');
    const vol = el('input', 'vol-slider', tools);
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = String(Math.round(this.sfx.volume * 100));
    vol.title = 'Volume';
    vol.addEventListener('input', () => this.sfx.setVolume(Number(vol.value) / 100));
    button(tools, 'Test console (`)', () => this.toggleWin('dev'), 'btn tool wide');

    const eqp = el('div', 'panel equipment', col);
    const grid = el('div', 'equip-grid', eqp);
    for (const e of EQUIP_LAYOUT) {
      if (!e.slot) {
        el('div', 'equip-gap', grid);
        continue;
      }
      const d = el('div', 'slot equip', grid);
      d.dataset.slot = e.slot;
      d.title = e.name;
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (ev.button !== 0 || !this.s.inventory.equipment[e.slot]) return;
        this.startDrag({ kind: 'eq', slot: e.slot }, ev, () => this.ctl.send({ c: 'unequip', slot: e.slot }));
      });
      this.equipEls.set(e.slot, d);
    }
    this.statsEl = el('div', 'stats', eqp);

    const battle = el('div', 'panel battle', this.colB);
    el('div', 'panel-title', battle, 'Battle');
    this.battleEl = el('div', 'battle-list', battle);

    const inv = el('div', 'panel inventory', this.colB);
    el('div', 'panel-title', inv, 'Pockets');
    this.pocketGrid = el('div', 'bag-grid', inv);
    this.bagTitle = el('div', 'panel-title', inv, 'Backpack');
    this.bagGrid = el('div', 'bag-grid', inv);
    this.statusLine = el('div', 'hover-line', this.colB);
  }

  private slotEl(i: number): HTMLDivElement {
    let d = this.slotEls[i];
    if (d) return d;
    d = el('div', 'slot');
    d.dataset.inv = String(i);
    d.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const st = this.s.inventory.slots[i];
      if (!st) return;
      if (ev.button === 2) return this.itemMenu(i, ev.clientX, ev.clientY);
      if (ev.button !== 0) return;
      const shift = ev.shiftKey;
      const ctrl = ev.ctrlKey;
      // a click uses the item; dragging moves or throws it
      this.startDrag({ kind: 'inv', index: i }, ev, () => {
        const cur = this.s.inventory.slots[i];
        if (!cur) return;
        if (shift) return this.log(`You see ${itemDef(cur.id).name}. ${describeItem(itemDef(cur.id))}`, 'info');
        if (this.ctl.depot() && ctrl) return this.ctl.send({ c: 'deposit', slot: i });
        this.useInventorySlot(i);
      });
    });
    this.slotEls[i] = d;
    return d;
  }

  // ---------------------------------------------------------------- drag and drop

  private drag: { src: DragSrc; x: number; y: number; ctrl: boolean; active: boolean; ghost: HTMLImageElement | null; click: () => void } | null = null;

  /** Begins a possible drag. Releasing without moving counts as a click. */
  startDrag(src: DragSrc, ev: MouseEvent, click: () => void): void {
    this.drag = { src, x: ev.clientX, y: ev.clientY, ctrl: ev.ctrlKey, active: false, ghost: null, click };
  }

  private dragItemId(src: DragSrc): string | null {
    const inv = this.s.inventory;
    if (src.kind === 'inv') return inv.slots[src.index]?.id ?? null;
    if (src.kind === 'eq') return inv.equipment[src.slot]?.id ?? null;
    const b = this.ctl.game.bags.find((x) => x.id === src.id);
    return b?.items[b.items.length - 1]?.id ?? null;
  }

  private onDragMove(e: MouseEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.active && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) {
      const id = this.dragItemId(d.src);
      if (!id) {
        this.drag = null;
        return;
      }
      d.active = true;
      d.ghost = el('img', 'drag-ghost', document.body);
      d.ghost.src = itemIcon(id);
      this.root.classList.add('dragging');
    }
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
    }
  }

  private onDragEnd(e: MouseEvent): void {
    const d = this.drag;
    if (!d || e.button !== 0) return;
    this.drag = null;
    d.ghost?.remove();
    this.root.classList.remove('dragging');
    if (!d.active) return d.click();
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!under) return;
    const src = d.src;
    const invSlot = under.closest('[data-inv]') as HTMLElement | null;
    const eqSlot = under.closest('.slot.equip') as HTMLElement | null;
    const hot = under.closest('.hot-slot') as HTMLElement | null;
    if (invSlot) {
      const to = Number(invSlot.dataset.inv);
      if (src.kind === 'inv') this.ctl.send({ c: 'moveSlot', from: src.index, to });
      else if (src.kind === 'eq') this.ctl.send({ c: 'unequip', slot: src.slot });
      else this.ctl.send({ c: 'pickup', id: src.id });
      return;
    }
    if (eqSlot && src.kind === 'inv') {
      this.ctl.send({ c: 'equipTo', from: src.index, slot: eqSlot.dataset.slot as EquipSlot });
      return;
    }
    if (hot && src.kind === 'inv') {
      const id = this.dragItemId(src);
      const i = this.hotbarEls.findIndex((h) => h.btn === hot);
      if (id && i >= 0) {
        const def = itemDef(id);
        if (def.kind === 'consumable' || def.rune) {
          this.hotbar[i] = { kind: 'item', id };
          this.storeHotbar();
          this.renderHotbar();
        } else this.log('Only potions, food and runes go on the action bar.', 'warn');
      }
      return;
    }
    if (under === this.renderer.canvas) {
      const t = this.renderer.pickTile(e.clientX, e.clientY);
      if (!t) return;
      if (src.kind === 'bag') return; // moving piles around is not supported; click to pick up
      this.ctl.send({ c: 'throw', from: src.kind === 'inv' ? src.index : src.slot, x: t.x, y: t.y, qty: d.ctrl ? 1 : undefined });
      this.renderer.showClickMarker(t.x, t.y);
      return;
    }
    if (src.kind === 'bag' && under.closest('.sidebar')) this.ctl.send({ c: 'pickup', id: src.id });
  }

  private useInventorySlot(i: number): void {
    const st = this.s.inventory.slots[i];
    const r = st ? itemDef(st.id).rune : undefined;
    // runes are aimed with the crosshair, the classic "use with…"
    if (r && r.type === 'damage') return this.beginAim(st!.id);
    this.ctl.send({ c: 'useSlot', slot: i });
  }

  /** Item currently being aimed with the crosshair. */
  aiming: string | null = null;

  beginAim(itemId: string): void {
    const d = itemDef(itemId);
    if (!d.rune) return;
    this.aiming = itemId;
    this.root.classList.add('aiming');
    this.renderer.setAim(d.rune.radius, d.rune.range);
    this.toast(`${d.name}: click where to throw it${d.rune.radius ? ' (area shown)' : ''}. Right-click or Esc cancels.`, 2.5);
  }

  cancelAim(): void {
    if (this.aiming) {
      this.toastTimer = 0;
      this.toastEl.classList.remove('show');
    }
    this.aiming = null;
    this.root.classList.remove('aiming');
    this.renderer.setAim(null, 0);
  }

  /** Throws the aimed rune at a tile. */
  throwAt(x: number, y: number): void {
    const id = this.aiming;
    this.cancelAim();
    if (!id) return;
    const inv = this.s.inventory;
    const slot = inv.slots.findIndex((st, idx) => idx < inv.size() && st?.id === id);
    if (slot < 0) return this.log(`You have no ${itemDef(id).name.toLowerCase()} left.`, 'warn');
    this.ctl.send({ c: 'useRuneAt', slot, x, y });
  }


  private renderInventory(): void {
    const s = this.s;
    const inv = s.inventory;
    for (const [slot, d] of this.equipEls) {
      const e = EQUIP_LAYOUT.find((x) => x.slot === slot)!;
      paintSlot(d, inv.equipment[slot], e.ph);
    }
    const size = inv.size();
    this.pocketGrid.replaceChildren();
    this.bagGrid.replaceChildren();
    for (let i = 0; i < size; i++) {
      const d = this.slotEl(i);
      paintSlot(d, inv.slots[i]);
      d.classList.toggle('offered', !!this.ctl.trade()?.mine.slots.includes(i));
      (i < POCKET_SLOTS ? this.pocketGrid : this.bagGrid).appendChild(d);
    }
    const bp = inv.equipment.backpack;
    this.bagTitle.textContent = bp ? itemDef(bp.id).name : 'No backpack';
    this.bagGrid.hidden = !bp;
    if (this.wins.depot.open) this.renderDepot();
  }

  private itemMenu(i: number, x: number, y: number): void {
    const st = this.s.inventory.slots[i];
    if (!st) return;
    const d = itemDef(st.id);
    const items: MenuItem[] = [];
    const eq = equipSlotFor(d);
    if (eq) items.push({ label: 'Equip', run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.kind === 'consumable') items.push({ label: d.mana && !d.heal ? 'Drink' : 'Use', run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.rune) {
      items.push({ label: 'Use with crosshair…', run: () => this.beginAim(d.id) });
      items.push({ label: d.rune.type === 'heal' ? 'Use on yourself' : 'Use on target', run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    }
    if (d.kind === 'consumable' || d.rune) items.push({ label: 'Assign to hotkey…', run: () => this.beginAssign({ kind: 'item', id: d.id }) });
    if (this.ctl.depot()) items.push({ label: 'Put in depot', run: () => this.ctl.send({ c: 'deposit', slot: i }) });
    const t = this.ctl.trade();
    if (t && d.id !== 'gold') {
      const offered = t.mine.slots.includes(i);
      items.push({
        label: offered ? 'Remove from trade' : 'Offer in trade',
        run: () => this.ctl.send({ c: 'tradeOffer', slots: offered ? t.mine.slots.filter((x) => x !== i) : [...t.mine.slots, i], gold: t.mine.gold }),
      });
    }
    items.push({ label: 'Look', run: () => this.log(`You see ${d.name}${st.qty > 1 ? ` (${st.qty})` : ''}. ${describeItem(d)}${d.note ? ` ${d.note}` : ''}`, 'info') });
    items.push({ label: 'Drop', run: () => this.ctl.send({ c: 'drop', slot: i }) });
    this.showMenu(items, x, y);
  }

  showMenu(items: MenuItem[], x: number, y: number): void {
    const m = this.menuEl;
    m.replaceChildren();
    for (const it of items) {
      const b = button(m, it.label, () => {
        m.hidden = true;
        it.run();
      }, 'menu-item');
      b.disabled = !!it.disabled;
    }
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
    m.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;
  }

  /** Right-click menu for creatures in the world. */
  creatureMenu(kind: 'enemy' | 'npc' | 'player', id: number, x: number, y: number): void {
    const g = this.ctl.game;
    const c = g.getCreature(id);
    if (!c) return;
    const items: MenuItem[] = [];
    if (kind === 'enemy') items.push({ label: `Attack ${c.name}`, run: () => this.ctl.send({ c: 'attack', id }) });
    if (kind === 'npc') items.push({ label: `Talk to ${c.name}`, run: () => this.ctl.send({ c: 'talk', id }) });
    if (kind === 'player') {
      items.push({ label: `Trade with ${c.name}`, run: () => this.ctl.send({ c: 'tradeRequest', id }) });
      items.push({ label: `Heal ${c.name} (exura sio)`, run: () => this.ctl.send({ c: 'cast', spell: 'exura_sio', param: c.name }), disabled: !this.s.spells.has('exura_sio') });
      items.push({ label: 'Message…', run: () => this.focusChat(`${c.name}, `) });
    }
    items.push({ label: 'Look', run: () => this.log(`You see ${this.renderer.describeHover() || c.name}.`, 'info') });
    this.showMenu(items, x, y);
  }

  // ================================================================ hotbar

  private hotbarKey(): string {
    return `thornvale.hotbar.${this.s.player.name.toLowerCase()}`;
  }

  private defaultHotbar(): HotbarEntry[] {
    const voc = this.s.player.vocation;
    const bar: HotbarEntry[] = new Array(HOTBAR_SIZE).fill(null);
    bar[0] = { kind: 'spell', id: 'exura' };
    bar[1] = voc === 'knight' ? { kind: 'spell', id: 'exori' } : voc === 'paladin' ? { kind: 'spell', id: 'exori_con' } : voc === 'sorcerer' ? { kind: 'spell', id: 'exori_vis' } : { kind: 'spell', id: 'exori_tera' };
    bar[2] = { kind: 'item', id: 'health_potion' };
    bar[3] = { kind: 'item', id: 'mana_potion' };
    bar[4] = { kind: 'spell', id: 'utani_hur' };
    bar[5] = { kind: 'spell', id: 'utevo_lux' };
    if (voc === 'sorcerer' || voc === 'druid') bar[6] = { kind: 'item', id: 'spark_rune' };
    if (voc === 'knight') bar[6] = { kind: 'spell', id: 'exura_ico' };
    if (voc === 'paladin') bar[6] = { kind: 'spell', id: 'exori_san' };
    if (voc === 'druid') bar[7] = { kind: 'spell', id: 'exura_sio' };
    return bar;
  }

  private loadHotbar(): void {
    this.hotbar = this.defaultHotbar();
    try {
      const raw = storage()?.getItem(this.hotbarKey());
      if (!raw) return;
      const arr = JSON.parse(raw) as unknown[];
      if (!Array.isArray(arr)) return;
      this.hotbar = arr.slice(0, HOTBAR_SIZE).map((e) => {
        const x = e as { kind?: string; id?: string } | null;
        if (x?.kind === 'spell' && isSpellId(x.id)) return { kind: 'spell', id: x.id };
        if (x?.kind === 'item' && typeof x.id === 'string' && x.id in ITEMS) return { kind: 'item', id: x.id };
        return null;
      });
      while (this.hotbar.length < HOTBAR_SIZE) this.hotbar.push(null);
    } catch {
      /* keep defaults */
    }
  }

  private storeHotbar(): void {
    try {
      storage()?.setItem(this.hotbarKey(), JSON.stringify(this.hotbar));
    } catch {
      /* not persistent here */
    }
  }

  private buildHotbar(): void {
    const outer = el('div', 'hotbar', this.bottom);
    // shared cooldowns, so you can see when you may cast or drink again
    const strip = el('div', 'cd-strip', outer);
    const groups: Array<[CooldownGroup, string]> = [['attack', 'Attack'], ['heal', 'Healing'], ['support', 'Support'], ['potion', 'Potions']];
    for (const [g, label] of groups) {
      const item = el('div', `cd-item cd-${g}`, strip);
      item.title = `${label}: ${GROUP_COOLDOWN[g]} s shared cooldown`;
      el('span', 'cd-label', item, label);
      const barEl = el('div', 'cd-bar', item);
      const fill = el('div', 'cd-fill', barEl);
      const secs = el('span', 'cd-secs', item);
      this.cdBars.set(g, { item, fill, secs });
    }
    const bar = el('div', 'hot-row', outer);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const btn = el('button', 'hot-slot', bar);
      btn.type = 'button';
      el('span', 'hot-key', btn, HOTKEY_LABELS[i]);
      const icon = el('img', 'hot-icon', btn);
      icon.alt = '';
      icon.draggable = false;
      const count = el('span', 'hot-count', btn);
      const cd = el('div', 'hot-cd', btn);
      const secs = el('span', 'hot-secs', btn);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (this.assigning) {
          this.hotbar[i] = this.assigning;
          this.assigning = null;
          this.root.classList.remove('assigning');
          this.storeHotbar();
          this.renderHotbar();
          return;
        }
        if (e.button === 2) {
          this.showMenu([
            { label: 'Clear hotkey', run: () => { this.hotbar[i] = null; this.storeHotbar(); this.renderHotbar(); } },
            { label: 'Open spellbook to assign', run: () => this.openWin('spells') },
          ], e.clientX, e.clientY);
          return;
        }
        this.triggerHotbar(i);
      });
      this.hotbarEls.push({ btn, icon, count, cd, secs });
    }
  }

  private beginAssign(entry: HotbarEntry): void {
    this.assigning = entry;
    this.root.classList.add('assigning');
    this.toast('Click a hotkey slot to assign it.');
  }

  private renderHotbar(): void {
    this.hotbar.forEach((h, i) => {
      const e = this.hotbarEls[i];
      e.count.textContent = '';
      if (!h) {
        e.icon.hidden = true;
        e.btn.title = `Hotkey ${HOTKEY_LABELS[i]} — empty. Assign from the spellbook or an item's right-click menu.`;
        e.btn.classList.add('empty');
        return;
      }
      e.btn.classList.remove('empty');
      e.icon.hidden = false;
      if (h.kind === 'spell') {
        const sp = SPELLS[h.id];
        e.icon.src = spellIcon(h.id);
        e.btn.title = `${sp.name} — "${sp.words}" · ${sp.mana} mana${this.s.spells.has(h.id) ? '' : ' (not learned)'}`;
        e.btn.classList.toggle('locked', !this.s.spells.has(h.id));
      } else {
        const d = itemDef(h.id);
        e.icon.src = itemIcon(h.id);
        const n = this.s.inventory.count(h.id);
        e.count.textContent = String(n);
        e.btn.title = `${d.name} (${n})`;
        e.btn.classList.toggle('locked', n === 0);
      }
    });
  }

  triggerHotbar(i: number): void {
    const h = this.hotbar[i];
    if (!h) return;
    if (h.kind === 'spell') {
      const sp = SPELLS[h.id];
      if (sp.kind === 'healFriend') {
        this.focusChat(`${sp.words} "`);
        return;
      }
      this.ctl.send({ c: 'cast', spell: h.id });
      return;
    }
    const inv = this.s.inventory;
    const slot = inv.slots.findIndex((st, idx) => idx < inv.size() && st?.id === h.id);
    if (slot < 0) {
      this.log(`You have no ${itemDef(h.id).name.toLowerCase()} left.`, 'warn');
      return;
    }
    const r = itemDef(h.id).rune;
    if (r && r.type === 'damage') {
      // area runes are always aimed; single-target runes hit your target, or aim when you have none
      const t = this.ctl.game.getEnemy(this.s.player.targetId);
      if (r.radius > 0 || !t || t.dead) return this.beginAim(h.id);
    }
    this.ctl.send({ c: 'useSlot', slot });
  }

  /** Battle list: every creature on screen, nearest first. Click to attack or talk. */
  private updateBattle(): void {
    const g = this.ctl.game;
    const me = this.s.player;
    const seen = new Set<number>();
    const list = g.creatures()
      .filter((c) => c.id !== me.id && !c.dead && c.z === me.z && Math.abs(c.x - me.x) <= 9 && Math.abs(c.y - me.y) <= 7)
      .sort((a, b) => Math.max(Math.abs(a.x - me.x), Math.abs(a.y - me.y)) - Math.max(Math.abs(b.x - me.x), Math.abs(b.y - me.y)))
      .slice(0, 14);
    list.forEach((c, i) => {
      seen.add(c.id);
      let r = this.battleRows.get(c.id);
      if (!r) {
        const row = el('div', `battle-row k-${c.kind}`);
        el('span', 'battle-dot', row);
        const info = el('div', 'battle-info', row);
        const name = el('span', 'battle-name', info, c.name);
        const bar = el('div', 'battle-bar', info);
        const fill = el('div', 'battle-fill', bar);
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (c.kind === 'enemy') {
            if (e.button === 2) this.creatureMenu('enemy', c.id, e.clientX, e.clientY);
            else this.ctl.send({ c: 'attack', id: c.id });
          } else if (c.kind === 'npc') {
            if (e.button === 2) this.creatureMenu('npc', c.id, e.clientX, e.clientY);
            else this.ctl.send({ c: 'talk', id: c.id });
          } else this.creatureMenu('player', c.id, e.clientX, e.clientY);
        });
        r = { row, fill, name };
        this.battleRows.set(c.id, r);
      }
      if (c.kind === 'player') {
        const pl = g.getPlayer(c.id);
        const label = pl ? `${pl.name} · ${pl.level} ${VOCATIONS[pl.vocation].name}` : c.name;
        if (r.name.textContent !== label) r.name.textContent = label;
      }
      const frac = c.hp / c.maxHp;
      r.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      r.fill.style.background = c.kind === 'npc' ? '#6fc8ff' : hpColor(frac);
      r.row.classList.toggle('targeted', me.targetId === c.id);
      if (this.battleEl.children[i] !== r.row) this.battleEl.insertBefore(r.row, this.battleEl.children[i] ?? null);
    });
    for (const [id, r] of this.battleRows) {
      if (!seen.has(id)) {
        r.row.remove();
        this.battleRows.delete(id);
      }
    }
    this.battleEl.classList.toggle('empty', list.length === 0);
  }

  private updateHotbarCooldowns(): void {
    const p = this.s.player;
    const gcd = p.groupCooldowns;
    for (const [g, b] of this.cdBars) {
      const left = Math.max(0, gcd[g] ?? 0);
      b.fill.style.width = `${Math.min(1, left / GROUP_COOLDOWN[g]) * 100}%`;
      b.secs.textContent = left > 0.05 ? left.toFixed(1) : '';
      b.item.classList.toggle('busy', left > 0.05);
    }
    this.hotbar.forEach((h, i) => {
      const e = this.hotbarEls[i];
      let left = 0;
      let total = 1;
      if (h?.kind === 'spell') {
        const sp = SPELLS[h.id];
        const own = Math.max(0, p.spellCooldowns[h.id] ?? 0);
        const grp = Math.max(0, gcd[sp.group] ?? 0);
        if (own >= grp) {
          left = own;
          total = Math.max(sp.cooldown, GROUP_COOLDOWN[sp.group]);
        } else {
          left = grp;
          total = GROUP_COOLDOWN[sp.group];
        }
      } else if (h?.kind === 'item') {
        const d = itemDef(h.id);
        const g: CooldownGroup | null = d.rune ? (d.rune.type === 'heal' ? 'heal' : 'attack') : d.kind === 'consumable' ? 'potion' : null;
        if (g) {
          left = Math.max(0, gcd[g] ?? 0);
          total = GROUP_COOLDOWN[g];
        }
      }
      e.cd.style.height = `${Math.min(1, left / total) * 100}%`;
      e.secs.textContent = left > 0.05 ? left.toFixed(1) : '';
    });
  }


  // ================================================================ console (bottom left)

  private buildConsole(): void {
    const c = el('div', 'panel console', this.bottom);
    const tabs = el('div', 'log-tabs', c);
    const tabBtns: HTMLButtonElement[] = [];
    for (const [id, label] of [['default', 'Default'], ['server', 'Server Log'], ['loot', 'Loot']] as const) {
      const b = button(tabs, label, () => {
        this.logEl.className = `log tab-${id}`;
        tabBtns.forEach((x) => x.classList.toggle('on', x === b));
        this.logEl.scrollTop = this.logEl.scrollHeight;
      }, `log-tab${id === 'default' ? ' on' : ''}`);
      tabBtns.push(b);
    }
    this.logEl = el('div', 'log tab-default', c);
    const row = el('div', 'chat-row', c);
    this.chatInput = el('input', 'chat-input', row);
    this.chatInput.placeholder = 'Press Enter to talk — spell words cast spells';
    this.chatInput.maxLength = 140;
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) this.ctl.send({ c: 'say', text });
        this.chatInput.value = '';
        this.chatInput.blur();
      } else if (e.key === 'Escape') {
        this.chatInput.value = '';
        this.chatInput.blur();
      }
    });
    this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get chatFocused(): boolean {
    const a = document.activeElement;
    if (a === this.chatInput || a instanceof HTMLSelectElement || a instanceof HTMLTextAreaElement) return true;
    return a instanceof HTMLInputElement && a.type !== 'checkbox' && a.type !== 'button';
  }

  focusChat(prefill = ''): void {
    if (prefill) this.chatInput.value = prefill;
    this.chatInput.focus();
    const n = this.chatInput.value.length;
    this.chatInput.setSelectionRange(n, n);
  }

  log(text: string, kind: MessageKind = 'info'): void {
    const line = el('div', `log-line ${kind}`, this.logEl, text);
    line.title = new Date().toLocaleTimeString();
    while (this.logEl.childElementCount > 120) this.logEl.firstElementChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  toast(text: string, secs = 3): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = secs;
  }

  // ================================================================ windows

  private makeWin(key: keyof HUD['wins'], title: string, cls: string): Win {
    const root = el('div', `window ${cls}`, this.root);
    const head = el('div', 'win-head', root);
    el('span', 'win-title', head, title);
    button(head, '✕', () => this.closeWin(key), 'btn tiny');
    const body = el('div', 'win-body', root);
    root.hidden = true;
    const w: Win = { root, body, open: false };
    this.wins[key] = w;
    return w;
  }

  private buildWindows(): void {
    this.makeWin('dialog', 'Conversation', 'dialog-win');
    this.makeWin('depot', 'Depot', 'depot-win');
    this.makeWin('trade', 'Trade', 'trade-win');
    this.makeWin('outfit', 'Outfit', 'outfit-win');
    this.makeWin('spells', 'Spellbook', 'spells-win');
    this.makeWin('quests', 'Quest Log', 'quests-win');
    this.makeWin('help', 'How to play', 'help-win');
    this.makeWin('dev', 'Test console', 'dev-win');
    this.renderHelp();
  }

  private zTop = 10;

  private openWin(key: keyof HUD['wins']): void {
    const w = this.wins[key];
    w.open = true;
    w.root.hidden = false;
    w.root.style.zIndex = String(++this.zTop);
    if (key === 'spells') this.renderSpells();
    if (key === 'quests') this.renderQuests();
    if (key === 'outfit') this.renderOutfit(true);
    if (key === 'dev') this.renderDev();
  }

  closeWin(key: keyof HUD['wins']): void {
    const w = this.wins[key];
    if (!w.open) return;
    w.open = false;
    w.root.hidden = true;
    if (key === 'dialog' && this.s.dialogue) this.ctl.send({ c: 'closeDialogue' });
    if (key === 'depot' && this.ctl.depot()) this.ctl.send({ c: 'closeDepot' });
    if (key === 'trade' && this.ctl.trade()) this.ctl.send({ c: 'tradeCancel' });
    if (key === 'outfit') {
      this.preview?.dispose();
      this.preview = null;
    }
  }

  toggleWin(key: keyof HUD['wins'], on?: boolean): void {
    const want = on ?? !this.wins[key].open;
    if (want) this.openWin(key);
    else this.closeWin(key);
  }

  get helpOpen(): boolean {
    return this.wins.help.open;
  }

  /** Escape: closes the top-most window. Returns false when nothing was open. */
  toggleWorldMap(): void {
    this.worldMap.toggle();
  }

  closeTop(): boolean {
    if (this.aiming) {
      this.cancelAim();
      return true;
    }
    if (this.worldMap.open) {
      this.worldMap.close();
      return true;
    }
    if (!this.menuEl.hidden) {
      this.menuEl.hidden = true;
      return true;
    }
    if (this.assigning) {
      this.assigning = null;
      this.root.classList.remove('assigning');
      return true;
    }
    for (const k of ['dev', 'help', 'outfit', 'spells', 'quests', 'trade', 'depot', 'dialog'] as const) {
      if (this.wins[k].open) {
        this.closeWin(k);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- NPC dialogue

  private renderDialog(): void {
    const w = this.wins.dialog;
    const view = this.ctl.game.dialogueView(this.s);
    if (!view) {
      w.open = false;
      w.root.hidden = true;
      return;
    }
    w.open = true;
    w.root.hidden = false;
    (w.root.querySelector('.win-title') as HTMLElement).textContent = `${view.npcName} — ${view.role}`;
    const b = w.body;
    b.replaceChildren();
    el('p', 'npc-text', b, view.text);
    const gold = this.s.inventory.count('gold');

    if (view.shop) {
      const shop = el('div', 'shop', b);
      el('div', 'shop-gold', shop, `You carry ${fmtGold(view.shop.gold)} gold · capacity ${Math.floor(this.s.player.capacity - this.s.inventory.weight())} oz free`);
      const cols = el('div', 'shop-cols', shop);
      if (view.shop.sells.length) {
        const sell = el('div', 'shop-col', cols);
        el('div', 'panel-title', sell, 'Buy');
        for (const it of view.shop.sells) {
          const d = itemDef(it.id);
          const row = el('div', 'shop-row', sell);
          const ic = el('div', 'slot mini', row);
          paintSlot(ic, { id: it.id, qty: 1 });
          const info = el('div', 'shop-info', row);
          el('div', 'shop-name', info, d.name);
          el('div', 'shop-desc', info, describeItem(d));
          const btns = el('div', 'shop-btns', row);
          const qtys = d.stackable ? [1, 10, 50] : [1];
          for (const q of qtys) {
            const bb = button(btns, `${q > 1 ? `${q}× ` : ''}${fmtGold(it.price * q)}`, () => this.ctl.send({ c: 'dialogue', action: `buy:${it.id}:${q}` }), 'btn small');
            bb.disabled = gold < it.price * q;
          }
        }
      }
      if (view.shop.buys.length) {
        const buy = el('div', 'shop-col', cols);
        el('div', 'panel-title', buy, 'Sell');
        const owned = view.shop.buys.filter((x) => x.have > 0);
        if (!owned.length) el('div', 'shop-empty', buy, 'You have nothing this trader wants.');
        for (const it of owned) {
          const d = itemDef(it.id);
          const row = el('div', 'shop-row', buy);
          const ic = el('div', 'slot mini', row);
          paintSlot(ic, { id: it.id, qty: it.have });
          const info = el('div', 'shop-info', row);
          el('div', 'shop-name', info, d.name);
          el('div', 'shop-desc', info, `${fmtGold(it.price)} gold each`);
          const btns = el('div', 'shop-btns', row);
          button(btns, `Sell 1`, () => this.ctl.send({ c: 'dialogue', action: `sell:${it.id}:1` }), 'btn small');
          if (it.have > 1) button(btns, `All ${it.have}`, () => this.ctl.send({ c: 'dialogue', action: `sell:${it.id}:${it.have}` }), 'btn small');
        }
      }
    }

    if (view.bank) {
      const bank = el('div', 'bank', b);
      el('div', 'bank-line', bank, `Balance: ${fmtGold(view.bank.balance)} gold · carrying ${fmtGold(view.bank.gold)} gold`);
      const row = el('div', 'bank-row', bank);
      const amt = el('input', 'num-input', row);
      amt.type = 'number';
      amt.min = '1';
      amt.placeholder = 'Amount';
      const n = () => Math.max(0, Math.floor(Number(amt.value) || 0));
      button(row, 'Deposit', () => n() && this.ctl.send({ c: 'dialogue', action: `deposit:${n()}` }), 'btn small');
      button(row, 'Withdraw', () => n() && this.ctl.send({ c: 'dialogue', action: `withdraw:${n()}` }), 'btn small');
      const row2 = el('div', 'bank-row', bank);
      const who = el('input', 'text-input', row2);
      who.placeholder = 'Transfer to (character name)';
      who.maxLength = 20;
      button(row2, 'Transfer', () => {
        const name = who.value.trim();
        if (n() && name) this.ctl.send({ c: 'dialogue', action: `transfer:${n()}:${name}` });
      }, 'btn small');
      for (const inp of [amt, who]) inp.addEventListener('keydown', (e) => e.stopPropagation());
    }

    if (view.spells) {
      const list = el('div', 'spell-offers', b);
      for (const o of view.spells) {
        const sp = SPELLS[o.id];
        const row = el('div', 'spell-row', list);
        const ic = el('img', 'spell-icon', row);
        ic.src = spellIcon(o.id);
        ic.alt = '';
        const info = el('div', 'spell-info', row);
        el('div', 'spell-name', info, `${sp.name} — "${sp.words}"`);
        el('div', 'spell-desc', info, `Level ${o.level} · ${sp.mana} mana · ${sp.vocations.map((v) => VOCATIONS[v].name).join(', ')}`);
        const label = o.known ? 'Known' : !o.allowed ? 'Not your vocation' : `Learn (${fmtGold(o.price)})`;
        const bb = button(row, label, () => this.ctl.send({ c: 'dialogue', action: `learn:${o.id}` }), 'btn small');
        bb.disabled = o.known || !o.allowed || gold < o.price || this.s.player.level < o.level;
      }
    }

    const opts = el('div', 'npc-options', b);
    for (const o of view.options) {
      const bb = button(opts, o.label, () => this.ctl.send({ c: 'dialogue', action: o.action }), 'npc-opt');
      bb.disabled = !!o.disabled;
    }
  }

  // ---------------------------------------------------------------- depot

  private renderDepot(): void {
    const w = this.wins.depot;
    const depot = this.ctl.depot();
    if (!depot) {
      w.open = false;
      w.root.hidden = true;
      return;
    }
    w.open = true;
    w.root.hidden = false;
    const b = w.body;
    b.replaceChildren();
    el('p', 'hint', b, 'Your personal depot is shared by every locker in the world. Click an item to take it; right-click (or Ctrl-click) backpack items to store them.');
    const grid = el('div', 'bag-grid depot-grid', b);
    for (let i = 0; i < DEPOT_SLOTS; i++) {
      const d = el('div', 'slot', grid);
      paintSlot(d, depot[i] ?? null);
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (depot[i]) this.ctl.send({ c: 'withdraw', index: i });
      });
    }
  }

  // ---------------------------------------------------------------- trade

  private renderTrade(): void {
    const w = this.wins.trade;
    const t = this.ctl.trade();
    this.renderInventory();
    if (!t) {
      w.open = false;
      w.root.hidden = true;
      return;
    }
    w.open = true;
    w.root.hidden = false;
    (w.root.querySelector('.win-title') as HTMLElement).textContent = `Trade with ${t.partnerName}`;
    const b = w.body;
    b.replaceChildren();
    el('p', 'hint', b, 'Right-click backpack items to add them to your offer. Changing an offer clears both acceptances; the trade happens only when both of you accept.');
    const cols = el('div', 'trade-cols', b);
    const side = (title: string, items: ItemStack[], gold: number, accepted: boolean) => {
      const c = el('div', 'trade-col', cols);
      el('div', 'panel-title', c, `${title}${accepted ? ' ✔ accepted' : ''}`);
      const grid = el('div', 'bag-grid', c);
      for (const it of items) paintSlot(el('div', 'slot', grid), it);
      if (!items.length) el('div', 'shop-empty', c, 'No items.');
      el('div', 'trade-gold', c, `Gold: ${fmtGold(gold)}`);
      return c;
    };
    const mine = side('Your offer', t.mine.items, t.mine.gold, t.mine.accepted);
    side(`${t.partnerName}'s offer`, t.theirs.items, t.theirs.gold, t.theirs.accepted);
    const gr = el('div', 'bank-row', mine);
    const gi = el('input', 'num-input', gr);
    gi.type = 'number';
    gi.min = '0';
    gi.value = String(t.mine.gold);
    gi.addEventListener('keydown', (e) => e.stopPropagation());
    button(gr, 'Set gold', () => this.ctl.send({ c: 'tradeOffer', slots: t.mine.slots, gold: Math.max(0, Math.floor(Number(gi.value) || 0)) }), 'btn small');
    const row = el('div', 'trade-actions', b);
    const acc = button(row, t.mine.accepted ? 'Waiting for partner…' : 'Accept', () => this.ctl.send({ c: 'tradeAccept' }), 'btn');
    acc.disabled = t.mine.accepted;
    button(row, 'Cancel trade', () => this.ctl.send({ c: 'tradeCancel' }), 'btn');
  }

  // ---------------------------------------------------------------- outfit

  private renderOutfit(fresh = false): void {
    const w = this.wins.outfit;
    if (fresh || !this.outfitDraft) this.outfitDraft = { ...this.s.player.outfit };
    const o = this.outfitDraft;
    const b = w.body;
    b.replaceChildren();
    const top = el('div', 'outfit-top', b);
    const pv = el('div', 'outfit-pv', top);
    if (!this.preview || !this.preview.canvas.isConnected) {
      this.preview?.dispose();
      this.preview = new OutfitPreview(pv);
    } else {
      pv.appendChild(this.preview.canvas);
    }
    this.preview.set(o);
    const types = el('div', 'outfit-types', top);
    for (const t of OUTFIT_TYPES) {
      const bb = button(types, t.name, () => {
        o.type = t.id;
        this.renderOutfit();
      }, `btn small${o.type === t.id ? ' on' : ''}`);
      bb.setAttribute('aria-pressed', String(o.type === t.id));
    }
    const parts = el('div', 'outfit-parts', b);
    for (const p of OUTFIT_PARTS) {
      const bb = button(parts, p.name, () => {
        this.outfitPart = p.id;
        this.renderOutfit();
      }, `btn small${this.outfitPart === p.id ? ' on' : ''}`);
      const sw = el('span', 'swatch', bb);
      sw.style.background = `#${PALETTE[o[p.id]].toString(16).padStart(6, '0')}`;
    }
    const pal = el('div', 'palette', b);
    pal.style.gridTemplateColumns = `repeat(${PALETTE_COLS}, 1fr)`;
    for (let i = 0; i < PALETTE_COLS * PALETTE_ROWS; i++) {
      const c = el('button', `pal${o[this.outfitPart] === i ? ' on' : ''}`, pal);
      c.type = 'button';
      c.style.background = `#${PALETTE[i].toString(16).padStart(6, '0')}`;
      c.addEventListener('click', () => {
        o[this.outfitPart] = i;
        this.renderOutfit();
      });
    }
    const gear = el('label', 'check-row', b);
    const cb = el('input', '', gear);
    cb.type = 'checkbox';
    cb.checked = this.s.player.showGear;
    cb.addEventListener('change', () => {
      this.ctl.send({ c: 'showGear', on: cb.checked });
      cb.blur();
    });
    el('span', '', gear, 'Show worn equipment on my character (untick for the classic look: your outfit never changes)');
    const row = el('div', 'trade-actions', b);
    button(row, 'Apply', () => {
      this.ctl.send({ c: 'outfit', outfit: { ...o } });
      this.closeWin('outfit');
    }, 'btn');
    button(row, 'Cancel', () => this.closeWin('outfit'), 'btn');
  }

  // ---------------------------------------------------------------- test console

  private renderDev(): void {
    const b = this.wins.dev.body;
    b.replaceChildren();
    const cmd = (text: string) => this.ctl.send({ c: 'say', text });
    el('p', 'hint', b, this.ctl.online
      ? 'Test commands work online only when the server allows them (ALLOW_ADMIN=1 or ADMINS="Your Name"). Results appear in the chat log.'
      : 'Give yourself levels, gold and items for testing. Results appear in the chat log. You can also type the commands in chat, e.g. /level 100.');
    const stop = (i: HTMLInputElement) => i.addEventListener('keydown', (e) => e.stopPropagation());
    const numRow = (label: string, def: number, quick: number[], run: (n: number) => void, fmt: (n: number) => string = String) => {
      const row = el('div', 'dev-row', b);
      el('span', 'dev-label', row, label);
      const inp = el('input', 'num-input', row);
      inp.type = 'number';
      inp.value = String(def);
      stop(inp);
      button(row, 'Set', () => run(Math.floor(Number(inp.value) || 0)), 'btn small');
      for (const q of quick) button(row, fmt(q), () => run(q), 'btn small');
    };
    numRow('Level', 100, [20, 50, 100, 200, 500], (n) => cmd(`/level ${n}`));
    numRow('Gold', 10000, [1000, 10000, 100000, 1000000], (n) => cmd(`/gold ${n}`), (n) => (n >= 1e6 ? `${n / 1e6}m` : n >= 1000 ? `${n / 1000}k` : String(n)));

    const tools = el('div', 'dev-row', b);
    button(tools, 'Learn all spells', () => cmd('/spells'), 'btn small');
    button(tools, 'Full heal', () => cmd('/heal'), 'btn small');
    button(tools, this.s.player.god ? 'God mode: on' : 'God mode: off', () => {
      cmd('/god');
      setTimeout(() => this.wins.dev.open && this.renderDev(), 150);
    }, 'btn small');
    button(tools, 'Kill target', () => cmd('/kill'), 'btn small');

    const tp = el('div', 'dev-row', b);
    el('span', 'dev-label', tp, 'Teleport');
    const sel = el('select', 'text-input', tp);
    const seen = new Set<string>();
    for (const r of this.ctl.game.world.regions) {
      if (seen.has(r.name) || (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 60) continue;
      seen.add(r.name);
      const o = el('option', '', sel, `${r.name}${r.level && r.level !== '—' ? ` (${r.level})` : ''}${r.z0 < 0 ? ` · floor ${r.z0}` : ''}`);
      o.value = r.name;
    }
    button(tp, 'Go', () => cmd(`/goto ${sel.value}`), 'btn small');

    const sets = el('div', 'dev-row', b);
    el('span', 'dev-label', sets, 'Gear sets');
    const giveAll = (list: Array<[string, number]>) => {
      list.forEach(([id, n], i) => setTimeout(() => cmd(`/item ${id} ${n}`), i * 60));
    };
    button(sets, 'Knight', () => giveAll([['dragonhide_pack', 1], ['kings_edge', 1], ['demon_reaver', 1], ['demon_helm', 1], ['demonplate', 1], ['demon_legs', 1], ['windstride_boots', 1], ['demon_shield', 1], ['demonbone_amulet', 1], ['ring_of_might', 1], ['great_health_potion', 100]]), 'btn small');
    button(sets, 'Paladin', () => giveAll([['dragonhide_pack', 1], ['dragonbane_crossbow', 1], ['infernal_bolt', 100], ['elven_longbow', 1], ['flaming_arrow', 100], ['royal_javelin', 50], ['elven_circlet', 1], ['elven_mail', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['strong_health_potion', 100]]), 'btn small');
    button(sets, 'Sorcerer', () => giveAll([['dragonhide_pack', 1], ['wand_of_inferno', 1], ['storm_tome', 1], ['elven_circlet', 1], ['arcane_robe', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['great_mana_potion', 100], ['fireball_rune', 50], ['death_rune', 50]]), 'btn small');
    button(sets, 'Druid', () => giveAll([['dragonhide_pack', 1], ['rod_of_wilds', 1], ['storm_tome', 1], ['elven_circlet', 1], ['arcane_robe', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['great_mana_potion', 100], ['healing_rune', 50], ['avalanche_rune', 50], ['stoneshower_rune', 50]]), 'btn small');
    button(sets, 'Tools', () => giveAll([['rope', 1], ['shovel', 1]]), 'btn small');

    const qtyRow = el('div', 'dev-row', b);
    el('span', 'dev-label', qtyRow, 'Items');
    el('span', 'hint', qtyRow, 'Click an item to get it. Stackable items come in this amount:');
    const qty = el('input', 'num-input', qtyRow);
    qty.type = 'number';
    qty.value = '100';
    stop(qty);
    const grid = el('div', 'dev-items', b);
    const kinds: Array<[string, string[]]> = [
      ['Weapons', ['weapon']], ['Ammo', ['ammo']], ['Shields & books', ['shield']], ['Helmets', ['helmet']], ['Armour', ['armor']],
      ['Legs', ['legs']], ['Boots', ['boots']], ['Amulets & rings', ['amulet', 'ring']], ['Backpacks & tools', ['backpack', 'tool']],
      ['Potions & food', ['consumable']], ['Runes', ['rune']], ['Loot', ['material']],
    ];
    for (const [title, ks] of kinds) {
      el('div', 'panel-title', grid, title);
      const g = el('div', 'dev-grid', grid);
      for (const d of Object.values(ITEMS)) {
        if (!ks.includes(d.kind)) continue;
        const slot = el('div', 'slot', g);
        paintSlot(slot, { id: d.id, qty: 1 });
        slot.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const n = d.stackable ? Math.max(1, Math.min(1000, Math.floor(Number(qty.value) || 1))) : 1;
          cmd(`/item ${d.id} ${n}`);
        });
      }
    }

    const line = el('div', 'dev-row', b);
    const inp = el('input', 'text-input', line);
    inp.placeholder = '/help, /level 80, /item dragon helm, /goto caldera, /vocation druid…';
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') inp.blur();
      if (e.key === 'Enter' && inp.value.trim()) {
        const t = inp.value.trim();
        cmd(t.startsWith('/') ? t : `/${t}`);
        inp.value = '';
      }
    });
    button(line, 'Run', () => {
      const t = inp.value.trim();
      if (t) cmd(t.startsWith('/') ? t : `/${t}`);
      inp.value = '';
    }, 'btn small');
  }

  // ---------------------------------------------------------------- spellbook

  private renderSpells(): void {
    const b = this.wins.spells.body;
    b.replaceChildren();
    const s = this.s;
    const voc = s.player.vocation;
    el('p', 'hint', b, 'Say a spell\'s words in chat, press its hotkey, or click Cast. Trainers in towns teach the spells you have not learned yet.');
    const list = el('div', 'spell-offers', b);
    const mine = SPELL_LIST.filter((sp) => sp.vocations.includes(voc)).sort((a, c) => a.level - c.level);
    const row = (sp: SpellDef) => {
      const known = s.spells.has(sp.id);
      const r = el('div', `spell-row${known ? '' : ' unknown'}`, list);
      const ic = el('img', 'spell-icon', r);
      ic.src = spellIcon(sp.id);
      ic.alt = '';
      const info = el('div', 'spell-info', r);
      el('div', 'spell-name', info, `${sp.name} — "${sp.words}${sp.kind === 'healFriend' ? ' "name"' : ''}"`);
      el('div', 'spell-desc', info, `${sp.description} · Level ${sp.level} · ${sp.mana} mana · cooldown ${sp.cooldown}s${known ? '' : ` · learn for ${fmtGold(sp.price)} gold`}`);
      const btns = el('div', 'shop-btns', r);
      const cast = button(btns, 'Cast', () => sp.kind === 'healFriend' ? this.focusChat(`${sp.words} "`) : this.ctl.send({ c: 'cast', spell: sp.id }), 'btn small');
      cast.disabled = !known;
      button(btns, 'Hotkey', () => {
        this.beginAssign({ kind: 'spell', id: sp.id });
      }, 'btn small');
    };
    mine.forEach(row);
  }

  // ---------------------------------------------------------------- quests

  private renderQuests(): void {
    const b = this.wins.quests.body;
    b.replaceChildren();
    const s = this.s;
    let any = false;
    for (const q of QUESTS) {
      const st = s.quests.get(q.id);
      if (!st || st.status === 'locked') continue;
      any = true;
      const r = el('div', `quest q-${st.status}`, b);
      const giver = NPCS[q.giver]?.name ?? q.giver;
      el('div', 'quest-title', r, q.title);
      const status = st.status === 'available' ? `Ask ${giver} about it${q.minLevel ? ` (level ${q.minLevel}+)` : ''}.`
        : st.status === 'active' ? `${q.targetName}: ${st.kills}/${q.count}`
        : st.status === 'ready' ? `Done — return to ${giver}.` : 'Completed.';
      el('div', 'quest-status', r, status);
      if (st.status === 'active' || st.status === 'ready') {
        const bar = el('div', 'bar quest-bar', r);
        el('div', 'bar-fill', bar).style.width = `${(st.kills / q.count) * 100}%`;
      }
      if (st.status !== 'done') el('div', 'quest-reward', r, `Reward: ${fmtGold(q.rewardExp)} exp${q.rewardItems.length ? `, ${q.rewardItems.map((i) => `${i.qty > 1 ? `${i.qty} ` : ''}${itemDef(i.id).name}`).join(', ')}` : ''}`);
    }
    if (!any) el('p', 'hint', b, 'No quests yet. Talk to people in town.');
  }

  // ---------------------------------------------------------------- help

  private renderHelp(): void {
    const b = this.wins.help.body;
    const intro = el('p', 'hint', b);
    intro.textContent = this.ctl.online
      ? 'You are playing online. Other adventurers share this world with you; the server keeps your character.'
      : 'You are playing offline. Your character is saved in this browser.';
    const grid = el('div', 'help-grid', b);
    const rows: Array<[string, string]> = [
      ['WASD / arrows', 'Walk (Q E Z C or numpad for diagonals)'],
      ['Left-click ground', 'Walk there (path-finding)'],
      ['Left-click monster', 'Attack — your character fights automatically'],
      ['Left-click NPC', 'Talk: trade, bank, quests, travel, spells'],
      ['Click ladders, ropes, lockers…', 'Use them (rope spots need a rope, loose stones a shovel)'],
      ['Right-click', 'Context menu: trade with players, item actions'],
      ['F1 – F12', 'Hotkeys (spells, potions, runes)'],
      ['Enter', 'Chat; saying spell words casts spells (e.g. exura)'],
      ['Tab / Space', 'Target the next monster'],
      ['Esc', 'Close windows / clear target'],
      ['Mouse wheel', 'Zoom'],
      ['M', 'World map (every floor, click to walk)'],
      ['Ctrl + direction / Ctrl+R', 'Turn without moving'],
      ['` (key under Esc)', 'Test console: levels, gold, items, teleports (also /help in chat)'],
      ['Ctrl-click item', 'Store in depot while a locker is open'],
    ];
    for (const [k, v] of rows) {
      el('div', 'help-key', grid, k);
      el('div', 'help-val', grid, v);
    }
    el('p', 'hint', b, 'Stairs and holes take you between floors; mountains, towers and dungeons go up to two floors high and four deep. Towns are protection zones: monsters cannot follow you in.');
  }

  // ================================================================ misc actions

  private togglePixels(): void {
    const on = !this.renderer.cam.pixelMode;
    this.renderer.setPixelMode(on);
    this.pixelBtn.textContent = `Pixels: ${on ? 'on' : 'off'}`;
    try {
      storage()?.setItem('thornvale.pixels', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  applyStoredPixelSetting(): void {
    try {
      if (storage()?.getItem('thornvale.pixels') === '0') this.togglePixels();
    } catch {
      /* ignore */
    }
  }

  saveNow(): void {
    if (this.ctl.save()) this.toast('Game saved.');
    else this.toast('Could not save right now.');
  }

  private showDisconnect(why: string): void {
    this.disconnectEl.hidden = false;
    this.disconnectEl.replaceChildren();
    el('div', 'death-title', this.disconnectEl, 'Disconnected');
    el('div', 'death-sub', this.disconnectEl, why);
    button(this.disconnectEl, 'Back to the title screen', () => location.reload(), 'btn');
  }

  // ================================================================ per frame

  update(dt: number): void {
    const s = this.s;
    const p = s.player;
    const g = this.ctl.game;
    this.nameEl.textContent = p.name;
    this.levelEl.textContent = `Level ${p.level} ${VOCATIONS[p.vocation].name}`;
    this.setBar(this.hp, p.hp / p.maxHp, `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.hp.fill.style.background = hpColor(p.hp / p.maxHp);
    this.setBar(this.mp, p.maxMana ? p.mana / p.maxMana : 0, `${Math.floor(p.mana)} / ${p.maxMana}`);
    const need = expForLevel(p.level + 1) - p.exp;
    this.setBar(this.xp, p.levelProgress(), `${Math.floor(p.levelProgress() * 100)}% · ${fmtGold(need)} to go`);
    const w = s.inventory.weight();
    this.capEl.textContent = `Cap ${Math.floor(p.capacity - w)} oz · Gold ${fmtGold(s.inventory.count('gold'))}${s.bank ? ` (+${fmtGold(s.bank)} bank)` : ''}`;
    const buffs: string[] = [];
    if (p.buffs.haste > 0) buffs.push('⇶ haste');
    if (p.buffs.magicShield > 0) buffs.push('◈ magic shield');
    if (p.buffs.light > 0) buffs.push('☀ light');
    if (g.isProtected(p)) buffs.push('⛨ protection zone');
    const bt = buffs.join('  ');
    if (this.buffsEl.textContent !== bt) this.buffsEl.textContent = bt;
    this.floorEl.textContent = p.z === 0 ? 'Ground floor' : p.z > 0 ? `Floor +${p.z}` : `Underground ${p.z}`;

    this.statsEl.textContent = `Atk ${g.attackValue(s)} · Def ${g.defense(s)} · Arm ${g.armor(s)} · Speed ${Math.round(100 * 0.27 / p.stepTime)}`;

    const region = g.world.regionAt(p.x, p.y, p.z);
    const rname = region ? region.name : '';
    if (rname !== this.lastRegion) {
      this.lastRegion = rname;
      if (region) {
        this.regionEl.textContent = `${region.name}${region.level && region.level !== '—' ? ` · level ${region.level}` : ''}`;
        this.regionEl.classList.remove('show');
        void this.regionEl.offsetWidth;
        this.regionEl.classList.add('show');
      }
    }

    const t = g.getEnemy(p.targetId);
    if (t && !t.dead) {
      this.targetEl.classList.add('on');
      this.targetName.textContent = t.def.elite ? `★ ${t.name}` : t.name;
      this.targetFill.style.width = `${(t.hp / t.maxHp) * 100}%`;
      this.targetFill.style.background = hpColor(t.hp / t.maxHp);
    } else {
      this.targetEl.classList.remove('on');
    }

    this.updateHotbarCooldowns();
    this.battleTimer -= dt;
    if (this.battleTimer <= 0) {
      this.battleTimer = 0.2;
      this.updateBattle();
    }
    this.minimap.update(dt);
    this.worldMap.update(dt);
    this.deathEl.classList.toggle('show', p.dead);
    const hover = this.renderer.describeHover();
    if (this.statusLine.textContent !== hover) this.statusLine.textContent = hover;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }
}
