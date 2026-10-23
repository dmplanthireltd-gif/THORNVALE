import type { Song } from './synth';

/**
 * Thornvale's soundtrack: original pieces, each played by a band of instruments that suits its region (two themes that take turns for
 * the main kinds of land), themes of their own for special places, quiet indoor themes, battle and the title screen.
 * Each bar of melody is "note/length" with lengths in sixteenths (16 per 4/4 bar, 12 in 3/4).
 * Edit here, then run `npx tsx scripts/music/render.ts` (see that file) to rebuild the audio.
 */

export const SONGS: Song[] = [
  {
    id: 'town', title: 'Hearth and Lantern', bpm: 116,
    band: { lead: 'fiddle', harmony: 'recorder', pad: 'accordion', arp: 'lute', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'pick', arpVol: 0.12, padVol: 0.07,
    drums: 'k...h.s.k.k.h.s.', drumVol: 0.45, echo: 0.16, swing: 0.12, reverb: 0.22,
    sections: {
      A: {
        chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
        melody: [
          'e5/4 g5/2 e5/2 c5/4 d5/4', 'e5/6 d5/2 c5/4 a4/4', 'f4/2 a4/2 c5/4 f5/4 e5/2 d5/2', 'd5/8 r/4 g4/4',
          'e5/4 g5/2 e5/2 c6/4 b5/2 a5/2', 'a5/6 g5/2 e5/4 c5/4', 'd5/2 e5/2 f5/4 a5/4 g5/2 f5/2', 'e5/4 d5/4 g4/8',
        ],
      },
      A2: {
        chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'C'], harmony: true,
        melody: [
          'e5/4 g5/2 e5/2 c5/4 d5/4', 'e5/6 d5/2 c5/4 a4/4', 'f4/2 a4/2 c5/4 f5/4 e5/2 d5/2', 'd5/8 r/4 g4/4',
          'e5/4 g5/2 e5/2 c6/4 b5/2 a5/2', 'a5/6 g5/2 e5/4 c5/4', 'f5/4 e5/2 d5/2 a4/4 b4/4', 'c5/12 r/4',
        ],
      },
      B: {
        lead: 'recorder',
        chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G'], arp: 'updown',
        melody: [
          'a5/4 c6/4 a5/4 f5/4', 'g5/6 a5/2 b5/4 d6/4', 'e6/4 d6/2 b5/2 g5/4 e5/4', 'a5/8 c6/4 a5/4',
          'f5/2 g5/2 a5/4 c6/4 a5/2 f5/2', 'g5/4 b5/4 d6/4 b5/4', 'c6/6 b5/2 g5/4 e5/4', 'd5/4 e5/4 f5/4 g5/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'fields', title: 'The Open Road', bpm: 132,
    band: { lead: 'whistle', harmony: 'fiddle', pad: 'strings', arp: 'guitar', bass: 'pizz', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'gallop', arp: 'strum', arpVol: 0.14, padVol: 0.08,
    drums: 'k.h.s.h.k.k.s.h.', drumVol: 0.5, echo: 0.18, reverb: 0.25,
    sections: {
      A: {
        chords: ['D', 'C', 'G', 'D', 'D', 'C', 'G', 'A'],
        melody: [
          'd5/2 f#5/2 a5/4 a5/2 b5/2 a5/4', 'g5/4 e5/4 c5/4 e5/4', 'd5/6 b4/2 g4/4 b4/4', 'a4/12 r/4',
          'd5/2 f#5/2 a5/4 d6/4 c#6/2 b5/2', 'c6/6 g5/2 e5/4 g5/4', 'b5/4 a5/2 g5/2 d5/4 g5/4', 'a5/12 r/4',
        ],
      },
      A2: {
        chords: ['D', 'C', 'G', 'D', 'D', 'C', 'G', 'A'], harmony: true,
        melody: [
          'd5/2 f#5/2 a5/4 a5/2 b5/2 a5/4', 'g5/4 e5/4 c5/4 e5/4', 'd5/6 b4/2 g4/4 b4/4', 'a4/12 r/4',
          'd5/2 f#5/2 a5/4 d6/4 c#6/2 b5/2', 'c6/6 g5/2 e5/4 g5/4', 'b5/4 a5/2 g5/2 d5/4 g5/4', 'e5/4 f#5/4 g5/4 a5/4',
        ],
      },
      B: {
        lead: 'fiddle',
        chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'A'], arp: 'up',
        melody: [
          'f#5/4 d5/4 b4/4 d5/4', 'e5/2 f#5/2 g5/4 b5/8', 'a5/4 f#5/4 d5/4 f#5/4', 'e5/8 a4/4 c#5/4',
          'd5/2 e5/2 f#5/4 b5/4 a5/4', 'g5/4 f#5/2 e5/2 d5/4 b4/4', 'e5/2 f#5/2 g5/4 a5/4 b5/4', 'c#6/8 a5/8',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A'],
  },
  {
    id: 'jungle', title: 'The Green Deep', bpm: 118,
    band: { lead: 'panpipe', harmony: 'kalimba', pad: 'choirOo', arp: 'marimba', bass: 'upright', kit: 'hand' },
    lead: { vol: 0.19 }, bass: 'root8', arp: 'off', arpVol: 0.1, padVol: 0.06,
    drums: 't..k.tp.t.k.tpp.', drumVol: 0.55, echo: 0.22, swing: 0.08, reverb: 0.3, mix: { drums: 1 },
    sections: {
      A: {
        chords: ['Am', 'Am', 'G', 'G', 'F', 'F', 'E', 'E'],
        melody: [
          'a4/3 c5/3 d5/2 e5/4 g5/2 e5/2', 'd5/4 c5/2 a4/2 r/8', 'g4/3 a4/3 c5/2 d5/4 c5/2 a4/2', 'g4/12 r/4',
          'c5/3 d5/3 e5/2 g5/4 a5/4', 'g5/4 e5/4 d5/4 c5/4', 'b4/4 d5/4 e5/8', 'e5/2 d5/2 b4/4 g#4/8',
        ],
      },
      A2: {
        chords: ['Am', 'Am', 'G', 'G', 'F', 'F', 'E', 'E'], harmony: true, arp: 'up',
        melody: [
          'a4/3 c5/3 d5/2 e5/4 g5/2 e5/2', 'd5/4 c5/2 a4/2 r/8', 'g4/3 a4/3 c5/2 d5/4 c5/2 a4/2', 'g4/12 r/4',
          'c5/3 d5/3 e5/2 g5/4 a5/4', 'g5/4 e5/4 d5/4 c5/4', 'b4/4 d5/4 e5/8', 'e5/2 d5/2 b4/4 g#4/8',
        ],
      },
      B: {
        lead: 'ocarina',
        chords: ['Dm', 'Am', 'Dm', 'E', 'F', 'G', 'Am', 'Am'], arp: 'updown',
        melody: [
          'f5/4 a5/4 g5/2 f5/2 d5/4', 'e5/6 c5/2 a4/8', 'd5/2 f5/2 a5/4 d6/4 c6/4', 'b5/8 g#5/8',
          'a5/4 c6/4 a5/4 f5/4', 'g5/4 b5/4 d6/4 b5/4', 'c6/6 b5/2 a5/8', 'a5/2 g5/2 e5/4 a4/8',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'snow', title: 'Frostfang', bpm: 92,
    band: { lead: 'celesta', harmony: 'flute', pad: 'strings', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'updown', arpRate: 16, arpVol: 0.08, padVol: 0.1,
    drums: 'k.......s.......', drumVol: 0.4, echo: 0.3, reverb: 0.45, mix: { drums: -4, bass: -3, pad: 1 },
    sections: {
      A: {
        chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B'],
        melody: [
          'b4/8 e5/4 f#5/4', 'g5/8 e5/8', 'f#5/4 a5/4 d5/8', 'f#5/12 r/4',
          'b5/8 a5/4 g5/4', 'e5/8 g5/4 c6/4', 'b5/4 a5/4 e5/8', 'd#5/12 r/4',
        ],
      },
      A2: {
        chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B'], harmony: true,
        melody: [
          'b4/8 e5/4 f#5/4', 'g5/8 e5/8', 'f#5/4 a5/4 d5/8', 'f#5/12 r/4',
          'b5/8 a5/4 g5/4', 'e5/8 g5/4 c6/4', 'b5/4 a5/4 e5/8', 'd#5/12 r/4',
        ],
      },
      B: {
        lead: 'flute',
        chords: ['C', 'D', 'Em', 'Em', 'Am', 'B', 'Em', 'Em'], drums: 'k...h...s...h...',
        melody: [
          'e6/8 d6/4 c6/4', 'd6/8 a5/8', 'b5/4 g5/4 e5/8', 'r/8 e5/4 g5/4',
          'a5/8 c6/4 e6/4', 'd#6/8 f#5/8', 'e6/16', 'r/16',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'desert', title: 'Sunspire', bpm: 104,
    band: { lead: 'oud', harmony: 'ney', pad: 'strings', arp: 'dulcimer', bass: 'upright', kit: 'darbuka' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'off', arpVol: 0.08, padVol: 0.05,
    drums: 't.pp.t.pt.pp.tp.', drumVol: 0.55, echo: 0.24, reverb: 0.32, mix: { drums: 1, pad: -2 },
    sections: {
      A: {
        chords: ['D', 'Eb', 'D', 'Eb', 'Cm', 'Eb', 'D', 'D'],
        melody: [
          'd5/2 eb5/2 f#5/4 g5/2 f#5/2 eb5/4', 'd5/6 eb5/2 g5/4 bb5/4', 'a5/4 g5/2 f#5/2 eb5/4 d5/4', 'eb5/12 r/4',
          'c5/2 d5/2 eb5/4 g5/4 c6/4', 'bb5/4 g5/2 eb5/2 g5/4 bb5/4', 'a5/6 g5/2 f#5/4 eb5/4', 'd5/12 r/4',
        ],
      },
      A2: {
        chords: ['D', 'Eb', 'D', 'Eb', 'Cm', 'Eb', 'D', 'D'], harmony: true, arp: 'up',
        melody: [
          'd5/2 eb5/2 f#5/4 g5/2 f#5/2 eb5/4', 'd5/6 eb5/2 g5/4 bb5/4', 'a5/4 g5/2 f#5/2 eb5/4 d5/4', 'eb5/12 r/4',
          'c5/2 d5/2 eb5/4 g5/4 c6/4', 'bb5/4 g5/2 eb5/2 g5/4 bb5/4', 'a5/6 g5/2 f#5/4 eb5/4', 'd5/12 r/4',
        ],
      },
      B: {
        lead: 'ney',
        chords: ['Gm', 'Cm', 'D', 'D', 'Gm', 'Eb', 'D', 'D'], arp: 'updown',
        melody: [
          'g5/4 bb5/4 d6/4 c6/2 bb5/2', 'c6/6 bb5/2 g5/4 eb5/4', 'f#5/2 g5/2 a5/4 c6/4 bb5/2 a5/2', 'a5/12 r/4',
          'd6/4 c6/2 bb5/2 a5/4 g5/4', 'g5/4 eb5/4 bb4/4 eb5/4', 'f#5/2 g5/2 eb5/4 d5/8', 'd5/16',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A'],
  },
  {
    id: 'volcano', title: 'Cinderfall', bpm: 144,
    band: { lead: 'horn', harmony: 'cello', pad: 'choir', arp: 'marcato', bass: 'cello', kit: 'taiko' },
    lead: { vol: 0.21 }, bass: 'gallop', arp: 'up', arpRate: 16, arpVol: 0.07, padVol: 0.07,
    drums: 'k.h.s.hkk.h.s.h.', drumVol: 0.55, echo: 0.14, reverb: 0.28, mix: { drums: 2.5 },
    sections: {
      A: {
        chords: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'G'],
        melody: [
          'c5/2 c5/2 eb5/2 g5/2 c6/4 bb5/2 g5/2', 'ab5/4 g5/4 eb5/4 d5/4', 'eb5/2 eb5/2 ab5/2 c6/2 eb6/4 c6/4', 'd6/8 bb5/8',
          'c6/2 c6/2 bb5/2 g5/2 eb5/4 g5/4', 'c6/4 d6/4 eb6/8', 'd6/4 c6/4 bb5/4 ab5/4', 'b5/8 d6/4 g5/4',
        ],
      },
      A2: {
        chords: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'G'], harmony: true,
        melody: [
          'c5/2 c5/2 eb5/2 g5/2 c6/4 bb5/2 g5/2', 'ab5/4 g5/4 eb5/4 d5/4', 'eb5/2 eb5/2 ab5/2 c6/2 eb6/4 c6/4', 'd6/8 bb5/8',
          'c6/2 c6/2 bb5/2 g5/2 eb5/4 g5/4', 'c6/4 d6/4 eb6/8', 'd6/4 c6/4 bb5/4 ab5/4', 'b5/8 d6/4 g5/4',
        ],
      },
      B: {
        lead: 'brass',
        chords: ['Fm', 'Cm', 'Ab', 'Bb', 'Fm', 'G', 'Cm', 'Cm'], drums: 'k.hks.hkk.hks.hs',
        melody: [
          'f5/4 ab5/4 c6/4 f6/4', 'eb6/8 c6/8', 'c6/4 eb6/4 ab5/8', 'bb5/4 d6/4 f6/8',
          'f6/4 eb6/4 c6/4 ab5/4', 'g5/4 b5/4 d6/4 f6/4', 'eb6/8 d6/4 c6/4', 'c6/12 r/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'deep', title: 'Below the Stone', bpm: 80,
    band: { lead: 'musicbox', harmony: 'ocarina', pad: 'choirOo', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.17 }, bass: 'drone', arp: 'off', arpVol: 0.07, padVol: 0.09,
    drums: 'k...............', drumVol: 0.4, echo: 0.42, reverb: 0.5, mix: { drums: -4, bass: -2, pad: 2 },
    sections: {
      A: {
        chords: ['Am', 'Am', 'F', 'E', 'Am', 'Dm', 'F', 'E'],
        melody: [
          'e5/8 r/4 c5/4', 'b4/4 c5/4 a4/8', 'c5/8 f5/4 e5/4', 'g#4/12 r/4',
          'a4/4 b4/4 c5/4 e5/4', 'f5/8 e5/4 d5/4', 'c5/4 d5/4 e5/8', 'b4/16',
        ],
      },
      A2: {
        chords: ['Am', 'Am', 'F', 'E', 'Am', 'Dm', 'F', 'E'], arp: 'down', harmony: true,
        melody: [
          'e5/8 r/4 c5/4', 'b4/4 c5/4 a4/8', 'c5/8 f5/4 e5/4', 'g#4/12 r/4',
          'a4/4 b4/4 c5/4 e5/4', 'f5/8 e5/4 d5/4', 'c5/4 d5/4 e5/8', 'b4/16',
        ],
      },
      B: {
        lead: 'celesta',
        chords: ['Dm', 'Am', 'Bb', 'E', 'Dm', 'Am', 'E', 'E'], drums: 'k.......t.......',
        melody: [
          'd5/8 f5/4 a5/4', 'e5/16', 'd5/8 f5/4 bb4/4', 'g#4/8 b4/8',
          'a5/8 g5/4 f5/4', 'e5/8 c5/8', 'b4/4 d5/4 g#5/8', 'e5/16',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A'],
  },
  {
    id: 'sea', title: 'Saltwind', bpm: 100, bar: 12,
    band: { lead: 'concertina', harmony: 'whistle', pad: 'strings', arp: 'guitar', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.19 }, bass: 'waltz', arp: 'pick', arpVol: 0.11, padVol: 0.06,
    drums: 'k...h...s...', drumVol: 0.45, echo: 0.24, reverb: 0.3,
    sections: {
      A: {
        chords: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'],
        melody: [
          'd5/4 g5/2 a5/2 b5/4', 'c6/4 b5/2 a5/2 g5/4', 'b5/6 a5/2 g5/4', 'a5/12',
          'd5/4 g5/2 a5/2 b5/4', 'c6/2 d6/2 e6/4 c6/4', 'b5/4 a5/4 f#5/4', 'g5/12',
        ],
      },
      A2: {
        chords: ['G', 'C', 'G', 'D', 'G', 'C', 'D', 'G'], harmony: true,
        melody: [
          'd5/4 g5/2 a5/2 b5/4', 'c6/4 b5/2 a5/2 g5/4', 'b5/6 a5/2 g5/4', 'a5/12',
          'd5/4 g5/2 a5/2 b5/4', 'c6/2 d6/2 e6/4 c6/4', 'b5/4 a5/4 f#5/4', 'g5/12',
        ],
      },
      B: {
        lead: 'fiddle',
        chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'D'], arp: 'updown',
        melody: [
          'e5/4 g5/4 b5/4', 'c6/6 b5/2 a5/4', 'b5/4 d6/4 b5/4', 'a5/12',
          'g5/4 b5/4 e6/4', 'e6/4 d6/2 c6/2 b5/4', 'a5/4 b5/4 c6/4', 'd6/8 f#5/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'forest', title: 'Whispering Pines', bpm: 84, bar: 12,
    band: { lead: 'flute', harmony: 'recorder', pad: 'strings', arp: 'harp', bass: 'pizz', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'waltz', arp: 'pick', arpVol: 0.1, padVol: 0.07,
    drums: 'k.....p..p..', drumVol: 0.35, echo: 0.2, reverb: 0.38, mix: { drums: -5, bass: -2 },
    sections: {
      A: {
        chords: ['Em', 'D', 'Em', 'A', 'C', 'G', 'D', 'Em'],
        melody: [
          'e5/4 g5/4 b5/4', 'a5/6 f#5/2 d5/4', 'e5/4 f#5/2 g5/2 a5/4', 'e5/8 c#5/4',
          'g5/4 e5/4 c5/4', 'd5/6 b4/2 d5/4', 'f#5/4 e5/2 d5/2 a4/4', 'b4/12',
        ],
      },
      A2: {
        chords: ['Em', 'D', 'Em', 'A', 'C', 'G', 'D', 'Em'], harmony: true,
        melody: [
          'e5/4 g5/4 b5/4', 'a5/6 f#5/2 d5/4', 'e5/4 f#5/2 g5/2 a5/4', 'e5/8 c#5/4',
          'g5/4 e5/4 c5/4', 'd5/6 b4/2 d5/4', 'f#5/4 e5/2 d5/2 a4/4', 'e5/12',
        ],
      },
      B: {
        lead: 'fiddle',
        chords: ['Am', 'Em', 'C', 'D', 'Am', 'Em', 'Bm', 'D'], arp: 'up', drums: 'k.....h.....',
        melody: [
          'c6/4 b5/4 a5/4', 'g5/6 e5/2 b4/4', 'c5/4 e5/4 g5/4', 'a5/8 f#5/4',
          'e6/4 d6/2 c6/2 a5/4', 'b5/6 g5/2 e5/4', 'f#5/4 d5/4 b4/4', 'a4/6 b4/2 d5/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'swamp', title: 'Mirewater', bpm: 76,
    band: { lead: 'cello', harmony: 'kalimba', pad: 'choirOo', arp: 'kalimba', bass: 'contrabass', kit: 'hand' },
    lead: { vol: 0.22 }, bass: 'drone', arp: 'pick', arpVol: 0.07, padVol: 0.07,
    drums: 'k.......p..t....', drumVol: 0.35, echo: 0.3, reverb: 0.42, mix: { drums: -3, bass: -2, pad: 1 },
    sections: {
      A: {
        chords: ['Dm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Eb', 'A'],
        melody: [
          'd4/8 f4/4 a4/4', 'g4/4 f4/4 e4/8', 'd4/6 f4/2 bb4/8', 'a4/12 r/4',
          'bb4/4 a4/4 g4/8', 'f4/6 e4/2 d4/8', 'eb4/8 g4/4 bb4/4', 'a4/8 c#5/4 e5/4',
        ],
      },
      A2: {
        chords: ['Dm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Eb', 'A'], harmony: true,
        melody: [
          'd4/8 f4/4 a4/4', 'g4/4 f4/4 e4/8', 'd4/6 f4/2 bb4/8', 'a4/12 r/4',
          'bb4/4 a4/4 g4/8', 'f4/6 e4/2 d4/8', 'eb4/8 g4/4 bb4/4', 'a4/12 r/4',
        ],
      },
      B: {
        lead: 'ocarina', leadOctave: 1,
        chords: ['Bb', 'F', 'Gm', 'A', 'Bb', 'F', 'Eb', 'A'], arp: 'updown', drums: 'k...h...p.h.t...',
        melody: [
          'f4/4 bb4/4 d5/8', 'c5/6 a4/2 f4/8', 'g4/4 bb4/4 d5/4 bb4/4', 'a4/8 e4/8',
          'd5/6 c5/2 bb4/8', 'a4/4 c5/4 f5/8', 'g5/4 f5/4 eb5/4 bb4/4', 'a4/16',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A'],
  },
  {
    id: 'battle', title: 'Steel and Thunder', bpm: 168,
    band: { lead: 'brass', harmony: 'horn', pad: 'strings', arp: 'marcato', bass: 'cello', kit: 'orchestral' },
    lead: { vol: 0.21 }, bass: 'gallop', arp: 'updown', arpRate: 16, arpVol: 0.08, padVol: 0.07,
    drums: 'k.hks.hkk.hks.hs', drumVol: 0.6, echo: 0.12, reverb: 0.22, mix: { drums: 3, bass: 1 },
    sections: {
      A: {
        chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'],
        melody: [
          'a5/2 a5/2 e5/2 a5/2 c6/2 b5/2 a5/2 g5/2', 'a5/4 e5/4 c5/4 e5/4', 'f5/2 f5/2 a5/2 c6/2 f6/4 e6/4', 'd6/4 b5/4 g5/4 d6/4',
          'e6/2 e6/2 d6/2 c6/2 b5/4 a5/4', 'c6/4 b5/4 a5/4 e5/4', 'f5/4 a5/4 c6/4 a5/4', 'g#5/8 b5/4 e6/4',
        ],
      },
      A2: {
        chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'], harmony: true,
        melody: [
          'a5/2 a5/2 e5/2 a5/2 c6/2 b5/2 a5/2 g5/2', 'a5/4 e5/4 c5/4 e5/4', 'f5/2 f5/2 a5/2 c6/2 f6/4 e6/4', 'd6/4 b5/4 g5/4 d6/4',
          'e6/2 e6/2 d6/2 c6/2 b5/4 a5/4', 'c6/4 b5/4 a5/4 e5/4', 'f5/4 a5/4 c6/4 a5/4', 'g#5/8 b5/4 e6/4',
        ],
      },
      B: {
        lead: 'horn',
        chords: ['Dm', 'Am', 'Dm', 'E', 'F', 'G', 'Am', 'E'], drums: 'k.k.s.kkk.k.s.ss',
        melody: [
          'd6/4 f6/4 d6/4 a5/4', 'c6/4 e6/4 c6/4 a5/4', 'd6/2 e6/2 f6/4 a6/8', 'g#6/8 e6/8',
          'f6/4 e6/4 d6/4 c6/4', 'b5/4 d6/4 g6/8', 'a6/4 g6/4 e6/4 c6/4', 'b5/4 g#5/4 e5/4 b4/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },

  // ------------------------------------------------------------------ title screen

  {
    id: 'title', title: 'The Gate of Thornvale', bpm: 92, ceiling: 0.5, kbps: 96,
    band: { lead: 'horn', harmony: 'cello', pad: 'strings', arp: 'harp', bass: 'contrabass', kit: 'orchestral' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'updown', arpVol: 0.08, padVol: 0.09,
    drums: 'k.......k...t...', drumVol: 0.35, echo: 0.2, reverb: 0.42, mix: { drums: -5, pad: 1, bass: -2 },
    sections: {
      I: {
        lead: 'flute', drums: '',
        chords: ['D', 'G', 'D', 'A'],
        melody: ['r/8 a4/8', 'b4/8 d5/8', 'f#5/12 r/4', 'e5/16'],
      },
      A: {
        chords: ['D', 'Bm', 'G', 'A', 'D', 'G', 'Em', 'A'],
        melody: [
          'a4/4 d5/4 f#5/6 e5/2', 'd5/4 b4/4 f#4/8', 'g4/4 b4/4 d5/4 g5/4', 'f#5/6 e5/2 e5/8',
          'a5/6 f#5/2 d5/4 a5/4', 'b5/6 a5/2 g5/4 d5/4', 'e5/4 g5/4 b5/4 a5/2 g5/2', 'a5/12 r/4',
        ],
      },
      B: {
        lead: 'fiddle', arp: 'up',
        chords: ['G', 'D', 'Em', 'Bm', 'G', 'D', 'Em', 'A'],
        melody: [
          'b5/8 d6/4 b5/4', 'a5/6 f#5/2 d5/8', 'e5/4 g5/4 b5/4 e6/4', 'd6/8 b5/4 f#5/4',
          'g5/4 b5/4 d6/4 g6/4', 'f#6/6 e6/2 d6/8', 'e6/4 d6/4 b5/4 g5/4', 'a5/8 c#6/4 e6/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['D', 'Bm', 'G', 'A', 'D', 'G', 'A', 'D'],
        melody: [
          'a4/4 d5/4 f#5/6 e5/2', 'd5/4 b4/4 f#4/8', 'g4/4 b4/4 d5/4 g5/4', 'f#5/6 e5/2 e5/8',
          'a5/6 f#5/2 d5/4 a5/4', 'b5/6 a5/2 g5/4 d5/4', 'e5/4 f#5/2 g5/2 a5/4 c#5/4', 'd5/16',
        ],
      },
    },
    form: ['I', 'A', 'B', 'A2'],
  },

  // ------------------------------------------------------------------ second themes for the main regions (they take turns)

  {
    id: 'town2', title: 'Cobbles and Kettles', bpm: 96, ceiling: 0.5, bar: 12, kbps: 80,
    band: { lead: 'lute', harmony: 'whistle', pad: 'accordion', arp: 'harp', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'waltz', arp: 'pick', arpVol: 0.09, padVol: 0.06,
    drums: 'k.....h.....', drumVol: 0.35, echo: 0.18, swing: 0.06, reverb: 0.26, mix: { drums: -4, pad: -2 },
    sections: {
      A: {
        chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D'],
        melody: [
          'b4/4 d5/2 g5/2 f#5/2 e5/2', 'e5/4 g5/4 b5/4', 'c6/6 b5/2 a5/2 g5/2', 'a5/8 d5/4',
          'g5/2 a5/2 b5/4 d6/4', 'e6/4 d6/2 b5/2 g5/4', 'a5/4 c6/4 e5/4', 'f#5/8 a5/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'D', 'G'],
        melody: [
          'b4/4 d5/2 g5/2 f#5/2 e5/2', 'e5/4 g5/4 b5/4', 'c6/6 b5/2 a5/2 g5/2', 'a5/8 d5/4',
          'g5/2 a5/2 b5/4 d6/4', 'e6/4 d6/2 b5/2 g5/4', 'a5/4 f#5/4 d5/4', 'g5/12',
        ],
      },
      B: {
        lead: 'whistle', arp: 'updown',
        chords: ['C', 'G', 'Am', 'Em', 'C', 'G', 'Am', 'D'],
        melody: [
          'e5/4 g5/4 c6/4', 'b5/6 a5/2 g5/4', 'a5/4 c6/4 e6/4', 'b5/8 g5/4',
          'c6/2 b5/2 a5/4 g5/4', 'd5/4 g5/4 b5/4', 'c6/4 a5/2 g5/2 e5/4', 'f#5/8 r/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'fields2', title: 'Hedgerow Lane', bpm: 120, ceiling: 0.5, kbps: 80,
    band: { lead: 'recorder', harmony: 'flute', pad: 'strings', arp: 'guitar', bass: 'pizz', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'root8', arp: 'pick', arpVol: 0.12, padVol: 0.07,
    drums: 'k...h.s.k...h.s.', drumVol: 0.4, echo: 0.18, reverb: 0.26, mix: { drums: -3 },
    sections: {
      A: {
        chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C'],
        melody: [
          'f5/4 a5/4 c6/6 a5/2', 'd6/4 c6/2 a5/2 f5/8', 'd5/4 f5/4 bb5/4 a5/2 g5/2', 'g5/8 e5/4 c5/4',
          'f5/2 g5/2 a5/4 c6/4 f6/4', 'e6/2 d6/2 a5/4 f5/8', 'g5/4 bb5/4 d6/4 bb5/4', 'c6/8 r/4 c5/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'C', 'F'],
        melody: [
          'f5/4 a5/4 c6/6 a5/2', 'd6/4 c6/2 a5/2 f5/8', 'd5/4 f5/4 bb5/4 a5/2 g5/2', 'g5/8 e5/4 c5/4',
          'f5/2 g5/2 a5/4 c6/4 f6/4', 'e6/2 d6/2 a5/4 f5/8', 'g5/4 e5/4 c5/4 e5/4', 'f5/12 r/4',
        ],
      },
      B: {
        lead: 'whistle', arp: 'strum',
        chords: ['Bb', 'F', 'Gm', 'Dm', 'Bb', 'F', 'Gm', 'C'],
        melody: [
          'd6/6 c6/2 bb5/8', 'a5/4 c6/4 f6/8', 'bb5/4 a5/2 g5/2 d5/8', 'f5/8 a5/8',
          'bb5/2 c6/2 d6/4 f6/4 d6/4', 'c6/8 a5/4 f5/4', 'g5/4 bb5/4 a5/4 g5/4', 'e5/8 g5/4 c6/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'forest2', title: 'Mossbound', bpm: 88, ceiling: 0.5, kbps: 80,
    band: { lead: 'ocarina', harmony: 'flute', pad: 'choirOo', arp: 'harp', bass: 'pizz', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'updown', arpVol: 0.08, padVol: 0.07,
    drums: 'k.......t.......', drumVol: 0.3, echo: 0.26, reverb: 0.4, mix: { drums: -5, bass: -2 },
    sections: {
      A: {
        chords: ['Dm', 'C', 'Dm', 'Am', 'Bb', 'F', 'C', 'Dm'],
        melody: [
          'd5/6 e5/2 f5/4 a5/4', 'g5/8 e5/4 c5/4', 'f5/4 e5/4 d5/8', 'c5/4 e5/4 a4/8',
          'bb4/4 d5/4 f5/4 bb5/4', 'a5/8 f5/4 c5/4', 'e5/6 f5/2 g5/4 e5/4', 'd5/12 r/4',
        ],
      },
      B: {
        lead: 'flute', arp: 'pick',
        chords: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'A', 'A'],
        melody: [
          'f5/4 bb5/4 d6/8', 'c6/6 bb5/2 g5/8', 'a5/4 c6/4 e6/8', 'd6/8 a5/8',
          'bb5/4 a5/2 g5/2 f5/4 d5/4', 'e5/4 g5/4 c6/8', 'c#6/8 a5/4 e5/4', 'a5/12 r/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['Dm', 'C', 'Dm', 'Am', 'Bb', 'F', 'C', 'Dm'],
        melody: [
          'd5/6 e5/2 f5/4 a5/4', 'g5/8 e5/4 c5/4', 'f5/4 e5/4 d5/8', 'c5/4 e5/4 a4/8',
          'bb4/4 d5/4 f5/4 bb5/4', 'a5/8 f5/4 c5/4', 'e5/6 f5/2 g5/4 e5/4', 'd5/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'deep2', title: 'Lanternless', bpm: 80, ceiling: 0.5, kbps: 64,
    band: { lead: 'bells', harmony: 'ocarina', pad: 'strings', arp: 'kalimba', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.17 }, bass: 'drone', arp: 'pick', arpVol: 0.06, padVol: 0.09,
    drums: 'k...............', drumVol: 0.35, echo: 0.4, reverb: 0.52, mix: { drums: -5, bass: -2, pad: 2, arp: -3 },
    sections: {
      A: {
        chords: ['Em', 'F', 'Em', 'D', 'C', 'Bm', 'Am', 'B'],
        melody: [
          'e5/8 r/4 g5/4', 'f5/8 e5/8', 'b4/8 r/4 e5/4', 'd5/12 r/4',
          'c5/8 e5/4 g5/4', 'f#5/8 d5/8', 'e5/4 c5/4 a4/8', 'b4/12 r/4',
        ],
      },
      B: {
        lead: 'ocarina', drums: 'k.......t.......',
        chords: ['Am', 'Em', 'F', 'B', 'Am', 'Em', 'C', 'B'],
        melody: [
          'a4/4 c5/4 e5/8', 'g5/6 f#5/2 e5/8', 'f5/8 a5/4 c6/4', 'b5/12 r/4',
          'c6/6 b5/2 a5/8', 'g5/4 e5/4 b4/8', 'c5/4 e5/4 g5/4 e5/4', 'd#5/16',
        ],
      },
      A2: {
        harmony: true, arp: 'down',
        chords: ['Em', 'F', 'Em', 'D', 'C', 'Bm', 'Am', 'B'],
        melody: [
          'e5/8 r/4 g5/4', 'f5/8 e5/8', 'b4/8 r/4 e5/4', 'd5/12 r/4',
          'c5/8 e5/4 g5/4', 'f#5/8 d5/8', 'e5/4 c5/4 a4/8', 'b4/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'sea2', title: "Gull's Rest", bpm: 96, ceiling: 0.5, bar: 12, kbps: 80,
    band: { lead: 'whistle', harmony: 'concertina', pad: 'accordion', arp: 'guitar', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'waltz', arp: 'pick', arpVol: 0.11, padVol: 0.05,
    drums: 'k.....s.....', drumVol: 0.38, echo: 0.24, reverb: 0.3, mix: { drums: -3, pad: -2 },
    sections: {
      A: {
        chords: ['A', 'D', 'A', 'E', 'F#m', 'D', 'E', 'A'],
        melody: [
          'e5/4 a5/2 b5/2 c#6/4', 'd6/4 c#6/2 b5/2 a5/4', 'c#6/6 b5/2 a5/4', 'b5/8 e5/4',
          'f#5/4 a5/2 c#6/2 f#6/4', 'f#6/4 e6/2 d6/2 a5/4', 'b5/4 g#5/4 e5/4', 'a5/12',
        ],
      },
      A2: {
        harmony: true,
        chords: ['A', 'D', 'A', 'E', 'F#m', 'D', 'E', 'A'],
        melody: [
          'e5/4 a5/2 b5/2 c#6/4', 'd6/4 c#6/2 b5/2 a5/4', 'c#6/6 b5/2 a5/4', 'b5/8 e5/4',
          'f#5/4 a5/2 c#6/2 f#6/4', 'f#6/4 e6/2 d6/2 a5/4', 'b5/4 g#5/4 e5/4', 'a5/12',
        ],
      },
      B: {
        lead: 'fiddle', arp: 'updown',
        chords: ['D', 'A', 'Bm', 'E', 'D', 'A', 'Bm', 'E'],
        melody: [
          'f#5/4 a5/4 d6/4', 'c#6/6 b5/2 a5/4', 'b5/4 d6/4 f#6/4', 'e6/8 b5/4',
          'a5/4 d6/4 f#6/4', 'e6/4 c#6/2 b5/2 a5/4', 'd6/4 b5/4 f#5/4', 'g#5/8 b5/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },

  // ------------------------------------------------------------------ places with a theme of their own

  {
    id: 'court', title: 'The Temple Court', bpm: 84, ceiling: 0.5, kbps: 80,
    band: { lead: 'flute', harmony: 'strings', pad: 'choirOo', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'updown', arpVol: 0.08, padVol: 0.08,
    drums: 'k...............', drumVol: 0.3, echo: 0.22, reverb: 0.45, mix: { drums: -6, bass: -3, pad: 1 }, loudness: -0.5,
    sections: {
      A: {
        chords: ['F', 'C', 'Dm', 'Bb', 'F', 'Gm', 'C', 'F'],
        melody: [
          'c5/8 f5/4 g5/4', 'e5/8 c5/8', 'd5/4 f5/4 a5/8', 'g5/12 r/4',
          'a5/6 bb5/2 c6/4 a5/4', 'g5/8 bb5/4 d5/4', 'c5/4 e5/4 g5/4 bb5/4', 'a5/16',
        ],
      },
      B: {
        lead: 'celesta', arp: 'pick',
        chords: ['Bb', 'F', 'Gm', 'Dm', 'Bb', 'C', 'Dm', 'C'],
        melody: [
          'd6/8 c6/4 bb5/4', 'a5/8 f5/8', 'g5/4 bb5/4 d6/8', 'f5/8 a5/8',
          'bb5/6 a5/2 g5/4 f5/4', 'e5/8 g5/4 c6/4', 'a5/6 g5/2 f5/4 d5/4', 'e5/8 g5/8',
        ],
      },
      A2: {
        harmony: true,
        chords: ['F', 'C', 'Dm', 'Bb', 'F', 'Gm', 'C', 'F'],
        melody: [
          'c5/8 f5/4 g5/4', 'e5/8 c5/8', 'd5/4 f5/4 a5/8', 'g5/12 r/4',
          'a5/6 bb5/2 c6/4 a5/4', 'g5/8 bb5/4 d5/4', 'c5/4 e5/4 g5/4 bb5/4', 'f5/16',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'reach', title: 'Drowned Light', bpm: 66, ceiling: 0.5, bar: 12, kbps: 64, tone: 1900,
    band: { lead: 'celesta', harmony: 'harp', pad: 'choirOo', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.18 }, bass: 'drone', arp: 'updown', arpVol: 0.07, padVol: 0.1,
    drums: '', echo: 0.4, reverb: 0.6, mix: { pad: 3, bass: -2, arp: -1 }, loudness: -1.5,
    sections: {
      A: {
        chords: ['Am7', 'Fmaj7', 'Cmaj7', 'G', 'Am7', 'Fmaj7', 'Em7', 'E'],
        melody: ['e5/8 c5/4', 'a5/8 g5/4', 'e5/12', 'd5/4 b4/4 g4/4', 'c5/4 e5/4 a5/4', 'c6/8 a5/4', 'g5/4 e5/4 d5/4', 'e5/12'],
      },
      B: {
        lead: 'flute',
        chords: ['Fmaj7', 'G', 'Em7', 'Am7', 'Dm7', 'G', 'Cmaj7', 'E'],
        melody: ['a5/8 c6/4', 'b5/6 a5/2 g5/4', 'g5/12', 'e5/4 a5/4 c6/4', 'f5/8 a5/4', 'd6/6 c6/2 b5/4', 'g5/12', 'g#5/12'],
      },
      A2: {
        harmony: true,
        chords: ['Am7', 'Fmaj7', 'Cmaj7', 'G', 'Am7', 'Fmaj7', 'Em7', 'E'],
        melody: ['e5/8 c5/4', 'a5/8 g5/4', 'e5/12', 'd5/4 b4/4 g4/4', 'c5/4 e5/4 a5/4', 'c6/8 a5/4', 'g5/4 e5/4 d5/4', 'e5/12'],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'crypt', title: 'Hollow Bells', bpm: 80, ceiling: 0.5, kbps: 64,
    band: { lead: 'cello', harmony: 'choirOo', pad: 'choirOo', arp: 'musicbox', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.21 }, bass: 'drone', arp: 'off', arpVol: 0.05, padVol: 0.09,
    drums: 'k.......t.......', drumVol: 0.35, echo: 0.36, reverb: 0.55, mix: { drums: -4, bass: -1, pad: 2 }, loudness: -1,
    sections: {
      A: {
        chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'C#dim', 'A'],
        melody: [
          'd4/8 a4/4 f4/4', 'bb4/8 a4/4 g4/4', 'g4/6 a4/2 bb4/8', 'a4/12 r/4',
          'f4/4 a4/4 d5/8', 'eb5/6 d5/2 bb4/8', 'c#5/4 e5/4 g5/4 e5/4', 'a4/16',
        ],
      },
      B: {
        lead: 'bells', arp: 'down',
        chords: ['Gm', 'Dm', 'Eb', 'A', 'Gm', 'Bb', 'A', 'A'],
        melody: [
          'g5/8 bb5/4 d6/4', 'a5/8 f5/8', 'g5/4 eb5/4 bb4/8', 'c#5/8 e5/8',
          'd5/4 g5/4 bb5/8', 'f5/6 d5/2 bb4/8', 'e5/4 c#5/4 a4/8', 'r/16',
        ],
      },
      A2: {
        harmony: true, arp: 'up',
        chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'C#dim', 'A'],
        melody: [
          'd4/8 a4/4 f4/4', 'bb4/8 a4/4 g4/4', 'g4/6 a4/2 bb4/8', 'a4/12 r/4',
          'f4/4 a4/4 d5/8', 'eb5/6 d5/2 bb4/8', 'c#5/4 e5/4 g5/4 e5/4', 'a4/16',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'steppe', title: 'Gravewind', bpm: 76, ceiling: 0.5, kbps: 64,
    band: { lead: 'ney', harmony: 'cello', pad: 'strings', arp: 'pizz', bass: 'contrabass', kit: 'hand' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'pick', arpVol: 0.07, padVol: 0.09,
    drums: 'k.....t.....t...', drumVol: 0.4, echo: 0.3, reverb: 0.45, mix: { drums: -3, pad: 1 },
    sections: {
      A: {
        leadOctave: 1,
        chords: ['Em', 'Em', 'C', 'B', 'Em', 'Am', 'F', 'B'],
        melody: [
          'e4/8 g4/4 f#4/4', 'e4/12 b3/4', 'c4/4 e4/4 g4/6 f#4/2', 'f#4/8 d#4/8',
          'e4/4 g4/4 b4/8', 'c5/6 b4/2 a4/8', 'f4/4 a4/4 c5/4 a4/4', 'b4/16',
        ],
      },
      B: {
        lead: 'cello', arp: 'off', drums: 'k.......t...t...',
        chords: ['Am', 'Em', 'F', 'B', 'Am', 'Em', 'C', 'B'],
        melody: [
          'a3/8 c4/4 e4/4', 'g4/6 f#4/2 e4/8', 'f4/4 a4/4 c5/8', 'b4/8 d#4/8',
          'a4/4 c5/4 e5/8', 'b4/6 g4/2 e4/8', 'g4/4 e4/4 c4/8', 'b3/16',
        ],
      },
      A2: {
        leadOctave: 1, harmony: true,
        chords: ['Em', 'Em', 'C', 'B', 'Em', 'Am', 'F', 'B'],
        melody: [
          'e4/8 g4/4 f#4/4', 'e4/12 b3/4', 'c4/4 e4/4 g4/6 f#4/2', 'f#4/8 d#4/8',
          'e4/4 g4/4 b4/8', 'c5/6 b4/2 a4/8', 'f4/4 a4/4 c5/4 a4/4', 'b4/16',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'boss', title: 'The Waiting Dark', bpm: 96, ceiling: 0.5, kbps: 64,
    band: { lead: 'horn', harmony: 'cello', pad: 'choir', arp: 'marcato', bass: 'contrabass', kit: 'taiko' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'up', arpVol: 0.06, padVol: 0.07,
    drums: 'k.......k.k.....', drumVol: 0.4, echo: 0.2, reverb: 0.4, mix: { drums: -2, arp: -2, pad: -1 },
    sections: {
      A: {
        chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Cm', 'Db', 'G'],
        melody: [
          'c5/8 eb5/4 d5/4', 'c5/4 g4/4 ab4/8', 'ab4/6 g4/2 f4/4 eb4/4', 'd4/12 r/4',
          'c5/8 bb4/4 g4/4', 'ab4/4 g4/4 eb4/8', 'db5/6 c5/2 ab4/8', 'b4/12 r/4',
        ],
      },
      B: {
        lead: 'strings', drums: 'k...t...k.k.t...',
        chords: ['Fm', 'Cm', 'Ab', 'Eb', 'Fm', 'Db', 'G', 'G'],
        melody: ['f5/8 ab5/8', 'g5/8 eb5/8', 'c6/8 ab5/8', 'g5/12 r/4', 'f5/4 ab5/4 c6/8', 'db6/8 c6/4 ab5/4', 'b5/8 d6/8', 'g5/16'],
      },
      A2: {
        harmony: true,
        chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Cm', 'Db', 'G'],
        melody: [
          'c5/8 eb5/4 d5/4', 'c5/4 g4/4 ab4/8', 'ab4/6 g4/2 f4/4 eb4/4', 'd4/12 r/4',
          'c5/8 bb4/4 g4/4', 'ab4/4 g4/4 eb4/8', 'db5/6 c5/2 ab4/8', 'b4/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },

  // ------------------------------------------------------------------ indoors: the calmest music in the game (no drums, 6+ dB quieter, mono)

  {
    id: 'shop', title: 'Quiet Counter', bpm: 72, ceiling: 0.22, bar: 12, kbps: 48, mono: true, tone: 5000, loudness: -5,
    band: { lead: 'lute', pad: 'strings', arp: 'harp', bass: 'upright', kit: 'soft' },
    lead: { vol: 0.18 }, bass: 'waltz', arp: 'pick', arpVol: 0.06, padVol: 0.06,
    drums: '', echo: 0.2, reverb: 0.3, mix: { pad: -3, bass: -4, arp: -2 },
    sections: {
      A: {
        chords: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'],
        melody: ['e5/8 g5/4', 'c5/8 e5/4', 'a4/4 c5/4 f5/4', 'd5/8 r/4', 'e5/4 g5/4 c6/4', 'b5/8 g5/4', 'a5/6 g5/2 f5/4', 'd5/12'],
      },
      B: {
        lead: 'musicbox',
        chords: ['F', 'C', 'Dm', 'G', 'Am', 'F', 'G', 'C'],
        melody: ['a5/8 c6/4', 'g5/8 e5/4', 'f5/4 d5/4 a4/4', 'b4/8 d5/4', 'c5/4 e5/4 a5/4', 'a5/6 g5/2 f5/4', 'd5/4 f5/4 b4/4', 'c5/12'],
      },
    },
    form: ['A', 'B', 'A'],
  },
  {
    id: 'hall', title: 'Ledger and Lamp', bpm: 64, ceiling: 0.22, kbps: 48, mono: true, tone: 4500, loudness: -7,
    band: { lead: 'flute', pad: 'strings', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.17 }, bass: 'drone', arp: 'updown', arpVol: 0.06, padVol: 0.08,
    drums: '', echo: 0.24, reverb: 0.42, mix: { lead: -1, bass: -4, arp: -2 },
    sections: {
      A: {
        chords: ['Eb', 'Bb', 'Cm', 'Ab', 'Eb', 'Gm', 'Ab', 'Bb'],
        melody: ['g5/8 bb5/8', 'f5/12 d5/4', 'eb5/8 g5/8', 'c5/16', 'bb4/8 eb5/4 g5/4', 'bb5/8 d5/8', 'c5/8 eb5/4 ab5/4', 'f5/16'],
      },
      B: {
        chords: ['Ab', 'Eb', 'Fm', 'Bb', 'Cm', 'Ab', 'Bb', 'Eb'],
        melody: ['c6/8 ab5/8', 'g5/8 eb5/8', 'f5/4 ab5/4 c6/8', 'bb5/16', 'g5/8 eb5/8', 'ab5/4 c6/4 eb6/8', 'd6/8 bb5/8', 'eb6/16'],
      },
    },
    form: ['A', 'B'],
  },
  {
    id: 'temple', title: 'Votive', bpm: 60, ceiling: 0.22, kbps: 48, mono: true, tone: 4500, loudness: -7,
    band: { lead: 'strings', pad: 'choirOo', arp: 'harp', bass: 'contrabass', kit: 'soft' },
    lead: { vol: 0.18 }, bass: 'drone', arp: 'up', arpVol: 0.05, padVol: 0.1,
    drums: '', echo: 0.26, reverb: 0.55, mix: { pad: 3, bass: -4, arp: -3 },
    sections: {
      A: {
        chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'],
        melody: ['a4/8 c5/8', 'd5/8 f5/8', 'd5/12 bb4/4', 'c5/16', 'a4/8 f5/8', 'e5/8 c5/8', 'd5/8 f5/8', 'e5/16'],
      },
      B: {
        lead: 'flute',
        chords: ['Dm', 'Bb', 'F', 'C', 'Bb', 'F', 'Gm', 'F'],
        melody: ['f5/8 a5/8', 'bb5/8 f5/8', 'a5/8 c6/8', 'g5/16', 'f5/8 d5/8', 'c5/8 a4/8', 'bb4/8 d5/8', 'c5/16'],
      },
    },
    form: ['A', 'B'],
  },
  {
    id: 'smithy', title: 'Banked Embers', bpm: 92, ceiling: 0.22, kbps: 48, mono: true, tone: 5000, loudness: -4.5,
    band: { lead: 'lute', pad: 'strings', arp: 'marimba', bass: 'pizz', kit: 'soft' },
    lead: { vol: 0.18 }, bass: 'pump', arp: 'pick', arpVol: 0.06, padVol: 0.05,
    drums: 'k.......k.......', drumVol: 0.25, echo: 0.16, reverb: 0.28, mix: { drums: -8, pad: -4, bass: -3, arp: -3 },
    sections: {
      A: {
        chords: ['Am', 'G', 'Am', 'Em', 'F', 'G', 'Am', 'E'],
        melody: [
          'a4/4 c5/4 e5/6 d5/2', 'b4/4 d5/4 g5/8', 'a5/6 g5/2 e5/4 c5/4', 'b4/12 r/4',
          'a4/4 c5/4 f5/8', 'g5/4 f5/2 e5/2 d5/8', 'c5/4 e5/4 a5/8', 'g#5/12 r/4',
        ],
      },
      B: {
        lead: 'guitar',
        chords: ['C', 'G', 'Am', 'Em', 'F', 'G', 'E', 'E'],
        melody: ['e5/4 g5/4 c6/8', 'd6/6 b5/2 g5/8', 'a5/4 c6/4 e6/8', 'b5/12 r/4', 'a5/4 f5/4 c5/8', 'd5/4 g5/4 b5/8', 'g#5/8 b5/8', 'e5/12 r/4'],
      },
    },
    form: ['A', 'B', 'A'],
  },
];
