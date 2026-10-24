import './style.css';
import { LocalController, NetController, type Controller } from './client/Controller';
import { Game } from './game/Game';
import { SaveSystem } from './game/save/SaveSystem';
import { Input } from './input/Input';
import { Renderer } from './render/Renderer';
import { HUD } from './ui/HUD';
import { Sfx } from './audio/Sfx';
import { Music } from './audio/Music';
import { StartScreen } from './ui/StartScreen';
import { SEASON_STAGES } from './game/progression/stages';
import { previewPlazaStyle } from './game/world/spawnPlaza';
import { PetsView } from './render/PetsView';
import { PetsUi } from './ui/petsUi';
import { TradesUi } from './ui/tradesUi';
import { TasksUi } from './ui/tasksUi';
import { EventsUi } from './ui/eventsUi';
import { ExchangeUi } from './ui/exchangeUi';
import { initLang } from './ui/lang';
import { t } from './i18n/i18n';

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app missing');
  // language: remembered choice, else the browser's (EN / PL / PT-BR)
  initLang();
  // `?plaza=N` previews another spawn plaza design (offline comparison only; the server builds the default)
  const plazaQ = new URLSearchParams(location.search).get('plaza');
  if (plazaQ !== null) previewPlazaStyle(Number(plazaQ));
  const saves = new SaveSystem();
  const music = new Music();
  const start = new StartScreen(container, saves);

  let ctl: Controller | null = null;
  while (!ctl) {
    const choice = await start.choose();
    try {
      if (choice.mode === 'online') {
        start.setStatus(t('Connecting to {url}…', { url: choice.url }));
        ctl = await NetController.connect({ url: choice.url, name: choice.name, password: choice.password, token: choice.token, vocation: choice.vocation, appearance: choice.appearance, skipTutorial: choice.skipTutorial });
      } else if (choice.mode === 'continue') {
        const peek = saves.peek();
        ctl = new LocalController(new Game({ stages: SEASON_STAGES }), saves, peek?.name ?? 'Adventurer', 'knight', { load: true });
      } else {
        saves.clear();
        ctl = new LocalController(new Game({ stages: SEASON_STAGES }), saves, choice.name, choice.vocation, { load: false, appearance: choice.appearance, skipTutorial: choice.skipTutorial });
      }
    } catch (err) {
      start.setError(err instanceof Error ? err.message : String(err));
      ctl = null;
    }
  }
  start.close();
  run(container, ctl, music);
}

function run(container: HTMLElement, ctl: Controller, music: Music): void {
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  container.appendChild(viewport);
  const renderer = new Renderer(viewport, ctl);
  const sfx = new Sfx(ctl);
  music.attach(ctl);
  const hud = new HUD(ctl, renderer, container, sfx, music);
  // pets: models that follow their owners, the pet window and the tortoise pouch
  const pets = new PetsView(renderer, ctl);
  const petsUi = new PetsUi(ctl, hud.root);
  const tradesUi = new TradesUi(ctl, hud.root);
  // the Gilded Exchange window (opened by an Exchange clerk in Grand Thornvale)
  const exchangeUi = new ExchangeUi(ctl, hud.root);
  // the task boards and world events: task window, event strip and calendar (ui/tasksUi.ts, ui/eventsUi.ts)
  const tasksUi = new TasksUi(ctl, hud.root);
  const eventsUi = new EventsUi(ctl, hud.root);
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
    // the first animation frame can carry a timestamp from before `last`: never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    ctl.update(dt);
    renderer.update(dt);
    pets.update(dt);
    hud.update(dt);
    petsUi.update(dt);
    tradesUi.update(dt);
    exchangeUi.update(dt);
    tasksUi.update(dt);
    eventsUi.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    if (!ctl.online) ctl.save();
  });
  // handy for debugging from the console
  (window as unknown as { thornvale: unknown }).thornvale = { ctl, renderer, hud, pets, petsUi };
}

void boot();
