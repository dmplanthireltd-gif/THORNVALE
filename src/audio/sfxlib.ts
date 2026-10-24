import type { Kit } from './foley';

/**
 * Every one-shot sound effect in the game, built from the small synth kit in foley.ts (no sound
 * files). Each recipe layers a few voices: a body (tone), a texture (filtered noise) and, where
 * it helps, a ring (metal partials) so hits, coins, doors and spells sound like their material.
 */

export type SoundName =
  // combat
  | 'hit' | 'hitHard' | 'miss' | 'block' | 'blockWood'
  | 'swing' | 'swingBlade' | 'swingHeavy' | 'swingBlunt' | 'swingFist' | 'swingMagic'
  | 'bow' | 'crossbow' | 'throw'
  // magic
  | 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy' | 'explosion'
  | 'boom' | 'thunder' | 'shatter' | 'implode' | 'roar' | 'quake' | 'healBig'
  | 'heal' | 'mana' | 'buff' | 'shield' | 'spellCast' | 'teleport' | 'respawn'
  | 'teleportOut' | 'teleportIn' | 'teleportFizzle'
  // progress
  | 'levelUp' | 'skillUp' | 'quest' | 'die' | 'monsterDie'
  // items
  | 'coins' | 'pickup' | 'pickupMetal' | 'pickupGlass' | 'pickupGem' | 'pickupCloth'
  | 'drink' | 'eat' | 'drop' | 'itemMove' | 'equipMetal' | 'equipLeather' | 'unequip'
  // world
  | 'door' | 'chest' | 'dig' | 'chop' | 'treeFall' | 'cast' | 'splash'
  | 'mineHit' | 'mineOre' | 'rockBreak' | 'anvil' | 'furnace' | 'crafted'
  // interface
  | 'click' | 'uiOpen' | 'error' | 'chat';

type Recipe = (k: Kit) => void;

/** Inharmonic partials of something metal ringing. */
function ring(k: Kit, freqs: number[], at: number, dur: number, peak: number): void {
  freqs.forEach((f, i) => k.tone('sine', f, f * 0.998, at, dur * (1 - i * 0.1), peak / (1 + i * 0.6), 0.001));
}

/** A plucked string: a saw through a closing low-pass. */
function twang(k: Kit, f: number, at: number, dur: number, peak: number, bright = 20): void {
  k.ftone('sawtooth', f, f * 0.996, 'lowpass', f * bright, f * 1.4, at, dur, peak, 2, 0.002);
}

/** A brass-like note: a saw through a low-pass that opens and settles. */
function horn(k: Kit, f: number, at: number, dur: number, peak: number): void {
  k.ftone('sawtooth', f * 0.985, f, 'lowpass', f * 2, f * 5, at, dur, peak, 1.2, 0.03);
}

/** A struck bell: fundamental plus its bright partial. */
function bell(k: Kit, f: number, at: number, dur: number, peak: number): void {
  k.tone('sine', f, f, at, dur, peak, 0.002);
  k.tone('sine', f * 2.76, f * 2.76, at, dur * 0.4, peak * 0.35, 0.002);
  k.tone('sine', f * 5.4, f * 5.4, at, dur * 0.15, peak * 0.15, 0.002);
}

