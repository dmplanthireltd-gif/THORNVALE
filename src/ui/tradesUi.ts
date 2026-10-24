import type { Controller } from '../client/Controller';
import { STAMINA_MAX } from '../game/trades/agility';
import { getLang, t } from '../i18n/i18n';
import { button, el } from './dom';
import './trades.css';

/**
 * The trade skills on the HUD, kept small and self-contained (the HUD layout is
 * someone else's): a stamina line under the character's bars with the Run
 * switch. Mounted like the pet line (ui/petsUi.ts) into the status panel, and
 * mounted again if the HUD rebuilds that panel. Every change is a command.
 */
export class TradesUi {
  private strip: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private key = '';
  private timer = 0;

  constructor(private readonly ctl: Controller, private readonly hudRoot: HTMLElement) {}

  update(dt: number): void {
    this.timer -= Math.max(0, dt);
    if (this.timer > 0) return;
    this.timer = 0.15;
    const s = this.ctl.game.session(this.ctl.pid);
    if (!s) return;
    if (!this.strip || !this.strip.isConnected) this.mount();
    if (!this.strip || !this.fill || !this.text || !this.runBtn) return;
    const st = Math.max(0, Math.floor(s.trades.stamina));
    const key = `${getLang()}|${st}|${s.trades.run ? 1 : 0}`;
    if (key === this.key) return;
    this.key = key;
    this.fill.style.width = `${Math.round((st / STAMINA_MAX) * 100)}%`;
    this.text.textContent = `${st}/${STAMINA_MAX}`;
    this.runBtn.textContent = s.trades.run ? t('Running') : t('Walking');
    this.runBtn.classList.toggle('on', s.trades.run);
    this.runBtn.title = s.trades.run ? t('You run: every step is quicker and uses stamina. Click to walk.') : t('You walk. Click to run: quicker steps that use stamina. Agility makes it last longer.');
    this.strip.title = t('Stamina: used by running, comes back while you walk or rest. A higher agility level gives more and faster stamina.');
  }

  private mount(): void {
    const status = this.hudRoot.querySelector('.panel.status .status-foot') ?? this.hudRoot.querySelector('.panel.status');
    if (!status) return;
    this.strip = el('div', 'stamina-strip', status as HTMLElement);
    const bar = el('div', 'bar stamina-bar', this.strip);
    this.fill = el('div', 'bar-fill', bar);
    this.text = el('div', 'bar-text', bar);
    this.runBtn = button(this.strip, t('Walking'), () => {
      const s = this.ctl.game.session(this.ctl.pid);
      if (s) this.ctl.send({ c: 'run', on: !s.trades.run });
    }, 'btn small run-btn');
    this.key = '';
  }
}
