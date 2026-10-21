/**
 * Save-data tools for the server owner.
 *
 *   npm run saves:backup [file]   — download every character into a JSON file
 *   npm run saves:import [dir]    — copy local server/data (accounts + characters)
 *                                    into the storage in use (Supabase when configured)
 *   npm run saves:check           — load every stored character with the current game
 *                                    version and report anything that would not migrate
 *
 * Uses the same SUPABASE_URL / SUPABASE_SERVICE_KEY environment variables as the server.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openStorage, type Account } from '../server/storage';
import { Game, type SaveData } from '../src/game/Game';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';

const proc = (globalThis as unknown as { process: { argv: string[]; env: Record<string, string | undefined>; exit(c: number): never } }).process;
const DATA_FILE = resolve(proc.env.DATA_FILE ?? join('server', 'data', 'characters.json'));

async function main(): Promise<void> {
  const [cmd, arg] = proc.argv.slice(2);
  const storage = await openStorage(DATA_FILE);
  console.log(`Storage: ${storage.kind}`);

  if (cmd === 'backup') {
    const all = await storage.allCharacters();
    const file = arg ?? `thornvale-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), saveVersion: SAVE_VERSION, characters: all }, null, 1));
    console.log(`Saved ${all.length} characters to ${file}`);
    return;
  }

  if (cmd === 'import') {
    const dir = resolve(arg ?? join('server', 'data'));
    const read = <T>(f: string, d: T): T => (existsSync(join(dir, f)) ? (JSON.parse(readFileSync(join(dir, f), 'utf8')) as T) : d);
    const accounts = read<Record<string, Partial<Account>>>('accounts.json', {});
    const chars = read<Record<string, SaveData>>('characters.json', {});
    let a = 0;
    let c = 0;
    for (const [key, acc] of Object.entries(accounts)) {
      if (!acc.salt || !acc.hash) continue;
      if (!(await storage.getAccount(key))) {
        await storage.createAccount(key, { name: acc.name ?? chars[key]?.player?.name ?? key, salt: acc.salt, hash: acc.hash, created: acc.created ?? Date.now() });
        a++;
      }
    }
    for (const [key, data] of Object.entries(chars)) {
      if (!(await storage.getAccount(key))) {
        console.log(`  skipped ${key}: no account/password for this character`);
        continue;
      }
      await storage.saveCharacter(key, data.player?.name ?? key, data);
      c++;
    }
    await storage.flush();
    console.log(`Imported ${a} accounts and ${c} characters from ${dir}`);
    return;
  }

  if (cmd === 'check') {
    const all = await storage.allCharacters();
    const g = new Game();
    let bad = 0;
    for (const ch of all) {
      const m = migrateSave(ch.data);
      const s = g.addPlayer('Check', { starter: false });
      const ok = typeof m !== 'string' && g.applySave(s.id, ch.data);
      g.removePlayer(s.id);
      if (!ok) bad++;
      const note = typeof m === 'string' ? m : `v${m.from}${m.from < SAVE_VERSION ? ` → v${SAVE_VERSION}` : ''}${m.lost.length ? `, ${m.lost.length} retired item stack(s) kept aside` : ''}`;
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${ch.name} (level ${ch.data.player?.level}) ${note}`);
    }
    console.log(bad ? `\n${bad} character(s) would not load — fix the migration before deploying.` : `\nAll ${all.length} characters load with save format v${SAVE_VERSION}.`);
    proc.exit(bad ? 1 : 0);
  }

  console.log('Usage: tsx scripts/saves.ts backup [file] | import [dir] | check');
}

main().catch((e) => {
  console.error(e);
  proc.exit(1);
});
