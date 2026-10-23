import {
  BEARDS, BODY_TYPES, BUILDS, CLOTH_COLORS, DEFAULT_APPEARANCE, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, randomAppearance,
  sanitizeAppearance, SCARS, SKIN_TONES, type Appearance,
} from '../game/player/appearance';
import type { GearLook } from '../render/models/humanoid';
import { CharacterPreview } from './CharacterPreview';
import './designer.css';
import { button, el } from './dom';
import { onLangChange, t } from '../i18n/i18n';
import { trName } from '../i18n/gameText';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The character designer: a turning 3D preview and one row per option (body type, build,
 * skin, hair style and colour, facial hair, scar, eyes, shirt and trousers), with ◀ ▶ arrows or
 * swatches and a Random button. Used by the hero creator on the title screen (online and
 * offline) and by the in-game Appearance window; the host adds its own Confirm button.
 */
export class CharacterDesigner {
  readonly root: HTMLDivElement;
  private a: Appearance;
  private preview: CharacterPreview;
  private form: HTMLDivElement;
  private offLang: () => void;

  constructor(parent: HTMLElement, initial: Appearance = DEFAULT_APPEARANCE, private readonly onChange?: (a: Appearance) => void) {
    this.a = sanitizeAppearance(initial);
    this.root = el('div', 'cd', parent);
    const stage = el('div', 'cd-stage', this.root);
    this.preview = new CharacterPreview(stage);
    const turn = el('div', 'cd-turn', stage);
    button(turn, '⟲', () => this.preview.turn(-0.6), 'cd-arrow').setAttribute('aria-label', t('Turn left'));
    const rnd = button(turn, t('Random'), () => this.update(randomAppearance()), 'cd-random');
    button(turn, '⟳', () => this.preview.turn(0.6), 'cd-arrow').setAttribute('aria-label', t('Turn right'));
    this.form = el('div', 'cd-form', this.root);
    this.render();
    this.offLang = onLangChange(() => { rnd.textContent = t('Random'); this.render(); });
    this.preview.set(this.a);
  }

  get value(): Appearance {
    return { ...this.a };
  }

  set(a: Appearance): void {
    this.update(a);
  }

  /** Worn gear on the preview (in-game window), null = plain clothes. */
  setGear(g: GearLook | null): void {
    this.preview.setGear(g);
  }

  dispose(): void {
    this.offLang();
    this.preview.dispose();
    this.root.remove();
  }

  private update(a: Appearance): void {
    this.a = sanitizeAppearance(a);
    this.preview.set(this.a);
    this.render();
    this.onChange?.(this.value);
  }

  private patch(p: Partial<Appearance>): void {
    const next = { ...this.a, ...p };
    if (next.body === 'female') next.beard = 'none';
    this.update(next);
  }

  private render(): void {
    const f = this.form;
    f.replaceChildren();
    const a = this.a;

    // body type: two toggles
    const body = this.row('Body');
    const tg = el('div', 'cd-toggle', body);
    for (const b of BODY_TYPES) {
      const bb = button(tg, trName(b.name), () => this.patch({ body: b.id }), `cd-opt${a.body === b.id ? ' on' : ''}`);
      bb.setAttribute('aria-pressed', String(a.body === b.id));
    }

    this.stepper('Build', BUILDS, a.build, (id) => this.patch({ build: id }));
    this.swatches('Skin', SKIN_TONES.map((c, i) => ({ name: t('Skin tone {n}', { n: i + 1 }), hex: c, raw: true })), a.skin, (i) => this.patch({ skin: i }));
    this.stepper('Hair', HAIR_STYLES, a.hair, (id) => this.patch({ hair: id }));
    this.swatches('Hair colour', HAIR_COLORS, a.hairColor, (i) => this.patch({ hairColor: i }));
    if (a.body === 'male') this.stepper('Facial hair', BEARDS, a.beard, (id) => this.patch({ beard: id }));
    this.stepper('Scar', SCARS, a.scar, (id) => this.patch({ scar: id }));
    this.swatches('Eyes', EYE_COLORS, a.eyes, (i) => this.patch({ eyes: i }));
    this.swatches('Shirt', CLOTH_COLORS, a.top, (i) => this.patch({ top: i }));
    this.swatches('Trousers', CLOTH_COLORS, a.bottom, (i) => this.patch({ bottom: i }));
    el('p', 'cd-hint', f, t('Worn armour shows over your clothes. Helmets cover the hair beneath them.'));
  }

  private row(label: string): HTMLDivElement {
    const r = el('div', 'cd-row', this.form);
    el('span', 'cd-label', r, t(label));
    return r;
  }

  private stepper<T extends string>(label: string, list: Array<{ id: T; name: string }>, cur: T, set: (id: T) => void): void {
    const r = this.row(label);
    const s = el('div', 'cd-step', r);
    const i = Math.max(0, list.findIndex((x) => x.id === cur));
    const go = (d: number) => set(list[(i + d + list.length) % list.length].id);
    button(s, '◀', () => go(-1), 'cd-arrow').setAttribute('aria-label', t('Previous: {what}', { what: t(label) }));
    el('span', 'cd-value', s, trName(list[i].name));
    button(s, '▶', () => go(1), 'cd-arrow').setAttribute('aria-label', t('Next: {what}', { what: t(label) }));
  }

  private swatches(label: string, list: Array<{ name: string; hex: number; raw?: boolean }>, cur: number, set: (i: number) => void): void {
    const r = this.row(label);
    const s = el('div', 'cd-swatches', r);
    list.forEach((c, i) => {
      const b = button(s, '', () => set(i), `cd-sw${i === cur ? ' on' : ''}`);
      b.style.background = hex(c.hex);
      const nm = c.raw ? c.name : c.name === 'Moss' ? t('Moss green') : trName(c.name);
      b.title = nm;
      b.setAttribute('aria-label', `${t(label)}: ${nm}`);
      b.setAttribute('aria-pressed', String(i === cur));
    });
  }
}
