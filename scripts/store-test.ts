/**
 * Premium store test: Paddle webhook signatures, purchases and refunds in the file storage,
 * and the real server's store API and webhook (no Paddle account needed).
 *   npx tsx scripts/store-test.ts
 * The same grant/refund rules run as SQL functions in Supabase
 * (supabase/migrations/20261022_premium_store.sql).
 */
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlePaddleEvent, paddleConfigFromEnv, paddleReady, verifyPaddleSignature } from '../server/payments';
import { FileStorage } from '../server/storage';
import { LAUNCH_AT, PRODUCTS } from '../src/game/premium/premium';

const proc = (globalThis as unknown as { process: { env: Record<string, string>; exit(c: number): never } }).process;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok: unknown, label: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failed++;
};

const DAY = 86_400_000;
const SECRET = 'pdl_ntfset_test_secret';
const ANN = '11111111-1111-1111-1111-111111111111';
const BEN = '22222222-2222-2222-2222-222222222222';
const cfg = paddleConfigFromEnv({
  PADDLE_ENV: 'sandbox', PADDLE_CLIENT_TOKEN: 'test_client_token', PADDLE_WEBHOOK_SECRET: SECRET,
  PADDLE_PRICES: 'premium_30=pri_p30, founder_warden=pri_fw,founder_legend=pri_fl,upgrade_warden_legend=pri_uwl,bogus=pri_x,premium_90=not-a-price',
} as never);

function sign(body: string, secret = SECRET, ts = Math.floor(Date.now() / 1000)): string {
  return `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`;
}

const paid = (txn: string, price: string, account: string) => ({
  event_id: `evt_${txn}`, event_type: 'transaction.completed',
  data: { id: txn, status: 'completed', custom_data: { account }, items: [{ price: { id: price }, quantity: 1 }], currency_code: 'GBP', details: { totals: { grand_total: '2499' } } },
});
const adjusted = (txn: string, action: string, status = 'approved', type = 'full') => ({
  event_type: 'adjustment.updated', data: { id: `adj_${txn}`, transaction_id: txn, action, status, type },
});

