import { sessionOf, type Controller } from '../client/Controller';
import type { GameEvent, MessageKind } from '../game/core/events';
import type { Session } from '../game/Game';
import { DEPOT_SLOTS, POCKET_SLOTS } from '../game/inventory/Inventory';
import { equipSlotFor, ITEMS, itemDef, runeGroup, runeIsAimed, type EquipSlot, type ItemStack } from '../game/inventory/items';
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
import { Layout, type MiniWin, type Preset, type WinId } from './layout';
import type { Renderer } from '../render/Renderer';
import { GRAPHICS_NAMES } from '../render/graphics';
import { RENDER_STYLE, storedStyle, storeStyle, type RenderStyle } from '../render/style';
import { button, el, fmtGold, paintSlot } from './dom';
import { itemIcon, spellIcon } from './icons';
import { SFX_CATS, type Sfx } from '../audio/Sfx';

import type { Music } from '../audio/Music';
import { Minimap } from './Minimap';
import { WorldMapView } from './WorldMapView';
import { CharacterDesigner } from './CharacterDesigner';
import { expStageLine, isClassic, stagesTable } from '../game/progression/stages';
import { fmtNum, getLang, k, onLangChange, t } from '../i18n/i18n';
import { trName, trText } from '../i18n/gameText';
import { describeItemL, bonusPartsL } from '../i18n/describe';
import { langPicker } from './lang';

/** Where a dragged item comes from. */
export type DragSrc = { kind: 'inv'; index: number } | { kind: 'eq'; slot: EquipSlot } | { kind: 'bag'; id: number };

export type HotbarEntry = { kind: 'spell'; id: SpellId } | { kind: 'item'; id: string } | null;

/** F1–F12, then a second row on Ctrl+1 … Ctrl+0 (runes for PvP). */
const HOTBAR_SIZE = 22;
const HOTKEY_LABELS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => `^${d}`)];
const hotkeyName = (i: number): string => (i < 12 ? HOTKEY_LABELS[i] : `Ctrl+${HOTKEY_LABELS[i].slice(1)}`);

/** Tibia-style equipment layout, three columns. */
const EQUIP_LAYOUT: Array<{ slot: EquipSlot; ph: string; name: string }> = [
  { slot: 'amulet', ph: 'amulet_of_warding', name: k('Amulet') }, { slot: 'head', ph: 'iron_helmet', name: k('Helmet') }, { slot: 'backpack', ph: 'backpack', name: k('Backpack') },
  { slot: 'weapon', ph: 'iron_sword', name: k('Weapon') }, { slot: 'armor', ph: 'chain_armor', name: k('Armour') }, { slot: 'shield', ph: 'wooden_shield', name: k('Shield / off-hand') },
  { slot: 'ring', ph: 'ring_of_vigor', name: k('Ring') }, { slot: 'legs', ph: 'chain_legs', name: k('Legs') }, { slot: 'ammo', ph: 'arrow', name: k('Ammunition') },
  { slot: 'cape', ph: 'thornvale_cape', name: k('Cape') }, { slot: 'feet', ph: 'leather_boots', name: k('Boots') }, { slot: null as unknown as EquipSlot, ph: '', name: '' },
];

