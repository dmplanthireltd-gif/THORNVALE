/**
 * Checks the Supabase storage layer against a small in-memory imitation of
 * Supabase's REST API (PostgREST), so it can be tested without a real project.
 *   npx tsx scripts/storage-test.ts
 */
import { SAVE_VERSION } from '../src/game/save/migrate';
import { createServer } from 'node:http';
import { SupabaseStorage } from '../server/storage';
import { Game } from '../src/game/Game';

const process = (globalThis as unknown as { process: { exit(code: number): never } }).process;
let failed = 0;
const check = (ok: unknown, label: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failed++;
};

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { accounts: [], characters: [], character_backups: [] };
const keys: Record<string, string> = { accounts: 'name_key', characters: 'name_key' };
let sawApiKey = true;

/** Access tokens the fake login service accepts: token → user. */
export const USERS: Record<string, { id: string; email: string }> = {
  'tok-ann': { id: '11111111-1111-1111-1111-111111111111', email: 'ann@example.com' },
  'tok-ben': { id: '22222222-2222-2222-2222-222222222222', email: 'ben@example.com' },
};

const mock = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/auth/v1/user') {
    const u = USERS[String(req.headers.authorization ?? '').replace('Bearer ', '')];
    res.writeHead(u ? 200 : 401, { 'content-type': 'application/json' }).end(JSON.stringify(u ?? { msg: 'invalid token' }));
    return;
  }
  if (req.headers.apikey !== 'eyJ.test') sawApiKey = false;
  const table = url.pathname.replace('/rest/v1/', '');
  const rows = tables[table];
  if (!rows) {
    res.writeHead(404).end('{"message":"relation does not exist"}');
    return;
  }
  const filters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, decodeURIComponent(v.slice(3))]);
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v);
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const prefer = String(req.headers.prefer ?? '');
    if (req.method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rows.filter(match).slice(offset, offset + limit)));
      return;
    }
    if (req.method === 'POST') {
      const row = JSON.parse(body) as Row;
      const pk = keys[table];
      const existing = pk ? rows.find((r) => r[pk] === row[pk]) : undefined;
      if (existing && !prefer.includes('merge-duplicates')) {
        res.writeHead(409).end('{"message":"duplicate key"}');
        return;
      }
      if (existing) Object.assign(existing, row);
      else rows.push({ ...row, created_at: new Date().toISOString(), id: rows.length + 1 });
      res.writeHead(201).end();
      return;
    }
    if (req.method === 'PATCH') {
      const patch = JSON.parse(body) as Row;
      for (const r of rows.filter(match)) Object.assign(r, patch);
      res.writeHead(204).end();
      return;
    }
    res.writeHead(405).end();
  });
});

export function startMock(port: number): Promise<void> {
  return new Promise<void>((r) => mock.listen(port, r));
}

async function main(): Promise<void> {
  await startMock(54329);
  const st = new SupabaseStorage('http://localhost:54329/', 'eyJ.test');
  await st.check();
  check(true, 'connects and finds the three tables');
  await st.createAccount('dawid', { name: 'Dawid', salt: 'aa', hash: 'bb', created: 0 });
  const acc = await st.getAccount('dawid');
  check(acc?.name === 'Dawid' && acc.hash === 'bb', 'account stored and read back');
  check((await st.getAccount('nobody')) === null, 'unknown account is null');
  await st.touchLogin('dawid');
  check(!!tables.accounts[0].last_login, 'last login recorded');

  const g = new Game();
  const s = g.addPlayer('Dawid', { vocation: 'druid' });
  s.player.level = 42;
  s.inventory.add('gold', 1234);
  await st.saveCharacter('dawid', 'Dawid', g.serialize(s.id));
  s.player.level = 43;
  await st.saveCharacter('dawid', 'Dawid', g.serialize(s.id));
  check(tables.characters.length === 1, 'saving twice updates the same row (upsert)');
  const ch = await st.getCharacter('dawid');
  check(ch?.data.player.level === 43 && ch.version === SAVE_VERSION, 'character read back with level and save version');
  const t = new Game();
  const s2 = t.addPlayer('Dawid', { vocation: 'knight' });
  check(t.applySave(s2.id, ch!.data) && s2.player.vocation === 'druid' && s2.inventory.count('gold') >= 1234, 'stored save loads into a game');
  await st.backupCharacter('dawid', ch!.data, 2, 'test');
  check(tables.character_backups.length === 1, 'backup row written');
  check((await st.allCharacters()).length === 1, 'all characters listed for export');
  check(sawApiKey, 'every request carries the API key');
  mock.close();
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll storage checks passed.');
  process.exit(failed ? 1 : 0);
}

// run only when started directly (auth-test.ts imports the mock from here)
const argv1 = (globalThis as unknown as { process: { argv: string[] } }).process.argv[1] ?? '';
if (argv1.endsWith('storage-test.ts')) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
