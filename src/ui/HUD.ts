import { sessionOf, type Controller } from '../client/Controller';
import type { GameEvent, MessageKind } from '../game/core/events';
import type { Session } from '../game/Game';
import { DEPOT_SLOTS, POCKET_SLOTS } from '../game/inventory/Inventory';
import { bonusParts } from '../game/inventory/sets';
import { describeItem, equipSlotFor, ITEMS, itemDef, runeGroup, runeIsAimed, type EquipSlot, type ItemStack } from '../game/inventory/items';
import { GROUP_COOLDOWN, isSpellId, SPELL_LIST, SPELLS, type CooldownGroup, type SpellDef, type SpellId } from '../game/magic/spells';
import { NPCS } from '../game/npc/npcs';
import { encodeAppearance } from '../game/player/appearance';
import { PREMIUM_DEPOT_SLOTS } from '../game/premium/premium';
import { Enemy } from '../game/enemies/Enemy';
import { expForLevel, type FightMode } from '../game/player/Player';
import { VOCATIONS } from '../game/player/vocations';
import { COMBAT_SKILLS, SKILL_NAMES, skillProgress, triesForNext } from '../game/player/skills';
import { gatherLevelForXp, gatherProgress, gatherXpForLevel, WC_MAX_LEVEL } from '../game/gathering/woodcutting';
import { marketFee, MARKET_MAX_PRICE, type MarketView } from '../game/market/market';
import { NONCOMBAT_SKILLS } from '../game/gathering/skills';
import { MAX_BATCH, stationForItem, type CraftView } from '../game/production/recipes';
import { RAW_FOOD_ITEMS } from '../game/production/cooking';
import { Obj } from '../game/world/WorldMap';
import { QUESTS } from '../game/quests/quests';
import { TUTORIAL_LAST, tutorialStep } from '../game/tutorial/tutorial';
import { hpColor } from '../render/Overlay';
import { makeBottomResizable, makePanelsMovable, resetPanelLayout } from './panels';
import type { Renderer } from '../render/Renderer';
import { button, el, fmtGold, paintSlot } from './dom';
import { itemIcon, spellIcon } from './icons';
import { SFX_CATS, type Sfx } from '../audio/Sfx';

/** HUD layout presets: "Two flanks" (design 2c) or "Full view" (design 3c). */
type HudLayout = 'flanks' | 'full';
import type { Music } from '../audio/Music';
import { Minimap } from './Minimap';
import { WorldMapView } from './WorldMapView';
import { CharacterDesigner } from './CharacterDesigner';
import { expStageLine, isClassic, stagesTable } from '../game/progression/stages';

/** Where a dragged item comes from. */
export type DragSrc = { kind: 'inv'; index: number } | { kind: 'eq'; slot: EquipSlot } | { kind: 'bag'; id: number };

export type HotbarEntry = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: string } | null;

/** F1–F12, then a second row on Ctrl+1 … Ctrl+0 (runes for PvP). */
const HOTBAR_SIZE = 22;
const HOTKEY_LABELS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => `^${d}`)];
const hotkeyName = (i: number): string => (i < 12 ? HOTKEY_LABELS[i] : `Ctrl+${HOTKEY_LABELS[i].slice(1)}`);

