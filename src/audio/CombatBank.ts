import { COMBAT_CLIPS, COMBAT_FILE, COMBAT_ONSET } from './combatBank';
import { jitter, MAX_VOICES, pickVariant } from './combatSurface';

interface Voice { src: AudioBufferSourceNode; g: GainNode; end: number }

/**
 * The pre-rendered combat sounds (public/audio/sfx/combat.mp3, made by scripts/sfx/render.ts):
 * one file, fetched and decoded once, played as slices. Every play picks a different variant
 * than last time and nudges pitch and level a little. At most MAX_VOICES play at once — the
 * oldest fades out — so big fights stay clear. Until the file has loaded (or if it fails),
 * `play` returns false and Sfx falls back to its synthesized recipes.
 */
export class CombatBank {
  private buf: AudioBuffer | null = null;
  private loading = false;
  private shift = 0;
  private last = new Map<string, number>();
  private voices: Voice[] = [];

  constructor(private readonly ctx: AudioContext) {}

  load(): void {
    if (this.loading || this.buf) return;
    this.loading = true;
    const url = new URL(COMBAT_FILE, document.baseURI).href;
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => {
        this.shift = this.measureShift(buf);
        this.buf = buf;
      })
      .catch(() => { this.loading = false; });
  }

  get ready(): boolean { return !!this.buf; }

  has(clip: string): boolean { return !!COMBAT_CLIPS[clip]?.length; }

  /**
   * Some MP3 decoders keep the encoder's start padding, others trim it: find where the first
   * clip really starts in the decoded audio and offset every slice by the difference.
   */
  private measureShift(buf: AudioBuffer): number {
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const end = Math.min(d.length, Math.round((COMBAT_ONSET + 0.1) * sr));
    for (let i = 0; i < end; i++) {
      if (Math.abs(d[i]) > 0.01) return Math.max(-0.06, Math.min(0.06, i / sr - COMBAT_ONSET));
    }
    return 0;
  }

  /**
   * Plays one clip into `out` after `delay` s. `gain` includes distance; `dist` (0 = here, 1 = edge
   * of hearing) also darkens far-away sounds a little. Returns false when the bank can't play it.
   */
  play(clip: string, out: AudioNode, gain: number, delay = 0, pitch = 1, dist = 0): boolean {
    const buf = this.buf;
    const vs = COMBAT_CLIPS[clip];
    if (!buf || !vs?.length) return false;
    const ctx = this.ctx;
    const v = pickVariant(vs.length, this.last.get(clip) ?? -1, Math.random());
    this.last.set(clip, v);
    const [start, dur] = vs[v];
    const j = jitter(Math.random(), Math.random());
    const when = ctx.currentTime + 0.005 + delay;
    const rate = j.rate * pitch;
    // voice pool: forget finished voices, fade out the oldest when full
    const now = ctx.currentTime;
    this.voices = this.voices.filter((x) => x.end > now);
    while (this.voices.length >= MAX_VOICES) {
      const old = this.voices.shift()!;
      try {
        old.g.gain.cancelScheduledValues(now);
        old.g.gain.setValueAtTime(old.g.gain.value, now);
        old.g.gain.linearRampToValueAtTime(0, now + 0.02);
        old.src.stop(now + 0.03);
      } catch { /* already stopped */ }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * j.gain;
    let head: AudioNode = g;
    if (dist > 0.1) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 18000 - 14000 * Math.min(1, dist);
      f.Q.value = 0.5;
      g.connect(f);
      head = f;
    }
    head.connect(out);
    src.connect(g);
    const offset = Math.max(0, start + this.shift);
    src.start(when, offset, dur + 0.01);
    const end = when + (dur + 0.01) / rate;
    src.onended = () => { try { g.disconnect(); if (head !== g) head.disconnect(); } catch { /* ignore */ } };
    this.voices.push({ src, g, end });
    return true;
  }
}
