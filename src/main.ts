import './style.css';
import { LocalController, NetController, type Controller } from './client/Controller';
import { Game } from './game/Game';
import { SaveSystem } from './game/save/SaveSystem';
import { Input } from './input/Input';
import { Renderer } from './render/Renderer';
import { HUD } from './ui/HUD';
import { Sfx } from './audio/Sfx';
import { StartScreen } from './ui/StartScreen';

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app missing');
  const saves = new SaveSystem();
  const start = new StartScreen(container, saves);

  let ctl: Controller | null = null;
  while (!ctl) {
    const choice = await start.choose();
    try {
      if (choice.mode === 'online') {
        start.setStatus(`Connecting to ${choice.url}…`);
        ctl = await NetController.connect({ url: choice.url, name: choice.name, vocation: choice.vocation, outfit: choice.outfit });
      } else if (choice.mode === 'continue') {
        const peek = saves.peek();
        ctl = new LocalController(new Game(), saves, peek?.name ?? 'Adventurer', 'knight', { load: true });
      } else {
        saves.clear();
        ctl = new LocalController(new Game(), saves, choice.name, choice.vocation, { load: false, outfit: choice.outfit });
      }
    } catch (err) {
      start.setError(err instanceof Error ? err.message : String(err));
      ctl = null;
    }
  }
  start.close();
  run(container, ctl);
}

function run(container: HTMLElement, ctl: Controller): void {
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  container.appendChild(viewport);
  const renderer = new Renderer(viewport, ctl);
  const sfx = new Sfx(ctl);
  const hud = new HUD(ctl, renderer, container, sfx);
  new Input(ctl, renderer, hud);
  hud.applyStoredPixelSetting();
  const first = (() => {
    try {
      return !globalThis.localStorage?.getItem('thornvale.seenHelp');
    } catch {
      return false;
    }
  })();
  if (first) {
    hud.toggleWin('help', true);
    try {
      globalThis.localStorage?.setItem('thornvale.seenHelp', '1');
    } catch {
      /* ignore */
    }
  }

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ctl.update(dt);
    renderer.update(dt);
    hud.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    if (!ctl.online) ctl.save();
  });
  // handy for debugging from the console
  (window as unknown as { thornvale: unknown }).thornvale = { ctl, renderer, hud };
}

void boot();
