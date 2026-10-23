import type { Song } from './synth';

/**
 * Themes of their own for every town (each in its people's style) and for the families of hunting
 * grounds that the land mix can't tell apart (orc warcamps, the minotaur labyrinth, dwarven mines,
 * dragon lairs, jungle temples, desert tombs). Original pieces in the same format as songs.ts; the
 * places that play them are in src/audio/musicPlaces.ts (TOWN_THEMES, REGION_THEMES).
 * All outdoor level (look-ahead limiter at -6 dBFS), 56–64 kbit/s AAC to keep the downloads small.
 */
export const PLACE_SONGS: Song[] = [
  // ------------------------------------------------------------------ towns
  {
    id: 'westmarch', title: 'The Westmarch Banners', bpm: 84, ceiling: 0.5, kbps: 56, loudness: -0.6,
    band: { lead: 'horn', harmony: 'strings', pad: 'strings', arp: 'harp', bass: 'contrabass', kit: 'orchestral' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'updown', arpVol: 0.08, padVol: 0.08,
    drums: 'k.......k...t...', drumVol: 0.35, echo: 0.18, reverb: 0.4, mix: { drums: -4, bass: -2 },
    sections: {
      A: {
        chords: ['D', 'G', 'A', 'D', 'Bm', 'G', 'Em', 'A'],
        melody: [
          'd5/6 f#5/2 a5/8', 'b5/4 a5/4 g5/4 f#5/4', 'e5/6 f#5/2 g5/4 e5/4', 'f#5/12 r/4',
          'd5/4 f#5/4 b5/6 a5/2', 'g5/4 b5/4 d6/8', 'e6/4 d6/2 c#6/2 b5/4 g5/4', 'a5/12 r/4',
        ],
      },
      B: {
        lead: 'strings', drums: 'k...t...k...t.t.',
        chords: ['G', 'D', 'Em', 'Bm', 'G', 'D', 'E', 'A'],
        melody: ['b5/8 d6/8', 'a5/6 f#5/2 d5/8', 'g5/4 b5/4 e6/8', 'd6/12 r/4', 'b5/4 d6/4 g6/8', 'f#6/6 e6/2 d6/8', 'e6/4 g#5/4 b5/8', 'c#6/8 e5/8'],
      },
      A2: {
        harmony: true,
        chords: ['D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D'],
        melody: [
          'd5/6 f#5/2 a5/8', 'b5/4 a5/4 g5/4 f#5/4', 'e5/6 f#5/2 g5/4 e5/4', 'f#5/12 r/4',
          'd5/4 f#5/4 b5/6 a5/2', 'g5/4 b5/4 d6/8', 'e6/4 d6/2 c#6/2 b5/4 e5/4', 'd5/16',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'elderglen', title: 'Silverleaf', bpm: 72, bar: 12, ceiling: 0.5, kbps: 56,
    band: { lead: 'flute', harmony: 'harp', pad: 'choirOo', arp: 'harp', bass: 'pizz', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'waltz', arp: 'updown', arpRate: 16, arpVol: 0.07, padVol: 0.08,
    drums: '', echo: 0.3, reverb: 0.5, mix: { pad: 1, bass: -4, arp: -1 },
    sections: {
      A: {
        chords: ['F', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'C'],
        melody: ['c5/4 f5/4 a5/4', 'b5/6 a5/2 g5/4', 'a5/8 e5/4', 'f5/12', 'd5/4 f5/4 a5/4', 'b5/4 d6/4 b5/4', 'c6/8 g5/4', 'e5/12'],
      },
      B: {
        lead: 'harp', arp: 'up',
        chords: ['Dm', 'Am', 'G', 'C', 'Dm', 'Am', 'G', 'G'],
        melody: ['f6/4 e6/4 d6/4', 'c6/8 a5/4', 'b5/4 a5/2 g5/2 d5/4', 'e5/12', 'f5/2 a5/2 d6/8', 'e6/6 c6/2 a5/4', 'b5/4 g5/4 d6/4', 'b5/12'],
      },
      A2: {
        harmony: true,
        chords: ['F', 'G', 'Am', 'F', 'Dm', 'G', 'C', 'C'],
        melody: ['c5/4 f5/4 a5/4', 'b5/6 a5/2 g5/4', 'a5/8 e5/4', 'f5/12', 'd5/4 f5/4 a5/4', 'b5/4 d6/4 b5/4', 'c6/8 g5/4', 'e5/12'],
      },
      B2: {
        harmony: true, leadOctave: -1,
        chords: ['Dm', 'Am', 'G', 'C', 'Dm', 'Am', 'G', 'G'],
        melody: ['f6/4 e6/4 d6/4', 'c6/8 a5/4', 'b5/4 a5/2 g5/2 d5/4', 'e5/12', 'f5/2 a5/2 d6/8', 'e6/6 c6/2 a5/4', 'b5/4 g5/4 d6/4', 'b5/12'],
      },
    },
    form: ['A', 'B', 'A2', 'B2'],
  },
  {
    id: 'stonedeep', title: 'Anvil and Root', bpm: 88, ceiling: 0.5, kbps: 56,
    band: { lead: 'horn', harmony: 'tuba', pad: 'choir', arp: 'pizz', bass: 'contrabass', kit: 'forge' },
    lead: { vol: 0.21 }, bass: 'root8', arp: 'off', arpVol: 0.08, padVol: 0.07,
    drums: 'k...s...k.k.s..h', drumVol: 0.45, echo: 0.16, reverb: 0.42, mix: { drums: 1, pad: -1 },
    sections: {
      A: {
        chords: ['Dm', 'G', 'Dm', 'C', 'Dm', 'G', 'Am', 'Dm'],
        melody: [
          'd4/6 f4/2 a4/8', 'g4/4 b4/4 d5/8', 'c5/6 a4/2 f4/4 d4/4', 'e4/12 r/4',
          'd4/4 a4/4 d5/6 c5/2', 'b4/4 g4/4 d4/8', 'e4/4 g4/4 a4/4 c5/4', 'd5/12 r/4',
        ],
      },
      B: {
        lead: 'brass', arp: 'up', drums: 'k.h.s.h.k.k.s.hp',
        chords: ['Bb', 'F', 'C', 'Am', 'Bb', 'C', 'Dm', 'Dm'],
        melody: ['f5/8 d5/8', 'c5/6 a4/2 f4/8', 'g4/4 c5/4 e5/8', 'a4/12 r/4', 'bb4/4 d5/4 f5/8', 'e5/6 d5/2 c5/8', 'd5/4 a4/4 f4/4 a4/4', 'd4/12 r/4'],
      },
      A2: {
        harmony: true,
        chords: ['Dm', 'G', 'Dm', 'C', 'Dm', 'G', 'Am', 'Dm'],
        melody: [
          'd4/6 f4/2 a4/8', 'g4/4 b4/4 d5/8', 'c5/6 a4/2 f4/4 d4/4', 'e4/12 r/4',
          'd4/4 a4/4 d5/6 c5/2', 'b4/4 g4/4 d4/8', 'e4/4 g4/4 a4/4 c5/4', 'd5/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'highmoor', title: 'Heather and Pipe', bpm: 92, bar: 12, ceiling: 0.5, kbps: 56,
    band: { lead: 'pipes', harmony: 'fiddle', pad: 'pipes', arp: 'guitar', bass: 'contrabass', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'off', arpVol: 0.09, padVol: 0.04,
    drums: 'k.....k..s..', drumVol: 0.42, echo: 0.14, reverb: 0.3, mix: { pad: -3, bass: -2, drums: -1 },
    sections: {
      A: {
        chords: ['A', 'G', 'A', 'D', 'A', 'G', 'D', 'A'],
        melody: [
          'a5/4 e5/2 a5/2 c#6/2 b5/2', 'g5/4 d5/2 g5/2 b5/2 g5/2', 'a5/4 c#6/2 e6/4 c#6/2', 'd6/4 b5/2 a5/4 f#5/2',
          'e5/4 a5/2 c#6/2 b5/2 a5/2', 'g5/4 b5/2 d6/4 b5/2', 'a5/2 f#5/2 d5/2 f#5/2 e5/2 d5/2', 'c#5/4 e5/2 a5/6',
        ],
      },
      A2: {
        harmony: true, arp: 'strum',
        chords: ['A', 'G', 'A', 'D', 'A', 'G', 'D', 'A'],
        melody: [
          'a5/4 e5/2 a5/2 c#6/2 b5/2', 'g5/4 d5/2 g5/2 b5/2 g5/2', 'a5/4 c#6/2 e6/4 c#6/2', 'd6/4 b5/2 a5/4 f#5/2',
          'e5/4 a5/2 c#6/2 b5/2 a5/2', 'g5/4 b5/2 d6/4 b5/2', 'a5/2 f#5/2 d5/2 f#5/2 e5/2 d5/2', 'c#5/4 e5/2 a5/6',
        ],
      },
      B: {
        lead: 'fiddle', arp: 'strum', noPad: true,
        chords: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'G', 'A'],
        melody: [
          'f#5/4 a5/2 c#6/4 a5/2', 'd6/4 a5/2 f#5/4 d5/2', 'e5/4 a5/2 c#6/2 e6/2 c#6/2', 'b5/6 g#5/4 e5/2',
          'f#5/2 g#5/2 a5/2 c#6/4 a5/2', 'f#5/4 d6/2 a5/4 f#5/2', 'g5/4 b5/2 d6/4 b5/2', 'a5/12',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'millbrook', title: 'Millbrook Green', bpm: 96, ceiling: 0.5, kbps: 56,
    band: { lead: 'dulcimer', harmony: 'whistle', pad: 'accordion', arp: 'guitar', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'walk', arp: 'pick', arpVol: 0.1, padVol: 0.05,
    drums: 'k...h...k.h.h...', drumVol: 0.36, echo: 0.18, swing: 0.06, reverb: 0.26, mix: { drums: -4, pad: -2 },
    sections: {
      A: {
        chords: ['G', 'C', 'G', 'D', 'Em', 'C', 'D', 'G'],
        melody: [
          'g5/4 b5/4 d6/4 b5/4', 'c6/4 e6/4 d6/2 c6/2 b5/4', 'a5/2 b5/2 g5/4 d5/8', 'f#5/4 a5/4 d5/8',
          'e5/2 f#5/2 g5/4 b5/4 e6/4', 'e6/4 d6/4 c6/4 a5/4', 'b5/4 a5/4 f#5/4 a5/4', 'g5/12 r/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['G', 'C', 'G', 'D', 'Em', 'C', 'D', 'G'],
        melody: [
          'g5/4 b5/4 d6/4 b5/4', 'c6/4 e6/4 d6/2 c6/2 b5/4', 'a5/2 b5/2 g5/4 d5/8', 'f#5/4 a5/4 d5/8',
          'e5/2 f#5/2 g5/4 b5/4 e6/4', 'e6/4 d6/4 c6/4 a5/4', 'b5/4 a5/4 f#5/4 a5/4', 'g5/12 r/4',
        ],
      },
      B: {
        lead: 'whistle', arp: 'strum',
        chords: ['C', 'G', 'Am', 'D', 'C', 'Bm', 'Am', 'D'],
        melody: [
          'e6/6 d6/2 c6/8', 'b5/4 d6/4 g5/8', 'a5/4 c6/4 e6/4 c6/4', 'd6/12 r/4',
          'c6/4 e6/4 g6/8', 'f#6/6 d6/2 b5/8', 'c6/4 a5/4 e5/4 c6/4', 'a5/4 c6/4 d6/4 f#5/4',
        ],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'valdrheim', title: 'Hearthsmoke Fjord', bpm: 76, ceiling: 0.5, kbps: 56, loudness: -0.6,
    band: { lead: 'hardanger', harmony: 'cello', pad: 'strings', arp: 'harp', bass: 'throat', kit: 'frame' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'pick', arpVol: 0.06, padVol: 0.06,
    drums: 'k.......k..k....', drumVol: 0.45, echo: 0.24, reverb: 0.45, mix: { bass: 1, pad: -2, arp: -2, drums: -1 },
    sections: {
      A: {
        chords: ['Em', 'D', 'Em', 'C', 'Em', 'D', 'Bm', 'Em'],
        melody: [
          'e5/6 g5/2 b5/8', 'a5/4 f#5/4 d5/8', 'e5/4 g5/4 b5/4 d6/4', 'c6/6 b5/2 g5/8',
          'e5/4 b5/4 e6/6 d6/2', 'a5/4 d6/4 f#5/8', 'b5/6 a5/2 f#5/4 d5/4', 'e5/12 r/4',
        ],
      },
      B: {
        lead: 'horn', arp: 'off', drums: 'k...t...k..kt...',
        chords: ['Am', 'Em', 'D', 'Em', 'C', 'G', 'D', 'Em'],
        melody: ['a4/8 c5/4 e5/4', 'b4/12 g4/4', 'f#4/4 a4/4 d5/8', 'e5/12 r/4', 'e5/4 g5/4 c5/8', 'd5/6 b4/2 g4/8', 'a4/4 f#4/4 d4/8', 'e4/16'],
      },
      A2: {
        harmony: true,
        chords: ['Em', 'D', 'Em', 'C', 'Em', 'D', 'Bm', 'Em'],
        melody: [
          'e5/6 g5/2 b5/8', 'a5/4 f#5/4 d5/8', 'e5/4 g5/4 b5/4 d6/4', 'c6/6 b5/2 g5/8',
          'e5/4 b5/4 e6/6 d6/2', 'a5/4 d6/4 f#5/8', 'b5/6 a5/2 f#5/4 d5/4', 'e5/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'aurelion', title: 'Crown of Aurelion', bpm: 96, ceiling: 0.5, kbps: 56, loudness: -0.5,
    band: { lead: 'brass', harmony: 'horn', pad: 'strings', arp: 'harp', bass: 'contrabass', kit: 'orchestral' },
    lead: { vol: 0.21 }, bass: 'pump', arp: 'updown', arpVol: 0.08, padVol: 0.08,
    drums: 'k.....s.k.k.s...', drumVol: 0.42, echo: 0.14, reverb: 0.36, mix: { drums: -2, bass: -1 },
    sections: {
      A: {
        chords: ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'Eb', 'F', 'Bb'],
        melody: [
          'bb4/6 d5/2 f5/8', 'f5/4 a5/4 c6/8', 'bb5/6 a5/2 g5/4 d5/4', 'eb5/12 r/4',
          'f5/4 bb5/4 d6/6 c6/2', 'bb5/4 g5/4 eb5/8', 'f5/4 a5/4 c6/4 eb6/4', 'd6/12 r/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['Bb', 'F', 'Gm', 'Eb', 'Bb', 'Eb', 'F', 'Bb'],
        melody: [
          'bb4/6 d5/2 f5/8', 'f5/4 a5/4 c6/8', 'bb5/6 a5/2 g5/4 d5/4', 'eb5/12 r/4',
          'f5/4 bb5/4 d6/6 c6/2', 'bb5/4 g5/4 eb5/8', 'f5/4 a5/4 c6/4 eb6/4', 'd6/12 r/4',
        ],
      },
      B: {
        lead: 'strings', drums: 'k.......k...t...',
        chords: ['Eb', 'Bb', 'Cm', 'F', 'Eb', 'Bb', 'Cm', 'F'],
        melody: ['g5/8 bb5/8', 'f5/6 d5/2 bb4/8', 'c5/4 eb5/4 g5/8', 'f5/12 r/4', 'g5/4 bb5/4 eb6/8', 'd6/6 bb5/2 f5/8', 'eb5/4 g5/4 c6/6 bb5/2', 'a5/8 c6/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'briarwatch', title: 'Briarwatch Palisade', bpm: 108, ceiling: 0.5, kbps: 56, loudness: -0.7,
    band: { lead: 'fiddle', harmony: 'whistle', pad: 'strings', arp: 'guitar', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'gallop', arp: 'strum', arpVol: 0.12, padVol: 0.05,
    drums: 'k..hs.h.k.khs.h.', drumVol: 0.45, echo: 0.14, reverb: 0.24, mix: { pad: -3, drums: -1 },
    sections: {
      A: {
        chords: ['Em', 'D', 'C', 'D', 'Em', 'G', 'Am', 'B'],
        melody: [
          'e5/4 g5/2 b5/2 e6/4 d6/4', 'f#5/4 a5/2 d6/2 c6/4 a5/4', 'g5/2 e5/2 c5/4 e5/4 g5/4', 'f#5/8 d5/8',
          'e5/4 b5/4 g5/2 b5/2 e6/4', 'd6/4 b5/4 g5/8', 'a5/2 b5/2 c6/4 e6/4 a5/4', 'b5/12 r/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['Em', 'D', 'C', 'D', 'Em', 'G', 'Am', 'B'],
        melody: [
          'e5/4 g5/2 b5/2 e6/4 d6/4', 'f#5/4 a5/2 d6/2 c6/4 a5/4', 'g5/2 e5/2 c5/4 e5/4 g5/4', 'f#5/8 d5/8',
          'e5/4 b5/4 g5/2 b5/2 e6/4', 'd6/4 b5/4 g5/8', 'a5/2 b5/2 c6/4 e6/4 a5/4', 'b5/12 r/4',
        ],
      },
      B: {
        lead: 'whistle', arp: 'pick',
        chords: ['C', 'G', 'D', 'Em', 'C', 'G', 'Am', 'B'],
        melody: ['e6/6 d6/2 c6/8', 'b5/4 d6/4 g5/8', 'a5/4 f#5/4 d5/8', 'e5/8 g5/4 b5/4', 'c6/4 e6/4 g5/8', 'b5/6 a5/2 g5/8', 'c6/4 b5/4 a5/4 e5/4', 'd#5/8 f#5/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'harbour', title: 'Tar and Tide', bpm: 112, ceiling: 0.5, kbps: 56,
    band: { lead: 'concertina', harmony: 'fiddle', pad: 'accordion', arp: 'guitar', bass: 'upright', kit: 'folk' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'strum', arpVol: 0.11, padVol: 0.05,
    drums: 'k...s...k.k.s...', drumVol: 0.45, echo: 0.16, swing: 0.1, reverb: 0.26, mix: { pad: -3, drums: -1 },
    sections: {
      A: {
        chords: ['Dm', 'C', 'Dm', 'A', 'Dm', 'F', 'C', 'Dm'],
        melody: [
          'd5/2 f5/2 a5/4 a5/2 g5/2 f5/4', 'e5/2 g5/2 c6/4 c6/2 b5/2 g5/4', 'a5/6 f5/2 d5/4 f5/4', 'e5/8 c#5/4 a4/4',
          'd5/2 f5/2 a5/4 d6/4 c6/2 a5/2', 'c6/6 a5/2 f5/4 a5/4', 'g5/4 e5/2 g5/2 c6/4 e5/4', 'd5/12 r/4',
        ],
      },
      A2: {
        harmony: true,
        chords: ['Dm', 'C', 'Dm', 'A', 'Dm', 'F', 'C', 'Dm'],
        melody: [
          'd5/2 f5/2 a5/4 a5/2 g5/2 f5/4', 'e5/2 g5/2 c6/4 c6/2 b5/2 g5/4', 'a5/6 f5/2 d5/4 f5/4', 'e5/8 c#5/4 a4/4',
          'd5/2 f5/2 a5/4 d6/4 c6/2 a5/2', 'c6/6 a5/2 f5/4 a5/4', 'g5/4 e5/2 g5/2 c6/4 e5/4', 'd5/12 r/4',
        ],
      },
      B: {
        lead: 'fiddle', arp: 'pick',
        chords: ['F', 'C', 'Dm', 'Am', 'Bb', 'F', 'G', 'A'],
        melody: ['a5/4 c6/4 f6/8', 'e6/6 d6/2 c6/8', 'd6/4 a5/4 f5/4 a5/4', 'e5/12 r/4', 'f5/4 bb5/4 d6/8', 'c6/6 a5/2 f5/8', 'g5/4 b5/4 d6/4 b5/4', 'c#6/8 e6/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'palmreach', title: 'Palmreach Tide', bpm: 104, ceiling: 0.5, kbps: 56, loudness: 1.5,
    band: { lead: 'steelpan', harmony: 'marimba', pad: 'choirOo', arp: 'marimba', bass: 'upright', kit: 'hand' },
    lead: { vol: 0.2 }, bass: 'root8', arp: 'off', arpVol: 0.08, padVol: 0.05,
    drums: 'k..pk.p.k..pk.t.', drumVol: 0.5, echo: 0.2, swing: 0.1, reverb: 0.28, mix: { pad: -3 },
    sections: {
      A: {
        chords: ['C', 'F', 'C', 'G', 'C', 'Bb', 'F', 'G'],
        melody: [
          'e5/3 g5/3 c6/2 g5/4 e5/4', 'f5/3 a5/3 c6/2 a5/4 f5/4', 'g5/2 e5/2 c5/4 e5/2 g5/2 e5/4', 'd5/8 b4/4 d5/4',
          'e5/3 g5/3 c6/2 e6/4 d6/4', 'bb5/3 d6/3 f6/2 d6/4 bb5/4', 'a5/4 c6/4 f5/4 a5/4', 'g5/12 r/4',
        ],
      },
      A2: {
        harmony: true, arp: 'updown',
        chords: ['C', 'F', 'C', 'G', 'C', 'Bb', 'F', 'G'],
        melody: [
          'e5/3 g5/3 c6/2 g5/4 e5/4', 'f5/3 a5/3 c6/2 a5/4 f5/4', 'g5/2 e5/2 c5/4 e5/2 g5/2 e5/4', 'd5/8 b4/4 d5/4',
          'e5/3 g5/3 c6/2 e6/4 d6/4', 'bb5/3 d6/3 f6/2 d6/4 bb5/4', 'a5/4 c6/4 f5/4 a5/4', 'g5/12 r/4',
        ],
      },
      B: {
        lead: 'marimba', arp: 'up',
        chords: ['Am', 'Em', 'F', 'C', 'Dm', 'Bb', 'G', 'G'],
        melody: ['a5/4 c6/4 e6/4 c6/4', 'b5/6 g5/2 e5/8', 'f5/2 a5/2 c6/4 f6/4 c6/4', 'e6/12 r/4', 'd6/4 a5/4 f5/4 d5/4', 'bb5/6 d6/2 f6/8', 'g5/4 b5/4 d6/4 f6/4', 'e6/4 d6/4 b5/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'oasis', title: 'Sunspire Bazaar', bpm: 100, ceiling: 0.5, kbps: 56, loudness: 0.7,
    band: { lead: 'oud', harmony: 'ney', pad: 'strings', arp: 'dulcimer', bass: 'upright', kit: 'darbuka' },
    lead: { vol: 0.2 }, bass: 'pump', arp: 'off', arpVol: 0.07, padVol: 0.05,
    drums: 'k.s.p.s.k.p.s.pp', drumVol: 0.5, echo: 0.22, reverb: 0.3, mix: { pad: -3 },
    sections: {
      A: {
        chords: ['E', 'F', 'E', 'Dm', 'E', 'Am', 'F', 'E'],
        melody: [
          'e5/2 f5/2 g#5/4 a5/2 g#5/2 f5/4', 'e5/2 f5/2 a5/4 c6/4 a5/4', 'b5/4 g#5/2 f5/2 e5/8', 'd5/2 e5/2 f5/4 a5/4 d6/4',
          'e6/4 d6/2 c6/2 b5/4 g#5/4', 'a5/6 c6/2 e5/8', 'f5/2 g#5/2 a5/4 g#5/2 f5/2 d5/4', 'e5/12 r/4',
        ],
      },
      A2: {
        harmony: true, arp: 'up',
        chords: ['E', 'F', 'E', 'Dm', 'E', 'Am', 'F', 'E'],
        melody: [
          'e5/2 f5/2 g#5/4 a5/2 g#5/2 f5/4', 'e5/2 f5/2 a5/4 c6/4 a5/4', 'b5/4 g#5/2 f5/2 e5/8', 'd5/2 e5/2 f5/4 a5/4 d6/4',
          'e6/4 d6/2 c6/2 b5/4 g#5/4', 'a5/6 c6/2 e5/8', 'f5/2 g#5/2 a5/4 g#5/2 f5/2 d5/4', 'e5/12 r/4',
        ],
      },
      B: {
        lead: 'ney', arp: 'updown', drums: 'k.s...s.k...s...',
        chords: ['Am', 'G', 'F', 'E', 'Am', 'Dm', 'F', 'E'],
        melody: ['a5/8 c6/4 b5/4', 'g5/6 b5/2 d6/8', 'c6/4 a5/4 f5/8', 'g#5/12 r/4', 'a5/4 c6/4 e6/8', 'd6/6 c6/2 a5/8', 'f5/4 a5/4 c6/2 b5/2 a5/4', 'g#5/8 e5/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    id: 'isle', title: "Wayfarer's Welcome", bpm: 80, bar: 12, ceiling: 0.5, kbps: 56,
    band: { lead: 'flute', harmony: 'celesta', pad: 'strings', arp: 'harp', bass: 'pizz', kit: 'soft' },
    lead: { vol: 0.2 }, bass: 'waltz', arp: 'pick', arpVol: 0.07, padVol: 0.07,
    drums: 'k...........', drumVol: 0.3, echo: 0.22, reverb: 0.4, mix: { drums: -6, bass: -3 }, loudness: -0.5,
    sections: {
      A: {
        chords: ['C', 'G', 'Am', 'F', 'C', 'F', 'G', 'G'],
        melody: ['e5/4 g5/4 c6/4', 'd6/6 b5/2 g5/4', 'a5/4 c6/4 e5/4', 'f5/8 a5/4', 'g5/4 e5/4 c5/4', 'a5/4 c6/4 f5/4', 'g5/4 b5/4 d6/4', 'g5/12'],
      },
      B: {
        lead: 'recorder',
        chords: ['F', 'C', 'Dm', 'G', 'F', 'C', 'G', 'C'],
        melody: ['a5/6 g5/2 f5/4', 'e5/8 g5/4', 'f5/4 a5/4 d6/4', 'b5/12', 'c6/4 a5/4 f5/4', 'e5/4 g5/4 c6/4', 'd6/6 b5/2 g5/4', 'c6/12'],
      },
      A2: {
        harmony: true,
        chords: ['C', 'G', 'Am', 'F', 'C', 'F', 'G', 'G'],
        melody: ['e5/4 g5/4 c6/4', 'd6/6 b5/2 g5/4', 'a5/4 c6/4 e5/4', 'f5/8 a5/4', 'g5/4 e5/4 c5/4', 'a5/4 c6/4 f5/4', 'g5/4 b5/4 d6/4', 'g5/12'],
      },
      B2: {
        harmony: true,
        chords: ['F', 'C', 'Dm', 'G', 'F', 'C', 'G', 'C'],
        melody: ['a5/6 g5/2 f5/4', 'e5/8 g5/4', 'f5/4 a5/4 d6/4', 'b5/12', 'c6/4 a5/4 f5/4', 'e5/4 g5/4 c6/4', 'd6/6 b5/2 g5/4', 'c6/12'],
      },
    },
    form: ['A', 'B', 'A2', 'B2'],
  },

  // ------------------------------------------------------------------ hunting grounds
  {
    id: 'warcamp', title: 'Grimtusk Drums', bpm: 100, ceiling: 0.5, kbps: 56,
    band: { lead: 'brass', harmony: 'horn', pad: 'choir', arp: 'marcato', bass: 'contrabass', kit: 'war' },
    lead: { vol: 0.21 }, bass: 'root8', arp: 'up', arpRate: 16, arpOctave: -1, arpVol: 0.06, padVol: 0.06,
    drums: 'k.k.s..kk.k.s.t.', drumVol: 0.6, echo: 0.12, reverb: 0.3, mix: { drums: 3, arp: -2, pad: -1 },
    sections: {
      A: {
        chords: ['Am', 'Bb', 'Am', 'G', 'Am', 'Bb', 'F', 'E'],
        melody: [
          'a4/6 c5/2 e5/8', 'f5/4 d5/4 bb4/8', 'a4/4 e5/4 c5/4 a4/4', 'b4/8 g4/4 d5/4',
          'a4/4 c5/4 e5/6 f5/2', 'f5/4 d5/4 bb4/8', 'c5/4 f5/4 a5/4 f5/4', 'e5/8 g#4/8',
        ],
      },
      A2: {
        harmony: true,
        chords: ['Am', 'Bb', 'Am', 'G', 'Am', 'Bb', 'F', 'E'],
        melody: [
          'a4/6 c5/2 e5/8', 'f5/4 d5/4 bb4/8', 'a4/4 e5/4 c5/4 a4/4', 'b4/8 g4/4 d5/4',
          'a4/4 c5/4 e5/6 f5/2', 'f5/4 d5/4 bb4/8', 'c5/4 f5/4 a5/4 f5/4', 'e5/8 g#4/8',
        ],
      },
      B: {
        lead: 'horn', drums: 'k.kks.kkk.kks.tt',
        chords: ['Dm', 'Am', 'Bb', 'E', 'Dm', 'Am', 'Bb', 'E'],
        melody: ['d5/8 f5/4 a5/4', 'e5/6 c5/2 a4/8', 'bb4/4 d5/4 f5/4 d5/4', 'e5/12 r/4', 'f5/4 a5/4 d6/8', 'c6/6 a5/2 e5/8', 'f5/4 d5/4 bb4/4 d5/4', 'g#4/8 b4/8'],
      },
    },
    form: ['A', 'A2', 'B', 'A2'],
  },
  {
    // 7/8 (2+2+3): a melody that keeps turning back on itself
    id: 'labyrinth', title: 'The Horned Maze', bpm: 92, bar: 14, ceiling: 0.5, kbps: 56,
    band: { lead: 'horn', harmony: 'cello', pad: 'strings', arp: 'marcato', bass: 'contrabass', kit: 'taiko' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'updown', arpOctave: -1, arpVol: 0.06, padVol: 0.07,
    drums: 'k...t...k..t.p', drumVol: 0.48, echo: 0.2, reverb: 0.38, mix: { drums: 1, arp: -2 },
    sections: {
      A: {
        chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],
        melody: ['d5/4 f5/4 a5/6', 'bb5/4 a5/4 f5/6', 'g5/4 bb5/4 d6/6', 'c#6/4 a5/4 e5/6', 'f5/4 a5/4 d6/6', 'd6/4 bb5/4 f5/6', 'g5/4 f5/4 e5/6', 'e5/4 c#5/4 a4/6'],
      },
      B: {
        lead: 'cello',
        chords: ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Bb', 'A'],
        melody: ['g4/8 bb4/6', 'a4/4 f4/4 d4/6', 'f4/4 bb4/4 d5/6', 'c#5/14', 'd5/4 bb4/4 g4/6', 'a4/4 d5/4 f5/6', 'e5/4 d5/4 bb4/6', 'a4/14'],
      },
      A2: {
        harmony: true,
        chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],
        melody: ['d5/4 f5/4 a5/6', 'bb5/4 a5/4 f5/6', 'g5/4 bb5/4 d6/6', 'c#6/4 a5/4 e5/6', 'f5/4 a5/4 d6/6', 'd6/4 bb5/4 f5/6', 'g5/4 f5/4 e5/6', 'e5/4 c#5/4 a4/6'],
      },
      B2: {
        lead: 'strings', drums: 'k.k.t...k.kt.p',
        chords: ['Gm', 'Dm', 'Bb', 'A', 'Gm', 'Dm', 'Bb', 'A'],
        melody: ['g5/8 bb5/6', 'a5/4 f5/4 d5/6', 'f5/4 bb5/4 d6/6', 'c#6/14', 'd6/4 bb5/4 g5/6', 'a5/4 d6/4 f6/6', 'e6/4 d6/4 bb5/6', 'a5/14'],
      },
    },
    form: ['A', 'B', 'A2', 'B2'],
  },
  {
    id: 'mines', title: 'Pick and Lantern', bpm: 92, ceiling: 0.5, kbps: 56,
    band: { lead: 'cello', harmony: 'horn', pad: 'choirOo', arp: 'kalimba', bass: 'contrabass', kit: 'forge' },
    lead: { vol: 0.21 }, bass: 'root8', arp: 'pick', arpVol: 0.05, padVol: 0.07,
    drums: 'k..hh..hk.h.s..h', drumVol: 0.45, echo: 0.28, reverb: 0.46, mix: { arp: -4, bass: -2 },
    sections: {
      A: {
        chords: ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Gm', 'A'],
        melody: [
          'd4/4 a4/4 f4/4 a4/4', 'e4/4 g4/4 c5/8', 'bb4/6 a4/2 f4/4 d4/4', 'c#4/12 r/4',
          'd4/4 f4/4 a4/4 d5/4', 'c5/6 bb4/2 g4/4 e4/4', 'g4/4 bb4/4 d5/4 bb4/4', 'a4/12 r/4',
        ],
      },
      B: {
        lead: 'horn', arp: 'off',
        chords: ['F', 'C', 'Dm', 'A', 'Bb', 'F', 'Gm', 'A'],
        melody: ['a4/8 c5/4 f5/4', 'e5/6 d5/2 c5/8', 'd5/4 f5/4 a5/8', 'e5/12 r/4', 'f5/4 d5/4 bb4/8', 'c5/4 a4/4 f4/8', 'g4/4 bb4/4 d5/4 g5/4', 'e5/8 c#5/8'],
      },
      A2: {
        harmony: true,
        chords: ['Dm', 'C', 'Bb', 'A', 'Dm', 'C', 'Gm', 'A'],
        melody: [
          'd4/4 a4/4 f4/4 a4/4', 'e4/4 g4/4 c5/8', 'bb4/6 a4/2 f4/4 d4/4', 'c#4/12 r/4',
          'd4/4 f4/4 a4/4 d5/4', 'c5/6 bb4/2 g4/4 e4/4', 'g4/4 bb4/4 d5/4 bb4/4', 'a4/12 r/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'dragon', title: 'Scales of Ash', bpm: 72, ceiling: 0.5, kbps: 56,
    band: { lead: 'brass', harmony: 'tuba', pad: 'choir', arp: 'marcato', bass: 'contrabass', kit: 'orchestral' },
    lead: { vol: 0.21 }, bass: 'drone', arp: 'up', arpOctave: -1, arpVol: 0.05, padVol: 0.07,
    drums: 'k.......t...k.k.', drumVol: 0.45, echo: 0.2, reverb: 0.45, mix: { drums: 1, arp: -3 },
    sections: {
      A: {
        chords: ['Cm', 'Db', 'Cm', 'G', 'Cm', 'Ab', 'Db', 'G'],
        melody: [
          'c4/8 eb4/4 g4/4', 'ab4/6 f4/2 db4/8', 'c4/4 g4/4 c5/6 bb4/2', 'b4/12 r/4',
          'c5/6 d5/2 eb5/8', 'c5/4 ab4/4 eb4/8', 'f4/4 ab4/4 db5/4 c5/4', 'b4/8 d5/4 g4/4',
        ],
      },
      B: {
        lead: 'horn', drums: 'k...t...k...t.tt',
        chords: ['Fm', 'Db', 'Ab', 'Eb', 'Fm', 'Db', 'G', 'G'],
        melody: ['f5/8 ab5/8', 'f5/6 db5/2 ab4/8', 'c5/4 eb5/4 ab5/8', 'g5/12 r/4', 'f5/4 c6/4 ab5/8', 'f5/6 db5/2 ab4/8', 'b4/4 d5/4 f5/4 ab5/4', 'g5/16'],
      },
      A2: {
        harmony: true,
        chords: ['Cm', 'Db', 'Cm', 'G', 'Cm', 'Ab', 'Db', 'G'],
        melody: [
          'c4/8 eb4/4 g4/4', 'ab4/6 f4/2 db4/8', 'c4/4 g4/4 c5/6 bb4/2', 'b4/12 r/4',
          'c5/6 d5/2 eb5/8', 'c5/4 ab4/4 eb4/8', 'f4/4 ab4/4 db5/4 c5/4', 'b4/8 d5/4 g4/4',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'serpent', title: 'The Coiled Idol', bpm: 84, ceiling: 0.5, kbps: 56,
    band: { lead: 'panpipe', harmony: 'marimba', pad: 'choirOo', arp: 'marimba', bass: 'upright', kit: 'hand' },
    lead: { vol: 0.2 }, bass: 'root8', arp: 'updown', arpRate: 16, arpVol: 0.05, padVol: 0.08,
    drums: 't..k..t.k..t.p..', drumVol: 0.5, echo: 0.3, reverb: 0.44, mix: { arp: -4, pad: 1 },
    sections: {
      A: {
        chords: ['Em', 'F', 'Em', 'Dm', 'Am', 'G', 'F', 'Em'],
        melody: [
          'e5/6 f5/2 g5/8', 'a5/4 f5/4 c5/8', 'b4/4 e5/4 g5/4 b5/4', 'a5/6 f5/2 d5/8',
          'c5/4 e5/4 a5/8', 'b5/6 g5/2 d5/8', 'c5/4 a4/4 f4/4 a4/4', 'e5/16',
        ],
      },
      B: {
        lead: 'cello', leadOctave: -1, arp: 'off', drums: 't..k..t.k.pt.ppp',
        chords: ['Am', 'F', 'Dm', 'Em', 'Am', 'C', 'F', 'Em'],
        melody: ['a4/8 c5/4 e5/4', 'f5/6 e5/2 c5/8', 'd5/4 f5/4 a5/8', 'g5/8 e5/8', 'a5/4 e5/4 c5/8', 'g5/4 e5/4 c5/8', 'f5/6 e5/2 c5/4 a4/4', 'b4/12 r/4'],
      },
      A2: {
        harmony: true,
        chords: ['Em', 'F', 'Em', 'Dm', 'Am', 'G', 'F', 'Em'],
        melody: [
          'e5/6 f5/2 g5/8', 'a5/4 f5/4 c5/8', 'b4/4 e5/4 g5/4 b5/4', 'a5/6 f5/2 d5/8',
          'c5/4 e5/4 a5/8', 'b5/6 g5/2 d5/8', 'c5/4 a4/4 f4/4 a4/4', 'e5/16',
        ],
      },
    },
    form: ['A', 'B', 'A2'],
  },
  {
    id: 'tomb', title: 'Sand-Sealed Halls', bpm: 66, ceiling: 0.5, kbps: 56,
    band: { lead: 'ney', harmony: 'cello', pad: 'choirOo', arp: 'dulcimer', bass: 'contrabass', kit: 'darbuka' },
    lead: { vol: 0.2 }, bass: 'drone', arp: 'pick', arpVol: 0.05, padVol: 0.09,
    drums: 'k.......p...s...', drumVol: 0.4, echo: 0.36, reverb: 0.55, mix: { drums: -3, arp: -4, pad: 2 }, loudness: -1,
    sections: {
      A: {
        chords: ['E', 'F', 'Am', 'E', 'Am', 'F', 'Dm', 'E'],
        melody: ['e5/8 f5/4 g#5/4', 'a5/6 g#5/2 f5/8', 'e5/4 c5/4 a4/8', 'b4/12 r/4', 'c5/4 e5/4 a5/8', 'a5/4 g#5/2 f5/2 c5/8', 'd5/4 f5/4 a5/4 f5/4', 'e5/16'],
      },
      B: {
        lead: 'cello', arp: 'off',
        chords: ['Am', 'E', 'F', 'E', 'Am', 'E', 'Dm', 'E'],
        melody: ['a4/8 c5/4 b4/4', 'g#4/12 e4/4', 'f4/4 a4/4 c5/6 b4/2', 'g#4/16', 'a4/4 c5/4 e5/8', 'd#5/4 e5/4 g#4/8', 'f4/4 a4/4 d5/8', 'e4/16'],
      },
      A2: {
        harmony: true,
        chords: ['E', 'F', 'Am', 'E', 'Am', 'F', 'Dm', 'E'],
        melody: ['e5/8 f5/4 g#5/4', 'a5/6 g#5/2 f5/8', 'e5/4 c5/4 a4/8', 'b4/12 r/4', 'c5/4 e5/4 a5/8', 'a5/4 g#5/2 f5/2 c5/8', 'd5/4 f5/4 a5/4 f5/4', 'e5/16'],
      },
    },
    form: ['A', 'B', 'A2'],
  },
];
