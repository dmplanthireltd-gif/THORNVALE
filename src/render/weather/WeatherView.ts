import * as THREE from 'three';
import type { Game } from '../../game/Game';
import type { Player } from '../../game/player/Player';
import { Climate, kindAmount, sandVisibility, WeatherKind, type WeatherState } from '../../game/world/weather';
import { Ground, Obj } from '../../game/world/WorldMap';
import { CAMERA_TILT_DEG } from '../CameraController';
import { WeatherHaze } from './haze';
import { LAYER_CAP, LAYER_LEAF, LAYER_MIST, LAYER_RAIN, LAYER_SAND, LAYER_SNOW, LAYER_SPLASH, WeatherParticles } from './particles';
import { setWind } from './wind';

/** Settings → Weather effects. Low halves the particles; Off keeps only what is gameplay (sandstorm visibility). */
export type WeatherQuality = 'high' | 'low' | 'off';
export const WEATHER_QUALITY_KEY = 'thornvale.weatherFx';

export function storedWeatherQuality(): WeatherQuality {
  try {
    const v = localStorage.getItem(WEATHER_QUALITY_KEY);
    return v === 'low' || v === 'off' ? v : 'high';
  } catch {
    return 'high';
  }
}

/** Light the renderer should use this frame (multipliers on its normal values). */
export interface WeatherLight {
  hemi: number;
  sun: number;
  /** 0–1: how far the sky colour goes to storm grey. */
  overcast: number;
  /** 0–1: lightning right now. */
  flash: number;
}

const TILT = THREE.MathUtils.degToRad(CAMERA_TILT_DEG);
/** How dark each kind makes the day at full strength. */
const COVER: Record<WeatherKind, number> = {
  [WeatherKind.Clear]: 0, [WeatherKind.Cloudy]: 0.22, [WeatherKind.Rain]: 0.42, [WeatherKind.Storm]: 0.66,
  [WeatherKind.Snow]: 0.24, [WeatherKind.Blizzard]: 0.45, [WeatherKind.Dust]: 0.08, [WeatherKind.Sandstorm]: 0.32,
  [WeatherKind.Mist]: 0.16, [WeatherKind.Downpour]: 0.52,
};

/** Eases a value toward its target with time constant `tau` seconds. */
let settling = false;
const ease = (v: number, target: number, dt: number, tau: number) => (settling ? target : v + (target - v) * (1 - Math.exp(-dt / tau)));

/**
 * Turns the server's weather for the player's zone into what you see: rain,
 * snow, sand, mist and leaves (WeatherParticles), the haze, wind for the
 * vegetation, darker light under storm clouds and lightning flashes. Values
 * ease in over several seconds, so a zone border or a new spell never pops.
 * Nothing falls underground or while you stand under a roof.
 */
export class WeatherView {
  readonly particles = new WeatherParticles();
  readonly haze = new WeatherHaze();
  quality: WeatherQuality = storedWeatherQuality();
  private t = 0;
  // eased amounts
  private rain = 0;
  private storm = 0;
  private snow = 0;
  private blizzard = 0;
  private sand = 0;
  private mist = 0;
  private leaves = 0;
  private cover = 0;
  private wind = 0.2;
  private dirX = 1;
  private dirZ = 0;
  private hazeR = 40;
  private hazeMax = 0;
  private flashT = 99;
  private flashPow = 0;
  private lastFlash = -1;
  private lastZone = -1;
  private sampleT = 0;
  private forest = 0;
  private desert = 0;
  private reduced = false;
  private settleNext = false;
  private readonly light: WeatherLight = { hemi: 1, sun: 1, overcast: 0, flash: 0 };
  private readonly hazeCol = new THREE.Color();
  private readonly tmpCol = new THREE.Color();

  constructor(scene: THREE.Scene) {
    scene.add(this.particles.mesh, this.haze.mesh);
    try { this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* old browser */ }
  }

  /** Jump straight to the current weather on the next frame (no easing): screenshots, the dev console. */
  settle(): void {
    this.settleNext = true;
  }

  setQuality(q: WeatherQuality): void {
    this.quality = q;
    try { localStorage.setItem(WEATHER_QUALITY_KEY, q); } catch { /* storage off */ }
  }

