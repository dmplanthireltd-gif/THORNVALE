/**
 * Renders Thornvale's soundtrack (instrument band per region, see synth.ts).
 *
 *   npx tsx scripts/music/render.ts            # every song
 *   npx tsx scripts/music/render.ts town battle # just these
 *
 * Writes public/audio/music/<id>.m4a (AAC, seamless loop) when ffmpeg is installed, otherwise
 * leaves the WAV files in public/audio/music/wav/ so they can be encoded elsewhere. The game
 * loads the .m4a files from /play/audio/music/ (see src/audio/Music.ts).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, wav } from './synth';
import { SONGS } from './songs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'audio', 'music');
const WAV = join(OUT, 'wav');
mkdirSync(WAV, { recursive: true });

const only = process.argv.slice(2);
let ffmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  ffmpeg = false;
}

for (const song of SONGS) {
  if (only.length && !only.includes(song.id)) continue;
  const t = Date.now();
  const { l, r, seconds } = render(song);
  const wavFile = join(WAV, `${song.id}.wav`);
  writeFileSync(wavFile, wav(l, r));
  if (ffmpeg) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavFile, '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', join(OUT, `${song.id}.m4a`)]);
  }
  console.log(`${song.id.padEnd(8)} "${song.title}"  ${seconds.toFixed(1)} s  (${((Date.now() - t) / 1000).toFixed(1)} s to render)`);
}
if (ffmpeg) rmSync(WAV, { recursive: true, force: true });
else console.log(`ffmpeg not found: WAV files left in ${WAV}`);
