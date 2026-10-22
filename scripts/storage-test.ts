/**
 * Checks the Supabase storage layer against a small in-memory imitation of
 * Supabase's REST API (PostgREST), so it can be tested without a real project.
 *   npx tsx scripts/storage-test.ts
 */
import { SAVE_VERSION } from '../src/game/save/migrate';
import { createServer } from 'node:http';
import { FileStorage, SupabaseStorage, type Storage } from '../server/storage';
import type { MarketDelivery, MarketOffer } from '../src/game/market/market';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game } from '../src/game/Game';

const process = (globalThis as unknown as { process: { exit(code: number): never } }).process;
let failed = 0;
const check = (ok: unknown, label: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failed++;
};

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { accounts: [], characters: [], character_backups: [], market_offers: [], market_deliveries: [], account_flags: [] };
const keys: Record<string, string> = { accounts: 'name_key', characters: 'name_key', market_offers: 'id', market_deliveries: 'id', account_flags: 'account_key' };
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
  // PostgREST "in" filters: id=in.("a","b")
  const inFilters = [...url.searchParams.entries()].filter(([, v]) => v.startsWith('in.(')).map(([k, v]) => [k, v.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''))] as const);
  const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v) && inFilters.every(([k, list]) => list.includes(String(r[k])));
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const prefer = String(req.headers.prefer ?? '');
    if (req.method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      // select aliases into JSON columns, e.g. tutorial:data->tutorial
      const aliases = (url.searchParams.get('select') ?? '').split(',').map((x) => /^(\w+):(\w+)->(\w+)$/.exec(x)).filter((x): x is RegExpExecArray => !!x);
      const out = rows.filter(match).slice(offset, offset + limit).map((r) => {
        const o: Row = { ...r };
        for (const a of aliases) o[a[1]] = (r[a[2]] as Row | undefined)?.[a[3]] ?? null;
        return o;
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      return;
    }
    if (req.method === 'POST') {
      const parsed = JSON.parse(body) as Row | Row[];
      const pk = keys[table];
      for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
        const existing = pk ? rows.find((r) => r[pk] === row[pk]) : undefined;
        if (existing && !prefer.includes('merge-duplicates')) {
          res.writeHead(409).end('{"message":"duplicate key"}');
          return;
        }
        if (existing) Object.assign(existing, row);
        else rows.push({ created_at: new Date().toISOString(), id: rows.length + 1, ...row });
      }
      res.writeHead(201).end();
      return;
    }
    if (req.method === 'DELETE') {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
      res.writeHead(204).end();
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
  // the cape slot and boss deeds (save v13) are stored like any other equipment
  s.inventory.equipment.cape = { id: 'starweave_cape', qty: 1 };
  s.bossKills = ['wb_mountain'];
  await st.saveCharacter('dawid', 'Dawid', g.serialize(s.id));
  s.player.level = 43;
  await st.saveCharacter('dawid', 'Dawid', g.serialize(s.id));
  check(tables.characters.length === 1, 'saving twice updates the same row (upsert)');
  const ch = await st.getCharacter('dawid');
  check(ch?.data.player.level === 43 && ch.version === SAVE_VERSION, 'character read back with level and save version');
  const t = new Game();
  const s2 = t.addPlayer('Dawid', { vocation: 'knight' });
  check(t.applySave(s2.id, ch!.data) && s2.player.vocation === 'druid' && s2.inventory.count('gold') >= 1234, 'stored save loads into a game');
  check(s2.inventory.equipment.cape?.id === 'starweave_cape' && s2.bossKills.includes('wb_mountain'), 'a worn cape and boss deeds survive Supabase save and load');
  await st.backupCharacter('dawid', ch!.data, 2, 'test');
  check(tables.character_backups.length === 1, 'backup row written');
  check((await st.allCharacters()).length === 1, 'all characters listed for export');
  check(sawApiKey, 'every request carries the API key');

  // ---- player market, in Supabase (tables market_offers / market_deliveries) and in files
  const offer = (id: string, qty: number): MarketOffer => ({ id, seller: 'dawid', sellerName: 'Dawid', item: 'wolf_pelt', qty, price: 120, created: 1_700_000_000_000, expires: 1_800_000_000_000 });
  const delivery: MarketDelivery = { id: 'd-1', to: 'dawid', gold: 360, items: [{ id: 'bone', qty: 2 }], reason: 'test sale', created: 1_700_000_000_000 };
  const marketChecks = async (st: Storage, label: string) => {
    const empty = await st.loadMarket();
    check(!!empty && empty.offers.length === 0 && empty.deliveries.length === 0, `${label}: an empty market loads`);
    await st.putMarketOffers([offer('o-1', 5), offer('o-2', 1)]);
    await st.putMarketOffers([offer('o-1', 3)]);
    await st.putMarketDeliveries([delivery]);
    let m = await st.loadMarket();
    const o1 = m?.offers.find((o) => o.id === 'o-1');
    check(m?.offers.length === 2 && o1?.qty === 3 && o1.price === 120 && o1.seller === 'dawid' && o1.expires === 1_800_000_000_000, `${label}: offers stored, updated by id and read back`);
    const d = m?.deliveries[0];
    check(m?.deliveries.length === 1 && d?.gold === 360 && d.items[0]?.id === 'bone' && d.to === 'dawid', `${label}: deliveries stored and read back`);
    await st.deleteMarketOffers(['o-1', 'o-2']);
    await st.deleteMarketDeliveries(['d-1']);
    m = await st.loadMarket();
    check(m?.offers.length === 0 && m?.deliveries.length === 0, `${label}: offers and deliveries deleted`);
    // the market survives a restart: a game loads it and pays the delivery at login
    await st.putMarketOffers([offer('o-3', 2)]);
    await st.putMarketDeliveries([delivery]);
    const loaded = (await st.loadMarket())!;
    const game = new Game();
    game.market.load(loaded.offers, loaded.deliveries);
    const who = game.addPlayer('Dawid', { vocation: 'druid' });
    const ok = game.applySave(who.id, ch!.data);
    check(ok && game.market.offers.has('o-3') && who.bank === 360 && who.depot.some((x) => x?.id === 'bone'), `${label}: a restarted game has the offers and pays waiting deliveries at login`);
    await st.deleteMarketOffers(['o-3']);
    await st.deleteMarketDeliveries(['d-1']);
  };
  await marketChecks(st, 'Supabase');
  const dir = mkdtempSync(join(tmpdir(), 'thornvale-market-'));
  const fs1 = new FileStorage(join(dir, 'characters.json'));
  await fs1.putMarketOffers([offer('f-1', 4)]);
  const fs2 = new FileStorage(join(dir, 'characters.json'));
  check((await fs2.loadMarket()).offers.some((o) => o.id === 'f-1' && o.qty === 4), 'files: the market file survives a restart');
  await fs2.deleteMarketOffers(['f-1']);
  await marketChecks(fs2, 'files');
  rmSync(dir, { recursive: true, force: true });
  // a Supabase project without the market tables keeps the market closed instead of failing
  delete tables.market_offers;
  check((await st.loadMarket()) === null, 'missing market tables: the market stays closed (server still starts)');
  tables.market_offers = [];

  // ---- tutorial account flags (table account_flags), Supabase and files
  const ann = USERS['tok-ann'].id, ben = USERS['tok-ben'].id;
  check((await st.accountFlagsMode()) === 'table', 'Supabase: the account_flags table is found');
  check(!(await st.tutorialDone(`auth:${ann}`, ann)), 'an account with no characters has not finished the tutorial');
  const fresh = new Game();
  const nc = fresh.addPlayer('Islander', { vocation: 'knight' });
  fresh.beginTutorial(nc.id);
  await st.saveCharacter('islander', 'Islander', fresh.serialize(nc.id), ann);
  check(!(await st.tutorialDone(`auth:${ann}`, ann)), 'a character still on the island does not count');
  const oldSave = { ...fresh.serialize(nc.id), version: 8 } as Record<string, unknown>;
  delete oldSave.tutorial;
  tables.characters.push({ name_key: 'veteran', owner_id: ben, display_name: 'Veteran', data: oldSave, save_version: 8, level: 30 });
  check(await st.tutorialDone(`auth:${ben}`, ben), 'an account owning a character from before the tutorial may skip it');
  await st.markTutorialDone(`auth:${ann}`);
  check(tables.account_flags.length === 1 && await st.tutorialDone(`auth:${ann}`, ann), 'the flag is stored and read back');
  tables.characters = tables.characters.filter((r) => r.owner_id !== ann);
  check(await st.tutorialDone(`auth:${ann}`, ann), 'the flag stays when the character is deleted');
  // a project without the table: the server still starts and character saves decide
  const flags = tables.account_flags;
  delete tables.account_flags;
  const st2 = new SupabaseStorage('http://localhost:54329/', 'eyJ.test');
  check((await st2.accountFlagsMode()) === 'derived', 'missing account_flags table: derived mode');
  await st2.markTutorialDone(`auth:${ann}`);
  check(await st2.tutorialDone(`auth:${ben}`, ben) && !(await st2.tutorialDone(`auth:${ann}`, ann)), 'derived mode answers from the saves (and writing is skipped)');
  tables.account_flags = flags;
  const dir2 = mkdtempSync(join(tmpdir(), 'thornvale-flags-'));
  const ff = new FileStorage(join(dir2, 'characters.json'));
  check(!(await ff.tutorialDone('name:zed')), 'files: no flag yet');
  await ff.markTutorialDone('name:zed');
  check(await new FileStorage(join(dir2, 'characters.json')).tutorialDone('name:zed'), 'files: the flag survives a restart');
  rmSync(dir2, { recursive: true, force: true });
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