  /** Every frame. Returns the light multipliers for this frame. */
  update(dt: number, game: Game, me: Player, cam: THREE.OrthographicCamera, groundY: number, focusX: number, focusZ: number): WeatherLight {
    // the first frame after a long load can arrive with a negative step: never ease backwards
    dt = Math.max(0, Math.min(dt, 0.25));
    settling = this.settleNext;
    this.settleNext = false;
    this.t += dt;
    const w = game.weatherView(me.id);
    const under = me.z < 0;
    const roof = !under && !!game.world.houseAt(me.x, me.y, me.z);
    const on = this.quality !== 'off';
    const scale = this.quality === 'low' ? 0.5 : 1;

    // surroundings, twice a second: trees for blowing leaves, sand for drifting dust
    this.sampleT -= dt;
    if (this.sampleT <= 0) {
      this.sampleT = 0.5;
      this.sample(game, me);
    }

    const k = (kind: WeatherKind) => kindAmount(w, kind);
    const sky = under ? 0 : 1;
    const open = under || roof ? 0 : 1;
    const rainT = Math.min(1.3, k(WeatherKind.Rain) + k(WeatherKind.Storm) + k(WeatherKind.Downpour) * 1.3) * open;
    const stormT = (k(WeatherKind.Storm) + k(WeatherKind.Downpour) * 0.5) * sky;
    const snowT = Math.min(1.4, k(WeatherKind.Snow) + k(WeatherKind.Blizzard) * 1.4) * open;
    const blizT = k(WeatherKind.Blizzard) * sky;
    const windT = w.wind;
    const sandT = Math.min(1.2, k(WeatherKind.Sandstorm) * 1.2 + k(WeatherKind.Dust) * 0.45 + this.desert * windT * 0.3) * open;
    const mistT = Math.min(1, k(WeatherKind.Mist) + k(WeatherKind.Downpour) * 0.35 + k(WeatherKind.Blizzard) * 0.5 + k(WeatherKind.Sandstorm) * 0.6) * open;
    let coverT = 0;
    coverT += COVER[w.kind] * (w.kind === WeatherKind.Clear ? 0 : w.amount);
    coverT += COVER[w.prev] * w.prevAmount;
    coverT = Math.min(0.72, coverT) * sky;
    const leafT = open * this.forest * THREE.MathUtils.smoothstep(windT, 0.3, 0.9) * (w.climate === Climate.Frost || w.climate === Climate.Desert ? 0 : 1);

    // a new zone or a fresh login eases in a little faster
    const tau = w.zone !== this.lastZone && this.lastZone !== -1 ? 3 : 4;
    this.lastZone = w.zone;
    const fast = under || roof ? 0.6 : tau;
    this.rain = ease(this.rain, rainT, dt, fast);
    this.storm = ease(this.storm, stormT, dt, tau);
    this.snow = ease(this.snow, snowT, dt, fast);
    this.blizzard = ease(this.blizzard, blizT, dt, tau);
    this.sand = ease(this.sand, sandT, dt, fast);
    this.mist = ease(this.mist, mistT, dt, fast);
    this.leaves = ease(this.leaves, leafT, dt, tau);
    this.cover = ease(this.cover, coverT, dt, under ? 0.4 : 5);
    this.wind = ease(this.wind, under ? 0 : windT, dt, 3);
    this.dirX = ease(this.dirX, Math.cos(w.dir), dt, 6);
    this.dirZ = ease(this.dirZ, Math.sin(w.dir), dt, 6);

    // lightning: a new flash id from the server (never the one already there when we arrived)
    if (w.flash !== this.lastFlash) {
      if (this.lastFlash !== -1 && w.flash > 0 && !under && on) {
        this.flashT = 0;
        this.flashPow = this.reduced ? 0.45 : 1;
      }
      this.lastFlash = w.flash;
    }
    this.flashT += dt;
    const flash = this.flashEnvelope(this.flashT) * this.flashPow;

    // wind for the vegetation (also with effects off? no: off = everything still)
    const wl = Math.hypot(this.dirX, this.dirZ) || 1;
    setWind(this.t % 3600, this.wind, this.dirX / wl, this.dirZ / wl, on);

    // particles
    const p = this.particles;
    const u = p.uniforms;
    u.uTime.value = this.t % 1800;
    u.uCenter.value.set(focusX, groundY, focusZ + 4);
    u.uWind.value.set((this.dirX / wl) * this.wind, (this.dirZ / wl) * this.wind);
    u.uGale.value = this.blizzard;
    u.uCamDir.value.set(0, -Math.cos(TILT), -Math.sin(TILT));
    u.uCamUp.value.set(0, Math.sin(TILT), -Math.cos(TILT));
    u.uLight.value = (1 - this.cover * 0.55) + flash * 0.8;
    const lay = (layer: number, amount: number, alpha: number) => p.setLayer(layer, on ? LAYER_CAP[layer] * scale * Math.min(1, amount) : 0, alpha);
    lay(LAYER_RAIN, this.rain, 0.9);
    lay(LAYER_SPLASH, this.rain * (roof ? 0 : 1), 0.8);
    lay(LAYER_SNOW, this.snow, 0.95);
    lay(LAYER_SAND, this.sand, 0.9);
    lay(LAYER_MIST, this.mist, 1);
    lay(LAYER_LEAF, this.leaves, 1);
    // mist puffs take the colour of what is blowing
    const sandK = Math.min(1, k(WeatherKind.Sandstorm) * 2);
    const blizK = Math.min(1, k(WeatherKind.Blizzard) * 2);
    u.uMistColor.value.setHex(0xd8e2d8).lerp(this.tmpCol.setHex(0xc9a466), sandK).lerp(this.tmpCol.setHex(0xeef3fa), blizK * (1 - sandK));
    p.mesh.visible = p.anyActive;

    // haze: sand closes in the view (kept with effects off — it is gameplay), blizzards and mist veil it
    const sv = sandVisibility(w);
    const sandOn = open > 0 && sv.max > 0;
    this.hazeR = ease(this.hazeR, sandOn ? sv.clear : 40, dt, 2.5);
    this.hazeMax = ease(this.hazeMax, sandOn ? sv.max : 0, dt, 2.5);
    const blizVeil = on ? this.blizzard * open * 0.5 : 0;
    const mistVeil = on ? Math.min(1, k(WeatherKind.Mist)) * open * 0.28 : 0;
    const rainVeil = on ? this.storm * open * 0.1 : 0;
    const h = this.haze.u;
    const sandW = this.hazeMax, other = blizVeil + mistVeil + rainVeil;
    const total = sandW + other;
    if (total > 0.004) {
      this.hazeCol.setHex(0xc39a5a).multiplyScalar(sandW);
      this.hazeCol.add(this.tmpCol.setHex(0xe4ecf4).multiplyScalar(blizVeil));
      this.hazeCol.add(this.tmpCol.setHex(0xb9c9bd).multiplyScalar(mistVeil));
      this.hazeCol.add(this.tmpCol.setHex(0x6a7480).multiplyScalar(rainVeil));
      h.uColor.value.copy(this.hazeCol).multiplyScalar(1 / total).multiplyScalar(1 - this.cover * 0.45 + flash * 0.4);
      h.uBase.value = sandW * 0.18 + blizVeil * 0.35 + mistVeil * 0.4 + rainVeil;
      h.uMax.value = Math.max(h.uBase.value, sandW + blizVeil * 0.9 + mistVeil * 0.8 + rainVeil);
      const r0 = sandW > 0.02 ? this.hazeR : 9;
      h.uR0.value = r0;
      h.uR1.value = r0 + 4;
      const zoom = cam.zoom || 1;
      h.uHalf.value.set((cam.right - cam.left) / (2 * zoom), (cam.top - cam.bottom) / (2 * zoom) / Math.cos(TILT));
      h.uWind.value.set(this.dirX, this.dirZ);
      h.uTime.value = this.t % 1000;
      h.uStreak.value = on ? Math.min(0.7, sandW * 0.9 + blizVeil * 0.8) : 0;
      this.haze.mesh.visible = true;
    } else {
      this.haze.mesh.visible = false;
    }

    // light
    const c = on ? this.cover : 0;
    this.light.hemi = 1 - c * 0.6 + flash * 2.2;
    this.light.sun = 1 - c * 0.9 + flash * 1.2;
    this.light.overcast = c / 0.7;
    this.light.flash = flash;
    return this.light;
  }