/** Tibia-style equipment layout, three columns. */
const EQUIP_LAYOUT: Array<{ slot: EquipSlot; ph: string; name: string }> = [
  { slot: 'amulet', ph: 'amulet_of_warding', name: 'Amulet' }, { slot: 'head', ph: 'iron_helmet', name: 'Helmet' }, { slot: 'backpack', ph: 'backpack', name: 'Backpack' },
  { slot: 'weapon', ph: 'iron_sword', name: 'Weapon' }, { slot: 'armor', ph: 'chain_armor', name: 'Armour' }, { slot: 'shield', ph: 'wooden_shield', name: 'Shield / off-hand' },
  { slot: 'ring', ph: 'ring_of_vigor', name: 'Ring' }, { slot: 'legs', ph: 'chain_legs', name: 'Legs' }, { slot: 'ammo', ph: 'arrow', name: 'Ammunition' },
  { slot: 'cape', ph: 'thornvale_cape', name: 'Cape' }, { slot: 'feet', ph: 'leather_boots', name: 'Boots' }, { slot: null as unknown as EquipSlot, ph: '', name: '' },
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
  /** Big centred banner for server-wide announcements (world bosses, raids). */
  private announceEl!: HTMLDivElement;
  private announceTimer = 0;
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
  private partyEl!: HTMLDivElement;
  private friendsBtn!: HTMLButtonElement;
  private inspectId: number | null = null;
  private corpseId: number | null = null;
  private inspectTimer = 0;
  private partyKey = '';
  private battleRows = new Map<number, { row: HTMLDivElement; fill: HTMLDivElement; name: HTMLSpanElement; skull: HTMLSpanElement }>();
  private battleTimer = 0;
  private worldMap!: WorldMapView;
  private lastRegion = '';
  private wins: Record<'dialog' | 'depot' | 'trade' | 'market' | 'craft' | 'appearance' | 'spells' | 'quests' | 'help' | 'dev' | 'inspect' | 'friends' | 'settings' | 'corpse', Win> = {} as never;
  /** Station window state that survives redraws: chosen tab (metal) and the "Make X" amount. */
  private cw = { tab: '', qty: 10, station: '' };
  private skillsEl!: HTMLDivElement;
  private skillsKey = '';
  private skillsTimer = 0;
  /** Market window state that survives redraws. */
  private mk = { tab: 'browse' as 'browse' | 'sell' | 'mine', search: '', sel: null as null | { from: 'depot' | 'inv'; index: number }, qty: 1, price: 0, buyQty: new Map<string, number>(), dirty: false };
  private designer: CharacterDesigner | null = null;
  private designerGear = true;
  private pixelBtn!: HTMLButtonElement;
  private pvpBtn!: HTMLButtonElement;
  private lvlBadge!: HTMLDivElement;
  /** Current layout preset (remembered in this browser). */
  private layout: HudLayout = (() => {
    try { return localStorage.getItem('thornvale.hudLayout') === 'full' ? 'full' : 'flanks'; } catch { return 'flanks'; }
  })();
  /** Full-view docks (top-left, top-right, bottom-left, bottom-centre, bottom-right). */
  private docks: Record<'tl' | 'tr' | 'bl' | 'bc' | 'br', HTMLDivElement> | null = null;
  /** Where each panel came from, so switching back to "Two flanks" puts everything exactly back. */
  private moved: Array<[HTMLElement, HTMLElement, Node | null]> = [];
  private topLoc!: HTMLSpanElement;
  private disconnectEl!: HTMLDivElement;
  /** Tutorial objective bar (Wayfarer's Isle): step, hint, direction to the target, skip button. */
  private tut!: { root: HTMLDivElement; title: HTMLSpanElement; arrow: HTMLSpanElement; dist: HTMLSpanElement; hint: HTMLDivElement; todo: HTMLDivElement; skip: HTMLButtonElement; armed: number; timer: number };

  constructor(private readonly ctl: Controller, private readonly renderer: Renderer, container: HTMLElement, private readonly sfx: Sfx, private readonly music?: Music) {
    this.root = el('div', 'hud', container);
    // "two flanks" layout: a slim title strip on top, character/combat/skills/battle on the left,
    // map/menu/equipment/inventory on the right, the game view in the middle with action bar and chat below
    this.buildTopbar();
    const left = el('div', 'flank flank-left', this.root);
    const side = el('div', 'flank sidebar', this.root);
    this.colA = el('div', 'side-col', left);
    this.colB = el('div', 'side-col', side);
    this.bottom = el('div', 'bottom', this.root);
    this.buildSidebar();
    makePanelsMovable(side, [this.colA, this.colB], () => {});
    this.buildHotbar();
    this.buildConsole();
    makeBottomResizable(this.root, this.bottom, this.bottom.querySelector('.hotbar') as HTMLElement);
    if (this.layout === 'full') this.setLayout('full');
    this.buildWindows();
    this.buildTutorial();
    this.worldMap = new WorldMapView(this.root, this.ctl, this.minimap);
    this.regionEl = el('div', 'region-banner', this.root);
    this.announceEl = el('div', 'announce-banner', this.root);
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
    this.renderTutorial();
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
      case 'adminNotice':
        if (e.to === me) this.adminNotice(e.title, e.text);
        break;
      case 'announce':
        this.log(e.text, 'event');
        if (e.big) this.announce(e.title, e.text, e.style);
        break;
      case 'bagChanged':
      case 'bagRemoved':
        if (this.wins.corpse.open && e.bagId === this.corpseId) this.renderCorpse();
        break;
      case 'inventoryChanged':
        if (e.to !== me) break;
        this.renderInventory();
        this.renderHotbar();
        if (this.wins.dialog.open) this.renderDialog();
        if (this.wins.trade.open) this.renderTrade();
        if (this.wins.craft.open) this.renderCraft();
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
      case 'partyChanged':
        if (e.to === me) this.partyKey = '';
        break;
      case 'marketChanged':
        if (e.to === me) this.renderMarket();
        break;
      case 'craftChanged':
        if (e.to === me) this.renderCraft();
        break;
      case 'skillUp':
        if (e.to === me) this.skillsKey = '';
        break;
      case 'friendsChanged':
        if (e.to === me) this.renderFriends();
        break;
      case 'spellsChanged':
        if (e.to === me) {
          if (this.wins.spells.open) this.renderSpells();
          if (this.wins.dialog.open) this.renderDialog();
        }
        break;
      case 'tileChanged': {
        // felled and regrowing trees do not change the map enough to redraw a whole floor
        const o = this.ctl.game.world.getObj(e.x, e.y, e.z);
        // (nor do mined-out and refilled ore rocks)
        if (o !== Obj.Stump && o !== Obj.Tree && o !== Obj.Pine && o !== Obj.Palm && o !== Obj.JungleTree && o !== Obj.DepletedRock && !(o >= Obj.CopperRock && o <= Obj.DarkstoneRock)) this.minimap.invalidate(e.z);
        break;
      }
      case 'tutorialChanged':
        if (e.to === me) this.renderTutorial();
        break;
      case 'gameLoaded':
        if (e.to !== me) break;
        this.renderTutorial();
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
    this.lvlBadge = el('div', 'lvl-badge', head);
    this.lvlBadge.title = 'Level';
    const who = el('div', 'status-who', head);
    this.nameEl = el('span', 'char-name', who);
    this.levelEl = el('span', 'char-level', who);
    this.hp = this.makeBar(panel, 'hp', 'HP');
    this.mp = this.makeBar(panel, 'mp', 'MP');
    this.xp = this.makeBar(panel, 'xp', 'XP');
    const foot = el('div', 'status-foot', panel);
    this.capEl = el('div', 'cap', foot);
    this.buffsEl = el('div', 'buffs', foot);

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

  /** Slim title strip above everything: crest, game name, where you are, online or offline. */
  private buildTopbar(): void {
    const top = el('div', 'topbar', this.root);
    const crest = el('span', 'tb-crest', top);
    crest.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" transform="rotate(45 10 10)" fill="#2b2621" stroke="#c9a24a" stroke-width="1.5"/><path d="M6.5 6.5h7v2h-2.5v6h-2v-6H6.5z" fill="#e8c26a"/></svg>';
    el('span', 'tb-name', top, 'THORNVALE');
    el('span', 'tb-sep', top);
    this.topLoc = el('span', 'tb-loc', top);
    el('span', 'tb-fill', top);
    const mode = el('span', `tb-mode ${this.ctl.online ? 'online' : 'offline'}`, top);
    el('span', 'tb-dot', mode);
    const label = el('span', '', mode, this.ctl.online ? 'Online' : 'Offline');
    if (this.ctl.online) {
      // players online, from the server's public /status (the same number the website shows)
      const refresh = () => {
        fetch('/status', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((s: { online?: number } | null) => {
            if (s && typeof s.online === 'number') label.textContent = `${s.online.toLocaleString('en-GB')} online`;
          })
          .catch(() => { /* keep "Online" */ });
      };
      refresh();
      window.setInterval(refresh, 30000);
    }
  }

  /** Settings window: display, sound and test tools that used to crowd the side bar. */
  /**
   * Switches between the layout presets. "Full view" moves the existing panels (same elements,
   * same behaviour) into five floating docks over a full-screen game view; "Two flanks" puts every
   * panel back exactly where it was.
   */
  setLayout(mode: HudLayout): void {
    if (!this.docks) {
      const d = (k: string) => el('div', `dock dock-${k}`, this.root);
      this.docks = { tl: d('tl'), tr: d('tr'), bl: d('bl'), bc: d('bc'), br: d('br') };
    }
    const docks = this.docks;
    // always start from "Two flanks" so the moves can be undone in reverse order
    for (let i = this.moved.length - 1; i >= 0; i--) {
      const [node, parent, next] = this.moved[i];
      parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    }
    this.moved = [];
    if (mode === 'full') {
      const move = (sel: string, dock: HTMLElement) => {
        const node = this.root.querySelector(sel) as HTMLElement | null;
        if (!node || !node.parentElement) return;
        this.moved.push([node, node.parentElement, node.nextSibling]);
        dock.appendChild(node);
      };
      move('.panel.status', docks.tl);
      move('.panel.skills', docks.tl);
      move('.panel.minimap-panel', docks.tr);
      move('.panel.battle', docks.tr);
      move('.panel.party', docks.tr);
      move('.panel.console', docks.bl);
      move('.panel.toolbar', docks.bc);
      move('.hotbar', docks.bc);
      move('.panel.fight-modes', docks.bc);
      move('.panel.equipment', docks.br);
      move('.panel.inventory', docks.br);
      move('.hover-line', docks.br);
    }
    this.layout = mode;
    document.documentElement.classList.toggle('layout-full', mode === 'full');
    try { localStorage.setItem('thornvale.hudLayout', mode); } catch { /* storage off */ }
    // the game view changed size
    window.dispatchEvent(new Event('resize'));
  }

  private buildSettings(): void {
    const b = this.makeWin('settings', 'Settings', 'settings-win').body;
    const sec = (title: string) => {
      el('div', 'panel-title', b, title);
      return el('div', 'set-row', b);
    };
    // layout presets: "Two flanks" (side columns) or "Full view" (game fills the screen, floating docks)
    const lay = sec('Layout');
    const lb: Array<[HTMLButtonElement, HudLayout]> = [];
    const layBtn = (label: string, mode: HudLayout, tip: string) => {
      const x = button(lay, label, () => {
        this.setLayout(mode);
        for (const [bb, m] of lb) bb.classList.toggle('on', m === this.layout);
      }, 'btn');
      x.title = tip;
      lb.push([x, mode]);
    };
    layBtn('Two flanks', 'flanks', 'Character and combat on the left, map and inventory on the right, the game view in the middle');
    layBtn('Full view', 'full', 'The game view fills the screen; panels float in its corners');
    for (const [bb, m] of lb) bb.classList.toggle('on', m === this.layout);

    const disp = sec('Display');
    this.pixelBtn = button(disp, 'Pixels: on', () => this.togglePixels(), 'btn');
    this.pixelBtn.title = 'Pixel-art look on or off';
    // weather effects: High / Low (half the particles) / Off (sandstorm visibility stays: it is gameplay)
    const wq = ['high', 'low', 'off'] as const;
    const wqName = { high: 'High', low: 'Low', off: 'Off' };
    const wb = button(disp, `Weather: ${wqName[this.renderer.weatherQuality]}`, () => {
      const next = wq[(wq.indexOf(this.renderer.weatherQuality) + 1) % wq.length];
      this.renderer.setWeatherQuality(next);
      wb.textContent = `Weather: ${wqName[next]}`;
    }, 'btn');
    wb.title = 'Weather effects: High, Low (half the rain, snow and sand) or Off (no weather pictures; sandstorms still limit how far you see)';
    const slider = (parent: HTMLElement, value: number, title: string, set: (v: number) => void, max = 100) => {
      const s = el('input', 'vol-slider', parent);
      s.type = 'range';
      s.min = '0';
      s.max = String(max);
      s.value = String(Math.round(value * 100));
      s.title = title;
      s.setAttribute('aria-label', title);
      s.addEventListener('input', () => set(Number(s.value) / 100));
      s.addEventListener('keydown', (e) => e.stopPropagation());
      return s;
    };
    const snd = sec('Sound effects');
    const sb = button(snd, this.sfx.muted ? 'Sound: off' : 'Sound: on', () => {
      sb.textContent = this.sfx.toggleMute() ? 'Sound: off' : 'Sound: on';
    }, 'btn');
    slider(snd, this.sfx.volume, 'Volume', (v) => this.sfx.setVolume(v));

    // each kind of sound on its own slider (0–150 %), on top of the main volume
    el('div', 'panel-title', b, 'Sound mix');
    const mix = el('div', 'mix-grid', b);
    for (const c of SFX_CATS) {
      const name = el('span', 'mix-name', mix, c.name);
      name.title = c.hint;
      const val = el('span', 'mix-val', mix);
      const show = (v: number) => { val.textContent = `${Math.round(v * 100)}%`; };
      const s = slider(mix, this.sfx.mix[c.id], c.name, (v) => { this.sfx.setMix(c.id, v); show(v); }, 150);
      s.title = c.hint;
      show(this.sfx.mix[c.id]);
    }
    button(b, 'Reset sound mix', () => {
      for (const c of SFX_CATS) this.sfx.setMix(c.id, 1);
      mix.querySelectorAll<HTMLInputElement>('input').forEach((i) => { i.value = '100'; });
      mix.querySelectorAll<HTMLSpanElement>('.mix-val').forEach((v) => { v.textContent = '100%'; });
    }, 'btn small mix-reset');
    if (this.music) {
      const mu = this.music;
      const mus = sec('Music');
      const mb = button(mus, mu.muted ? 'Music: off' : 'Music: on', () => {
        mb.textContent = mu.toggleMute() ? 'Music: off' : 'Music: on';
      }, 'btn');
      slider(mus, mu.volume, 'Music volume', (v) => mu.setVolume(v));
    }
    const game = sec('Game');
    if (!this.ctl.online) button(game, 'Save now', () => this.saveNow(), 'btn');
    button(game, 'Test console (`)', () => { this.closeWin('settings'); this.toggleWin('dev'); }, 'btn');
    button(game, 'Reset layout', () => resetPanelLayout(), 'btn');
    button(game, 'Full screen', () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen().catch(() => this.log('Your browser refused full screen.', 'warn'));
    }, 'btn');
  }

  private buildSidebar(): void {
    const col = this.colA;
    this.buildStatus();

    // classic combat controls: stance (attack / balanced / defence), chase / stand, and PvP secure mode
    const fight = el('div', 'panel fight-modes', col);
    el('div', 'panel-title', fight, 'Combat');
    const fgrid = el('div', 'fm-grid', fight);
    let mode: FightMode = 'balanced';
    let chase = true;
    try {
      const m = localStorage.getItem('thornvale.fightMode');
      if (m === 'offensive' || m === 'balanced' || m === 'defensive') mode = m;
      chase = localStorage.getItem('thornvale.chase') !== '0';
    } catch { /* storage off */ }
    const fbtn: Array<[HTMLButtonElement, () => boolean]> = [];
    const apply = () => {
      this.ctl.send({ c: 'fightMode', mode, chase });
      try { localStorage.setItem('thornvale.fightMode', mode); localStorage.setItem('thornvale.chase', chase ? '1' : '0'); } catch { /* storage off */ }
      for (const [b, on] of fbtn) b.classList.toggle('on', on());
    };
    const fb = (label: string, tip: string, click: () => void, on: () => boolean) => {
      const b = button(fgrid, label, () => { click(); apply(); }, 'btn fm');
      b.title = tip;
      fbtn.push([b, on]);
    };
    fb('Attack', 'Offensive: hit harder (+20%), take more damage', () => { mode = 'offensive'; }, () => mode === 'offensive');
    fb('Balance', 'Balanced', () => { mode = 'balanced'; }, () => mode === 'balanced');
    fb('Defend', 'Defensive: take less damage (−25%), hit softer', () => { mode = 'defensive'; }, () => mode === 'defensive');
    fb('Follow', 'Chase: follow your target', () => { chase = true; }, () => chase);
    fb('Stand', 'Stand: keep your position while attacking', () => { chase = false; }, () => !chase);
    this.pvpBtn = button(fgrid, 'Secure', () => this.ctl.send({ c: 'secureMode', on: !this.s.player.secure }), 'btn fm pvp');
    this.pvpBtn.title = 'Secure mode: you cannot attack unmarked players and your area attacks spare them. Open: you can attack anyone, but attacking unmarked players gives you a skull.';
    this.pvpBtn.hidden = true;
    apply();

    // right flank: map, menu, equipment, inventory
    const right = this.colB;
    const mp = el('div', 'panel minimap-panel', right);
    const mt = el('div', 'panel-title map-title', mp);
    el('span', '', mt, 'Map');
    this.floorEl = el('div', 'floor-ind', mt);
    this.minimap = new Minimap(mp, this.ctl);
    button(mp, 'World map (M)', () => this.toggleWorldMap(), 'btn small wm-open');

    const tools = el('div', 'panel toolbar', right);
    button(tools, 'Spells', () => this.toggleWin('spells'), 'btn tool');
    button(tools, 'Quests', () => this.toggleWin('quests'), 'btn tool');
    this.friendsBtn = button(tools, 'Friends', () => { this.toggleWin('friends'); this.renderFriends(); }, 'btn tool');
    button(tools, 'Appearance', () => this.toggleWin('appearance'), 'btn tool');
    button(tools, 'Help', () => this.toggleWin('help'), 'btn tool');
    button(tools, 'Settings', () => this.toggleWin('settings'), 'btn tool');
    this.buildSettings();

    const eqp = el('div', 'panel equipment', right);
    el('div', 'panel-title', eqp, 'Equipment');
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

    // classic skills window: every skill with a thin bar to the next level; click the title to fold
    const sk = el('div', 'panel skills', col);
    const st = el('div', 'panel-title skills-title', sk, 'Skills');
    st.title = 'Click to fold or unfold. Skills rise by using them: fight with a weapon, block with a shield, spend mana, chop trees, fish.';
    this.skillsEl = el('div', 'skills-list', sk);
    try {
      if (localStorage.getItem('thornvale.skillsFolded') === '1') sk.classList.add('folded');
    } catch { /* storage off */ }
    st.addEventListener('click', () => {
      sk.classList.toggle('folded');
      try { localStorage.setItem('thornvale.skillsFolded', sk.classList.contains('folded') ? '1' : '0'); } catch { /* storage off */ }
    });

    const battle = el('div', 'panel battle', this.colA);
    const bt = el('div', 'panel-title battle-title', battle, 'Battle');
    bt.title = 'Click to fold or unfold. Drag the bottom edge of the list to make it taller or shorter.';
    this.battleEl = el('div', 'battle-list', battle);
    try {
      const h = localStorage.getItem('thornvale.battleHeight');
      if (h) this.battleEl.style.height = h;
      if (localStorage.getItem('thornvale.battleFolded') === '1') battle.classList.add('folded');
    } catch { /* storage off */ }
    bt.addEventListener('click', () => {
      battle.classList.toggle('folded');
      try { localStorage.setItem('thornvale.battleFolded', battle.classList.contains('folded') ? '1' : '0'); } catch { /* storage off */ }
    });
    new ResizeObserver(() => {
      if (battle.classList.contains('folded') || !this.battleEl.style.height) return;
      try { localStorage.setItem('thornvale.battleHeight', this.battleEl.style.height); } catch { /* storage off */ }
    }).observe(this.battleEl);

    // party: members with health, shared experience switch
    this.partyEl = el('div', 'panel party', this.colA);
    this.partyEl.hidden = true;

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
    const target = under.closest('.battle-row') as HTMLElement | null;
    if (target && src.kind === 'inv') {
      const id = this.dragItemId(src);
      const cid = Number(target.dataset.cid);
      if (id && itemDef(id).rune) return this.runeOn(cid, src.index);
      // any other item dropped on a player offers it in a trade
      if (target.classList.contains('k-player')) this.ctl.send({ c: 'tradeItem', id: cid, slot: src.index });
      return;
    }
    // dropped onto the pet window: the tortoise carries it (ui/petsUi.ts)
    if (src.kind === 'inv' && under.closest('.pet-win')) return this.ctl.send({ c: 'pet', a: 'put', i: src.index });
    // dropped into the open trade window: add to your offer
    if (src.kind === 'inv' && under.closest('.trade-win')) {
      const t = this.ctl.trade();
      if (t && !t.mine.slots.includes(src.index)) this.ctl.send({ c: 'tradeOffer', slots: [...t.mine.slots, src.index], gold: t.mine.gold });
      return;
    }
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
      // dropped on another player standing there: offer it in a trade
      if (src.kind === 'inv') {
        const other = this.ctl.game.players().find((o) => o.id !== this.ctl.pid && !o.dead && o.z === this.s.player.z && Math.round(o.x) === t.x && Math.round(o.y) === t.y);
        if (other) {
          this.ctl.send({ c: 'tradeItem', id: other.id, slot: src.index });
          return;
        }
      }
      if (src.kind === 'bag') {
        this.ctl.send({ c: 'moveBag', id: src.id, x: t.x, y: t.y, qty: d.ctrl ? 1 : undefined });
        this.renderer.showClickMarker(t.x, t.y);
        return;
      }
      this.ctl.send({ c: 'throw', from: src.kind === 'inv' ? src.index : src.slot, x: t.x, y: t.y, qty: d.ctrl ? 1 : undefined });
      this.renderer.showClickMarker(t.x, t.y);
      return;
    }
    if (src.kind === 'bag' && under.closest('.flank')) this.ctl.send({ c: 'pickup', id: src.id });
  }

  private useInventorySlot(i: number): void {
    const st = this.s.inventory.slots[i];
    const r = st ? itemDef(st.id).rune : undefined;
    // runes are aimed with the crosshair, the classic "use with…"
    if (r && runeIsAimed(r)) return this.beginAim(st!.id);
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

  /** Fires the aimed rune at a creature from the battle list. */
  runeOn(cid: number, slotIndex?: number): void {
    const id = slotIndex === undefined ? this.aiming : this.s.inventory.slots[slotIndex]?.id ?? null;
    this.cancelAim();
    if (!id || !itemDef(id).rune) return;
    const inv = this.s.inventory;
    const slot = slotIndex ?? inv.slots.findIndex((st, idx) => idx < inv.size() && st?.id === id);
    if (slot < 0) return this.log(`You have no ${itemDef(id).name.toLowerCase()} left.`, 'warn');
    this.ctl.send({ c: 'useRuneOn', slot, id: cid });
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
      items.push({ label: !runeIsAimed(d.rune) ? 'Use on yourself' : 'Use on target', run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    } else if (stationForItem(d.id)) items.push({ label: `Use (${stationForItem(d.id)!.title.toLowerCase()})`, run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.kind === 'tool' || RAW_FOOD_ITEMS.includes(d.id)) items.push({ label: 'Use', run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
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
    items.push({ label: `Follow ${c.name}`, run: () => this.ctl.send({ c: 'follow', id }) });
    items.push({ label: kind === 'player' ? `Inspect ${c.name}` : `Look at ${c.name}`, run: () => this.inspect(id) });
    if (kind === 'npc') items.push({ label: `Talk to ${c.name}`, run: () => this.ctl.send({ c: 'talk', id }) });
    if (kind === 'player') {
      if (g.pvp) items.push({ label: `Attack ${c.name}`, run: () => this.ctl.send({ c: 'attack', id }) });
      items.push({ label: `Trade with ${c.name}`, run: () => this.ctl.send({ c: 'tradeRequest', id }) });
      const fv = g.friendsView(this.ctl.pid);
      const isFriend = fv.friends.some((f) => f.name.toLowerCase() === c.name.toLowerCase());
      if (fv.requests.some((r) => r.id === id)) items.push({ label: `Accept ${c.name}'s friend request`, run: () => this.ctl.send({ c: 'friendAccept', id }) });
      else if (!isFriend) items.push({ label: `Add ${c.name} as friend`, run: () => this.ctl.send({ c: 'friendRequest', id }) });
      const flag = g.partyFlag(this.ctl.pid, id);
      const mine = g.partyView(this.ctl.pid);
      const lead = !mine || mine.leader === this.ctl.pid;
      if (flag === 2) items.push({ label: `Join ${c.name}'s party`, run: () => this.ctl.send({ c: 'partyJoin', id }) });
      else if (flag === 3) items.push({ label: `Revoke ${c.name}'s invitation`, run: () => this.ctl.send({ c: 'partyRevoke', id }) });
      else if (flag === 0 && lead) items.push({ label: `Invite ${c.name} to party`, run: () => this.ctl.send({ c: 'partyInvite', id }) });
      if (flag === 1 && mine?.leader === this.ctl.pid) items.push({ label: `Pass leadership to ${c.name}`, run: () => this.ctl.send({ c: 'partyLeader', id }) });
      items.push({ label: `Heal ${c.name} (exura sio)`, run: () => this.ctl.send({ c: 'cast', spell: 'exura_sio', param: c.name }), disabled: !this.s.spells.has('exura_sio') });
      items.push({ label: 'Message…', run: () => this.focusChat(`${c.name}, `) });
    }
    const pv = g.partyView(this.ctl.pid);
    if (pv) {
      if (pv.leader === this.ctl.pid) items.push({ label: pv.shared ? 'Disable shared experience' : 'Enable shared experience', run: () => this.ctl.send({ c: 'partyShare', on: !pv.shared }) });
      items.push({ label: 'Leave party', run: () => this.ctl.send({ c: 'partyLeave' }) });
    }
    items.push({ label: 'Look', run: () => this.log(`You see ${this.renderer.describeHover() || c.name}.`, 'info') });
    this.showMenu(items, x, y);
  }

  /**
   * Left-click on another player: with PvP on it attacks, if secure mode allows it
   * (the server checks every rule again); otherwise the usual menu.
   */
  clickPlayer(id: number, x: number, y: number): void {
    const g = this.ctl.game;
    const t = g.getPlayer(id);
    if (!g.pvp || !t) return this.creatureMenu('player', id, x, y);
    if (this.s.player.secure && g.skullOf(t) === 0) {
      this.log('Secure mode is on: you cannot attack unmarked players. Use the "PvP: secure" button to turn it off.', 'warn');
      return this.creatureMenu('player', id, x, y);
    }
    this.ctl.send({ c: 'attack', id });
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
    const bar2 = el('div', 'hot-row hot-row-ctrl', outer);
    bar2.title = 'Ctrl+1 … Ctrl+0 (or Alt+1 … Alt+0). In full screen your browser lets the game have Ctrl+number.';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const btn = el('button', 'hot-slot', i < 12 ? bar : bar2);
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
        e.btn.title = `Hotkey ${hotkeyName(i)} — empty. Assign from the spellbook or an item's right-click menu.`;
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
      if (sp.kind === 'healFriend' || sp.param) {
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
    if (r && runeIsAimed(r)) {
      // area runes are always aimed; single-target runes hit your target, or aim when you have none
      const t = this.ctl.game.getTarget(this.s.player.targetId);
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
        const skull = el('span', 'battle-skull', row, '☠');
        const info = el('div', 'battle-info', row);
        const name = el('span', 'battle-name', info, c.name);
        const bar = el('div', 'battle-bar', info);
        const fill = el('div', 'battle-fill', bar);
        row.dataset.cid = String(c.id);
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          // a rune picked from the bag or hotbar can be fired straight at someone on the list
          if (this.aiming && e.button === 0) return this.runeOn(c.id);
          if (c.kind === 'enemy') {
            if (e.button === 2) this.creatureMenu('enemy', c.id, e.clientX, e.clientY);
            else this.ctl.send({ c: 'attack', id: c.id });
          } else if (c.kind === 'npc') {
            if (e.button === 2) this.creatureMenu('npc', c.id, e.clientX, e.clientY);
            else this.ctl.send({ c: 'talk', id: c.id });
          } else if (e.button === 2) this.creatureMenu('player', c.id, e.clientX, e.clientY);
          else this.clickPlayer(c.id, e.clientX, e.clientY);
        });
        r = { row, fill, name, skull };
        this.battleRows.set(c.id, r);
      }
      if (c.kind === 'player') {
        const pl = g.getPlayer(c.id);
        const label = pl ? `${pl.name} · ${pl.level} ${VOCATIONS[pl.vocation].name}` : c.name;
        if (r.name.textContent !== label) r.name.textContent = label;
        const sk = pl ? g.skullOf(pl) : 0;
        const skCls = sk === 2 ? 'battle-skull red' : sk === 1 ? 'battle-skull white' : 'battle-skull';
        if (r.skull.className !== skCls) r.skull.className = skCls;
        r.row.classList.toggle('party', g.partyFlag(this.ctl.pid, c.id) === 1);
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
        const g: CooldownGroup | null = d.rune ? runeGroup(d.rune) : d.kind === 'consumable' ? 'potion' : null;
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

  /** Shows a server-wide announcement in the middle of the screen for a few seconds. */
  private announce(title: string, text: string, style: string): void {
    this.announceEl.replaceChildren();
    el('div', 'announce-title', this.announceEl, title);
    el('div', 'announce-text', this.announceEl, text);
    this.announceEl.className = `announce-banner ${style} show`;
    this.announceTimer = 7;
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
    this.makeWin('market', 'Market', 'market-win');
    this.makeWin('craft', 'Production', 'craft-win');
    this.makeWin('appearance', 'Appearance', 'appearance-win');
    this.makeWin('spells', 'Spellbook', 'spells-win');
    this.makeWin('quests', 'Quest Log', 'quests-win');
    this.makeWin('help', 'How to play', 'help-win');
    this.makeWin('dev', 'Test console', 'dev-win');
    this.makeWin('inspect', 'Inspect', 'inspect-win');
    this.makeWin('friends', 'Friends', 'friends-win');
    this.makeWin('corpse', 'Dead body', 'corpse-win');
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
    if (key === 'appearance') this.renderAppearance();
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
    if (key === 'market' && this.ctl.market()) this.ctl.send({ c: 'marketClose' });
    if (key === 'craft' && this.ctl.craft()) this.ctl.send({ c: 'craftClose' });
    if (key === 'appearance') {
      this.designer?.dispose();
      this.designer = null;
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
    for (const k of ['settings', 'dev', 'help', 'appearance', 'spells', 'quests', 'craft', 'market', 'trade', 'depot', 'dialog'] as const) {
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
    // premium depots hold more; items above a free depot's size stay after premium ends
    const pv = this.ctl.game.premiumView(this.ctl.pid);
    const cap = pv?.depotCap ?? DEPOT_SLOTS;
    let last = -1;
    depot.forEach((x, i) => { if (x) last = i; });
    const used = depot.filter(Boolean).length;
    el('p', 'hint', b, `Your personal depot is shared by every locker in the world. Click an item to take it; right-click (or Ctrl-click) backpack items to store them. ${used} of ${cap} slots used${cap < PREMIUM_DEPOT_SLOTS ? ` (premium: ${PREMIUM_DEPOT_SLOTS})` : ''}.`);
    if (used > cap) el('p', 'hint warn', b, 'Your depot holds more than a free account may fill. Everything stays; new items fit once it is back under the limit.');
    const grid = el('div', 'bag-grid depot-grid', b);
    for (let i = 0; i < Math.min(depot.length, Math.max(cap, last + 1)); i++) {
      const d = el('div', 'slot', grid);
      paintSlot(d, depot[i] ?? null);
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (depot[i]) this.ctl.send({ c: 'withdraw', index: i });
      });
    }
  }

  // ---------------------------------------------------------------- skills

  private renderSkills(): void {
    const s = this.s;
    const voc = s.player.vocation;
    const st = this.ctl.game.stages;
    const key = `${voc}|${s.player.level}|${st.name}|${JSON.stringify(s.skills)}|${NONCOMBAT_SKILLS.map((d) => Math.floor(s.gathering[d.id])).join(',')}`;
    if (key === this.skillsKey) return;
    this.skillsKey = key;
    const box = this.skillsEl;
    box.replaceChildren();
    // server rates (exp stages): what this character earns right now
    if (!isClassic(st)) {
      const rates = el('div', 'skill-rates', box, `Rates · ${expStageLine(st, s.player.level)}`);
      rates.title = `Server rates (${st.name}):\n${stagesTable(st).join('\n')}`;
    }
    const row = (name: string, level: number, frac: number, tip: string) => {
      const r = el('div', 'skill-row', box);
      r.title = tip;
      const top = el('div', 'skill-top', r);
      el('span', 'skill-name', top, name);
      el('span', 'skill-level', top, String(level));
      const bar = el('div', 'skill-bar', r);
      el('div', 'skill-fill', bar).style.width = `${Math.round(frac * 100)}%`;
    };
    for (const k of COMBAT_SKILLS) {
      const p = s.skills[k];
      const need = triesForNext(k, p.level, voc);
      const pct = Math.floor(skillProgress(k, p, voc) * 100);
      const how = k === 'magic' ? 'mana to spend' : k === 'shielding' ? 'blows to block' : 'attacks';
      row(SKILL_NAMES[k], p.level, skillProgress(k, p, voc), `${SKILL_NAMES[k]} ${p.level} — ${pct}% to the next level (${fmtGold(Math.max(0, Math.ceil(need - p.tries)))} more ${how})`);
    }
    // gathering and production skills come from the registry (gathering/skills.ts)
    for (const [kind, head] of [['gathering', 'Gathering'], ['production', 'Production']] as const) {
      el('div', 'skill-head', box, head);
      for (const d of NONCOMBAT_SKILLS) {
        if (d.kind !== kind) continue;
        const xp = s.gathering[d.id];
        const lv = gatherLevelForXp(xp);
        const left = lv >= WC_MAX_LEVEL ? 0 : gatherXpForLevel(lv + 1) - xp;
        row(d.name, lv, gatherProgress(xp), `${d.name} ${lv} — ${fmtGold(Math.floor(xp))} xp${lv < WC_MAX_LEVEL ? `, ${fmtGold(Math.ceil(left))} to level ${lv + 1}` : ' (maximum)'}. ${d.hint}`);
      }
    }
  }

  // ---------------------------------------------------------------- production stations (furnace, anvil)

  private renderCraft(): void {
    const w = this.wins.craft;
    const view = this.ctl.craft();
    if (!view) {
      w.open = false;
      w.root.hidden = true;
      return;
    }
    if (!w.open) {
      w.open = true;
      w.root.hidden = false;
      w.root.style.zIndex = String(++this.zTop);
    }
    // don't redraw under someone typing an amount
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && w.root.contains(a)) return;
    this.drawCraft(view);
  }

  private drawCraft(view: CraftView): void {
    const w = this.wins.craft;
    const b = w.body;
    const st = this.cw;
    b.replaceChildren();
    const title = w.root.querySelector('.win-title');
    if (title) title.textContent = view.title;
    const groups = [...new Set(view.recipes.map((r) => r.group))];
    if (st.station !== view.station || !groups.includes(st.tab)) {
      // open on the best metal you can work right now
      st.station = view.station;
      const usable = view.recipes.filter((r) => !r.locked);
      st.tab = (usable.find((r) => r.can > 0) ? [...usable].reverse().find((r) => r.can > 0)!.group : usable[usable.length - 1]?.group) ?? groups[0];
    }
    const name = SKILL_NAMES[view.skill];
    el('div', 'shop-gold', b, `${name} level ${view.level}.${view.note ? ` ${view.note}` : ''} Walking away stops the work.`);
    if (view.making) {
      const r = view.recipes.find((x) => x.id === view.making!.recipe);
      const row = el('div', 'craft-making', b);
      el('span', '', row, `${r?.label ? r.label : `Making ${r ? itemDef(r.output.id).name.toLowerCase() : '…'}`} — ${view.making.left} left`);
      button(row, 'Stop', () => this.ctl.send({ c: 'craft', recipe: '', count: 0 }), 'btn small');
    }
    if (groups.length > 1) {
      const tabs = el('div', 'market-tabs', b);
      for (const g of groups) {
        button(tabs, g, () => {
          st.tab = g;
          this.drawCraft(view);
        }, `btn small${st.tab === g ? ' on' : ''}`);
      }
    }
    const amount = el('div', 'bank-row', b);
    el('span', 'hint', amount, 'Make X:');
    const qi = el('input', 'num-input qty', amount);
    qi.type = 'number';
    qi.min = '1';
    qi.max = String(MAX_BATCH);
    qi.value = String(st.qty);
    qi.addEventListener('keydown', (e) => e.stopPropagation());
    qi.addEventListener('input', () => { st.qty = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(qi.value) || 1))); });
    qi.addEventListener('blur', () => this.renderCraft());
    const list = el('div', 'market-list craft-list', b);
    for (const r of view.recipes) {
      if (r.group !== st.tab) continue;
      const d = itemDef(r.output.id);
      const locked = r.locked;
      const rname = SKILL_NAMES[r.skill];
      const row = el('div', `shop-row${locked ? ' locked' : ''}`, list);
      const ic = el('div', 'slot mini', row);
      paintSlot(ic, { id: r.output.id, qty: r.output.qty });
      ic.title = describeItem(d);
      const info = el('div', 'shop-info', row);
      el('div', 'shop-name', info, r.label ?? `${r.output.qty > 1 ? `${r.output.qty}× ` : ''}${d.name}`);
      const needs = r.inputs.map((it) => `${it.qty} ${itemDef(it.id).name.toLowerCase()} (${it.have})`).join(' + ');
      el('div', 'shop-desc', info, `${r.skill === view.skill ? 'Level' : `${rname} level`} ${r.level} · ${needs} · ${r.xp} xp${r.chance < 100 ? ` · ${r.chance}% success` : ''}${r.hasTool ? '' : ` · needs ${itemDef(r.tool!).name.toLowerCase()}`}`);
      const btns = el('div', 'shop-btns', row);
      const make = (label: string, n: () => number) => {
        const bt = button(btns, label, () => this.ctl.send({ c: 'craft', recipe: r.id, count: n() }), 'btn small');
        bt.disabled = locked || r.can <= 0;
        if (locked) bt.title = `Needs ${rname.toLowerCase()} level ${r.level}`;
      };
      make('1', () => 1);
      make('5', () => 5);
      make('X', () => st.qty);
      make('All', () => Math.max(1, Math.min(MAX_BATCH, r.can)));
    }
  }

  // ---------------------------------------------------------------- market

  private renderMarket(): void {
    const w = this.wins.market;
    const view = this.ctl.market();
    if (!view) {
      w.open = false;
      w.root.hidden = true;
      this.mk.sel = null;
      return;
    }
    if (!w.open) {
      w.open = true;
      w.root.hidden = false;
      w.root.style.zIndex = String(++this.zTop);
    }
    // don't pull the rug from under someone typing a price
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && w.root.contains(a)) {
      if (!this.mk.dirty) {
        this.mk.dirty = true;
        a.addEventListener('blur', () => {
          this.mk.dirty = false;
          this.renderMarket();
        }, { once: true });
      }
      return;
    }
    this.drawMarket(view);
  }

  private drawMarket(view: MarketView): void {
    const b = this.wins.market.body;
    const st = this.mk;
    b.replaceChildren();
    const carried = this.s.inventory.count('gold');
    el('div', 'shop-gold', b, `Bank ${fmtGold(view.bank)} gold · carrying ${fmtGold(carried)} gold. Purchases are paid from the bank (then from your backpack) and delivered to your depot.`);
    if (!view.enabled) el('p', 'hint warn', b, 'The market is closed for now. Your offers and items are safe.');
    const tabs = el('div', 'market-tabs', b);
    const mine = view.offers.filter((o) => o.mine);
    for (const [id, label] of [['browse', 'Buy'], ['sell', 'Sell'], ['mine', `My offers (${mine.length})`]] as const) {
      button(tabs, label, () => {
        st.tab = id;
        this.drawMarket(view);
      }, `btn small${st.tab === id ? ' on' : ''}`);
    }
    const stop = (i: HTMLInputElement) => i.addEventListener('keydown', (e) => e.stopPropagation());
    const numInput = (parent: HTMLElement, value: number, min: number, max: number, onInput: (n: number) => void) => {
      const i = el('input', 'num-input', parent);
      i.type = 'number';
      i.min = String(min);
      i.max = String(max);
      i.value = String(value);
      stop(i);
      i.addEventListener('input', () => onInput(Math.max(min, Math.min(max, Math.floor(Number(i.value) || min)))));
      return i;
    };
    const itemCell = (parent: HTMLElement, id: string, qty: number) => {
      const ic = el('div', 'slot mini', parent);
      paintSlot(ic, { id, qty });
      return ic;
    };

    if (st.tab === 'browse') {
      const sr = el('div', 'bank-row', b);
      const q = el('input', 'text-input', sr);
      q.placeholder = 'Search items…';
      q.value = st.search;
      stop(q);
      const list = el('div', 'market-list', b);
      const fill = () => {
        list.replaceChildren();
        const needle = st.search.trim().toLowerCase();
        const shown = view.offers.filter((o) => !needle || itemDef(o.item).name.toLowerCase().includes(needle));
        if (!shown.length) el('div', 'shop-empty', list, view.offers.length ? 'No offers match.' : 'Nobody is selling anything yet.');
        for (const o of shown.slice(0, 200)) {
          const d = itemDef(o.item);
          const r = el('div', 'shop-row', list);
          itemCell(r, o.item, o.qty);
          const info = el('div', 'shop-info', r);
          el('div', 'shop-name', info, `${o.qty}× ${d.name}`);
          el('div', 'shop-desc', info, `${fmtGold(o.price)} gold each · from ${o.seller}${o.mine ? ' (you)' : ''}`);
          const btns = el('div', 'shop-btns', r);
          if (o.mine) {
            el('span', 'shop-empty', btns, 'your offer');
            continue;
          }
          let n = Math.min(o.qty, st.buyQty.get(o.id) ?? 1);
          const buy = button(btns, '', () => this.ctl.send({ c: 'marketBuy', id: o.id, qty: n }), 'btn small');
          const label = () => {
            buy.textContent = `Buy ${n} · ${fmtGold(n * o.price)}`;
            buy.disabled = !view.enabled || n * o.price > view.bank + carried;
          };
          if (o.qty > 1) numInput(btns, n, 1, o.qty, (v) => { n = v; st.buyQty.set(o.id, v); label(); }).classList.add('qty');
          label();
        }
      };
      q.addEventListener('input', () => {
        st.search = q.value;
        fill();
      });
      fill();
    } else if (st.tab === 'sell') {
      el('p', 'hint', b, `Pick an item from your depot or backpack, then set how many and the price for each. Listing costs 1% of the total (at least 1 gold) from your bank. The items wait in the market until someone buys them; the gold goes to your bank, even while you are away.`);
      const cols = el('div', 'shop-cols', b);
      const pick = (title: string, from: 'depot' | 'inv', stacks: Array<ItemStack | null>) => {
        const c = el('div', 'shop-col', cols);
        el('div', 'panel-title', c, title);
        const grid = el('div', 'bag-grid market-pick', c);
        let any = false;
        stacks.forEach((x, i) => {
          if (!x || x.id === 'gold' || !ITEMS[x.id]) return;
          any = true;
          const d = el('div', 'slot', grid);
          paintSlot(d, x);
          if (st.sel && st.sel.from === from && st.sel.index === i) d.classList.add('offered');
          d.addEventListener('mousedown', (e) => {
            e.preventDefault();
            st.sel = { from, index: i };
            st.qty = x.qty;
            if (!st.price) st.price = Math.max(1, itemDef(x.id).value);
            this.drawMarket(view);
          });
        });
        if (!any) el('div', 'shop-empty', c, 'Nothing to sell here.');
      };
      pick('Depot', 'depot', view.depot);
      const inv = this.s.inventory;
      pick('Backpack', 'inv', inv.slots.slice(0, inv.size()));
      const sel = st.sel;
      const stack = sel ? (sel.from === 'depot' ? view.depot[sel.index] : inv.slots[sel.index]) : null;
      const form = el('div', 'market-form', b);
      if (!sel || !stack) {
        el('div', 'shop-empty', form, 'Select an item to sell.');
      } else {
        const d = itemDef(stack.id);
        const r = el('div', 'bank-row', form);
        itemCell(r, stack.id, stack.qty);
        el('span', 'shop-name', r, d.name);
        el('span', 'dev-label', r, 'Amount');
        st.qty = Math.max(1, Math.min(stack.qty, st.qty));
        const summary = el('div', 'shop-desc', form);
        const go = button(form, 'Create offer', () => this.ctl.send({ c: 'marketSell', from: sel.from, index: sel.index, qty: st.qty, price: st.price }), 'btn');
        const update = () => {
          const total = st.qty * st.price;
          const fee = marketFee(total);
          summary.textContent = `${st.qty}× ${d.name} at ${fmtGold(st.price)} gold each = ${fmtGold(total)} gold. Listing fee: ${fmtGold(fee)} gold. Traders would pay ${fmtGold(d.value)} each.`;
          go.disabled = !view.enabled || st.price < 1 || fee > view.bank + carried;
        };
        numInput(r, st.qty, 1, stack.qty, (v) => { st.qty = v; update(); });
        el('span', 'dev-label', r, 'Price each');
        numInput(r, st.price, 1, MARKET_MAX_PRICE, (v) => { st.price = v; update(); });
        update();
      }
    } else {
      const list = el('div', 'market-list', b);
      if (!mine.length) el('div', 'shop-empty', list, 'You have no offers. Use the Sell tab to list something.');
      for (const o of mine) {
        const d = itemDef(o.item);
        const r = el('div', 'shop-row', list);
        itemCell(r, o.item, o.qty);
        const info = el('div', 'shop-info', r);
        el('div', 'shop-name', info, `${o.qty}× ${d.name}`);
        const days = Math.max(0, Math.ceil((o.expires - Date.now()) / 86_400_000));
        el('div', 'shop-desc', info, `${fmtGold(o.price)} gold each · ends in ${days} day${days === 1 ? '' : 's'}`);
        const bb = button(r, 'Cancel', () => this.ctl.send({ c: 'marketCancel', id: o.id }), 'btn small');
        bb.disabled = !view.enabled;
      }
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
    el('p', 'hint', b, 'Drag items from your backpack here (or onto the other player) to offer them; click an item in your offer to take it back. Changing an offer clears both acceptances; the trade happens only when both of you accept.');
    const cols = el('div', 'trade-cols', b);
    const side = (title: string, items: ItemStack[], gold: number, accepted: boolean, onClick?: (i: number) => void) => {
      const c = el('div', 'trade-col', cols);
      el('div', 'panel-title', c, `${title}${accepted ? ' ✔ accepted' : ''}`);
      const grid = el('div', 'bag-grid', c);
      items.forEach((it, i) => {
        const d = el('div', 'slot', grid);
        paintSlot(d, it);
        if (onClick) {
          d.title = `${itemDef(it.id).name} — click to take it back`;
          d.style.cursor = 'pointer';
          d.addEventListener('click', () => onClick(i));
        }
      });
      if (!items.length) el('div', 'shop-empty', c, 'No items.');
      el('div', 'trade-gold', c, `Gold: ${fmtGold(gold)}`);
      return c;
    };
    const mine = side('Your offer', t.mine.items, t.mine.gold, t.mine.accepted, (i) => this.ctl.send({ c: 'tradeOffer', slots: t.mine.slots.filter((_, k) => k !== i), gold: t.mine.gold }));
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

  // ---------------------------------------------------------------- appearance

  /**
   * The character designer in game: free, anywhere. The preview shows the worn gear
   * (switchable) so a helmet's effect on the hair is visible before confirming.
   */
  private renderAppearance(): void {
    const w = this.wins.appearance;
    const b = w.body;
    this.designer?.dispose();
    b.replaceChildren();
    const d = new CharacterDesigner(b, this.s.player.appearance);
    this.designer = d;
    const gearNow = () => {
      const eq = this.s.inventory.equipment;
      const id = (k: keyof typeof eq) => eq[k]?.id ?? null;
      return { weapon: id('weapon'), shield: id('shield'), armor: id('armor'), head: id('head'), legs: id('legs'), feet: id('feet'), cloak: this.s.player.cloak || null, cape: this.s.cosmetics.hideCloak ? null : id('cape') };
    };
    d.setGear(this.designerGear ? gearNow() : null);
    const opts = el('div', 'dev-row', b);
    el('span', 'dev-label', opts, 'Preview');
    const gb = button(opts, this.designerGear ? 'Worn gear: shown' : 'Worn gear: hidden', () => {
      this.designerGear = !this.designerGear;
      d.setGear(this.designerGear ? gearNow() : null);
      gb.textContent = this.designerGear ? 'Worn gear: shown' : 'Worn gear: hidden';
      gb.classList.toggle('on', this.designerGear);
    }, `btn small${this.designerGear ? ' on' : ''}`);
    // founder looks: cloak and title can be switched off per character
    const tier = this.ctl.game.premiumView(this.ctl.pid)?.tier ?? null;
    // a worn cape can be hidden with the same switch as the founder cloak
    const capeOn = !!this.s.inventory.equipment.cape;
    if (tier || capeOn) {
      const fr = el('div', 'dev-row', b);
      el('span', 'dev-label', fr, tier ? 'Founder' : 'Cape');
      const cos = this.s.cosmetics;
      const what = tier ? (capeOn ? 'Cloak & cape' : 'Cloak') : 'Cape';
      const cb = button(fr, cos.hideCloak ? `${what}: hidden` : `${what}: shown`, () => {
        this.ctl.send({ c: 'cosmetics', cloak: cos.hideCloak });
        cos.hideCloak = !cos.hideCloak;
        cb.textContent = cos.hideCloak ? `${what}: hidden` : `${what}: shown`;
        cb.classList.toggle('on', !cos.hideCloak);
      }, `btn small${cos.hideCloak ? '' : ' on'}`);
      if (tier) {
        const tb = button(fr, cos.hideTitle ? 'Title: hidden' : 'Title: shown', () => {
          this.ctl.send({ c: 'cosmetics', title: cos.hideTitle });
          cos.hideTitle = !cos.hideTitle;
          tb.textContent = cos.hideTitle ? 'Title: hidden' : 'Title: shown';
          tb.classList.toggle('on', !cos.hideTitle);
        }, `btn small${cos.hideTitle ? '' : ' on'}`);
      }
    }
    const row = el('div', 'trade-actions', b);
    button(row, 'Confirm', () => {
      this.ctl.send({ c: 'appearance', ap: encodeAppearance(d.value) });
      this.closeWin('appearance');
    }, 'btn on');
    button(row, 'Cancel', () => this.closeWin('appearance'), 'btn');
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
      el('div', 'spell-name', info, `${sp.name} — "${sp.words}${sp.kind === 'healFriend' ? ' "name"' : sp.param ? ` "${sp.param}` : ''}"`);
      el('div', 'spell-desc', info, `${sp.description} · Level ${sp.level} · ${sp.mana} mana · cooldown ${sp.cooldown}s${known ? '' : ` · learn for ${fmtGold(sp.price)} gold`}`);
      const btns = el('div', 'shop-btns', r);
      const cast = button(btns, 'Cast', () => sp.kind === 'healFriend' || sp.param ? this.focusChat(`${sp.words} "`) : this.ctl.send({ c: 'cast', spell: sp.id }), 'btn small');
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
    const lay = el('p', 'hint', b, 'Layout: drag the striped bar at the top of a side panel to move it, drag its bottom edge to resize it, drag the left edge of the side bar to widen it, drag the top edge of the chat to make it taller, and ⇅ on the action bar moves it to the top of the game view. ');
    button(lay, 'Reset layout', () => resetPanelLayout(), 'btn small');
    const grid = el('div', 'help-grid', b);
    const rows: Array<[string, string]> = [
      ['WASD / arrows', 'Walk (Q E Z C or numpad for diagonals)'],
      ['Left-click ground', 'Walk there (path-finding)'],
      ['Left-click monster', 'Attack — your character fights automatically'],
      ['Left-click NPC', 'Talk: trade, bank, quests, travel, spells'],
      ['Click ladders, ropes, lockers…', 'Use them (rope spots need a rope, loose stones a shovel)'],
      ['Right-click', 'Context menu: trade with players, item actions'],
      ['F1 – F12', 'Hotkeys (spells, potions, runes)'],
      ['Ctrl+1 – Ctrl+0', 'Second hotkey row, made for runes in PvP (Alt+1 – Alt+0 also works; use Full screen in Settings so the browser lets the game have Ctrl+number)'],
      ['Enter', 'Chat; saying spell words casts spells (e.g. exura)'],
      ['Tab / Space', 'Target the next monster'],
      ['Esc', 'Close windows / clear target'],
      ['Mouse wheel', 'Zoom'],
      ['M', 'World map (every floor, click to walk)'],
      ['Ctrl + direction / Ctrl+R', 'Turn without moving'],
      ['` (key under Esc)', 'Test console: levels, gold, items, teleports (also /help in chat)'],
      ['Ctrl-click item', 'Store in depot while a locker is open'],
      ['Click a tree (with an axe)', 'Chop it: logs and woodcutting experience (higher trees need higher woodcutting)'],
      ['Click water within 3 tiles (with a fishing rod)', 'Fish: catches to eat or sell and fishing experience (better fish need higher fishing; ice fish near snow, swordfish in deep sea)'],
      ['Market board (in depots)', 'Buy from and sell to other players; gold goes to the bank, items to the depot'],
      ['Click an ore rock (with a pickaxe)', 'Mine it: ore, sometimes a gem, and mining experience (copper and tin near towns, rarer ore deeper underground)'],
      ['Furnace / anvil (in every smithy)', "Furnace: smelt ore into bars, or cast rings and amulets from silver/gold bars and cut gems (crafting). Anvil (with a smith's hammer): smith bars into weapons, armour, pickaxes and arrowheads. Make 1, 5, X or All; walking stops it"],
      ['Use a knife (or arrow shafts)', 'Fletching: carve logs into arrow shafts, bows and crossbow stocks; shafts + feathers + arrowheads make arrows'],
      ['Use a needle / a chisel', 'Crafting: sew leather and fur (with thread) into armour, bags and backpacks; cut gems. Tan hides at the tanning rack in every smithy'],
      ['Use a tinderbox', 'Firemaking: light logs where you stand (not in towns); you step aside. The fire burns 1–2 minutes'],
      ['Click a campfire or a stove', 'Cooking: raw fish and meat become food that heals more; burns less as you level. Every depot has a stove'],
    ];
    for (const [k, v] of rows) {
      el('div', 'help-key', grid, k);
      el('div', 'help-val', grid, v);
    }
    const st = this.ctl.game.stages;
    el('div', 'panel-title', b, `Server rates (${st.name})`);
    el('p', 'hint help-rates', b, (isClassic(st) ? ['Classic: everything ×1.'] : stagesTable(st)).join('\n'));
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

  /** A game master's pop-up: stays until the player clicks OK. */
  private adminNotice(title: string, text: string): void {
    const box = el('div', 'admin-notice', this.root);
    const card = el('div', 'admin-card', box);
    el('div', 'admin-title', card, `⚠ ${title}`);
    el('div', 'admin-text', card, text);
    const ok = button(card, 'OK, understood', () => box.remove(), 'btn');
    ok.focus();
    this.log(`${title}: ${text}`, 'warn');
  }

  /** Friends window: online first; friend requests at the top. */
  private renderFriends(): void {
    const fv = this.ctl.game.friendsView(this.ctl.pid);
    this.friendsBtn.textContent = fv.requests.length ? `Friends (${fv.requests.length})` : 'Friends';
    this.friendsBtn.classList.toggle('on', fv.requests.length > 0);
    const w = this.wins.friends;
    if (!w.open) return;
    const b = w.body;
    b.replaceChildren();
    for (const r of fv.requests) {
      const row = el('div', 'friend-row request', b);
      el('span', 'friend-name', row, `${r.name} wants to be your friend`);
      button(row, 'Accept', () => this.ctl.send({ c: 'friendAccept', id: r.id }), 'btn small');
      button(row, 'Decline', () => this.ctl.send({ c: 'friendDecline', id: r.id }), 'btn small');
    }
    if (!fv.friends.length) el('p', 'hint', b, 'No friends yet. Right-click a player and choose "Add … as friend"; they have to accept.');
    for (const f of fv.friends) {
      const row = el('div', `friend-row${f.online ? ' online' : ''}`, b);
      el('span', 'friend-dot', row);
      el('span', 'friend-name', row, f.online ? `${f.name}${f.level ? ` (${f.level})` : ''}` : f.name);
      el('span', 'friend-state', row, f.online ? 'online' : 'offline');
      button(row, 'Message', () => this.focusChat(`${f.name}, `), 'btn tiny');
      button(row, '✕', () => this.ctl.send({ c: 'friendRemove', name: f.name }), 'btn tiny');
    }
  }

  /** Inspect window: who someone is and what they wear. */
  /** Opens a dead body's loot window (the server walks you up to it). */
  openCorpse(id: number): void {
    this.corpseId = id;
    this.toggleWin('corpse', true);
    this.renderCorpse();
  }

  private renderCorpse(): void {
    const w = this.wins.corpse;
    if (!w.open || this.corpseId === null) return;
    const g = this.ctl.game;
    const bag = g.bags.find((x) => x.id === this.corpseId);
    const b = w.body;
    b.replaceChildren();
    if (!bag) {
      this.closeWin('corpse');
      return;
    }
    (w.root.querySelector('.win-title') as HTMLElement).textContent = `Dead body of ${bag.corpse ?? 'someone'}`;
    if (!bag.items.length) {
      el('p', 'hint', b, 'Nothing left on the body.');
      return;
    }
    el('p', 'hint', b, 'Click an item to take it.');
    const grid = el('div', 'bag-grid', b);
    bag.items.forEach((it, i) => {
      const d = el('div', 'slot', grid);
      paintSlot(d, it);
      d.title = describeItem(itemDef(it.id));
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.ctl.send({ c: 'pickup', id: bag.id, take: i });
      });
    });
    button(b, 'Take all', () => this.ctl.send({ c: 'pickup', id: bag.id, take: -1 }), 'btn');
  }

  inspect(id: number): void {
    this.inspectId = id;
    this.toggleWin('inspect', true);
    this.renderInspect();
  }

  private renderInspect(): void {
    const w = this.wins.inspect;
    if (!w.open || this.inspectId === null) return;
    const g = this.ctl.game;
    const c = g.getCreature(this.inspectId);
    const b = w.body;
    b.replaceChildren();
    if (!c) { el('p', 'hint', b, 'Out of sight.'); return; }
    (w.root.querySelector('.win-title') as HTMLElement).textContent = c.name;
    const pl = g.getPlayer(c.id);
    const lines: Array<[string, string]> = [];
    if (pl) {
      if (pl.title) lines.push(['Title', pl.title]);
      lines.push(['Level', String(pl.level)], ['Vocation', VOCATIONS[pl.vocation].name], ['Health', `${Math.round((pl.hp / pl.maxHp) * 100)}%`]);
      if (pl.premium) lines.push(['Account', '♛ Premium']);
      const sk = g.skullOf(pl);
      if (sk) lines.push(['Skull', sk === 2 ? 'red' : 'white']);
      const pf = g.partyFlag(this.ctl.pid, pl.id);
      if (pf === 1) lines.push(['Party', 'in your party']);
      if (pl.id === this.ctl.pid) lines.push(['Experience', fmtGold(pl.exp)]);
    } else {
      const en = g.getEnemy(c.id);
      lines.push(['Health', `${Math.round((c.hp / c.maxHp) * 100)}%`]);
      if (en) lines.push(['Experience', String(en.def.exp)], ['Hit points', String(en.maxHp)]);
    }
    const tbl = el('div', 'inspect-stats', b);
    for (const [k, v] of lines) { el('span', 'k', tbl, k); el('span', 'v', tbl, v); }
    const sess = pl ? g.session(pl.id) : null;
    if (sess) {
      el('div', 'panel-title', b, 'Equipment');
      const grid = el('div', 'bag-grid', b);
      for (const e of EQUIP_LAYOUT) {
        const st = sess.inventory.equipment[e.slot];
        const d = el('div', 'slot', grid);
        paintSlot(d, st, e.ph);
        if (st) d.title = itemDef(st.id).name;
      }
      const sets = g.activeSets(sess);
      if (sets.length) {
        el('div', 'panel-title', b, 'Set bonuses');
        for (const a of sets) el('div', 'hint', b, `${a.set.name} (${a.count}/${a.set.pieces.length}): ${a.bonuses.flatMap(bonusParts).join(', ')}`);
      }
    }
    if (pl && pl.id !== this.ctl.pid) {
      const row = el('div', 'trade-actions', b);
      button(row, 'Follow', () => this.ctl.send({ c: 'follow', id: pl.id }), 'btn small');
      button(row, 'Trade', () => this.ctl.send({ c: 'tradeRequest', id: pl.id }), 'btn small');
      button(row, 'Add friend', () => this.ctl.send({ c: 'friendRequest', id: pl.id }), 'btn small');
    }
  }

  /** Party panel: rebuilt when membership changes, health bars every frame. */
  private renderParty(): void {
    const pv = this.ctl.game.partyView(this.ctl.pid);
    this.partyEl.hidden = !pv;
    if (!pv) { this.partyKey = ''; return; }
    const key = JSON.stringify([pv.leader, pv.shared, pv.sharedActive, pv.members.map((m) => [m.id, m.name, m.level])]);
    if (key !== this.partyKey) {
      this.partyKey = key;
      const b = this.partyEl;
      b.replaceChildren();
      el('div', 'panel-title', b, 'Party');
      for (const m of pv.members) {
        const row = el('div', 'party-row', b);
        row.dataset.pid = String(m.id);
        el('span', 'party-name', row, `${m.id === pv.leader ? '★ ' : ''}${m.name} (${m.level})`);
        const bar = el('div', 'battle-bar', row);
        el('div', 'battle-fill party-fill', bar);
        if (m.id !== this.ctl.pid) row.addEventListener('mousedown', (e) => { e.preventDefault(); this.creatureMenu('player', m.id, e.clientX, e.clientY); });
      }
      const st = el('div', `party-share${pv.shared ? (pv.sharedActive ? ' on' : ' idle') : ''}`, b,
        pv.shared ? (pv.sharedActive ? 'Shared experience: active (+20%)' : 'Shared experience: on, inactive (too far apart or levels too different)') : 'Shared experience: off');
      st.title = 'Members on the same floor within 30 tiles of the kill share its experience evenly, with a 20% bonus. The lowest level must be at least 2/3 of the highest.';
      const row = el('div', 'trade-actions', b);
      if (pv.leader === this.ctl.pid) button(row, pv.shared ? 'Share exp: ON' : 'Share exp: OFF', () => this.ctl.send({ c: 'partyShare', on: !pv.shared }), `btn small${pv.shared ? ' on' : ''}`);
      button(row, 'Leave', () => this.ctl.send({ c: 'partyLeave' }), 'btn small');
    }
    for (const m of pv.members) {
      const live = this.ctl.game.getPlayer(m.id);
      const frac = live ? live.hp / live.maxHp : m.hp / Math.max(1, m.mhp);
      const fill = this.partyEl.querySelector(`.party-row[data-pid="${m.id}"] .party-fill`) as HTMLDivElement | null;
      if (fill) { fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; fill.style.background = hpColor(frac); }
    }
  }

  // ================================================================ tutorial objective bar

  private buildTutorial(): void {
    const root = el('div', 'panel tut-bar', this.root);
    const head = el('div', 'tut-head', root);
    el('span', 'tut-tag', head, 'Tutorial');
    const title = el('span', 'tut-title', head);
    const nav = el('span', 'tut-nav', head);
    const arrow = el('span', 'tut-arrow', nav, '➤');
    const dist = el('span', 'tut-dist', nav);
    const hint = el('div', 'tut-hint', root);
    const todo = el('div', 'tut-todo', root);
    const skip = button(head, 'Skip tutorial', () => {
      // two clicks, so nobody leaves the island by accident
      if (this.tut.armed > 0) {
        this.tut.armed = 0;
        this.ctl.send({ c: 'tutorialSkip' });
        return;
      }
      this.tut.armed = 4;
      skip.textContent = 'Click again to sail to Thornvale';
    }, 'btn tiny tut-skip');
    skip.title = 'Your account has finished the island before. Skipping gives you the same gear a graduate leaves with.';
    this.tut = { root, title, arrow, dist, hint, todo, skip, armed: 0, timer: 0 };
  }

  private renderTutorial(): void {
    if (!this.tut) return;
    const t = this.s.tutorial;
    const on = t.state === 'active';
    this.tut.root.classList.toggle('on', on);
    if (!on) return;
    const st = tutorialStep(t.step);
    if (!st) return;
    this.tut.title.textContent = `${t.step}/${TUTORIAL_LAST} · ${st.title}${st.optional ? ' (optional)' : ''}`;
    this.tut.hint.textContent = st.hint;
    const parts: string[] = [];
    if (st.id === 'rats') parts.push(`Rats slain: ${t.count}/${st.need ?? 3}`);
    if (st.id === 'loot') parts.push(`${t.flags & 1 ? '✔' : '○'} pick up loot`, `${t.flags & 2 ? '✔' : '○'} eat`);
    if (st.id === 'depot') parts.push(`${t.flags & 1 ? '✔' : '○'} store an item in the depot`, `${t.flags & 2 ? '✔' : '○'} bank your gold`);
    if (st.id === 'cellar') parts.push(`${t.flags & 1 ? '✔' : '○'} down into the cellar`, '○ climb out by rope');
    this.tut.todo.textContent = parts.join('   ');
    this.tut.todo.hidden = !parts.length;
    this.tut.skip.hidden = !t.canSkip;
    if (!this.tut.armed) this.tut.skip.textContent = 'Skip tutorial';
    this.tut.timer = 0;
  }

  /** Points the objective arrow from the player towards the current target (north is up on screen). */
  private updateTutorialArrow(dt: number): void {
    const tut = this.tut;
    if (!tut || this.s.tutorial.state !== 'active') return;
    if (tut.armed > 0) {
      tut.armed -= dt;
      if (tut.armed <= 0) { tut.armed = 0; tut.skip.textContent = 'Skip tutorial'; }
    }
    tut.timer -= dt;
    if (tut.timer > 0) return;
    tut.timer = 0.2;
    const p = this.s.player;
    const goal = this.ctl.game.tutorialTarget(this.ctl.pid);
    if (!goal) {
      tut.arrow.hidden = true;
      tut.dist.textContent = '';
      return;
    }
    tut.arrow.hidden = false;
    if (goal.z !== p.z) {
      tut.arrow.style.transform = `rotate(${goal.z < p.z ? 90 : -90}deg)`;
      tut.dist.textContent = goal.z < p.z ? 'go down' : 'go up';
      return;
    }
    const dx = goal.x - p.x, dy = goal.y - p.y;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d <= 1) {
      tut.arrow.hidden = true;
      tut.dist.textContent = 'here';
      return;
    }
    tut.arrow.style.transform = `rotate(${Math.round(Math.atan2(dy, dx) * 180 / Math.PI)}deg)`;
    tut.dist.textContent = `${d} tiles`;
  }

  update(dt: number): void {
    this.updateTutorialArrow(dt);
    this.music?.update();
    this.renderParty();
    this.inspectTimer -= dt;
    if (this.inspectTimer <= 0) { this.inspectTimer = 0.5; this.renderInspect(); }
    const s = this.s;
    const p = s.player;
    const g = this.ctl.game;
    this.nameEl.textContent = p.name;
    const lvl = String(p.level);
    if (this.lvlBadge.textContent !== lvl) this.lvlBadge.textContent = lvl;
    this.levelEl.textContent = `${VOCATIONS[p.vocation].name} · level ${p.level}`;
    this.setBar(this.hp, p.hp / p.maxHp, `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.hp.fill.style.background = hpColor(p.hp / p.maxHp);
    this.setBar(this.mp, p.maxMana ? p.mana / p.maxMana : 0, `${Math.floor(p.mana)} / ${p.maxMana}`);
    const need = expForLevel(p.level + 1) - p.exp;
    this.setBar(this.xp, p.levelProgress(), `${Math.floor(p.levelProgress() * 100)}% · ${fmtGold(need)} to go`);
    const w = s.inventory.weight();
    this.capEl.textContent = `Cap ${Math.floor(p.capacity - w)} oz · Gold ${fmtGold(s.inventory.count('gold'))}${s.bank ? ` (+${fmtGold(s.bank)} bank)` : ''}`;
    const buffs: string[] = [];
    if (p.buffs.strongHaste > 0) buffs.push('⇶ strong haste');
    else if (p.buffs.haste > 0) buffs.push('⇶ haste');
    if (p.buffs.magicShield > 0) buffs.push('◈ magic shield');
    if (p.buffs.light > 0 || p.buffs.greatLight > 0 || p.buffs.ultimateLight > 0) buffs.push('☀ light');
    if (p.buffs.invisible > 0) buffs.push('◌ invisible');
    if (p.buffs.illusion > 0 && p.illusion) buffs.push(`◐ illusion`);
    if (p.buffs.poisoned > 0) buffs.push('☣ poisoned');
    if (p.buffs.rooted > 0) buffs.push('❦ rooted');
    const mins = (t: number) => `${Math.ceil(t / 60)}m`;
    if (p.buffs.berserk > 0) buffs.push(`⚔ fury ${mins(p.buffs.berserk)}`);
    if (p.buffs.bullseye > 0) buffs.push(`◎ hawk eye ${mins(p.buffs.bullseye)}`);
    if (p.buffs.mastermind > 0) buffs.push(`✦ clarity ${mins(p.buffs.mastermind)}`);
    if (g.isProtected(p)) buffs.push('⛨ protection zone');
    if (p.pzLock > 0) buffs.push(`⚠ PZ-locked ${Math.ceil(p.pzLock)}s`);
    const prem = g.premiumView(this.ctl.pid);
    if (prem && prem.until > Date.now()) buffs.push(`♛ premium ${Math.ceil((prem.until - Date.now()) / 86_400_000)}d`);
    else if (prem?.enforced) buffs.push('free account');
    const mySkull = g.skullOf(p);
    if (mySkull === 2) buffs.push('☠ red skull');
    else if (mySkull === 1) buffs.push('☠ white skull');
    this.pvpBtn.hidden = !g.pvp;
    const pvpLabel = p.secure ? 'Secure' : 'Open PvP';
    if (this.pvpBtn.textContent !== pvpLabel) {
      this.pvpBtn.textContent = pvpLabel;
      this.pvpBtn.classList.toggle('pvp-open', !p.secure);
    }
    const bt = buffs.join('  ');
    if (this.buffsEl.textContent !== bt) this.buffsEl.textContent = bt;
    const floorText = p.z === 0 ? 'Ground floor' : p.z > 0 ? `Floor +${p.z}` : `Underground ${p.z}`;
    if (this.floorEl.textContent !== floorText) this.floorEl.textContent = floorText;
    const where = g.world.regionAt(p.x, p.y, p.z)?.name;
    const loc = where ? `${where} · ${floorText}` : floorText;
    if (this.topLoc.textContent !== loc) this.topLoc.textContent = loc;

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

    const t = g.getTarget(p.targetId);
    if (t && !t.dead) {
      this.targetEl.classList.add('on');
      this.targetName.textContent = t instanceof Enemy && t.def.boss ? `♛ ${t.name}${t.def.title ? `, ${t.def.title}` : ''}` : t instanceof Enemy && t.def.elite ? `★ ${t.name}` : t.name;
      this.targetFill.style.width = `${(t.hp / t.maxHp) * 100}%`;
      this.targetFill.style.background = hpColor(t.hp / t.maxHp);
    } else {
      this.targetEl.classList.remove('on');
    }

    this.updateHotbarCooldowns();
    this.skillsTimer -= dt;
    if (this.skillsTimer <= 0) {
      this.skillsTimer = 0.25;
      this.renderSkills();
    }
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

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) this.announceEl.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }
}