/** Every side window, in the order the Windows menu lists them. */
const WIN_NAMES: Array<[WinId, string]> = [
  ['map', k('Map')], ['status', k('Status')], ['combat', k('Combat')], ['equipment', k('Equipment')], ['pockets', k('Pockets')], ['backpack', k('Backpack')],
  ['skills', k('Skills')], ['battle', k('Battle')], ['party', k('Party')], ['friends', k('Friends')], ['quests', k('Quest Log')],
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
  private floorEl!: HTMLSpanElement;
  private statsEl!: HTMLDivElement;
  private equipEls = new Map<EquipSlot, HTMLDivElement>();
  private bagGrid!: HTMLDivElement;
  private bagTitle!: HTMLElement;
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
  /** Labels that show a state ("Sound: on") and must be rebuilt in a new language. */
  private relabelers: Array<() => void> = [];
  /** Windows, columns, bars and the chat frame (ui/layout.ts), remembered in this browser. */
  private ui!: Layout;
  private lockBtn!: HTMLButtonElement;
  /** The party window opens by itself when you join a party. */
  private inParty = false;
  private topLoc!: HTMLSpanElement;
  private disconnectEl!: HTMLDivElement;
  /** Tutorial objective bar (Wayfarer's Isle): step, hint, direction to the target, skip button. */
  private tut!: { root: HTMLDivElement; title: HTMLSpanElement; arrow: HTMLSpanElement; dist: HTMLSpanElement; hint: HTMLDivElement; todo: HTMLDivElement; skip: HTMLButtonElement; armed: number; timer: number };

  constructor(private readonly ctl: Controller, private readonly renderer: Renderer, container: HTMLElement, private readonly sfx: Sfx, private readonly music?: Music) {
    this.root = el('div', 'hud', container);
    // classic layout (owner request 2026-10-24): title strip on top, the game view on the left/centre,
    // one or two columns of mini-windows on the right (optional left column), chat under the view,
    // action bars and the health/mana bar docked round the view or floating over it (ui/layout.ts)
    this.buildTopbar();
    this.bottom = el('div', 'bottom', this.root);
    const ctrl = el('div', 'panel toolbar ctrl-bar');
    this.ui = new Layout(this.root, this.bottom, ctrl);
    this.buildSidebar(ctrl);
    this.buildHotbar();
    this.buildConsole();
    this.buildWindows();
    this.ui.onVisible = (id, shown) => this.winVisible(id, shown);
    this.ui.onChange = () => this.relabelLayout();
    this.ui.apply();
    this.wins.friends.open = this.ui.isOpen('friends');
    this.wins.quests.open = this.ui.isOpen('quests');
    this.relabelLayout();
    this.buildTutorial();
    this.worldMap = new WorldMapView(this.root, this.ctl, this.minimap);
    this.regionEl = el('div', 'region-banner', this.root);
    this.announceEl = el('div', 'announce-banner', this.root);
    this.deathEl = el('div', 'death-screen', this.root);
    el('div', 'death-title', this.deathEl, t('You are dead'));
    el('div', 'death-sub', this.deathEl, t('You will wake in your home temple…'));
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
    onLangChange(() => this.languageChanged());
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
        if (e.to === me) this.log(trText(e.text), e.kind);
        if (e.to === me && (e.kind === 'level' || e.kind === 'quest')) this.toast(trText(e.text));
        break;
      case 'chat':
        this.log(`${e.name}: ${e.text}`, 'chat');
        break;
      case 'adminNotice':
        if (e.to === me) this.adminNotice(e.title, e.text);
        break;
      case 'announce':
        this.log(trText(e.text), 'event');
        if (e.big) this.announce(trText(e.title), trText(e.text), e.style);
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
      // teleport runes: a channel bar while you stand still (game/magic/teleport.ts)
      case 'teleportCast':
        if (e.id === me) this.castStart(t('Teleporting to {place}', { place: trName(e.dest) }), e.dur);
        break;
      case 'teleportCancel':
        if (e.id === me) this.castEnd(t('Teleport broken off'), false);
        break;
      case 'teleportDone':
        if (e.id === me) this.castEnd(t('Arrived: {place}', { place: trName(e.dest) }), true);
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

  /** Status window (name, level, experience, capacity, buffs, pet) and the movable health/mana bar. */
  private buildStatus(): void {
    const w = this.ui.addWindow('status', t('Status'), 'panel status', t('Your character. Drag the title bar to move this window, click it to fold.'));
    const panel = w.body;
    const head = el('div', 'status-head', panel);
    this.lvlBadge = el('div', 'lvl-badge', head);
    this.lvlBadge.title = t('Level');
    const who = el('div', 'status-who', head);
    this.nameEl = el('span', 'char-name', who);
    this.levelEl = el('span', 'char-level', who);
    this.xp = this.makeBar(panel, 'xp', t('XP'));
    const foot = el('div', 'status-foot', panel);
    this.capEl = el('div', 'cap', foot);
    this.buffsEl = el('div', 'buffs', foot);

    // health and mana: their own bar, docked over the game view by default (drag it anywhere)
    const vit = el('div', 'vitals');
    this.hp = this.makeBar(vit, 'hp', t('HP'));
    this.mp = this.makeBar(vit, 'mp', t('MP'));
    this.ui.addBar('vitals', vit, t('Health and mana'));

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
    // phones: the side columns sit in a drawer behind this button
    const pb = button(top, t('Panels'), () => this.ui.toggleDrawer(), 'btn tiny tb-panels');
    pb.title = t('Show or hide the windows (map, equipment, backpack, skills…)');
    const mode = el('span', `tb-mode ${this.ctl.online ? 'online' : 'offline'}`, top);
    el('span', 'tb-dot', mode);
    const label = el('span', '', mode, t(this.ctl.online ? 'Online' : 'Offline'));
    if (this.ctl.online) {
      // players online, from the server's public /status (the same number the website shows)
      let count: number | null = null;
      const show = () => { label.textContent = count === null ? t('Online') : t('{n} online', { n: count }); };
      const refresh = () => {
        fetch('/status', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((s: { online?: number } | null) => {
            if (s && typeof s.online === 'number') { count = s.online; show(); }
          })
          .catch(() => { /* keep "Online" */ });
      };
      onLangChange(show);
      refresh();
      window.setInterval(refresh, 30000);
    }
  }

  /** A window was shown, folded or closed: windows that draw their content only while open catch up. */
  private winVisible(id: WinId, shown: boolean): void {
    if (id === 'friends') { this.wins.friends.open = shown; this.renderFriends(); }
    if (id === 'quests') { this.wins.quests.open = shown; if (shown) this.renderQuests(); }
    if (id === 'skills' && shown) this.skillsKey = '';
    if (id === 'party' && shown) this.partyKey = '';
  }

  /** Labels that show the layout's state (lock, columns, preset) — after every layout change and language switch. */
  private layoutLabels: Array<() => void> = [];
  private relabelLayout(): void {
    const st = this.ui.state;
    this.lockBtn.textContent = t(st.locked ? 'Unlock layout' : 'Lock layout');
    this.lockBtn.classList.toggle('on', st.locked);
    this.lockBtn.title = t(st.locked ? 'The layout is locked: windows and bars stay where they are. Click to move them again.' : 'Lock the layout so windows and bars cannot be moved by accident');
    for (const f of this.layoutLabels) f();
  }

  /** "Windows" menu: show or hide every window, the extra columns, lock and reset. */
  private windowsMenu(anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    const mark = (on: boolean, label: string) => `${on ? '◆' : '◇'}  ${label}`;
    const st = this.ui.state;
    const items: MenuItem[] = WIN_NAMES.map(([id, name]) => ({ label: mark(this.ui.isShown(id), t(name)), run: () => this.ui.setClosed(id, this.ui.isShown(id)) }));
    items.push({ label: mark(st.right2, t('Second right column')), run: () => this.ui.setColumn('right2', !st.right2) });
    items.push({ label: mark(st.left, t('Left column')), run: () => this.ui.setColumn('left', !st.left) });
    items.push({ label: t(st.locked ? 'Unlock layout' : 'Lock layout'), run: () => this.ui.setLocked(!st.locked) });
    items.push({ label: t('Reset layout'), run: () => this.ui.reset() });
    this.showMenu(items, r.left, r.bottom + 2);
  }

  private buildSettings(): void {
    const b = this.makeWin('settings', 'Settings', 'settings-win').body;
    const sec = (title: string) => {
      el('div', 'panel-title', b, t(title));
      return el('div', 'set-row', b);
    };
    // layout presets: "Classic" (view left, window columns right — the default), "Two flanks", "Full view";
    // then the extra columns, the lock and Reset layout (ui/layout.ts)
    const lay = sec('Layout');
    const lb: Array<[HTMLButtonElement, Preset]> = [];
    const layBtn = (label: string, mode: Preset, tip: string) => {
      const x = button(lay, t(label), () => this.ui.applyPreset(mode), 'btn');
      x.title = t(tip);
      lb.push([x, mode]);
    };
    layBtn('Classic', 'classic', 'The game view on the left, windows in one or two columns on the right, like the classic client');
    layBtn('Two flanks', 'flanks', 'Character and combat on the left, map and inventory on the right, the game view in the middle');
    layBtn('Full view', 'full', 'The game view fills the screen; windows float over its sides');
    const lay2 = el('div', 'set-row', b);
    const col2 = button(lay2, '', () => this.ui.setColumn('right2', !this.ui.state.right2), 'btn');
    const colL = button(lay2, '', () => this.ui.setColumn('left', !this.ui.state.left), 'btn');
    const lockS = button(lay2, '', () => this.ui.setLocked(!this.ui.state.locked), 'btn');
    button(lay2, t('Reset layout'), () => this.ui.reset(), 'btn').title = t('Every window and bar back to where it starts');
    el('p', 'hint', b, t('Drag a window by its title bar to move it, click the title to fold it, drag its bottom edge to resize it. Drag an action bar or the health bar by its grip to any edge of the game view, or anywhere over it.'));
    this.layoutLabels.push(() => {
      const st = this.ui.state;
      for (const [bb, m] of lb) bb.classList.toggle('on', m === st.preset);
      col2.textContent = t(st.right2 ? 'Second column: on' : 'Second column: off');
      col2.classList.toggle('on', st.right2);
      colL.textContent = t(st.left ? 'Left column: on' : 'Left column: off');
      colL.classList.toggle('on', st.left);
      lockS.textContent = t(st.locked ? 'Layout: locked' : 'Layout: unlocked');
      lockS.classList.toggle('on', st.locked);
    });

    // language: EN / PL / PT-BR (remembered in this browser); game messages follow at once
    const langRow = sec('Language');
    langPicker(langRow, 'lang-pick set-lang');
    const disp = sec('Display');
    this.pixelBtn = button(disp, t('Pixels: on'), () => this.togglePixels(), 'btn');
    this.pixelBtn.title = t('Pixel-art look on or off');
    // weather effects: High / Low (half the particles) / Off (sandstorm visibility stays: it is gameplay)
    const wq = ['high', 'low', 'off'] as const;
    const wqName = { high: k('High'), low: k('Low'), off: k('Off') };
    const wLabel = (q: keyof typeof wqName) => t('Weather: {q}', { q: t(wqName[q]) });
    const wb = button(disp, wLabel(this.renderer.weatherQuality), () => {
      const next = wq[(wq.indexOf(this.renderer.weatherQuality) + 1) % wq.length];
      this.renderer.setWeatherQuality(next);
      wb.textContent = wLabel(next);
    }, 'btn');
    wb.title = t('Weather effects: High, Low (half the rain, snow and sand) or Off (no weather pictures; sandstorms still limit how far you see)');
    // graphics: High (full look) / Medium / Low (graphics.ts) — for slower computers
    const gq = ['high', 'medium', 'low'] as const;
    const gLabel = (q: (typeof gq)[number]) => t('Graphics: {q}', { q: t(GRAPHICS_NAMES[q]) });
    const gb = button(disp, gLabel(this.renderer.graphics), () => {
      const next = gq[(gq.indexOf(this.renderer.graphics) + 1) % gq.length];
      this.renderer.setGraphics(next);
      gb.textContent = gLabel(next);
    }, 'btn');
    gb.title = t('Graphics: High (the full look), Medium (softer shadows, small props cast none) or Low (no shadows, no grass tufts, half the weather, a little less zoom-out) — for slower computers');
    // look: Painted (default) / Classic (render/style.ts) — saved in this browser, used from the next load
    const styleName: Record<RenderStyle, string> = { painted: k('Painted'), classic: k('Classic') };
    let lookPick = storedStyle();
    const lookLabel = () => t('Look: {style}', { style: t(styleName[lookPick]) });
    const lookNote = el('span', 'set-note', disp);
    const showLookNote = () => { lookNote.textContent = lookPick !== RENDER_STYLE ? t('Takes effect after reload') : ''; };
    const lb2 = button(disp, lookLabel(), () => {
      lookPick = lookPick === 'painted' ? 'classic' : 'painted';
      storeStyle(lookPick);
      lb2.textContent = lookLabel();
      showLookNote();
    }, 'btn');
    lb2.title = t('Look of the world: Painted (hand-painted, the default) or Classic (the pixel look). Takes effect after reload');
    disp.insertBefore(lb2, lookNote);
    showLookNote();
    this.relabelers.push(() => { lb2.textContent = lookLabel(); lb2.title = t('Look of the world: Painted (hand-painted, the default) or Classic (the pixel look). Takes effect after reload'); showLookNote(); });
    this.relabelers.push(() => { wb.textContent = wLabel(this.renderer.weatherQuality); gb.textContent = gLabel(this.renderer.graphics); this.pixelBtn.textContent = t(this.renderer.cam.pixelMode ? 'Pixels: on' : 'Pixels: off'); });
    const slider = (parent: HTMLElement, value: number, title: string, set: (v: number) => void, max = 100) => {
      const s = el('input', 'vol-slider', parent);
      s.type = 'range';
      s.min = '0';
      s.max = String(max);
      s.value = String(Math.round(value * 100));
      s.title = t(title);
      s.setAttribute('aria-label', t(title));
      s.addEventListener('input', () => set(Number(s.value) / 100));
      s.addEventListener('keydown', (e) => e.stopPropagation());
      return s;
    };
    const snd = sec('Sound effects');
    const sb = button(snd, t(this.sfx.muted ? 'Sound: off' : 'Sound: on'), () => {
      sb.textContent = t(this.sfx.toggleMute() ? 'Sound: off' : 'Sound: on');
    }, 'btn');
    this.relabelers.push(() => { sb.textContent = t(this.sfx.muted ? 'Sound: off' : 'Sound: on'); });
    slider(snd, this.sfx.volume, 'Volume', (v) => this.sfx.setVolume(v));

    // each kind of sound on its own slider (0–150 %), on top of the main volume
    el('div', 'panel-title', b, t('Sound mix'));
    const mix = el('div', 'mix-grid', b);
    for (const c of SFX_CATS) {
      const name = el('span', 'mix-name', mix, t(c.name));
      name.title = t(c.hint);
      const val = el('span', 'mix-val', mix);
      const show = (v: number) => { val.textContent = `${Math.round(v * 100)}%`; };
      const s = slider(mix, this.sfx.mix[c.id], c.name, (v) => { this.sfx.setMix(c.id, v); show(v); }, 150);
      s.title = t(c.hint);
      show(this.sfx.mix[c.id]);
    }
    button(b, t('Reset sound mix'), () => {
      for (const c of SFX_CATS) this.sfx.setMix(c.id, 1);
      mix.querySelectorAll<HTMLInputElement>('input').forEach((i) => { i.value = '100'; });
      mix.querySelectorAll<HTMLSpanElement>('.mix-val').forEach((v) => { v.textContent = '100%'; });
    }, 'btn small mix-reset');
    if (this.music) {
      const mu = this.music;
      const mus = sec('Music');
      const label = { all: k('Music: all'), outdoor: k('Music: outdoors only'), off: k('Music: off') } as const;
      const mb = button(mus, t(label[mu.mode]), () => {
        mb.textContent = t(label[mu.cycleMode()]);
      }, 'btn');
      mb.title = t('All music / outdoors only (quiet inside shops, depots and temples) / off');
      this.relabelers.push(() => { mb.textContent = t(label[mu.mode]); });
      slider(mus, mu.volume, 'Music volume', (v) => mu.setVolume(v));
    }
    const game = sec('Game');
    if (!this.ctl.online) button(game, t('Save now'), () => this.saveNow(), 'btn');
    button(game, t('Test console (`)'), () => { this.closeWin('settings'); this.toggleWin('dev'); }, 'btn');
    button(game, t('Full screen'), () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen().catch(() => this.log(t('Your browser refused full screen.'), 'warn'));
    }, 'btn');
  }

  private buildSidebar(tools: HTMLDivElement): void {
    // control bar on top of the right column (always there): the menu, the Windows list and the lock
    button(tools, t('Spells'), () => this.toggleWin('spells'), 'btn tool');
    button(tools, t('Quests'), () => this.toggleWin('quests'), 'btn tool');
    this.friendsBtn = button(tools, t('Friends'), () => this.toggleWin('friends'), 'btn tool');
    button(tools, t('Appearance'), () => this.toggleWin('appearance'), 'btn tool');
    button(tools, t('Help'), () => this.toggleWin('help'), 'btn tool');
    button(tools, t('Settings'), () => this.toggleWin('settings'), 'btn tool');
    const winBtn = button(tools, `${t('Windows')} ▾`, () => this.windowsMenu(winBtn), 'btn tool half');
    winBtn.title = t('Show or hide windows, the extra columns, lock or reset the layout');
    this.lockBtn = button(tools, '', () => this.ui.setLocked(!this.ui.state.locked), 'btn tool half');

    this.buildStatus();

    // classic combat controls: stance (attack / balanced / defence), chase / stand, and PvP secure mode
    const fight = this.ui.addWindow('combat', t('Combat'), 'fight-modes').body;
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
      const b = button(fgrid, t(label), () => { click(); apply(); }, 'btn fm');
      b.title = t(tip);
      fbtn.push([b, on]);
    };
    fb('Attack', 'Offensive: hit harder (+20%), take more damage', () => { mode = 'offensive'; }, () => mode === 'offensive');
    fb('Balance', 'Balanced', () => { mode = 'balanced'; }, () => mode === 'balanced');
    fb('Defend', 'Defensive: take less damage (−25%), hit softer', () => { mode = 'defensive'; }, () => mode === 'defensive');
    fb('Follow', 'Chase: follow your target', () => { chase = true; }, () => chase);
    fb('Stand', 'Stand: keep your position while attacking', () => { chase = false; }, () => !chase);
    this.pvpBtn = button(fgrid, t('Secure'), () => this.ctl.send({ c: 'secureMode', on: !this.s.player.secure }), 'btn fm pvp');
    this.pvpBtn.title = t('Secure mode: you cannot attack unmarked players and your area attacks spare them. Open: you can attack anyone, but attacking unmarked players gives you a skull.');
    this.pvpBtn.hidden = true;
    apply();

    // map: minimap (wheel zoom, right-drag pan, double-click centre) and the world map
    const mw = this.ui.addWindow('map', t('Map'), 'minimap-panel');
    this.floorEl = el('span', 'floor-ind', mw.extra);
    this.minimap = new Minimap(mw.body, this.ctl);
    button(mw.body, t('World map (M)'), () => this.toggleWorldMap(), 'btn small wm-open');
    this.buildSettings();
    // running slowly on High for a while: suggest a lower graphics setting once (never switch by itself)
    this.renderer.onSlow = () => this.log(t('The game is running slowly here. Settings → Display → Graphics: Medium or Low can make it smoother.'), 'info');

    const eqp = this.ui.addWindow('equipment', t('Equipment'), 'equipment').body;
    const grid = el('div', 'equip-grid', eqp);
    for (const e of EQUIP_LAYOUT) {
      if (!e.slot) {
        el('div', 'equip-gap', grid);
        continue;
      }
      const d = el('div', 'slot equip', grid);
      d.dataset.slot = e.slot;
      d.title = t(e.name);
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (ev.button !== 0 || !this.s.inventory.equipment[e.slot]) return;
        this.startDrag({ kind: 'eq', slot: e.slot }, ev, () => this.ctl.send({ c: 'unequip', slot: e.slot }));
      });
      this.equipEls.set(e.slot, d);
    }
    this.statsEl = el('div', 'stats', eqp);

    // classic skills window: every skill with a thin bar to the next level
    const sk = this.ui.addWindow('skills', t('Skills'), 'skills', t('Click to fold or unfold. Skills rise by using them: fight with a weapon, block with a shield, spend mana, chop trees, fish.'));
    this.skillsEl = el('div', 'skills-list', sk.body);

    const battle = this.ui.addWindow('battle', t('Battle'), 'battle', t('Click to fold or unfold. Drag the bottom edge of the window to make it taller or shorter.'));
    this.battleEl = el('div', 'battle-list', battle.body);
    const emptyText = () => { this.battleEl.dataset.empty = t('Nobody around.'); };
    emptyText();
    this.relabelers.push(emptyText);

    // party: members with health, shared experience switch (opens by itself when you join a party)
    this.partyEl = this.ui.addWindow('party', t('Party'), 'party').body;

    // pockets and the backpack: two containers, like stacked bags in the classic client
    this.pocketGrid = el('div', 'bag-grid', this.ui.addWindow('pockets', t('Pockets'), 'inventory').body);
    const bag: MiniWin = this.ui.addWindow('backpack', t('Backpack'), 'inventory');
    this.bagTitle = bag.title;
    this.bagGrid = el('div', 'bag-grid', bag.body);
    // what the mouse is over: a quiet line at the bottom of the game view
    this.statusLine = el('div', 'hover-line', this.root);
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
        if (shift) return this.log(t('You see {item}. {about}', { item: trName(itemDef(cur.id).name), about: describeItemL(itemDef(cur.id)) }), 'info');
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
    // a stack asks "How many?" (Ctrl held: the whole stack, no question); `send` gets undefined for all of it
    const have = this.dragQty(src);
    const dragId = this.dragItemId(src);
    const amount = (send: (qty: number | undefined) => void) => {
      if (d.ctrl || e.ctrlKey || have <= 1 || !dragId) return send(undefined);
      this.askQty(dragId, have, e.clientX, e.clientY, (n) => send(n >= have ? undefined : n));
    };
    const invSlot = under.closest('[data-inv]') as HTMLElement | null;
    const eqSlot = under.closest('.slot.equip') as HTMLElement | null;
    const hot = under.closest('.hot-slot') as HTMLElement | null;
    const target = under.closest('.battle-row') as HTMLElement | null;
    if (target && src.kind === 'inv') {
      const id = this.dragItemId(src);
      const cid = Number(target.dataset.cid);
      if (id && itemDef(id).rune) return this.runeOn(cid, src.index);
      // any other item dropped on a player offers it in a trade
      if (target.classList.contains('k-player')) amount((qty) => this.ctl.send({ c: 'tradeItem', id: cid, slot: src.index, qty }));
      return;
    }
    // dropped onto the pet window: the tortoise carries it (ui/petsUi.ts)
    if (src.kind === 'inv' && under.closest('.pet-win')) return this.ctl.send({ c: 'pet', a: 'put', i: src.index });
    // dropped into the open trade window: add to your offer
    if (src.kind === 'inv' && under.closest('.trade-win')) {
      const t = this.ctl.trade();
      if (t && !t.mine.slots.includes(src.index)) amount((qty) => this.ctl.send({ c: 'tradeAdd', slot: src.index, qty }));
      return;
    }
    if (invSlot) {
      const to = Number(invSlot.dataset.inv);
      if (src.kind === 'inv') {
        if (to === src.index) return;
        // part of a stack goes to an empty slot or onto the same item; onto anything else the two swap
        const there = this.s.inventory.slots[to];
        if (there && there.id !== dragId) return this.ctl.send({ c: 'moveSlot', from: src.index, to });
        amount((qty) => this.ctl.send({ c: 'moveSlot', from: src.index, to, qty }));
      }
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
        } else this.log(t('Only potions, food and runes go on the action bar.'), 'warn');
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
          amount((qty) => this.ctl.send({ c: 'tradeItem', id: other.id, slot: src.index, qty }));
          return;
        }
      }
      this.renderer.showClickMarker(t.x, t.y);
      if (src.kind === 'bag') return amount((qty) => this.ctl.send({ c: 'moveBag', id: src.id, x: t.x, y: t.y, qty }));
      amount((qty) => this.ctl.send({ c: 'throw', from: src.kind === 'inv' ? src.index : src.slot, x: t.x, y: t.y, qty }));
      return;
    }
    // a ground item dropped on the side windows: pick it up
    if (src.kind === 'bag' && under.closest('.mw-col, .mw-drawer')) this.ctl.send({ c: 'pickup', id: src.id });
  }

  /** How many items the dragged thing holds (a whole stack, or the top item of a ground pile). */
  private dragQty(src: DragSrc): number {
    if (src.kind === 'inv') return this.s.inventory.slots[src.index]?.qty ?? 0;
    if (src.kind === 'eq') return this.s.inventory.equipment[src.slot]?.qty ?? 0;
    const bag = this.ctl.game.bags.find((b) => b.id === src.id);
    return bag?.items[bag.items.length - 1]?.qty ?? 0;
  }

  // ---------------------------------------------------------------- "How many?" (splitting stacks)

  private qtyPop: { root: HTMLDivElement; cancel: () => void } | null = null;

  /**
   * The classic "How many?" box: slider + number, quick 1 / half / all, Enter confirms, Esc cancels.
   * Starts at the whole stack. `done` gets a whole number from 1 to `max`.
   */
  askQty(itemId: string, max: number, x: number, y: number, done: (n: number) => void): void {
    this.qtyPop?.cancel();
    const root = el('div', 'panel qty-pop', this.root);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('How many?'));
    const head = el('div', 'qty-head', root);
    const img = el('img', 'qty-icon', head);
    img.src = itemIcon(itemId);
    img.alt = '';
    const tx = el('div', 'qty-text', head);
    el('div', 'qty-title', tx, t('How many?'));
    el('div', 'qty-name', tx, `${trName(itemDef(itemId).name)} · ${t('{n} in the stack', { n: fmtNum(max) })}`);
    const row = el('div', 'qty-row', root);
    const slider = el('input', 'vol-slider qty-slider', row);
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(max);
    slider.setAttribute('aria-label', t('Amount'));
    const field = el('input', 'num-input qty-field', row);
    field.type = 'number';
    field.min = '1';
    field.max = String(max);
    field.setAttribute('aria-label', t('Amount'));
    let n = max;
    const set = (v: number) => {
      n = Math.max(1, Math.min(max, Math.round(Number.isFinite(v) ? v : max)));
      slider.value = String(n);
      if (Number(field.value) !== n) field.value = String(n);
    };
    slider.addEventListener('input', () => set(Number(slider.value)));
    field.addEventListener('input', () => { if (field.value !== '') set(Number(field.value)); });
    const quick = el('div', 'qty-quick', root);
    button(quick, '1', () => set(1), 'btn small');
    button(quick, t('Half'), () => set(Math.max(1, Math.floor(max / 2))), 'btn small');
    button(quick, t('All'), () => set(max), 'btn small');
    const acts = el('div', 'qty-actions', root);
    const close = () => {
      root.remove();
      window.removeEventListener('mousedown', outside, true);
      if (this.qtyPop?.root === root) this.qtyPop = null;
    };
    const ok = () => { set(Number(field.value || n)); close(); done(n); };
    const cancel = () => close();
    button(acts, t('Move'), ok, 'btn on qty-ok').title = t('Enter');
    button(acts, t('Cancel'), cancel, 'btn').title = t('Esc');
    el('div', 'qty-hint', root, t('Tip: hold Ctrl while dragging to move the whole stack without asking.'));
    const outside = (ev: MouseEvent) => { if (!root.contains(ev.target as Node)) cancel(); };
    window.addEventListener('mousedown', outside, true);
    root.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); ok(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    });
    root.addEventListener('keyup', (ev) => ev.stopPropagation());
    set(max);
    this.qtyPop = { root, cancel };
    // beside the drop point, kept on screen
    const r = root.getBoundingClientRect();
    root.style.left = `${Math.max(4, Math.min(window.innerWidth - r.width - 4, x - r.width / 2))}px`;
    root.style.top = `${Math.max(4, Math.min(window.innerHeight - r.height - 4, y - r.height - 14))}px`;
    field.focus();
    field.select();
  }

  /** Right-click → "Split stack…": that many into the first empty slot. */
  private splitStack(i: number, x: number, y: number): void {
    const st = this.s.inventory.slots[i];
    if (!st || st.qty < 2) return;
    const inv = this.s.inventory;
    const free = inv.slots.findIndex((v, j) => j < inv.size() && !v);
    if (free < 0) return this.log(trText('You need a free slot to split that stack.'), 'warn');
    this.askQty(st.id, st.qty - 1, x, y, (n) => this.ctl.send({ c: 'moveSlot', from: i, to: free, qty: n }));
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
    this.toast(t(d.rune.radius ? '{item}: click where to throw it (area shown). Right-click or Esc cancels.' : '{item}: click where to throw it. Right-click or Esc cancels.', { item: trName(d.name) }), 2.5);
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
    if (slot < 0) return this.log(t('You have no {item} left.', { item: trName(itemDef(id).name.toLowerCase()) }), 'warn');
    this.ctl.send({ c: 'useRuneOn', slot, id: cid });
  }

  /** Throws the aimed rune at a tile. */
  throwAt(x: number, y: number): void {
    const id = this.aiming;
    this.cancelAim();
    if (!id) return;
    const inv = this.s.inventory;
    const slot = inv.slots.findIndex((st, idx) => idx < inv.size() && st?.id === id);
    if (slot < 0) return this.log(t('You have no {item} left.', { item: trName(itemDef(id).name.toLowerCase()) }), 'warn');
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
    this.bagTitle.textContent = bp ? trName(itemDef(bp.id).name) : t('No backpack');
    this.bagGrid.hidden = !bp;
    if (this.wins.depot.open) this.renderDepot();
  }

  private itemMenu(i: number, x: number, y: number): void {
    const st = this.s.inventory.slots[i];
    if (!st) return;
    const d = itemDef(st.id);
    const items: MenuItem[] = [];
    const eq = equipSlotFor(d);
    if (eq) items.push({ label: t('Equip'), run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.kind === 'consumable') items.push({ label: t(d.mana && !d.heal ? 'Drink' : 'Use'), run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.rune) {
      items.push({ label: t('Use with crosshair…'), run: () => this.beginAim(d.id) });
      items.push({ label: t(!runeIsAimed(d.rune) ? 'Use on yourself' : 'Use on target'), run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    } else if (stationForItem(d.id)) items.push({ label: t('Use ({station})', { station: trName(stationForItem(d.id)!.title).toLowerCase() }), run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    else if (d.kind === 'tool' || RAW_FOOD_ITEMS.includes(d.id)) items.push({ label: t('Use'), run: () => this.ctl.send({ c: 'useSlot', slot: i }) });
    if (d.kind === 'consumable' || d.rune) items.push({ label: t('Assign to hotkey…'), run: () => this.beginAssign({ kind: 'item', id: d.id }) });
    if (this.ctl.depot()) items.push({ label: t('Put in depot'), run: () => this.ctl.send({ c: 'deposit', slot: i }) });
    const tv = this.ctl.trade();
    if (tv && d.id !== 'gold') {
      const offered = tv.mine.slots.includes(i);
      items.push({
        label: t(offered ? 'Remove from trade' : 'Offer in trade'),
        run: () => this.ctl.send({ c: 'tradeOffer', slots: offered ? tv.mine.slots.filter((x) => x !== i) : [...tv.mine.slots, i], gold: tv.mine.gold }),
      });
    }
    if (st.qty > 1) items.push({ label: t('Split stack…'), run: () => this.splitStack(i, x, y) });
    items.push({ label: t('Look'), run: () => this.log(`${t('You see {item}.', { item: `${trName(d.name)}${st.qty > 1 ? ` (${fmtNum(st.qty)})` : ''}` })} ${describeItemL(d)}${d.note ? ` ${trText(d.note)}` : ''}`, 'info') });
    items.push({ label: t('Drop'), run: () => this.ctl.send({ c: 'drop', slot: i }) });
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
    // your own character: change how you look (the same designer as at character creation)
    if (id === this.ctl.pid) {
      items.push({ label: t('Change appearance…'), run: () => this.toggleWin('appearance', true) });
      items.push({ label: t('Inspect yourself'), run: () => this.inspect(id) });
      const own = g.partyView(this.ctl.pid);
      if (own) {
        if (own.leader === this.ctl.pid) items.push({ label: t(own.shared ? 'Disable shared experience' : 'Enable shared experience'), run: () => this.ctl.send({ c: 'partyShare', on: !own.shared }) });
        items.push({ label: t('Leave party'), run: () => this.ctl.send({ c: 'partyLeave' }) });
      }
      this.showMenu(items, x, y);
      return;
    }
    const who = kind === 'player' ? c.name : trName(c.name);
    if (kind === 'enemy') items.push({ label: t('Attack {name}', { name: who }), run: () => this.ctl.send({ c: 'attack', id }) });
    items.push({ label: t('Follow {name}', { name: who }), run: () => this.ctl.send({ c: 'follow', id }) });
    items.push({ label: kind === 'player' ? t('Inspect {name}', { name: who }) : t('Look at {name}', { name: who }), run: () => this.inspect(id) });
    if (kind === 'npc') items.push({ label: t('Talk to {name}', { name: who }), run: () => this.ctl.send({ c: 'talk', id }) });
    if (kind === 'player') {
      if (g.pvp) items.push({ label: t('Attack {name}', { name: who }), run: () => this.ctl.send({ c: 'attack', id }) });
      items.push({ label: t('Trade with {name}', { name: who }), run: () => this.ctl.send({ c: 'tradeRequest', id }) });
      const fv = g.friendsView(this.ctl.pid);
      const isFriend = fv.friends.some((f) => f.name.toLowerCase() === c.name.toLowerCase());
      if (fv.requests.some((r) => r.id === id)) items.push({ label: t("Accept {name}'s friend request", { name: who }), run: () => this.ctl.send({ c: 'friendAccept', id }) });
      else if (!isFriend) items.push({ label: t('Add {name} as friend', { name: who }), run: () => this.ctl.send({ c: 'friendRequest', id }) });
      const flag = g.partyFlag(this.ctl.pid, id);
      const mine = g.partyView(this.ctl.pid);
      const lead = !mine || mine.leader === this.ctl.pid;
      if (flag === 2) items.push({ label: t("Join {name}'s party", { name: who }), run: () => this.ctl.send({ c: 'partyJoin', id }) });
      else if (flag === 3) items.push({ label: t("Revoke {name}'s invitation", { name: who }), run: () => this.ctl.send({ c: 'partyRevoke', id }) });
      else if (flag === 0 && lead) items.push({ label: t('Invite {name} to party', { name: who }), run: () => this.ctl.send({ c: 'partyInvite', id }) });
      if (flag === 1 && mine?.leader === this.ctl.pid) items.push({ label: t('Pass leadership to {name}', { name: who }), run: () => this.ctl.send({ c: 'partyLeader', id }) });
      items.push({ label: t('Heal {name} (exura sio)', { name: who }), run: () => this.ctl.send({ c: 'cast', spell: 'exura_sio', param: c.name }), disabled: !this.s.spells.has('exura_sio') });
      items.push({ label: t('Message…'), run: () => this.focusChat(`${c.name}, `) });
    }
    const pv = g.partyView(this.ctl.pid);
    if (pv) {
      if (pv.leader === this.ctl.pid) items.push({ label: t(pv.shared ? 'Disable shared experience' : 'Enable shared experience'), run: () => this.ctl.send({ c: 'partyShare', on: !pv.shared }) });
      items.push({ label: t('Leave party'), run: () => this.ctl.send({ c: 'partyLeave' }) });
    }
    items.push({ label: t('Look'), run: () => this.log(t('You see {item}.', { item: trText(this.renderer.describeHover()) || who }), 'info') });
    this.showMenu(items, x, y);
  }

  /**
   * Left-click on another player: with PvP on it attacks, if secure mode allows it
   * (the server checks every rule again); otherwise the usual menu.
   */
  clickPlayer(id: number, x: number, y: number): void {
    const g = this.ctl.game;
    const tp = g.getPlayer(id);
    if (!g.pvp || !tp || id === this.ctl.pid) return this.creatureMenu('player', id, x, y);
    if (this.s.player.secure && g.skullOf(tp) === 0) {
      this.log(t('Secure mode is on: you cannot attack unmarked players. Use the "Secure" button to turn it off.'), 'warn');
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
    // two movable action bars (ui/layout.ts): F1–F12 with the shared cooldowns, and Ctrl+1 … Ctrl+0
    const outer = el('div', 'hotbar hb1');
    const outer2 = el('div', 'hotbar hb2');
    // shared cooldowns, so you can see when you may cast or drink again
    const strip = el('div', 'cd-strip', outer);
    const groups: Array<[CooldownGroup, string]> = [['attack', k('Attack')], ['heal', k('Healing')], ['support', k('Support')], ['potion', k('Potions')]];
    for (const [g, label] of groups) {
      const item = el('div', `cd-item cd-${g}`, strip);
      item.title = t('{group}: {s} s shared cooldown', { group: t(label), s: GROUP_COOLDOWN[g] });
      el('span', 'cd-label', item, t(label));
      const barEl = el('div', 'cd-bar', item);
      const fill = el('div', 'cd-fill', barEl);
      const secs = el('span', 'cd-secs', item);
      this.cdBars.set(g, { item, fill, secs });
    }
    const bar = el('div', 'hot-row', outer);
    const bar2 = el('div', 'hot-row hot-row-ctrl', outer2);
    bar2.title = t('Ctrl+1 … Ctrl+0 (or Alt+1 … Alt+0). In full screen your browser lets the game have Ctrl+number.');
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
            { label: t('Clear hotkey'), run: () => { this.hotbar[i] = null; this.storeHotbar(); this.renderHotbar(); } },
            { label: t('Open spellbook to assign'), run: () => this.openWin('spells') },
          ], e.clientX, e.clientY);
          return;
        }
        this.triggerHotbar(i);
      });
      this.hotbarEls.push({ btn, icon, count, cd, secs });
    }
    this.ui.addBar('hotbar1', outer, t('Action bar (F1–F12)'));
    this.ui.addBar('hotbar2', outer2, t('Second action bar (Ctrl+1 … Ctrl+0)'));
  }

  private beginAssign(entry: HotbarEntry): void {
    this.assigning = entry;
    this.root.classList.add('assigning');
    this.toast(t('Click a hotkey slot to assign it.'));
  }

  private renderHotbar(): void {
    this.hotbar.forEach((h, i) => {
      const e = this.hotbarEls[i];
      e.count.textContent = '';
      if (!h) {
        e.icon.hidden = true;
        e.btn.title = t("Hotkey {key} — empty. Assign from the spellbook or an item's right-click menu.", { key: hotkeyName(i) });
        e.btn.classList.add('empty');
        return;
      }
      e.btn.classList.remove('empty');
      e.icon.hidden = false;
      if (h.kind === 'spell') {
        const sp = SPELLS[h.id];
        e.icon.src = spellIcon(h.id);
        e.btn.title = `${trName(sp.name)} — "${sp.words}" · ${t('{n} mana', { n: sp.mana })}${this.s.spells.has(h.id) ? '' : ` ${t('(not learned)')}`}`;
        e.btn.classList.toggle('locked', !this.s.spells.has(h.id));
      } else {
        const d = itemDef(h.id);
        e.icon.src = itemIcon(h.id);
        const n = this.s.inventory.count(h.id);
        e.count.textContent = String(n);
        e.btn.title = `${trName(d.name)} (${fmtNum(n)})`;
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
      this.log(t('You have no {item} left.', { item: trName(itemDef(h.id).name.toLowerCase()) }), 'warn');
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
        const name = el('span', 'battle-name', info, c.kind === 'player' ? c.name : trName(c.name));
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
        const label = pl ? `${pl.name} · ${pl.level} ${trName(VOCATIONS[pl.vocation].name)}` : c.name;
        if (r.name.textContent !== label) r.name.textContent = label;
        const sk = pl ? g.skullOf(pl) : 0;
        const skCls = sk === 2 ? 'battle-skull red' : sk === 1 ? 'battle-skull white' : 'battle-skull';
        if (r.skull.className !== skCls) r.skull.className = skCls;
        r.row.classList.toggle('party', g.partyFlag(this.ctl.pid, c.id) === 1);
      }
      const frac = c.hp / c.maxHp;
      r.fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      if (c.kind !== 'player') { const nm = trName(c.name); if (r.name.textContent !== nm) r.name.textContent = nm; }
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
    for (const [id, label] of [['default', k('Default')], ['chat', k('Chat')], ['server', k('Server Log')], ['loot', k('Loot')]] as const) {
      const b = button(tabs, t(label), () => {
        this.logEl.className = `log tab-${id}`;
        tabBtns.forEach((x) => x.classList.toggle('on', x === b));
        this.logEl.scrollTop = this.logEl.scrollHeight;
      }, `log-tab${id === 'default' ? ' on' : ''}`);
      tabBtns.push(b);
    }
    this.logEl = el('div', 'log tab-default', c);
    const row = el('div', 'chat-row', c);
    this.chatInput = el('input', 'chat-input', row);
    this.chatInput.placeholder = t('Press Enter to talk — spell words cast spells');
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
    el('span', 'win-title', head, t(title));
    button(head, '✕', () => this.closeWin(key), 'btn tiny').setAttribute('aria-label', t('Close'));
    const body = el('div', 'win-body', root);
    root.hidden = true;
    const w: Win = { root, body, open: false };
    this.wins[key] = w;
    return w;
  }

  /** Friends and the quest log are side windows (they live in the columns, like the classic VIP list). */
  private makeSideWin(key: 'friends' | 'quests', title: string, cls: string): void {
    const w = this.ui.addWindow(key, title, cls);
    this.wins[key] = { root: w.root, body: w.body, open: false };
  }

  private buildWindows(): void {
    this.makeWin('dialog', 'Conversation', 'dialog-win');
    this.makeWin('depot', 'Depot', 'depot-win');
    this.makeWin('trade', 'Trade', 'trade-win');
    this.makeWin('market', 'Market', 'market-win');
    this.makeWin('craft', 'Production', 'craft-win');
    this.makeWin('appearance', 'Appearance', 'appearance-win');
    this.makeWin('spells', 'Spellbook', 'spells-win');
    this.makeSideWin('quests', t('Quest Log'), 'quests-win');
    this.makeWin('help', 'How to play', 'help-win');
    this.makeWin('dev', 'Test console', 'dev-win');
    this.makeWin('inspect', 'Inspect', 'inspect-win');
    this.makeSideWin('friends', t('Friends'), 'friends-win');
    this.makeWin('corpse', 'Dead body', 'corpse-win');
    this.renderHelp();
  }

  private zTop = 10;

  private openWin(key: keyof HUD['wins']): void {
    if (key === 'friends' || key === 'quests') return this.ui.toggle(key, true);
    const w = this.wins[key];
    w.open = true;
    w.root.hidden = false;
    w.root.style.zIndex = String(++this.zTop);
    if (key === 'spells') this.renderSpells();
    if (key === 'appearance') this.renderAppearance();
    if (key === 'dev') this.renderDev();
  }

  closeWin(key: keyof HUD['wins']): void {
    if (key === 'friends' || key === 'quests') return this.ui.setClosed(key, true);
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
    if (this.qtyPop) {
      this.qtyPop.cancel();
      return true;
    }
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
    for (const k of ['settings', 'dev', 'help', 'appearance', 'spells', 'craft', 'market', 'trade', 'depot', 'dialog'] as const) {
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
    (w.root.querySelector('.win-title') as HTMLElement).textContent = `${trName(view.npcName)} — ${trName(view.role)}`;
    const b = w.body;
    b.replaceChildren();
    el('p', 'npc-text', b, trText(view.text));
    const gold = this.s.inventory.count('gold');

    if (view.shop) {
      const shop = el('div', 'shop', b);
      el('div', 'shop-gold', shop, t('You carry {gold} gold · capacity {cap} oz free', { gold: view.shop.gold, cap: Math.floor(this.s.player.capacity - this.s.inventory.weight()) }));
      const cols = el('div', 'shop-cols', shop);
      if (view.shop.sells.length) {
        const sell = el('div', 'shop-col', cols);
        el('div', 'panel-title', sell, t('Buy'));
        for (const it of view.shop.sells) {
          const d = itemDef(it.id);
          const row = el('div', 'shop-row', sell);
          const ic = el('div', 'slot mini', row);
          paintSlot(ic, { id: it.id, qty: 1 });
          const info = el('div', 'shop-info', row);
          el('div', 'shop-name', info, trName(d.name));
          el('div', 'shop-desc', info, describeItemL(d));
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
        el('div', 'panel-title', buy, t('Sell'));
        const owned = view.shop.buys.filter((x) => x.have > 0);
        if (!owned.length) el('div', 'shop-empty', buy, t('You have nothing this trader wants.'));
        for (const it of owned) {
          const d = itemDef(it.id);
          const row = el('div', 'shop-row', buy);
          const ic = el('div', 'slot mini', row);
          paintSlot(ic, { id: it.id, qty: it.have });
          const info = el('div', 'shop-info', row);
          el('div', 'shop-name', info, trName(d.name));
          el('div', 'shop-desc', info, t('{price} gold each', { price: it.price }));
          const btns = el('div', 'shop-btns', row);
          button(btns, t('Sell 1'), () => this.ctl.send({ c: 'dialogue', action: `sell:${it.id}:1` }), 'btn small');
          if (it.have > 1) button(btns, t('All {n}', { n: it.have }), () => this.ctl.send({ c: 'dialogue', action: `sell:${it.id}:${it.have}` }), 'btn small');
        }
      }
    }

    if (view.bank) {
      const bank = el('div', 'bank', b);
      el('div', 'bank-line', bank, t('Balance: {balance} gold · carrying {gold} gold', { balance: view.bank.balance, gold: view.bank.gold }));
      const row = el('div', 'bank-row', bank);
      const amt = el('input', 'num-input', row);
      amt.type = 'number';
      amt.min = '1';
      amt.placeholder = t('Amount');
      const n = () => Math.max(0, Math.floor(Number(amt.value) || 0));
      button(row, t('Deposit'), () => n() && this.ctl.send({ c: 'dialogue', action: `deposit:${n()}` }), 'btn small');
      button(row, t('Withdraw'), () => n() && this.ctl.send({ c: 'dialogue', action: `withdraw:${n()}` }), 'btn small');
      const row2 = el('div', 'bank-row', bank);
      const who = el('input', 'text-input', row2);
      who.placeholder = t('Transfer to (character name)');
      who.maxLength = 20;
      button(row2, t('Transfer'), () => {
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
        el('div', 'spell-name', info, `${trName(sp.name)} — "${sp.words}"`);
        el('div', 'spell-desc', info, `${t('Level {n}', { n: o.level })} · ${t('{n} mana', { n: sp.mana })} · ${sp.vocations.map((v) => trName(VOCATIONS[v].name)).join(', ')}`);
        const label = o.known ? t('Known') : !o.allowed ? t('Not your vocation') : t('Learn ({price})', { price: o.price });
        const bb = button(row, label, () => this.ctl.send({ c: 'dialogue', action: `learn:${o.id}` }), 'btn small');
        bb.disabled = o.known || !o.allowed || gold < o.price || this.s.player.level < o.level;
      }
    }

    const opts = el('div', 'npc-options', b);
    for (const o of view.options) {
      const bb = button(opts, trText(o.label), () => this.ctl.send({ c: 'dialogue', action: o.action }), 'npc-opt');
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
    el('p', 'hint', b, `${t('Your personal depot is shared by every locker in the world. Click an item to take it; right-click (or Ctrl-click) backpack items to store them.')} ${cap < PREMIUM_DEPOT_SLOTS ? t('{used} of {cap} slots used (premium: {premium}).', { used, cap, premium: PREMIUM_DEPOT_SLOTS }) : t('{used} of {cap} slots used.', { used, cap })}`);
    if (used > cap) el('p', 'hint warn', b, t('Your depot holds more than a free account may fill. Everything stays; new items fit once it is back under the limit.'));
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
    const key = `${getLang()}|${voc}|${s.player.level}|${st.name}|${JSON.stringify(s.skills)}|${NONCOMBAT_SKILLS.map((d) => Math.floor(s.gathering[d.id])).join(',')}`;
    if (key === this.skillsKey) return;
    this.skillsKey = key;
    const box = this.skillsEl;
    box.replaceChildren();
    // server rates (exp stages): what this character earns right now
    if (!isClassic(st)) {
      const rates = el('div', 'skill-rates', box, `${t('Rates')} · ${trText(expStageLine(st, s.player.level))}`);
      rates.title = `${t('Server rates ({name}):', { name: t(st.name) })}\n${stagesTable(st).map((x) => trText(x)).join('\n')}`;
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
      const more = Math.max(0, Math.ceil(need - p.tries));
      const how = k === 'magic' ? t('{n} more mana to spend', { n: more }) : k === 'shielding' ? t('{n} more blows to block', { n: more }) : t('{n} more attacks', { n: more });
      row(trName(SKILL_NAMES[k]), p.level, skillProgress(k, p, voc), `${trName(SKILL_NAMES[k])} ${p.level} — ${t('{pct}% to the next level', { pct })} (${how})`);
    }
    // gathering and production skills come from the registry (gathering/skills.ts)
    for (const [kind, head] of [['gathering', k('Gathering')], ['production', k('Production')]] as const) {
      el('div', 'skill-head', box, t(head));
      for (const d of NONCOMBAT_SKILLS) {
        if (d.kind !== kind) continue;
        const xp = s.gathering[d.id];
        const lv = gatherLevelForXp(xp);
        const left = lv >= WC_MAX_LEVEL ? 0 : gatherXpForLevel(lv + 1) - xp;
        row(trName(d.name), lv, gatherProgress(xp), `${trName(d.name)} ${lv} — ${t('{xp} xp', { xp: Math.floor(xp) })}${lv < WC_MAX_LEVEL ? `, ${t('{left} to level {next}', { left: Math.ceil(left), next: lv + 1 })}` : ` ${t('(maximum)')}`}. ${trText(d.hint)}`);
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
    if (title) title.textContent = trName(view.title);
    const groups = [...new Set(view.recipes.map((r) => r.group))];
    if (st.station !== view.station || !groups.includes(st.tab)) {
      // open on the best metal you can work right now
      st.station = view.station;
      const usable = view.recipes.filter((r) => !r.locked);
      st.tab = (usable.find((r) => r.can > 0) ? [...usable].reverse().find((r) => r.can > 0)!.group : usable[usable.length - 1]?.group) ?? groups[0];
    }
    const name = trName(SKILL_NAMES[view.skill]);
    el('div', 'shop-gold', b, `${t('{skill} level {n}.', { skill: name, n: view.level })}${view.note ? ` ${trText(view.note)}` : ''} ${t('Walking away stops the work.')}`);
    if (view.making) {
      const r = view.recipes.find((x) => x.id === view.making!.recipe);
      const row = el('div', 'craft-making', b);
      el('span', '', row, `${r?.label ? trName(r.label) : t('Making {item}', { item: r ? trName(itemDef(r.output.id).name.toLowerCase()) : '…' })} — ${t('{n} left', { n: view.making.left })}`);
      button(row, t('Stop'), () => this.ctl.send({ c: 'craft', recipe: '', count: 0 }), 'btn small');
    }
    if (groups.length > 1) {
      const tabs = el('div', 'market-tabs', b);
      for (const g of groups) {
        button(tabs, trName(g), () => {
          st.tab = g;
          this.drawCraft(view);
        }, `btn small${st.tab === g ? ' on' : ''}`);
      }
    }
    const amount = el('div', 'bank-row', b);
    el('span', 'hint', amount, t('Make X:'));
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
      const rname = trName(SKILL_NAMES[r.skill]);
      const row = el('div', `shop-row${locked ? ' locked' : ''}`, list);
      const ic = el('div', 'slot mini', row);
      paintSlot(ic, { id: r.output.id, qty: r.output.qty });
      ic.title = describeItemL(d);
      const info = el('div', 'shop-info', row);
      el('div', 'shop-name', info, r.label ? trName(r.label) : `${r.output.qty > 1 ? `${r.output.qty}× ` : ''}${trName(d.name)}`);
      const needs = r.inputs.map((it) => `${fmtNum(it.qty)}× ${trName(itemDef(it.id).name.toLowerCase())} (${fmtNum(it.have)})`).join(' + ');
      el('div', 'shop-desc', info, `${r.skill === view.skill ? t('Level {n}', { n: r.level }) : t('{skill} level {n}', { skill: rname, n: r.level })} · ${needs} · ${t('{xp} xp', { xp: r.xp })}${r.chance < 100 ? ` · ${t('{pct}% success', { pct: r.chance })}` : ''}${r.hasTool ? '' : ` · ${t('needs {item}', { item: trName(itemDef(r.tool!).name.toLowerCase()) })}`}`);
      const btns = el('div', 'shop-btns', row);
      const make = (label: string, n: () => number) => {
        const bt = button(btns, label, () => this.ctl.send({ c: 'craft', recipe: r.id, count: n() }), 'btn small');
        bt.disabled = locked || r.can <= 0;
        if (locked) bt.title = t('Needs {skill} level {n}', { skill: rname.toLowerCase(), n: r.level });
      };
      make('1', () => 1);
      make('5', () => 5);
      make('X', () => st.qty);
      make(t('All'), () => Math.max(1, Math.min(MAX_BATCH, r.can)));
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
    el('div', 'shop-gold', b, t('Bank {bank} gold · carrying {gold} gold. Purchases are paid from the bank (then from your backpack) and delivered to your depot.', { bank: view.bank, gold: carried }));
    if (!view.enabled) el('p', 'hint warn', b, t('The market is closed for now. Your offers and items are safe.'));
    const tabs = el('div', 'market-tabs', b);
    const mine = view.offers.filter((o) => o.mine);
    for (const [id, label] of [['browse', t('Buy')], ['sell', t('Sell')], ['mine', t('My offers ({n})', { n: mine.length })]] as const) {
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
      q.placeholder = t('Search items…');
      q.value = st.search;
      stop(q);
      const list = el('div', 'market-list', b);
      const fill = () => {
        list.replaceChildren();
        const needle = st.search.trim().toLowerCase();
        const shown = view.offers.filter((o) => !needle || itemDef(o.item).name.toLowerCase().includes(needle) || trName(itemDef(o.item).name).toLowerCase().includes(needle));
        if (!shown.length) el('div', 'shop-empty', list, t(view.offers.length ? 'No offers match.' : 'Nobody is selling anything yet.'));
        for (const o of shown.slice(0, 200)) {
          const d = itemDef(o.item);
          const r = el('div', 'shop-row', list);
          itemCell(r, o.item, o.qty);
          const info = el('div', 'shop-info', r);
          el('div', 'shop-name', info, `${fmtNum(o.qty)}× ${trName(d.name)}`);
          el('div', 'shop-desc', info, `${t('{price} gold each', { price: o.price })} · ${t('from {seller}', { seller: o.seller })}${o.mine ? ` ${t('(you)')}` : ''}`);
          const btns = el('div', 'shop-btns', r);
          if (o.mine) {
            el('span', 'shop-empty', btns, t('your offer'));
            continue;
          }
          let n = Math.min(o.qty, st.buyQty.get(o.id) ?? 1);
          const buy = button(btns, '', () => this.ctl.send({ c: 'marketBuy', id: o.id, qty: n }), 'btn small');
          const label = () => {
            buy.textContent = t('Buy {n} · {price}', { n, price: n * o.price });
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
      el('p', 'hint', b, t('Pick an item from your depot or backpack, then set how many and the price for each. Listing costs 1% of the total (at least 1 gold) from your bank. The items wait in the market until someone buys them; the gold goes to your bank, even while you are away.'));
      const cols = el('div', 'shop-cols', b);
      const pick = (title: string, from: 'depot' | 'inv', stacks: Array<ItemStack | null>) => {
        const c = el('div', 'shop-col', cols);
        el('div', 'panel-title', c, t(title));
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
        if (!any) el('div', 'shop-empty', c, t('Nothing to sell here.'));
      };
      pick('Depot', 'depot', view.depot);
      const inv = this.s.inventory;
      pick('Backpack', 'inv', inv.slots.slice(0, inv.size()));
      const sel = st.sel;
      const stack = sel ? (sel.from === 'depot' ? view.depot[sel.index] : inv.slots[sel.index]) : null;
      const form = el('div', 'market-form', b);
      if (!sel || !stack) {
        el('div', 'shop-empty', form, t('Select an item to sell.'));
      } else {
        const d = itemDef(stack.id);
        const r = el('div', 'bank-row', form);
        itemCell(r, stack.id, stack.qty);
        el('span', 'shop-name', r, trName(d.name));
        el('span', 'dev-label', r, t('Amount'));
        st.qty = Math.max(1, Math.min(stack.qty, st.qty));
        const summary = el('div', 'shop-desc', form);
        const go = button(form, t('Create offer'), () => this.ctl.send({ c: 'marketSell', from: sel.from, index: sel.index, qty: st.qty, price: st.price }), 'btn');
        const update = () => {
          const total = st.qty * st.price;
          const fee = marketFee(total);
          summary.textContent = t('{qty}× {item} at {price} gold each = {total} gold. Listing fee: {fee} gold. Traders would pay {value} each.', { qty: st.qty, item: trName(d.name), price: st.price, total, fee, value: d.value });
          go.disabled = !view.enabled || st.price < 1 || fee > view.bank + carried;
        };
        numInput(r, st.qty, 1, stack.qty, (v) => { st.qty = v; update(); });
        el('span', 'dev-label', r, t('Price each'));
        numInput(r, st.price, 1, MARKET_MAX_PRICE, (v) => { st.price = v; update(); });
        update();
      }
    } else {
      const list = el('div', 'market-list', b);
      if (!mine.length) el('div', 'shop-empty', list, t('You have no offers. Use the Sell tab to list something.'));
      for (const o of mine) {
        const d = itemDef(o.item);
        const r = el('div', 'shop-row', list);
        itemCell(r, o.item, o.qty);
        const info = el('div', 'shop-info', r);
        el('div', 'shop-name', info, `${fmtNum(o.qty)}× ${trName(d.name)}`);
        const days = Math.max(0, Math.ceil((o.expires - Date.now()) / 86_400_000));
        el('div', 'shop-desc', info, `${t('{price} gold each', { price: o.price })} · ${t('ends in {n} day|ends in {n} days', { n: days })}`);
        const bb = button(r, t('Cancel'), () => this.ctl.send({ c: 'marketCancel', id: o.id }), 'btn small');
        bb.disabled = !view.enabled;
      }
    }
  }

  // ---------------------------------------------------------------- trade

  private renderTrade(): void {
    const w = this.wins.trade;
    const tv = this.ctl.trade();
    this.renderInventory();
    if (!tv) {
      w.open = false;
      w.root.hidden = true;
      return;
    }
    w.open = true;
    w.root.hidden = false;
    (w.root.querySelector('.win-title') as HTMLElement).textContent = t('Trade with {name}', { name: tv.partnerName });
    const b = w.body;
    b.replaceChildren();
    el('p', 'hint', b, t('Drag items from your backpack here (or onto the other player) to offer them; click an item in your offer to take it back. Changing an offer clears both acceptances; the trade happens only when both of you accept.'));
    const cols = el('div', 'trade-cols', b);
    const side = (title: string, items: ItemStack[], gold: number, accepted: boolean, onClick?: (i: number) => void) => {
      const c = el('div', 'trade-col', cols);
      el('div', 'panel-title', c, `${title}${accepted ? ` ✔ ${t('accepted')}` : ''}`);
      const grid = el('div', 'bag-grid', c);
      items.forEach((it, i) => {
        const d = el('div', 'slot', grid);
        paintSlot(d, it);
        if (onClick) {
          d.title = `${trName(itemDef(it.id).name)} — ${t('click to take it back')}`;
          d.style.cursor = 'pointer';
          d.addEventListener('click', () => onClick(i));
        }
      });
      if (!items.length) el('div', 'shop-empty', c, t('No items.'));
      el('div', 'trade-gold', c, t('Gold: {gold}', { gold }));
      return c;
    };
    const mine = side(t('Your offer'), tv.mine.items, tv.mine.gold, tv.mine.accepted, (i) => this.ctl.send({ c: 'tradeOffer', slots: tv.mine.slots.filter((_, k) => k !== i), gold: tv.mine.gold }));
    side(t("{name}'s offer", { name: tv.partnerName }), tv.theirs.items, tv.theirs.gold, tv.theirs.accepted);
    const gr = el('div', 'bank-row', mine);
    const gi = el('input', 'num-input', gr);
    gi.type = 'number';
    gi.min = '0';
    gi.value = String(tv.mine.gold);
    gi.addEventListener('keydown', (e) => e.stopPropagation());
    button(gr, t('Set gold'), () => this.ctl.send({ c: 'tradeOffer', slots: tv.mine.slots, gold: Math.max(0, Math.floor(Number(gi.value) || 0)) }), 'btn small');
    const row = el('div', 'trade-actions', b);
    const acc = button(row, t(tv.mine.accepted ? 'Waiting for partner…' : 'Accept'), () => this.ctl.send({ c: 'tradeAccept' }), 'btn');
    acc.disabled = tv.mine.accepted;
    button(row, t('Cancel trade'), () => this.ctl.send({ c: 'tradeCancel' }), 'btn');
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
    el('span', 'dev-label', opts, t('Preview'));
    const gb = button(opts, t(this.designerGear ? 'Worn gear: shown' : 'Worn gear: hidden'), () => {
      this.designerGear = !this.designerGear;
      d.setGear(this.designerGear ? gearNow() : null);
      gb.textContent = t(this.designerGear ? 'Worn gear: shown' : 'Worn gear: hidden');
      gb.classList.toggle('on', this.designerGear);
    }, `btn small${this.designerGear ? ' on' : ''}`);
    // founder looks: cloak and title can be switched off per character
    const tier = this.ctl.game.premiumView(this.ctl.pid)?.tier ?? null;
    // a worn cape can be hidden with the same switch as the founder cloak
    const capeOn = !!this.s.inventory.equipment.cape;
    // a Pioneer (no founder tier) can still switch the title off
    const titled = !!this.ctl.game.getPlayer(this.ctl.pid)?.title || this.s.cosmetics.hideTitle;
    if (tier || capeOn || titled) {
      const fr = el('div', 'dev-row', b);
      el('span', 'dev-label', fr, t(tier ? 'Founder' : capeOn ? 'Cape' : 'Pioneer'));
      const cos = this.s.cosmetics;
      if (tier || capeOn) {
        const what = tier ? (capeOn ? k('Cloak & cape') : k('Cloak')) : k('Cape');
        const shown = () => t(cos.hideCloak ? '{what}: hidden' : '{what}: shown', { what: t(what) });
        const cb = button(fr, shown(), () => {
          this.ctl.send({ c: 'cosmetics', cloak: cos.hideCloak });
          cos.hideCloak = !cos.hideCloak;
          cb.textContent = shown();
          cb.classList.toggle('on', !cos.hideCloak);
        }, `btn small${cos.hideCloak ? '' : ' on'}`);
      }
      if (tier || titled) {
        const tb = button(fr, t(cos.hideTitle ? 'Title: hidden' : 'Title: shown'), () => {
          this.ctl.send({ c: 'cosmetics', title: cos.hideTitle });
          cos.hideTitle = !cos.hideTitle;
          tb.textContent = t(cos.hideTitle ? 'Title: hidden' : 'Title: shown');
          tb.classList.toggle('on', !cos.hideTitle);
        }, `btn small${cos.hideTitle ? '' : ' on'}`);
      }
    }
    const row = el('div', 'trade-actions', b);
    button(row, t('Confirm'), () => {
      this.ctl.send({ c: 'appearance', ap: encodeAppearance(d.value) });
      this.closeWin('appearance');
    }, 'btn on');
    button(row, t('Cancel'), () => this.closeWin('appearance'), 'btn');
  }

  // ---------------------------------------------------------------- test console

  private renderDev(): void {
    const b = this.wins.dev.body;
    b.replaceChildren();
    const cmd = (text: string) => this.ctl.send({ c: 'say', text });
    el('p', 'hint', b, t(this.ctl.online
      ? 'Test commands work online for game masters (ouriolis, dawid and names in ADMINS). Results appear in the chat log.'
      : 'Give yourself levels, gold and items for testing. Results appear in the chat log. You can also type the commands in chat, e.g. /level 100.'));
    const stop = (i: HTMLInputElement) => i.addEventListener('keydown', (e) => e.stopPropagation());
    const numRow = (label: string, def: number, quick: number[], run: (n: number) => void, fmt: (n: number) => string = String) => {
      const row = el('div', 'dev-row', b);
      el('span', 'dev-label', row, t(label));
      const inp = el('input', 'num-input', row);
      inp.type = 'number';
      inp.value = String(def);
      stop(inp);
      button(row, t('Set'), () => run(Math.floor(Number(inp.value) || 0)), 'btn small');
      for (const q of quick) button(row, fmt(q), () => run(q), 'btn small');
    };
    numRow('Level', 100, [20, 50, 100, 200, 500], (n) => cmd(`/level ${n}`));
    numRow('Gold', 10000, [1000, 10000, 100000, 1000000], (n) => cmd(`/gold ${n}`), (n) => (n >= 1e6 ? `${n / 1e6}m` : n >= 1000 ? `${n / 1000}k` : String(n)));

    const tools = el('div', 'dev-row', b);
    button(tools, t('Learn all spells'), () => cmd('/spells'), 'btn small');
    button(tools, t('Full heal'), () => cmd('/heal'), 'btn small');
    button(tools, t(this.s.player.god ? 'God mode: on' : 'God mode: off'), () => {
      cmd('/god');
      setTimeout(() => this.wins.dev.open && this.renderDev(), 150);
    }, 'btn small');
    button(tools, t('Kill target'), () => cmd('/kill'), 'btn small');

    const cp = el('div', 'dev-row', b);
    el('span', 'dev-label', cp, t('Capes & pets'));
    button(cp, t('All 30 capes'), () => cmd('/capes'), 'btn small');
    button(cp, t('Max all skills'), () => cmd('/maxskills'), 'btn small');
    button(cp, t('All 8 pets'), () => cmd('/pets'), 'btn small');
    button(cp, t('Pets to level 10'), () => cmd('/petlevel 10'), 'btn small');
    el('span', 'hint', cp, t('Skill capes need the skill: press Max all skills to wear every cape. Use a pet item to call the pet.'));

    const tp = el('div', 'dev-row', b);
    el('span', 'dev-label', tp, t('Teleport'));
    const sel = el('select', 'text-input', tp);
    const seen = new Set<string>();
    for (const r of this.ctl.game.world.regions) {
      if (seen.has(r.name) || (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 60) continue;
      seen.add(r.name);
      const o = el('option', '', sel, `${trName(r.name)}${r.level && r.level !== '—' ? ` (${r.level})` : ''}${r.z0 < 0 ? ` · ${t('floor {z}', { z: String(r.z0) })}` : ''}`);
      o.value = r.name;
    }
    button(tp, t('Go'), () => cmd(`/goto ${sel.value}`), 'btn small');

    const sets = el('div', 'dev-row', b);
    el('span', 'dev-label', sets, t('Gear sets'));
    const giveAll = (list: Array<[string, number]>) => {
      list.forEach(([id, n], i) => setTimeout(() => cmd(`/item ${id} ${n}`), i * 60));
    };
    button(sets, trName('Knight'), () => giveAll([['dragonhide_pack', 1], ['kings_edge', 1], ['demon_reaver', 1], ['demon_helm', 1], ['demonplate', 1], ['demon_legs', 1], ['windstride_boots', 1], ['demon_shield', 1], ['demonbone_amulet', 1], ['ring_of_might', 1], ['great_health_potion', 100]]), 'btn small');
    button(sets, trName('Paladin'), () => giveAll([['dragonhide_pack', 1], ['dragonbane_crossbow', 1], ['infernal_bolt', 100], ['elven_longbow', 1], ['flaming_arrow', 100], ['royal_javelin', 50], ['elven_circlet', 1], ['elven_mail', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['strong_health_potion', 100]]), 'btn small');
    button(sets, trName('Sorcerer'), () => giveAll([['dragonhide_pack', 1], ['wand_of_inferno', 1], ['storm_tome', 1], ['elven_circlet', 1], ['arcane_robe', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['great_mana_potion', 100], ['fireball_rune', 50], ['death_rune', 50]]), 'btn small');
    button(sets, trName('Druid'), () => giveAll([['dragonhide_pack', 1], ['rod_of_wilds', 1], ['storm_tome', 1], ['elven_circlet', 1], ['arcane_robe', 1], ['elven_leggings', 1], ['windstride_boots', 1], ['great_mana_potion', 100], ['healing_rune', 50], ['avalanche_rune', 50], ['stoneshower_rune', 50]]), 'btn small');
    button(sets, t('Tools'), () => giveAll([['rope', 1], ['shovel', 1]]), 'btn small');

    const qtyRow = el('div', 'dev-row', b);
    el('span', 'dev-label', qtyRow, t('Items'));
    el('span', 'hint', qtyRow, t('Click an item to get it. Stackable items come in this amount:'));
    const qty = el('input', 'num-input', qtyRow);
    qty.type = 'number';
    qty.value = '100';
    stop(qty);
    const grid = el('div', 'dev-items', b);
    const kinds: Array<[string, string[]]> = [
      [k('Weapons'), ['weapon']], [k('Ammo'), ['ammo']], [k('Shields & books'), ['shield']], [k('Helmets'), ['helmet']], [k('Armour'), ['armor']],
      [k('Legs'), ['legs']], [k('Boots'), ['boots']], [k('Amulets & rings'), ['amulet', 'ring']], [k('Backpacks & tools'), ['backpack', 'tool']],
      [k('Capes'), ['cape']], [k('Pets'), ['pet']], [k('Potions & food'), ['consumable']], [k('Runes'), ['rune']], [k('Loot'), ['material']],
    ];
    for (const [title, ks] of kinds) {
      el('div', 'panel-title', grid, t(title));
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
    inp.placeholder = t('/help, /level 80, /item dragon helm, /goto caldera, /vocation druid…');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') inp.blur();
      if (e.key === 'Enter' && inp.value.trim()) {
        const v = inp.value.trim();
        cmd(v.startsWith('/') ? v : `/${v}`);
        inp.value = '';
      }
    });
    button(line, t('Run'), () => {
      const v = inp.value.trim();
      if (v) cmd(v.startsWith('/') ? v : `/${v}`);
      inp.value = '';
    }, 'btn small');
  }

  // ---------------------------------------------------------------- spellbook

  private renderSpells(): void {
    const b = this.wins.spells.body;
    b.replaceChildren();
    const s = this.s;
    const voc = s.player.vocation;
    el('p', 'hint', b, t("Say a spell's words in chat, press its hotkey, or click Cast. Trainers in towns teach the spells you have not learned yet."));
    const list = el('div', 'spell-offers', b);
    const mine = SPELL_LIST.filter((sp) => sp.vocations.includes(voc)).sort((a, c) => a.level - c.level);
    const row = (sp: SpellDef) => {
      const known = s.spells.has(sp.id);
      const r = el('div', `spell-row${known ? '' : ' unknown'}`, list);
      const ic = el('img', 'spell-icon', r);
      ic.src = spellIcon(sp.id);
      ic.alt = '';
      const info = el('div', 'spell-info', r);
      el('div', 'spell-name', info, `${trName(sp.name)} — "${sp.words}${sp.kind === 'healFriend' ? ` "${t('name')}` : sp.param ? ` "${t(sp.param)}` : ''}"`);
      el('div', 'spell-desc', info, `${trText(sp.description)} · ${t('Level {n}', { n: sp.level })} · ${t('{n} mana', { n: sp.mana })} · ${t('cooldown {s}s', { s: sp.cooldown })}${known ? '' : ` · ${t('learn for {price} gold', { price: sp.price })}`}`);
      const btns = el('div', 'shop-btns', r);
      const cast = button(btns, t('Cast'), () => sp.kind === 'healFriend' || sp.param ? this.focusChat(`${sp.words} "`) : this.ctl.send({ c: 'cast', spell: sp.id }), 'btn small');
      cast.disabled = !known;
      button(btns, t('Hotkey'), () => {
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
      const giver = trName(NPCS[q.giver]?.name ?? q.giver);
      el('div', 'quest-title', r, trName(q.title));
      const status = st.status === 'available' ? (q.minLevel ? t('Ask {giver} about it (level {level}+).', { giver, level: q.minLevel }) : t('Ask {giver} about it.', { giver }))
        : st.status === 'active' ? `${trName(q.targetName)}: ${st.kills}/${q.count}`
        : st.status === 'ready' ? t('Done — return to {giver}.', { giver }) : t('Completed.');
      el('div', 'quest-status', r, status);
      if (st.status === 'active' || st.status === 'ready') {
        const bar = el('div', 'bar quest-bar', r);
        el('div', 'bar-fill', bar).style.width = `${(st.kills / q.count) * 100}%`;
      }
      if (st.status !== 'done') el('div', 'quest-reward', r, `${t('Reward: {exp} exp', { exp: q.rewardExp })}${q.rewardItems.length ? `, ${q.rewardItems.map((i) => i.id === 'gold' ? t('{n} gold', { n: i.qty }) : `${i.qty > 1 ? `${fmtNum(i.qty)}× ` : ''}${trName(itemDef(i.id).name)}`).join(', ')}` : ''}`);
    }
    if (!any) el('p', 'hint', b, t('No quests yet. Talk to people in town.'));
  }

  // ---------------------------------------------------------------- help

  private renderHelp(): void {
    const b = this.wins.help.body;
    const intro = el('p', 'hint', b);
    intro.textContent = t(this.ctl.online
      ? 'You are playing online. Other adventurers share this world with you; the server keeps your character.'
      : 'You are playing offline. Your character is saved in this browser.');
    const lay = el('p', 'hint', b, t('Layout: drag a window by its title bar to another place or column, click the title to fold it, − folds it, ✕ closes it (Windows brings it back), drag its bottom edge to resize it. Drag an action bar or the health bar by its striped grip to any edge of the game view, or anywhere over it. Drag the inner edge of the columns to widen them and the top edge of the chat to make it taller. Lock layout keeps everything in place.') + ' ');
    button(lay, t('Reset layout'), () => this.ui.reset(), 'btn small');
    const grid = el('div', 'help-grid', b);
    const rows: Array<[string, string]> = [
      [k('WASD / arrows'), k('Walk (Q E Z C or numpad for diagonals)')],
      [k('Left-click ground'), k('Walk there (path-finding)')],
      [k('Left-click monster'), k('Attack — your character fights automatically')],
      [k('Left-click NPC'), k('Talk: trade, bank, quests, travel, spells')],
      [k('Click ladders, ropes, lockers…'), k('Use them (rope spots need a rope, loose stones a shovel)')],
      [k('Right-click'), k('Context menu: trade with players, item actions')],
      [k('F1 – F12'), k('Hotkeys (spells, potions, runes)')],
      [k('Ctrl+1 – Ctrl+0'), k('Second hotkey row, made for runes in PvP (Alt+1 – Alt+0 also works; use Full screen in Settings so the browser lets the game have Ctrl+number)')],
      [k('Enter'), k('Chat; saying spell words casts spells (e.g. exura)')],
      [k('Tab / Space'), k('Target the next monster')],
      [k('Esc'), k('Close windows / clear target')],
      [k('Mouse wheel'), k('Zoom')],
      [k('M'), k('World map (every floor, click to walk)')],
      [k('Ctrl + direction / Ctrl+R'), k('Turn without moving')],
      [k('` (key under Esc)'), k('Test console: levels, gold, items, teleports (also /help in chat)')],
      [k('Ctrl-click item'), k('Store in depot while a locker is open')],
      [k('Drag a stack'), k('How many? — move, drop or trade only part of it (slider, 1 / Half / All, Enter confirms, Esc cancels). Hold Ctrl while dragging to move the whole stack without asking; right-click → Split stack… splits it into a free slot')],
      [k('Click a tree (with an axe)'), k('Chop it: logs and woodcutting experience (higher trees need higher woodcutting)')],
      [k('Click water within 3 tiles (with a fishing rod)'), k('Fish: catches to eat or sell and fishing experience (better fish need higher fishing; ice fish near snow, swordfish in deep sea)')],
      [k('Market board (in depots)'), k('Buy from and sell to other players; gold goes to the bank, items to the depot')],
      [k('Click an ore rock (with a pickaxe)'), k('Mine it: ore, sometimes a gem, and mining experience (copper and tin near towns, rarer ore deeper underground)')],
      [k('Furnace / anvil (in every smithy)'), k("Furnace: smelt ore into bars, or cast rings and amulets from silver/gold bars and cut gems (crafting). Anvil (with a smith's hammer): smith bars into weapons, armour, pickaxes and arrowheads. Make 1, 5, X or All; walking stops it")],
      [k('Use a knife (or arrow shafts)'), k('Fletching: carve logs into arrow shafts, bows and crossbow stocks; shafts + feathers + arrowheads make arrows')],
      [k('Use a needle / a chisel'), k('Crafting: sew leather and fur (with thread) into armour, bags and backpacks; cut gems. Tan hides at the tanning rack in every smithy')],
      [k('Use a tinderbox'), k('Firemaking: light logs where you stand (not in towns); you step aside. The fire burns 1–2 minutes')],
      [k('Click a campfire or a stove'), k('Cooking: raw fish and meat become food that heals more; burns less as you level. Every depot has a stove')],
    ];
    for (const [k, v] of rows) {
      el('div', 'help-key', grid, t(k));
      el('div', 'help-val', grid, t(v));
    }
    const st = this.ctl.game.stages;
    el('div', 'panel-title', b, t('Server rates ({name})', { name: t(st.name) }));
    el('p', 'hint help-rates', b, (isClassic(st) ? [t('Classic: everything ×1.')] : stagesTable(st).map((x) => trText(x))).join('\n'));
    el('p', 'hint', b, t('Stairs and holes take you between floors; mountains, towers and dungeons go up to two floors high and four deep. Towns are protection zones: monsters cannot follow you in.'));
  }

  // ================================================================ misc actions

  /** A new language was picked: rebuild everything that shows text (fixed labels were relabelled by ui/lang.ts). */
  private languageChanged(): void {
    for (const f of this.relabelers) f();
    this.relabelLayout();
    this.skillsKey = '';
    this.partyKey = '';
    this.lastRegion = '';
    this.wins.help.body.replaceChildren();
    this.renderHelp();
    this.renderInventory();
    this.renderHotbar();
    this.renderTutorial();
    this.renderFriends();
    if (this.wins.dialog.open) this.renderDialog();
    if (this.wins.spells.open) this.renderSpells();
    if (this.wins.quests.open) this.renderQuests();
    if (this.wins.trade.open) this.renderTrade();
    if (this.wins.market.open) this.renderMarket();
    if (this.wins.craft.open) this.renderCraft();
    if (this.wins.depot.open) this.renderDepot();
    if (this.wins.dev.open) this.renderDev();
    if (this.wins.corpse.open) this.renderCorpse();
  }

  private togglePixels(): void {
    const on = !this.renderer.cam.pixelMode;
    this.renderer.setPixelMode(on);
    this.pixelBtn.textContent = t(on ? 'Pixels: on' : 'Pixels: off');
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
    if (this.ctl.save()) this.toast(t('Game saved.'));
    else this.toast(t('Could not save right now.'));
  }

  private showDisconnect(why: string): void {
    this.disconnectEl.hidden = false;
    this.disconnectEl.replaceChildren();
    el('div', 'death-title', this.disconnectEl, t('Disconnected'));
    el('div', 'death-sub', this.disconnectEl, trText(why));
    button(this.disconnectEl, t('Back to the title screen'), () => location.reload(), 'btn');
  }

  // ================================================================ per frame

  /** A game master's pop-up: stays until the player clicks OK. */
  private adminNotice(title: string, text: string): void {
    const box = el('div', 'admin-notice', this.root);
    const card = el('div', 'admin-card', box);
    el('div', 'admin-title', card, `⚠ ${title}`);
    el('div', 'admin-text', card, text);
    const ok = button(card, t('OK, understood'), () => box.remove(), 'btn');
    ok.focus();
    this.log(`${title}: ${text}`, 'warn');
  }

  /** Friends window: online first; friend requests at the top. */
  private renderFriends(): void {
    const fv = this.ctl.game.friendsView(this.ctl.pid);
    this.friendsBtn.textContent = fv.requests.length ? t('Friends ({n})', { n: fv.requests.length }) : t('Friends');
    this.friendsBtn.classList.toggle('on', fv.requests.length > 0);
    const w = this.wins.friends;
    if (!w.open) return;
    const b = w.body;
    b.replaceChildren();
    for (const r of fv.requests) {
      const row = el('div', 'friend-row request', b);
      el('span', 'friend-name', row, t('{name} wants to be your friend', { name: r.name }));
      button(row, t('Accept'), () => this.ctl.send({ c: 'friendAccept', id: r.id }), 'btn small');
      button(row, t('Decline'), () => this.ctl.send({ c: 'friendDecline', id: r.id }), 'btn small');
    }
    if (!fv.friends.length) el('p', 'hint', b, t('No friends yet. Right-click a player and choose "Add … as friend"; they have to accept.'));
    for (const f of fv.friends) {
      const row = el('div', `friend-row${f.online ? ' online' : ''}`, b);
      el('span', 'friend-dot', row);
      el('span', 'friend-name', row, f.online ? `${f.name}${f.level ? ` (${f.level})` : ''}` : f.name);
      el('span', 'friend-state', row, t(f.online ? 'online' : 'offline'));
      button(row, t('Message'), () => this.focusChat(`${f.name}, `), 'btn tiny');
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
    (w.root.querySelector('.win-title') as HTMLElement).textContent = t('Dead body of {name}', { name: bag.corpse ? trName(bag.corpse) : t('someone') });
    if (!bag.items.length) {
      el('p', 'hint', b, t('Nothing left on the body.'));
      return;
    }
    el('p', 'hint', b, t('Click an item to take it.'));
    const grid = el('div', 'bag-grid', b);
    bag.items.forEach((it, i) => {
      const d = el('div', 'slot', grid);
      paintSlot(d, it);
      d.title = `${trName(itemDef(it.id).name)}\n${describeItemL(itemDef(it.id))}`;
      d.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.ctl.send({ c: 'pickup', id: bag.id, take: i });
      });
    });
    button(b, t('Take all'), () => this.ctl.send({ c: 'pickup', id: bag.id, take: -1 }), 'btn');
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
    if (!c) { el('p', 'hint', b, t('Out of sight.')); return; }
    (w.root.querySelector('.win-title') as HTMLElement).textContent = c.kind === 'player' ? c.name : trName(c.name);
    const pl = g.getPlayer(c.id);
    const lines: Array<[string, string]> = [];
    if (pl) {
      if (pl.title) lines.push([k('Title'), trText(pl.title)]);
      lines.push([k('Level'), String(pl.level)], [k('Vocation'), trName(VOCATIONS[pl.vocation].name)], [k('Health'), `${Math.round((pl.hp / pl.maxHp) * 100)}%`]);
      if (pl.premium) lines.push([k('Account'), `♛ ${t('Premium')}`]);
      const sk = g.skullOf(pl);
      if (sk) lines.push([k('Skull'), t(sk === 2 ? 'red' : 'white')]);
      const pf = g.partyFlag(this.ctl.pid, pl.id);
      if (pf === 1) lines.push([k('Party'), t('in your party')]);
      if (pl.id === this.ctl.pid) lines.push([k('Experience'), fmtNum(pl.exp)]);
    } else {
      const en = g.getEnemy(c.id);
      lines.push([k('Health'), `${Math.round((c.hp / c.maxHp) * 100)}%`]);
      if (en) lines.push([k('Experience'), fmtNum(en.def.exp)], [k('Hit points'), fmtNum(en.maxHp)]);
    }
    const tbl = el('div', 'inspect-stats', b);
    for (const [k, v] of lines) { el('span', 'k', tbl, t(k)); el('span', 'v', tbl, v); }
    const sess = pl ? g.session(pl.id) : null;
    if (sess) {
      el('div', 'panel-title', b, t('Equipment'));
      const grid = el('div', 'bag-grid', b);
      for (const e of EQUIP_LAYOUT) {
        const st = sess.inventory.equipment[e.slot];
        const d = el('div', 'slot', grid);
        paintSlot(d, st, e.ph);
        if (st) d.title = trName(itemDef(st.id).name);
      }
      const sets = g.activeSets(sess);
      if (sets.length) {
        el('div', 'panel-title', b, t('Set bonuses'));
        for (const a of sets) el('div', 'hint', b, `${trName(`${a.set.name} set`)} (${a.count}/${a.set.pieces.length}): ${a.bonuses.flatMap(bonusPartsL).join(', ')}`);
      }
    }
    if (pl && pl.id !== this.ctl.pid) {
      const row = el('div', 'trade-actions', b);
      button(row, t('Follow'), () => this.ctl.send({ c: 'follow', id: pl.id }), 'btn small');
      button(row, t('Trade'), () => this.ctl.send({ c: 'tradeRequest', id: pl.id }), 'btn small');
      button(row, t('Add friend'), () => this.ctl.send({ c: 'friendRequest', id: pl.id }), 'btn small');
    }
  }

  /** Party panel: rebuilt when membership changes, health bars every frame. */
  private renderParty(): void {
    const pv = this.ctl.game.partyView(this.ctl.pid);
    if (!!pv !== this.inParty) {
      this.inParty = !!pv;
      if (pv) this.ui.toggle('party', true);
    }
    if (!pv) {
      if (this.partyKey !== 'none') {
        this.partyKey = 'none';
        this.partyEl.replaceChildren();
        el('p', 'hint', this.partyEl, t('You are not in a party. Right-click a player to invite them.'));
      }
      return;
    }
    const key = JSON.stringify([getLang(), pv.leader, pv.shared, pv.sharedActive, pv.members.map((m) => [m.id, m.name, m.level])]);
    if (key !== this.partyKey) {
      this.partyKey = key;
      const b = this.partyEl;
      b.replaceChildren();
      for (const m of pv.members) {
        const row = el('div', 'party-row', b);
        row.dataset.pid = String(m.id);
        el('span', 'party-name', row, `${m.id === pv.leader ? '★ ' : ''}${m.name} (${m.level})`);
        const bar = el('div', 'battle-bar', row);
        el('div', 'battle-fill party-fill', bar);
        if (m.id !== this.ctl.pid) row.addEventListener('mousedown', (e) => { e.preventDefault(); this.creatureMenu('player', m.id, e.clientX, e.clientY); });
      }
      const st = el('div', `party-share${pv.shared ? (pv.sharedActive ? ' on' : ' idle') : ''}`, b,
        t(pv.shared ? (pv.sharedActive ? 'Shared experience: active (+20%)' : 'Shared experience: on, inactive (too far apart or levels too different)') : 'Shared experience: off'));
      st.title = t('Members on the same floor within 30 tiles of the kill share its experience evenly, with a 20% bonus. The lowest level must be at least 2/3 of the highest.');
      const row = el('div', 'trade-actions', b);
      if (pv.leader === this.ctl.pid) button(row, t(pv.shared ? 'Share exp: ON' : 'Share exp: OFF'), () => this.ctl.send({ c: 'partyShare', on: !pv.shared }), `btn small${pv.shared ? ' on' : ''}`);
      button(row, t('Leave'), () => this.ctl.send({ c: 'partyLeave' }), 'btn small');
    }
    for (const m of pv.members) {
      const live = this.ctl.game.getPlayer(m.id);
      const frac = live ? live.hp / live.maxHp : m.hp / Math.max(1, m.mhp);
      const fill = this.partyEl.querySelector(`.party-row[data-pid="${m.id}"] .party-fill`) as HTMLDivElement | null;
      if (fill) { fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; fill.style.background = hpColor(frac); }
    }
  }

  // ================================================================ cast / channel bar

  /** Times are wall-clock ms (performance.now), so a slow frame rate cannot make the bar lag behind the server's 3 s. */
  private cast: { root: HTMLDivElement; label: HTMLSpanElement; secs: HTMLSpanElement; fill: HTMLDivElement; end: number; dur: number; hide: number } | null = null;

  /** A channel starts (teleport rune): the bar fills over `dur` seconds under your character. */
  private castStart(label: string, dur: number): void {
    if (!this.cast) {
      const root = el('div', 'panel cast-bar', this.root);
      root.setAttribute('role', 'status');
      const top = el('div', 'cast-top', root);
      const lb = el('span', 'cast-label', top);
      const secs = el('span', 'cast-secs', top);
      const bar = el('div', 'bar cast-track', root);
      const fill = el('div', 'bar-fill cast-fill', bar);
      this.cast = { root, label: lb, secs, fill, end: 0, dur: 1, hide: 0 };
    }
    const c = this.cast;
    c.label.textContent = label;
    c.dur = Math.max(0.1, dur);
    c.end = performance.now() + c.dur * 1000;
    c.hide = 0;
    c.root.classList.remove('broken', 'done');
    c.root.classList.add('on');
    this.updateCast();
  }

  /** The channel ends: done (full, gold) or broken off (red); the bar fades a moment later. */
  private castEnd(label: string, done: boolean): void {
    const c = this.cast;
    if (!c || !c.root.classList.contains('on')) return;
    c.label.textContent = label;
    c.secs.textContent = '';
    c.fill.style.width = done ? '100%' : c.fill.style.width;
    c.root.classList.toggle('done', done);
    c.root.classList.toggle('broken', !done);
    c.hide = performance.now() + 1200;
  }

  private updateCast(): void {
    const c = this.cast;
    if (!c || !c.root.classList.contains('on')) return;
    const now = performance.now();
    if (c.hide > 0) {
      if (now >= c.hide) c.root.classList.remove('on');
      return;
    }
    const left = Math.max(0, (c.end - now) / 1000);
    c.fill.style.width = `${Math.min(1, 1 - left / c.dur) * 100}%`;
    c.secs.textContent = `${left.toFixed(1)} s`;
  }

  // ================================================================ tutorial objective bar

  private buildTutorial(): void {
    const root = el('div', 'panel tut-bar', this.root);
    const head = el('div', 'tut-head', root);
    el('span', 'tut-tag', head, t('Tutorial'));
    const title = el('span', 'tut-title', head);
    const nav = el('span', 'tut-nav', head);
    const arrow = el('span', 'tut-arrow', nav, '➤');
    const dist = el('span', 'tut-dist', nav);
    const hint = el('div', 'tut-hint', root);
    const todo = el('div', 'tut-todo', root);
    const skip = button(head, t('Skip tutorial'), () => {
      // two clicks, so nobody leaves the island by accident
      if (this.tut.armed > 0) {
        this.tut.armed = 0;
        this.ctl.send({ c: 'tutorialSkip' });
        return;
      }
      this.tut.armed = 4;
      skip.textContent = t('Click again to sail to Thornvale');
    }, 'btn tiny tut-skip');
    skip.title = t('Your account has finished the island before. Skipping gives you the same gear a graduate leaves with.');
    this.tut = { root, title, arrow, dist, hint, todo, skip, armed: 0, timer: 0 };
  }

  private renderTutorial(): void {
    if (!this.tut) return;
    const ts = this.s.tutorial;
    const on = ts.state === 'active';
    this.tut.root.classList.toggle('on', on);
    if (!on) return;
    const st = tutorialStep(ts.step);
    if (!st) return;
    this.tut.title.textContent = `${ts.step}/${TUTORIAL_LAST} · ${trName(st.title)}${st.optional ? ` ${t('(optional)')}` : ''}`;
    this.tut.hint.textContent = trText(st.hint);
    const parts: string[] = [];
    if (st.id === 'rats') parts.push(t('Rats slain: {count}/{need}', { count: ts.count, need: st.need ?? 3 }));
    if (st.id === 'loot') parts.push(`${ts.flags & 1 ? '✔' : '○'} ${t('pick up loot')}`, `${ts.flags & 2 ? '✔' : '○'} ${t('eat')}`);
    if (st.id === 'depot') parts.push(`${ts.flags & 1 ? '✔' : '○'} ${t('store an item in the depot')}`, `${ts.flags & 2 ? '✔' : '○'} ${t('bank your gold')}`);
    if (st.id === 'cellar') parts.push(`${ts.flags & 1 ? '✔' : '○'} ${t('down into the cellar')}`, `○ ${t('climb out by rope')}`);
    this.tut.todo.textContent = parts.join('   ');
    this.tut.todo.hidden = !parts.length;
    this.tut.skip.hidden = !ts.canSkip;
    if (!this.tut.armed) this.tut.skip.textContent = t('Skip tutorial');
    this.tut.timer = 0;
  }

  /** Points the objective arrow from the player towards the current target (north is up on screen). */
  private updateTutorialArrow(dt: number): void {
    const tut = this.tut;
    if (!tut || this.s.tutorial.state !== 'active') return;
    if (tut.armed > 0) {
      tut.armed -= dt;
      if (tut.armed <= 0) { tut.armed = 0; tut.skip.textContent = t('Skip tutorial'); }
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
      tut.dist.textContent = t(goal.z < p.z ? 'go down' : 'go up');
      return;
    }
    const dx = goal.x - p.x, dy = goal.y - p.y;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d <= 1) {
      tut.arrow.hidden = true;
      tut.dist.textContent = t('here');
      return;
    }
    tut.arrow.style.transform = `rotate(${Math.round(Math.atan2(dy, dx) * 180 / Math.PI)}deg)`;
    tut.dist.textContent = t('{n} tile|{n} tiles', { n: d });
  }

  update(dt: number): void {
    this.updateTutorialArrow(dt);
    this.updateCast();
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
    this.levelEl.textContent = `${trName(VOCATIONS[p.vocation].name)} · ${t('level {n}', { n: p.level })}`;
    this.setBar(this.hp, p.hp / p.maxHp, `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.hp.fill.style.background = hpColor(p.hp / p.maxHp);
    this.setBar(this.mp, p.maxMana ? p.mana / p.maxMana : 0, `${Math.floor(p.mana)} / ${p.maxMana}`);
    const need = expForLevel(p.level + 1) - p.exp;
    this.setBar(this.xp, p.levelProgress(), `${Math.floor(p.levelProgress() * 100)}% · ${t('{n} to go', { n: need })}`);
    const w = s.inventory.weight();
    this.capEl.textContent = `${t('Cap {n} oz', { n: Math.floor(p.capacity - w) })} · ${t('Gold {n}', { n: s.inventory.count('gold') })}${s.bank ? ` (${t('+{n} bank', { n: s.bank })})` : ''}`;
    const buffs: string[] = [];
    if (p.buffs.strongHaste > 0) buffs.push(`⇶ ${t('strong haste')}`);
    else if (p.buffs.haste > 0) buffs.push(`⇶ ${t('haste')}`);
    if (p.buffs.magicShield > 0) buffs.push(`◈ ${t('magic shield')}`);
    if (p.buffs.light > 0 || p.buffs.greatLight > 0 || p.buffs.ultimateLight > 0) buffs.push(`☀ ${t('light')}`);
    if (p.buffs.invisible > 0) buffs.push(`◌ ${t('invisible')}`);
    if (p.buffs.illusion > 0 && p.illusion) buffs.push(`◐ ${t('illusion')}`);
    if (p.buffs.poisoned > 0) buffs.push(`☣ ${t('poisoned')}`);
    if (p.buffs.rooted > 0) buffs.push(`❦ ${t('rooted')}`);
    const mins = (secs: number) => t('{n}m', { n: Math.ceil(secs / 60) });
    if (p.buffs.berserk > 0) buffs.push(`⚔ ${t('fury')} ${mins(p.buffs.berserk)}`);
    if (p.buffs.bullseye > 0) buffs.push(`◎ ${t('hawk eye')} ${mins(p.buffs.bullseye)}`);
    if (p.buffs.mastermind > 0) buffs.push(`✦ ${t('clarity')} ${mins(p.buffs.mastermind)}`);
    if (g.isProtected(p)) buffs.push(`⛨ ${t('protection zone')}`);
    if (p.pzLock > 0) buffs.push(`⚠ ${t('PZ-locked {n}s', { n: Math.ceil(p.pzLock) })}`);
    const prem = g.premiumView(this.ctl.pid);
    if (prem && prem.until > Date.now()) buffs.push(`♛ ${t('premium {n}d', { n: Math.ceil((prem.until - Date.now()) / 86_400_000) })}`);
    else if (prem?.enforced) buffs.push(t('free account'));
    const mySkull = g.skullOf(p);
    if (mySkull === 2) buffs.push(`☠ ${t('red skull')}`);
    else if (mySkull === 1) buffs.push(`☠ ${t('white skull')}`);
    this.pvpBtn.hidden = !g.pvp;
    const pvpLabel = t(p.secure ? 'Secure' : 'Open PvP');
    if (this.pvpBtn.textContent !== pvpLabel) {
      this.pvpBtn.textContent = pvpLabel;
      this.pvpBtn.classList.toggle('pvp-open', !p.secure);
    }
    const bt = buffs.join('  ');
    if (this.buffsEl.textContent !== bt) this.buffsEl.textContent = bt;
    const floorText = p.z === 0 ? t('Ground floor') : p.z > 0 ? t('Floor +{z}', { z: String(p.z) }) : t('Underground {z}', { z: String(p.z) });
    if (this.floorEl.textContent !== floorText) this.floorEl.textContent = floorText;
    const whereEn = g.world.regionAt(p.x, p.y, p.z)?.name;
    const where = whereEn ? trName(whereEn) : whereEn;
    const loc = where ? `${where} · ${floorText}` : floorText;
    if (this.topLoc.textContent !== loc) this.topLoc.textContent = loc;

    this.statsEl.textContent = t('Atk {atk} · Def {def} · Arm {arm} · Speed {speed}', { atk: g.attackValue(s), def: g.defense(s), arm: g.armor(s), speed: Math.round(100 * 0.27 / p.stepTime) });

    const region = g.world.regionAt(p.x, p.y, p.z);
    const rname = region ? region.name : '';
    if (rname !== this.lastRegion) {
      this.lastRegion = rname;
      if (region) {
        this.regionEl.textContent = `${trName(region.name)}${region.level && region.level !== '—' ? ` · ${t('level {n}', { n: region.level })}` : ''}`;
        this.regionEl.classList.remove('show');
        void this.regionEl.offsetWidth;
        this.regionEl.classList.add('show');
      }
    }

    const tg = g.getTarget(p.targetId);
    if (tg && !tg.dead) {
      this.targetEl.classList.add('on');
      const tname = tg instanceof Enemy || !this.ctl.game.getPlayer(tg.id) ? trName(tg.name) : tg.name;
      this.targetName.textContent = tg instanceof Enemy && tg.def.boss ? `♛ ${tname}${tg.def.title ? `, ${trName(tg.def.title)}` : ''}` : tg instanceof Enemy && tg.def.elite ? `★ ${tname}` : tname;
      this.targetFill.style.width = `${(tg.hp / tg.maxHp) * 100}%`;
      this.targetFill.style.background = hpColor(tg.hp / tg.maxHp);
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
    const hover = trText(this.renderer.describeHover());
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