  /** The bright double flicker of a lightning flash, then a quick fade. */
  private flashEnvelope(t: number): number {
    if (t < 0.05) return t / 0.05;
    if (t < 0.11) return 1 - ((t - 0.05) / 0.06) * 0.75;
    if (t < 0.16) return 0.25 + ((t - 0.11) / 0.05) * 0.6;
    if (t < 0.7) return 0.85 * (1 - (t - 0.16) / 0.54);
    return 0;
  }

  private sample(game: Game, me: Player): void {
    const wd = game.world;
    let trees = 0, sand = 0, n = 0;
    for (let dy = -7; dy <= 7; dy += 1) for (let dx = -7; dx <= 7; dx += 1) {
      const x = me.x + dx, y = me.y + dy;
      const o = wd.getObj(x, y, me.z);
      if (o === Obj.Tree || o === Obj.Pine || o === Obj.JungleTree || o === Obj.Palm) trees++;
      if (wd.getGround(x, y, me.z) === Ground.Sand) sand++;
      n++;
    }
    this.forest = Math.min(1, (trees / n) * 4);
    this.desert = sand / n;
  }

  /** For screenshots and the console: the weather the view is easing towards right now. */
  debugState(game: Game, me: Player): WeatherState {
    return game.weatherView(me.id);
  }
}