async function main(): Promise<void> {
  console.log('Settings and signatures');
  check(cfg.prices.premium_30 === 'pri_p30' && cfg.prices.founder_legend === 'pri_fl' && !('bogus' in cfg.prices) && !cfg.prices.premium_90, 'price list reads known products with real price ids only');
  check(paddleReady(cfg) && !paddleReady(paddleConfigFromEnv({} as never)), 'payments are ready only with token, secret and prices');
  const body = JSON.stringify(paid('txn_a', 'pri_fw', ANN));
  check(verifyPaddleSignature(body, sign(body), SECRET), 'a correctly signed webhook is accepted');
  check(!verifyPaddleSignature(body, sign(body, 'pdl_ntfset_wrong'), SECRET), 'a webhook signed with another secret is refused');
  check(!verifyPaddleSignature(`${body} `, sign(body), SECRET), 'a changed body is refused');
  check(!verifyPaddleSignature(body, sign(body, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET), 'an old signature (replay) is refused');
  check(verifyPaddleSignature(body, `${sign(body, 'pdl_ntfset_old')};${sign(body).split(';')[1]}`, SECRET), 'during a secret rotation any matching h1 is accepted');
  check(!verifyPaddleSignature(body, undefined, SECRET) && !verifyPaddleSignature(body, 'nonsense', SECRET), 'a missing or broken header is refused');

  console.log('Purchases and refunds (file storage)');
  const dir = mkdtempSync(join(tmpdir(), 'thornvale-store-'));
  const st = new FileStorage(join(dir, 'characters.json'));
  const dec = Date.UTC(2026, 11, 3);
  let r = await handlePaddleEvent(paid('txn_a', 'pri_fw', ANN), cfg, st, dec);
  let ann = await st.getPerks(ANN);
  check(r.kind === 'granted' && ann.founderTier === 'warden' && ann.premiumUntil === LAUNCH_AT + 180 * DAY && ann.extraSlots === 1, 'a Warden pack bought in December: 180 days from opening day and a 6th slot');
  r = await handlePaddleEvent(paid('txn_a', 'pri_fw', ANN), cfg, st, dec);
  check(r.kind === 'duplicate' && (await st.getPerks(ANN)).premiumUntil === ann.premiumUntil, 'the same payment twice is granted once');
  r = await handlePaddleEvent(paid('txn_b', 'pri_fl', BEN), cfg, st, dec);
  const ben = await st.getPerks(BEN);
  check(r.kind === 'granted' && ben.founderTier === 'legend' && ben.founderNo === 1 && ben.extraSlots === 2, 'the first Legend is #1 with two extra slots');
  r = await handlePaddleEvent(paid('txn_c', 'pri_uwl', ANN), cfg, st, dec);
  ann = await st.getPerks(ANN);
  check(r.kind === 'granted' && ann.founderTier === 'legend' && ann.founderNo === 2 && ann.premiumUntil === LAUNCH_AT + 365 * DAY, 'an upgrade to Legend adds the difference in days and the next number');
  check((await st.legendCount()) === 2, 'Legends are counted for the 300 cap');
  const after = LAUNCH_AT + 10 * DAY;
  r = await handlePaddleEvent(paid('txn_d', 'pri_p30', ANN), cfg, st, after);
  check((await st.getPerks(ANN)).premiumUntil === LAUNCH_AT + 395 * DAY, 'premium bought later adds 30 days on top');
  check((await handlePaddleEvent(paid('txn_e', 'pri_unknown', ANN), cfg, st)).kind === 'ignored', 'a payment for an unknown price is not granted');
  check((await handlePaddleEvent(paid('txn_f', 'pri_p30', 'not-an-account'), cfg, st)).kind === 'ignored', 'a payment without an account id is not granted');
  check((await handlePaddleEvent(adjusted('txn_c', 'refund', 'pending_approval'), cfg, st)).kind === 'ignored', 'a refund waiting for approval changes nothing yet');
  check((await handlePaddleEvent(adjusted('txn_c', 'refund', 'approved', 'partial'), cfg, st)).kind === 'ignored', 'a partial refund is left for the owner to check');
  r = await handlePaddleEvent(adjusted('txn_c', 'refund'), cfg, st);
  ann = await st.getPerks(ANN);
  check(r.kind === 'revoked' && ann.founderTier === 'warden' && ann.extraSlots === 1 && ann.premiumUntil === LAUNCH_AT + 210 * DAY, 'a full refund of the upgrade takes its days back and returns to Warden');
  check((await handlePaddleEvent(adjusted('txn_c', 'refund'), cfg, st)).kind === 'ignored', 'the same refund twice is taken once');
  r = await handlePaddleEvent(adjusted('txn_b', 'chargeback'), cfg, st);
  const ben2 = await st.getPerks(BEN);
  check(r.kind === 'revoked' && ben2.flagged && ben2.founderTier === 'legend' && ben2.premiumUntil === LAUNCH_AT, 'a chargeback takes the days back and flags the account (looks stay for the owner to decide)');
  await st.setFounderName(BEN, 'Benedict');
  await st.setFounderName(ANN, 'Annabel');
  const reopened = new FileStorage(join(dir, 'characters.json'));
  const list = await reopened.listFounders();
  check(list.length === 2 && list[0].name === 'Benedict' && list[0].no === 1 && list[1].tier === 'warden' && list[1].no === 0, 'founders are kept on disk and listed Legends first');
  check(PRODUCTS.founder_legend.days === 365 && PRODUCTS.premium_365.pence === 5499, 'product table matches the approved plan');
  rmSync(dir, { recursive: true, force: true });

  console.log('Server: store API and webhook');
  const dir2 = mkdtempSync(join(tmpdir(), 'thornvale-store-srv-'));
  const server = spawn('/opt/npm-tools/node_modules/.bin/tsx', ['server/server.ts'], {
    env: {
      ...proc.env, PORT: '8133', DATA_FILE: join(dir2, 'characters.json'), BOTS: '0', TEST_MODE: '0',
      SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', SUPABASE_PUBLISHABLE_KEY: '',
      PADDLE_ENV: 'sandbox', PADDLE_CLIENT_TOKEN: 'test_client_token', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_PRICES: 'premium_30=pri_p30,founder_legend=pri_fl',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 80 && !log.includes('Thornvale server on'); i++) await sleep(250);
  try {
    check(log.includes('Premium: enforced') && log.includes('Store: closed (needs email login)'), 'start-up log shows premium enforced and why the store is closed');
    check(!log.includes(SECRET), 'the webhook secret never appears in the log');
    const conf = (await (await fetch('http://localhost:8133/api/store/config')).json()) as { open: boolean; clientToken: string; products: unknown[]; legendLeft: number; launchAt: number };
    check(conf.open === false && conf.clientToken === '' && conf.products.length === 10 && conf.legendLeft === 300 && conf.launchAt === LAUNCH_AT, 'store config: closed without email login, products listed, 300 Legends left');
    check((await (await fetch('http://localhost:8133/api/founders')).json() as { rows: unknown[] }).rows.length === 0, 'founders list starts empty');
    const hook = (b: string, sig?: string) => fetch('http://localhost:8133/api/pay/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'paddle-signature': sig } : {}) }, body: b });
    const b1 = JSON.stringify(paid('txn_srv', 'pri_fl', ANN));
    check((await hook(b1)).status === 401 && (await hook(b1, sign(b1, 'pdl_ntfset_wrong'))).status === 401, 'unsigned or wrongly signed webhooks are refused');
    check((await hook(b1, sign(b1))).status === 200, 'a signed payment webhook is accepted');
    check((await hook(b1, sign(b1))).status === 200, 'Paddle repeating the same webhook is fine');
    const conf2 = (await (await fetch('http://localhost:8133/api/store/config')).json()) as { legendLeft: number };
    check(conf2.legendLeft === 299, 'the Legend count drops after a Legend pack');
    await sleep(300);
    check(log.includes('Payment: founder_legend for account 11111111…') && !log.includes(ANN), 'payments are logged without the full account id');
    check((await fetch('http://localhost:8133/api/store/me')).status === 404, 'account endpoints need email login');
  } finally {
    server.kill('SIGTERM');
    await sleep(500);
    rmSync(dir2, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll store checks passed.');
  proc.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  proc.exit(1);
});