export const SOUNDS: Record<SoundName, Recipe> = {
  // ---------------------------------------------------------------- combat
  hit: (k) => {
    k.noise('bandpass', 1300, 300, k.t, 0.08, 0.5, 1.2);
    k.tone('sine', 150, 60, k.t, 0.1, 0.45);
    k.noise('lowpass', 500, 150, k.t, 0.12, 0.3);
  },
  hitHard: (k) => {
    k.noise('lowpass', 2200, 150, k.t, 0.22, 0.8, 0.8);
    k.tone('sine', 105, 38, k.t, 0.26, 0.7);
    k.noise('bandpass', 1900, 900, k.t, 0.05, 0.35, 2);
  },
  miss: (k) => k.noise('bandpass', 1900, 700, k.t, 0.16, 0.26, 3, 0.03),
  block: (k) => {
    ring(k, [520 * k.r(0.95, 1.05), 1310, 2210, 3380, 4650], k.t, 0.55, 0.2);
    k.noise('bandpass', 3200, 2000, k.t, 0.03, 0.35, 1.5);
  },
  blockWood: (k) => {
    k.noise('bandpass', 700, 300, k.t, 0.1, 0.6, 2);
    k.tone('triangle', 240, 150, k.t, 0.1, 0.35);
  },
  swing: (k) => k.noise('bandpass', 500, 1500, k.t, 0.18, 0.3, 2.5, 0.05),
  swingBlade: (k) => {
    k.noise('bandpass', 1300, 4200, k.t, 0.16, 0.3, 4, 0.05);
    k.noise('highpass', 6000, 8000, k.t + 0.06, 0.06, 0.08);
  },
  swingHeavy: (k) => k.noise('bandpass', 380, 1300, k.t, 0.24, 0.4, 3, 0.08),
  swingBlunt: (k) => k.noise('bandpass', 300, 900, k.t, 0.2, 0.35, 2, 0.06),
  swingFist: (k) => k.noise('bandpass', 900, 2200, k.t, 0.09, 0.22, 2, 0.02),
  swingMagic: (k) => {
    k.tone('sine', 500, 1400, k.t, 0.2, 0.12, 0.03);
    k.noise('bandpass', 2500, 6000, k.t, 0.22, 0.12, 6, 0.04);
  },
  bow: (k) => {
    k.tone('triangle', 900, 250, k.t, 0.03, 0.2); // string slap
    twang(k, 98, k.t, 0.35, 0.3, 25);
    k.noise('highpass', 3000, 7000, k.t + 0.03, 0.16, 0.12, 1, 0.02); // arrow away
  },
  crossbow: (k) => {
    k.noise('bandpass', 2600, 1500, k.t, 0.035, 0.5, 2); // trigger clack
    twang(k, 140, k.t + 0.01, 0.22, 0.28, 18);
    k.noise('highpass', 3500, 7000, k.t + 0.03, 0.12, 0.12);
  },
  throw: (k) => {
    k.noise('bandpass', 700, 2400, k.t, 0.13, 0.5, 2, 0.04);
    k.noise('bandpass', 900, 2600, k.t + 0.12, 0.12, 0.35, 2, 0.03); // spinning
  },

  // ---------------------------------------------------------------- magic
  fire: (k) => {
    k.noise('lowpass', 600, 3200, k.t, 0.35, 0.55, 1, 0.03);
    k.noise('bandpass', 260, 110, k.t + 0.05, 0.45, 0.4);
    for (let i = 0; i < 5; i++) k.noise('highpass', 3500, 3500, k.t + k.r(0.05, 0.4), 0.025, 0.15);
  },
  energy: (k) => {
    k.pulse(0.1, 120, 600, k.t, 0.25, 0.1, 50);
    for (let i = 0; i < 5; i++) k.tone('sawtooth', k.r(1200, 3000), k.r(200, 600), k.t + i * 0.035, 0.06, 0.11);
    k.noise('highpass', 4500, 2500, k.t, 0.25, 0.22);
    k.tone('sine', 60, 60, k.t, 0.3, 0.15);
  },
  ice: (k) => {
    [2349, 2637, 3136, 3520, 4186].forEach((f, i) => k.tone('sine', f, f * 1.002, k.t + i * 0.035, 0.3, 0.09));
    k.noise('highpass', 6000, 3000, k.t, 0.3, 0.16);
    k.tone('triangle', 1400, 400, k.t, 0.07, 0.15); // crack
  },
  earth: (k) => {
    k.tone('sine', 75, 38, k.t, 0.45, 0.55, 0.02);
    k.noise('lowpass', 450, 90, k.t, 0.45, 0.7);
    for (let i = 0; i < 4; i++) k.noise('bandpass', k.r(600, 1300), 400, k.t + k.r(0.05, 0.35), 0.05, 0.25, 2);
  },
  death: (k) => {
    k.tone('sawtooth', 220, 55, k.t, 0.5, 0.18, 0.02);
    k.tone('sawtooth', 233, 58, k.t, 0.5, 0.16, 0.02);
    k.noise('bandpass', 600, 280, k.t, 0.5, 0.3, 8, 0.06); // a hiss of a whisper
    k.tone('sine', 50, 40, k.t, 0.5, 0.25);
  },
  holy: (k) => {
    [880, 1109, 1319, 1760].forEach((f, i) => k.tone('sine', f, f * 1.004, k.t + i * 0.04, 0.5, 0.12, 0.02));
    k.noise('highpass', 7500, 9000, k.t, 0.45, 0.08, 0.7, 0.05);
  },
  explosion: (k) => {
    k.noise('lowpass', 3200, 90, k.t, 0.75, 0.95, 0.7);
    k.tone('sine', 85, 28, k.t, 0.65, 0.8);
    for (let i = 0; i < 6; i++) k.noise('bandpass', k.r(900, 2500), 600, k.t + k.r(0.1, 0.6), 0.05, 0.2, 2); // debris
  },
  // the great area spells (ultimate explosions): as loud and deep as it gets
  boom: (k) => {
    // a heavy, deep blast: sub-bass drop, a crack on top, a long rumble tail
    k.tone('sine', 120, 28, k.t, 0.9, 1.0, 0.004);
    k.tone('triangle', 70, 30, k.t, 0.7, 0.6, 0.004);
    k.noise('lowpass', 4000, 300, k.t, 0.25, 1.0, 0.7, 0.002);
    k.noise('lowpass', 600, 60, k.t + 0.05, 1.4, 0.8, 0.8, 0.02);
  },
  roar: (k) => {
    // a rushing firestorm
    k.noise('lowpass', 500, 2600, k.t, 0.5, 0.8, 0.8, 0.04);
    k.noise('bandpass', 240, 90, k.t + 0.1, 1.2, 0.7, 0.9, 0.05);
    for (let i = 0; i < 6; i++) k.noise('highpass', 2500, 1800, k.t + 0.15 + i * k.r(0.07, 0.15), 0.04, 0.25, 1);
  },
  thunder: (k) => {
    // a sharp crack followed by rolling thunder
    k.noise('highpass', 6000, 1500, k.t, 0.08, 1.0, 0.7, 0.001);
    for (let i = 0; i < 6; i++) k.tone('sawtooth', k.r(1200, 3000), k.r(150, 400), k.t + i * 0.03, 0.06, 0.18);
    k.noise('lowpass', 900, 70, k.t + 0.06, 1.3, 0.9, 0.8, 0.03);
    k.tone('sine', 80, 32, k.t + 0.05, 0.9, 0.6, 0.01);
  },
  shatter: (k) => {
    // ice bursting: glassy breaks over a cold boom
    for (let i = 0; i < 9; i++) k.tone('triangle', k.r(2200, 5200), k.r(1500, 3500), k.t + i * k.r(0.015, 0.05), 0.12, 0.18);
    k.noise('highpass', 7000, 3000, k.t, 0.4, 0.4, 1);
    k.noise('bandpass', 900, 300, k.t + 0.05, 0.9, 0.5, 0.7, 0.05);
  },
  quake: (k) => {
    // the ground erupts
    k.noise('lowpass', 350, 50, k.t, 1.4, 1.0, 1, 0.03);
    for (let i = 0; i < 7; i++) k.noise('lowpass', k.r(700, 1400), 150, k.t + i * k.r(0.06, 0.14), 0.12, 0.6, 1);
    k.tone('sine', 60, 25, k.t, 1.1, 0.8, 0.02);
  },
  implode: (k) => {
    // the air sucked in, then a dead, hollow thud
    k.noise('bandpass', 300, 3000, k.t, 0.14, 0.35, 2, 0.12);
    k.tone('sawtooth', 160, 40, k.t + 0.14, 0.5, 0.35, 0.005);
    k.tone('sine', 110, 30, k.t + 0.14, 0.6, 0.8, 0.005);
    k.tone('sine', 233, 120, k.t + 0.14, 0.6, 0.15, 0.02);
  },
  healBig: (k) => {
    // a warm swell of bells
    [523, 659, 784, 1047, 1319].forEach((f, i) => k.tone('sine', f, f, k.t + i * 0.05, 0.6, 0.15, 0.01));
    [262, 392].forEach((f) => k.tone('triangle', f, f, k.t, 0.8, 0.1, 0.15));
    k.noise('bandpass', 3000, 6000, k.t, 0.7, 0.08, 3, 0.2);
  },
  heal: (k) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => twang(k, f, k.t + i * 0.055, 0.45, 0.09, 6)); // a harp run
    [523, 784].forEach((f) => k.tone('sine', f, f, k.t, 0.7, 0.06, 0.15));
    k.noise('highpass', 8000, 9000, k.t + 0.1, 0.45, 0.05, 0.7, 0.1);
  },
  mana: (k) => {
    [392, 494, 587, 784].forEach((f, i) => bell(k, f, k.t + i * 0.06, 0.5, 0.08));
    for (let i = 0; i < 4; i++) k.tone('sine', k.r(280, 380), k.r(700, 1000), k.t + 0.05 + i * 0.07, 0.06, 0.08); // bubbles
  },
  buff: (k) => {
    k.noise('bandpass', 400, 3200, k.t, 0.4, 0.22, 2, 0.08);
    k.tone('sine', 300, 1200, k.t, 0.4, 0.15, 0.06);
  },
  shield: (k) => {
    [110, 220, 330, 440].forEach((f, i) => k.tone('sine', f, f * 1.01, k.t, 0.8, 0.14 / (i + 1), 0.12));
    k.noise('bandpass', 2000, 4000, k.t, 0.6, 0.06, 4, 0.15);
  },
  spellCast: (k) => {
    k.noise('bandpass', 2800, 4200, k.t, 0.25, 0.1, 5, 0.05);
    k.tone('sine', 700, 1400, k.t, 0.2, 0.05, 0.04);
  },
  teleport: (k) => {
    k.tone('sine', 200, 1600, k.t, 0.4, 0.16, 0.05);
    k.noise('bandpass', 500, 5000, k.t, 0.4, 0.12, 3, 0.05);
    bell(k, 1568, k.t + 0.35, 0.4, 0.06);
  },
  // teleport runes (render/fx/teleportFx.ts): the channel hum is `teleportHum` below
  teleportOut: (k) => {
    // the column collapses: a deep suck of air, a falling sweep and a glassy chord
    k.noise('bandpass', 3200, 300, k.t, 0.5, 0.2, 2, 0.02);
    k.tone('sine', 520, 70, k.t, 0.55, 0.2, 0.01);
    k.tone('triangle', 1040, 260, k.t + 0.05, 0.4, 0.06, 0.01);
    bell(k, 784, k.t + 0.08, 0.7, 0.05);
    bell(k, 1175, k.t + 0.1, 0.6, 0.035);
  },
  teleportIn: (k) => {
    // arrival: a soft thump of displaced air, a bright rising shimmer and two bells
    k.tone('sine', 90, 45, k.t, 0.3, 0.3, 0.004);
    k.noise('lowpass', 1800, 200, k.t, 0.25, 0.25, 1, 0.003);
    k.noise('highpass', 5000, 9000, k.t + 0.02, 0.6, 0.06, 0.8, 0.05);
    k.tone('sine', 400, 1200, k.t, 0.35, 0.08, 0.02);
    bell(k, 1047, k.t + 0.12, 0.9, 0.06);
    bell(k, 1568, k.t + 0.22, 0.8, 0.045);
  },
  teleportFizzle: (k) => {
    k.noise('bandpass', 2400, 600, k.t, 0.3, 0.12, 3, 0.01);
    k.tone('sine', 660, 180, k.t, 0.28, 0.07, 0.01);
    k.pulse(0.2, 300, 120, k.t + 0.05, 0.16, 0.025);
  },
  respawn: (k) => {
    [262, 330, 392, 523].forEach((f) => k.tone('sine', f, f, k.t, 1.2, 0.07, 0.4));
    k.noise('highpass', 6000, 9000, k.t + 0.2, 0.9, 0.04, 0.7, 0.4);
    bell(k, 1047, k.t + 0.5, 0.8, 0.05);
  },

  // ---------------------------------------------------------------- progress
  levelUp: (k) => {
    // a short brass fanfare with bells on top
    horn(k, 262, k.t, 0.13, 0.16);
    horn(k, 330, k.t + 0.13, 0.13, 0.16);
    horn(k, 392, k.t + 0.26, 0.13, 0.16);
    horn(k, 523, k.t + 0.42, 0.75, 0.2);
    horn(k, 392, k.t + 0.42, 0.75, 0.1);
    [1047, 1319, 1568, 2093].forEach((f, i) => bell(k, f, k.t + 0.42 + i * 0.07, 0.9, 0.05));
    k.noise('highpass', 6000, 9000, k.t + 0.42, 0.9, 0.06, 0.7, 0.02);
  },
  skillUp: (k) => [784, 988, 1175].forEach((f, i) => bell(k, f, k.t + i * 0.08, 0.5, 0.08)),
  quest: (k) => {
    k.noise('bandpass', 3500, 2500, k.t, 0.18, 0.08, 3, 0.04); // a quill on paper
    bell(k, 784, k.t + 0.15, 0.6, 0.08);
    bell(k, 1175, k.t + 0.28, 0.8, 0.08);
  },
  die: (k) => {
    bell(k, 98, k.t, 2.2, 0.3); // a low toll
    k.ftone('sawtooth', 392, 196, 'lowpass', 1200, 500, k.t + 0.1, 1.4, 0.08, 1, 0.2);
    k.ftone('sawtooth', 466, 233, 'lowpass', 1200, 500, k.t + 0.1, 1.4, 0.06, 1, 0.2);
  },
  monsterDie: (k) => {
    k.tone('sawtooth', 300, 60, k.t, 0.35, 0.16, 0.01);
    k.noise('lowpass', 1200, 150, k.t, 0.3, 0.35);
  },

  // ---------------------------------------------------------------- items
  coins: (k) => {
    for (let i = 0; i < 6; i++) {
      const f = k.r(2600, 3600), at = k.t + i * 0.04 + k.r(0, 0.03);
      ring(k, [f, f * 1.47, f * 2.13], at, 0.14, 0.06);
    }
    k.noise('highpass', 5000, 5000, k.t, 0.25, 0.05);
  },
  pickup: (k) => {
    k.noise('bandpass', 1500, 2000, k.t, 0.08, 0.2, 1.5, 0.02);
    k.tone('triangle', 500, 700, k.t, 0.05, 0.12);
  },
  pickupMetal: (k) => {
    ring(k, [820, 1930, 3150], k.t, 0.3, 0.12);
    k.noise('bandpass', 2500, 1500, k.t, 0.05, 0.2, 1.5);
  },
  pickupGlass: (k) => {
    ring(k, [2400, 5600], k.t, 0.2, 0.08);
    ring(k, [2550, 5900], k.t + 0.07, 0.15, 0.05);
  },
  pickupGem: (k) => [2637, 3520, 4186].forEach((f, i) => k.tone('sine', f, f, k.t + i * 0.05, 0.25, 0.07)),
  pickupCloth: (k) => k.noise('bandpass', 2500, 1800, k.t, 0.15, 0.2, 0.8, 0.03),
  drink: (k) => {
    ring(k, [2300, 5400], k.t, 0.12, 0.05); // cork / glass
    for (let i = 0; i < 3; i++) {
      const at = k.t + 0.1 + i * 0.16;
      k.tone('sine', k.r(200, 260), k.r(420, 520), at, 0.09, 0.25);
      k.noise('lowpass', 600, 300, at, 0.08, 0.15);
    }
  },
  eat: (k) => {
    for (let i = 0; i < 3; i++) {
      const at = k.t + i * 0.17 + k.r(0, 0.03);
      k.noise('bandpass', k.r(1200, 1900), 700, at, 0.07, 0.35, 1.2);
      k.tone('sine', 120, 80, at, 0.06, 0.2);
    }
  },
  drop: (k) => {
    k.noise('lowpass', 700, 200, k.t, 0.12, 0.5);
    k.tone('sine', 130, 60, k.t, 0.1, 0.4);
  },
  itemMove: (k) => {
    k.noise('bandpass', 2000, 2600, k.t, 0.06, 0.12, 1.2, 0.01);
    k.tone('triangle', 900, 700, k.t, 0.03, 0.06);
  },
  equipMetal: (k) => {
    ring(k, [700, 1650, 2900], k.t, 0.25, 0.08);
    ring(k, [760, 1800, 3100], k.t + 0.09, 0.25, 0.07);
    k.noise('bandpass', 1800, 2400, k.t, 0.18, 0.12, 1, 0.03);
  },
  equipLeather: (k) => {
    k.noise('bandpass', 1400, 2200, k.t, 0.18, 0.2, 0.8, 0.04);
    k.tone('triangle', 1600, 1500, k.t + 0.15, 0.03, 0.08); // buckle
  },
  unequip: (k) => k.noise('bandpass', 2200, 1400, k.t, 0.14, 0.15, 0.8, 0.03),

  // ---------------------------------------------------------------- world
  door: (k) => {
    k.ftone('sawtooth', 170, 230, 'bandpass', 900, 700, k.t, 0.4, 0.08, 6, 0.05); // hinge creak
    k.noise('lowpass', 500, 150, k.t + 0.38, 0.12, 0.5); // the door settles
    k.tone('triangle', 1500, 1300, k.t + 0.38, 0.03, 0.08); // latch
  },
  chest: (k) => {
    k.tone('triangle', 1700, 1500, k.t, 0.03, 0.1); // lock
    k.ftone('sawtooth', 140, 190, 'bandpass', 800, 600, k.t + 0.05, 0.3, 0.07, 6, 0.04);
    k.noise('lowpass', 400, 120, k.t + 0.33, 0.1, 0.45);
  },
  dig: (k) => {
    for (let i = 0; i < 2; i++) {
      const at = k.t + i * 0.22;
      k.noise('bandpass', 900, 300, at, 0.16, 0.6, 1);
      for (let j = 0; j < 3; j++) k.noise('highpass', 2500, 2500, at + k.r(0.02, 0.15), 0.02, 0.12); // gravel
    }
  },
  chop: (k) => {
    k.noise('bandpass', k.r(500, 650), 220, k.t, 0.09, 0.7, 2.5);
    k.tone('triangle', k.r(190, 230), 110, k.t, 0.12, 0.35);
    k.tone('triangle', 330, 320, k.t, 0.15, 0.08); // woody ring
  },
  treeFall: (k) => {
    k.ftone('sawtooth', 90, 60, 'bandpass', 600, 400, k.t, 0.4, 0.1, 5, 0.1); // trunk creaks
    k.noise('bandpass', 1400, 400, k.t + 0.25, 0.4, 0.35, 1.5, 0.08); // branches through the air
    k.noise('lowpass', 500, 70, k.t + 0.6, 0.5, 0.85, 0.8);
    k.tone('sine', 80, 35, k.t + 0.6, 0.45, 0.6);
  },
  cast: (k) => {
    k.noise('bandpass', 2400, 900, k.t, 0.12, 0.08, 1.2);
    k.tone('sine', k.r(520, 600), 260, k.t + 0.12, 0.09, 0.08);
  },
  splash: (k) => {
    k.noise('lowpass', 2400, 400, k.t, 0.3, 0.35, 0.8, 0.01);
    k.noise('bandpass', 900, 1600, k.t + 0.08, 0.22, 0.12, 2);
    for (let i = 0; i < 3; i++) k.tone('sine', k.r(900, 1400), k.r(1600, 2200), k.t + 0.15 + i * 0.07, 0.04, 0.08); // droplets
  },
  mineHit: (k) => {
    ring(k, [2200 * k.r(0.95, 1.05), 3900, 5600], k.t, 0.2, 0.14);
    k.noise('bandpass', 2600, 1200, k.t, 0.07, 0.5, 1.5);
    k.tone('sine', 320, 150, k.t, 0.05, 0.3);
  },
  mineOre: (k) => {
    SOUNDS.mineHit(k);
    [1568, 2093, 2637].forEach((f, i) => k.tone('sine', f, f, k.t + 0.08 + i * 0.05, 0.25, 0.06));
  },
  rockBreak: (k) => {
    k.noise('lowpass', 1600, 180, k.t, 0.55, 0.75);
    k.tone('sine', 95, 45, k.t, 0.35, 0.5);
    for (let i = 0; i < 6; i++) k.noise('bandpass', k.r(700, 1600), 400, k.t + k.r(0.05, 0.5), 0.05, 0.25, 2);
  },
  anvil: (k) => {
    for (let i = 0; i < 2; i++) {
      const at = k.t + i * 0.28;
      ring(k, [1180, 2750, 4330, 5940], at, 0.7, 0.2 * (i ? 0.7 : 1));
      k.noise('bandpass', 4000, 3000, at, 0.02, 0.4, 1.5);
    }
  },
  furnace: (k) => {
    k.noise('lowpass', 250, 1300, k.t, 0.55, 0.45, 1, 0.25); // bellows
    k.noise('bandpass', 300, 150, k.t + 0.2, 0.6, 0.35, 1, 0.1); // roar
    for (let i = 0; i < 4; i++) k.noise('highpass', 3000, 3000, k.t + k.r(0.2, 0.7), 0.02, 0.12);
  },
  crafted: (k) => { bell(k, 1047, k.t, 0.5, 0.08); bell(k, 1568, k.t + 0.09, 0.7, 0.07); },

  // ---------------------------------------------------------------- interface
  click: (k) => {
    k.tone('triangle', 1800, 1200, k.t, 0.025, 0.07);
    k.noise('bandpass', 3000, 3000, k.t, 0.012, 0.05, 2);
  },
  uiOpen: (k) => k.noise('bandpass', 1800, 3000, k.t, 0.12, 0.1, 1, 0.02),
  error: (k) => {
    k.tone('sine', 220, 160, k.t, 0.09, 0.2);
    k.tone('sine', 185, 140, k.t + 0.1, 0.12, 0.2);
  },
  chat: (k) => k.tone('sine', 880, 990, k.t, 0.05, 0.05, 0.005),
};

/**
 * One second of a teleport rune's channel (`step` 0, 1, 2): a low drone and an airy swirl
 * that rise a little each second, with a chime on the beat. Played in one-second pieces so
 * a broken channel can simply stop.
 */
export function teleportHum(k: Kit, step: number): void {
  const up = 1 + step * 0.26;
  k.tone('sine', 110 * up, 124 * up, k.t, 1.05, 0.09, 0.15);
  k.tone('triangle', 220 * up, 250 * up, k.t, 1.05, 0.035, 0.2);
  k.noise('bandpass', 700 * up, 2400 * up, k.t, 1.05, 0.05, 6, 0.3);
  bell(k, [659, 784, 988][step] ?? 988, k.t + 0.02, 0.8, 0.03);
}
