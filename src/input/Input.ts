import type { Controller } from '../client/Controller';
import type { Renderer } from '../render/Renderer';
import type { HUD } from '../ui/HUD';

const DIR_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], Numpad8: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1], Numpad2: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], Numpad4: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0], Numpad6: [1, 0],
  KeyQ: [-1, -1], Numpad7: [-1, -1],
  KeyE: [1, -1], Numpad9: [1, -1],
  KeyZ: [-1, 1], Numpad1: [-1, 1],
  KeyC: [1, 1], Numpad3: [1, 1],
};

/** Action bar keys, F1–F12 like the classic client. */
const HOTKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

/**
 * Keyboard and mouse. Movement keys feed the controller's intent; clicks on
 * the 3D view are turned into commands via the renderer's picking.
 */
export class Input {
  private down = new Set<string>();

  constructor(private readonly ctl: Controller, private readonly renderer: Renderer, private readonly hud: HUD) {
    // F1–F12 work everywhere, even while typing in chat, and never reach the browser (F5 would reload)
    window.addEventListener('keydown', (e) => {
      const hk = HOTKEYS.indexOf(e.code);
      if (hk < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.hud.triggerHotbar(hk);
    }, true);
    // second row: Ctrl+1 … Ctrl+0 (Alt+1 … Alt+0 too, for browsers that keep Ctrl+number for tabs)
    window.addEventListener('keydown', (e) => {
      const m = /^Digit(\d)$/.exec(e.code);
      if (!m || e.shiftKey || e.metaKey || !(e.ctrlKey || e.altKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const d = Number(m[1]);
      if (!e.repeat) this.hud.triggerHotbar(12 + (d === 0 ? 9 : d - 1));
    }, true);
    // in full screen, ask the browser to hand Ctrl+number to the game instead of switching tabs
    document.addEventListener('fullscreenchange', () => {
      const kb = (navigator as unknown as { keyboard?: { lock?: (codes?: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
      if (document.fullscreenElement) kb?.lock?.([...Array(10).keys()].map((i) => `Digit${i}`)).catch(() => undefined);
      else kb?.unlock?.();
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.pushHeld();
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pushHeld();
    });
    const canvas = renderer.canvas;
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseleave', () => renderer.setHover(null));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      renderer.cam.zoomBy(e.deltaY);
    }, { passive: false });
  }

  private pushHeld(): void {
    let dx = 0;
    let dy = 0;
    for (const code of this.down) {
      const d = DIR_KEYS[code];
      if (d) {
        dx += d[0];
        dy += d[1];
      }
    }
    this.ctl.setHeld(Math.sign(dx), Math.sign(dy));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.hud.chatFocused) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      this.hud.saveNow();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      // Ctrl + direction turns without walking; Ctrl+R turns clockwise
      const t = DIR_KEYS[e.code];
      if (t) {
        e.preventDefault();
        this.ctl.send({ c: 'turn', dx: t[0], dy: t[1] });
        return;
      }
      if (e.code === 'KeyR') {
        e.preventDefault();
        const p = this.ctl.game.getPlayer(this.ctl.pid);
        if (!p) return;
        const order: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        // facing: 0 = south; find the closest cardinal direction and step clockwise
        const cur = order.findIndex(([dx, dy]) => Math.abs(Math.atan2(Math.sin(p.facing - Math.atan2(dx, dy)), Math.cos(p.facing - Math.atan2(dx, dy)))) < Math.PI / 4);
        const [dx, dy] = order[(Math.max(0, cur) + 1) % 4];
        this.ctl.send({ c: 'turn', dx, dy });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = DIR_KEYS[e.code];
    if (d) {
      e.preventDefault();
      if (!e.repeat) this.ctl.tap(d[0], d[1]);
      this.down.add(e.code);
      this.pushHeld();
      return;
    }
    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        this.hud.focusChat();
        break;
      case 'Tab':
      case 'Space':
        e.preventDefault();
        this.ctl.send({ c: 'targetNext' });
        break;
      case 'Escape':
        if (!this.hud.closeTop()) this.ctl.send({ c: 'clearTarget' });
        break;
      case 'Backquote':
        e.preventDefault();
        this.hud.toggleWin('dev');
        break;
      case 'KeyM':
        e.preventDefault();
        this.hud.toggleWorldMap();
        break;
      case 'KeyH':
        e.preventDefault();
        this.hud.toggleWin('help');
        break;
      default:
        break;
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    if (this.hud.aiming) {
      if (e.button === 2) return this.hud.cancelAim();
      const t = this.renderer.pickTile(e.clientX, e.clientY);
      if (t) this.hud.throwAt(t.x, t.y);
      return;
    }
    const hit = this.renderer.pick(e.clientX, e.clientY);
    if (!hit) return;
    const right = e.button === 2;
    if (e.shiftKey && hit.kind !== 'tile') {
      this.hud.log(`You see ${this.renderer.describeHover() || 'something'}.`, 'info');
      return;
    }
    switch (hit.kind) {
      case 'enemy':
        if (right && e.ctrlKey) this.hud.creatureMenu('enemy', hit.id, e.clientX, e.clientY);
        else this.ctl.send({ c: 'attack', id: hit.id });
        break;
      case 'npc':
        if (right) this.hud.creatureMenu('npc', hit.id, e.clientX, e.clientY);
        else this.ctl.send({ c: 'talk', id: hit.id });
        break;
      case 'player':
        if (right) this.hud.creatureMenu('player', hit.id, e.clientX, e.clientY);
        else this.hud.clickPlayer(hit.id, e.clientX, e.clientY);
        break;
      case 'bag': {
        const id = hit.id;
        // a dead body opens its loot window; you walk up to it
        if (this.ctl.game.bags.find((x) => x.id === id)?.corpse) {
          this.hud.openCorpse(id);
          this.ctl.send({ c: 'pickup', id, take: -2 });
          break;
        }
        if (right) this.ctl.send({ c: 'pickup', id });
        else this.hud.startDrag({ kind: 'bag', id }, e, () => this.ctl.send({ c: 'pickup', id }));
        break;
      }
      case 'tile':
        if (hit.usable) {
          this.ctl.send({ c: 'useTile', x: hit.x, y: hit.y });
          this.renderer.showClickMarker(hit.x, hit.y);
        } else if (!right) {
          this.ctl.send({ c: 'moveTo', x: hit.x, y: hit.y });
          this.renderer.showClickMarker(hit.x, hit.y);
        }
        break;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const hit = this.renderer.pick(e.clientX, e.clientY);
    this.renderer.setHover(hit);
    const c = this.renderer.canvas;
    const cursor = this.hud.aiming ? 'crosshair' : !hit ? 'default'
      : hit.kind === 'enemy' ? 'crosshair'
      : hit.kind === 'tile' ? (hit.usable ? 'pointer' : 'default')
      : 'pointer';
    if (c.style.cursor !== cursor) c.style.cursor = cursor;
  }
}
