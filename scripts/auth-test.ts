/**
 * Email-login test: runs the real game server against a stand-in for Supabase
 * (database + login service) and logs in with access tokens.
 *   npx tsx scripts/auth-test.ts
 */
import { spawn } from 'node:child_process';
import { NetController } from '../src/client/Controller';
import { DEFAULT_OUTFIT } from '../src/game/player/outfits';
import { startMock } from './storage-test';

const proc = (globalThis as unknown as { process: { env: Record<string, string>; execPath: string; exit(c: number): never } }).process;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok: unknown, label: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failed++;
};

async function connect(name: string, token: string, skipTutorial = false): Promise<NetController | string> {
  try {
    return await NetController.connect({ url: 'ws://localhost:8131/ws', name, token, vocation: 'sorcerer', outfit: DEFAULT_OUTFIT, skipTutorial });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main(): Promise<void> {
  await startMock(54330);
  const server = spawn('/opt/npm-tools/node_modules/.bin/tsx', ['server/server.ts'], {
    env: { ...proc.env, PORT: '8131', SUPABASE_URL: 'http://localhost:54330', SUPABASE_SERVICE_KEY: 'eyJ.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', ADMINS: 'Annabel' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60 && !log.includes('Thornvale server on'); i++) await sleep(250);
  check(log.includes('Login: email'), 'server starts with email login');
  try {
    const cfg = (await (await fetch('http://localhost:8131/api/auth-config')).json()) as { mode: string; key: string };
    check(cfg.mode === 'email' && cfg.key === 'sb_publishable_test', 'title screen gets the public login settings (never the secret key)');
    const none = await fetch('http://localhost:8131/api/characters');
    check(none.status === 401, 'character list needs a login');

    const bad = await connect('Annabel', 'tok-nobody');
    check(typeof bad === 'string' && /expired|log in/i.test(bad), `invalid token refused (${bad})`);

    const a = await connect('Annabel', 'tok-ann');
    check(typeof a !== 'string', 'logged in with a valid token and created a character');
    if (typeof a === 'string') throw new Error(a);
    for (let i = 0; i < 10; i++) {
      a.update(0.05);
      await sleep(50);
    }
    const list = (await (await fetch('http://localhost:8131/api/characters', { headers: { Authorization: 'Bearer tok-ann' } })).json()) as { email: string; characters: Array<{ name: string }> };
    check(list.email === 'ann@example.com' && list.characters.some((c) => c.name === 'Annabel'), 'the account lists its character');
    check((list as { maxCharacters?: number }).maxCharacters === 5, 'the account screen gets its character limit (5 without founder slots)');
    const me = (await (await fetch('http://localhost:8131/api/store/me', { headers: { Authorization: 'Bearer tok-ann' } })).json()) as { account: string; founderTier: unknown; premiumActive: boolean; characters: unknown[] };
    check(me.account === '11111111-1111-1111-1111-111111111111' && me.founderTier === null && me.premiumActive === false && me.characters.length === 1, 'the store page sees the logged-in account (no store tables yet: no premium)');
    check((await fetch('http://localhost:8131/api/store/me', { headers: { Authorization: 'Bearer tok-nobody' } })).status === 401, 'the store page needs a valid login');
    a.close();
    await sleep(500);

    const steal = await connect('Annabel', 'tok-ben');
    check(typeof steal === 'string' && /taken/i.test(steal), `another account cannot use that name (${steal})`);
    const back = await connect('Annabel', 'tok-ann');
    check(typeof back !== 'string' && back.game.getPlayer(back.pid)?.vocation === 'sorcerer', 'the owner logs back in to the same character');
    if (typeof back === 'string') throw new Error(back);

    // ---- the tutorial island and the account flag
    const pump = async (c: NetController, secs: number) => {
      for (let i = 0; i < secs * 20; i++) { c.update(0.05); await sleep(50); }
    };
    const tu = (c: NetController) => c.game.session(c.pid)!.tutorial;
    const lvl = (c: NetController) => c.game.getPlayer(c.pid)!.level;
    check(tu(back).state === 'active' && !tu(back).canSkip && lvl(back) === 1, 'a new character starts on the island (and test servers do not raise its level there)');
    const before = (await (await fetch('http://localhost:8131/api/characters', { headers: { Authorization: 'Bearer tok-ann' } })).json()) as { tutorialDone: boolean };
    check(before.tutorialDone === false, 'the account has not finished the tutorial yet');
    back.send({ c: 'tutorialSkip' });
    await pump(back, 0.5);
    check(tu(back).state === 'active', 'skipping is refused before the account finished it once');
    back.send({ c: 'say', text: '/tutorial done' });
    await pump(back, 1);
    check(tu(back).state === 'done' && lvl(back) >= 20, 'finishing the island ends the tutorial (test server: level raised now)');
    await sleep(300);
    const after = (await (await fetch('http://localhost:8131/api/characters', { headers: { Authorization: 'Bearer tok-ann' } })).json()) as { tutorialDone: boolean };
    check(after.tutorialDone === true, 'the account is now marked as having finished the tutorial');
    back.close();
    await sleep(300);
    const skipper = await connect('Annika', 'tok-ann', true);
    check(typeof skipper !== 'string' && tu(skipper).state === 'skipped' && skipper.game.session(skipper.pid)!.inventory.count('rope') === 1, 'a second character of that account may skip the island');
    if (typeof skipper !== 'string') skipper.close();
    await sleep(300);
    const keen = await connect('Anwen', 'tok-ann');
    check(typeof keen !== 'string' && tu(keen).state === 'active' && tu(keen).canSkip, 'one who does not tick skip goes to the island, with a skip button available');
    if (typeof keen !== 'string') keen.close();
  } finally {
    server.kill('SIGTERM');
    await sleep(800);
  }
  console.log(failed ? `\n${failed} check(s) failed.\n${log}` : '\nAll email-login checks passed.');
  proc.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  proc.exit(1);
});
