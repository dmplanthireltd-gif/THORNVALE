// Thornvale store page (/store/ only): login that shares the game's session, premium and founder
// packs, Paddle checkout. Plain script, no dependencies. Built with DOM methods, never innerHTML
// with data: names and emails come from players. Loaded after /site.js by scripts/site/build.ts.
(() => {
  'use strict';
  const SESSION_KEY = 'thornvale.auth';
  const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  // Used when the server doesn't answer /api/store/config (store closed, or the server isn't updated yet).
  const LAUNCH = Date.UTC(2027, 0, 1, 0, 0, 0); // 1 January 2027, 00:00 UK time (GMT in January)
  const FOUNDER_FROM = Date.UTC(2026, 11, 1, 0, 0, 0); // 1 December 2026, 00:00 UK time
  const FOUNDER_UNTIL = Date.UTC(2027, 1, 1, 0, 0, 0); // end of 31 January 2027, UK time
  const RANK = { wayfarer: 1, warden: 2, legend: 3 };
  const TIER_NAME = { wayfarer: 'Wayfarer', warden: 'Warden', legend: 'Legend' };
  const VOC = { knight: 'Knight', paladin: 'Paladin', sorcerer: 'Sorcerer', druid: 'Druid' };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  const money = (pence) => `£${(pence / 100).toFixed(2)}`;
  const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const now = () => (state.cfg && state.cfg.now ? state.cfg.now + (Date.now() - state.loadedAt) : Date.now());
  const scrollTo = (node, block) => node.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block });

  const state = {
    auth: null, // /api/auth-config
    cfg: null, // /api/store/config, or null when the store is closed / unknown
    loadedAt: Date.now(),
    session: null,
    me: null,
    meError: '',
    paddle: false,
    pending: null, // { product, premiumUntil, founderTier } while waiting for a purchase to arrive
  };

  // ------------------------------------------------------------------ session (shared with /play/)

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const s = raw ? JSON.parse(raw) : null;
      return s && s.access_token && s.refresh_token ? s : null;
    } catch {
      return null;
    }
  }
  function keep(j) {
    state.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    } catch {
      /* not remembered; works for this visit */
    }
  }
  function forget() {
    state.session = null;
    state.me = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
  function authFetch(path, body) {
    return fetch(`${state.auth.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: state.auth.key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  async function errorText(res) {
    try {
      const j = await res.json();
      return j.error_description || j.msg || j.message || j.error || `Error ${res.status}`;
    } catch {
      return `Error ${res.status}`;
    }
  }
  /** Makes sure the access token is valid for at least another minute. */
  async function ensureFresh(force) {
    const s = state.session;
    if (!s) return false;
    if (!force && s.expires_at - Date.now() > 60000) return true;
    try {
      const res = await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      if (!res.ok) throw new Error(String(res.status));
      keep(await res.json());
      return true;
    } catch {
      forget();
      return false;
    }
  }

  // ------------------------------------------------------------------ server calls

  async function getJson(url, init) {
    const res = await fetch(url, { cache: 'no-store', ...init });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  async function loadConfig() {
    try {
      const c = await getJson('/api/store/config');
      state.cfg = c && typeof c === 'object' && Array.isArray(c.products) ? c : null;
    } catch {
      state.cfg = null; // 404 or offline: show prices, nothing for sale
    }
    state.loadedAt = Date.now();
  }
  async function loadMe() {
    state.meError = '';
    if (!(await ensureFresh())) {
      state.me = null;
      return;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        state.me = await getJson('/api/store/me', { headers: { Authorization: `Bearer ${state.session.access_token}` } });
        return;
      } catch (e) {
        if (e.status === 401 && attempt === 0 && (await ensureFresh(true))) continue;
        if (e.status === 401) {
          forget();
          state.meError = 'Your login expired. Please log in again.';
        } else {
          state.me = null;
          state.meError = 'Your store details aren\'t available right now. Please try again later.';
        }
        return;
      }
    }
  }

  // ------------------------------------------------------------------ windows and products

  function windows() {
    const c = state.cfg;
    const t = now();
    const from = c && c.founderSale ? c.founderSale.from : FOUNDER_FROM;
    const until = c && c.founderSale ? c.founderSale.until : FOUNDER_UNTIL;
    const launchAt = c && c.launchAt ? c.launchAt : LAUNCH;
    return {
      t,
      from,
      until,
      launchAt,
      founderOpen: !!(c && c.founderSale && c.founderSale.open),
      premiumOpen: !!(c && c.premiumOpen),
      storeOpen: !!(c && c.open),
      legendLeft: c && typeof c.legendLeft === 'number' ? c.legendLeft : null,
    };
  }
  function product(id) {
    return state.cfg ? state.cfg.products.find((p) => p.id === id) || null : null;
  }
  function priced(id) {
    return !!(state.cfg && state.cfg.prices && state.cfg.prices[id]);
  }
  function founderClosedText(w) {
    if (w.t < w.from) return `On sale from ${day(w.from)}`;
    if (w.t >= w.until) return 'Founder packs have closed';
    return 'Not on sale right now. Please check back soon.';
  }
  function premiumClosedText(w) {
    if (w.t < w.launchAt) return `Premium goes on sale on opening day, ${day(w.launchAt)}`;
    return 'Not on sale right now. Please check back soon.';
  }

  /** What each card shows: { productId, pence, label, enabled, note }. */
  function cardPlan(cardId) {
    const w = windows();
    const p = product(cardId);
    const plan = { productId: cardId, pence: p ? p.pence : null, label: '', enabled: false, note: '', needsLogin: false, owned: false, upgradeFrom: '' };
    const myTier = state.me ? state.me.founderTier : null;
    const myRank = myTier ? RANK[myTier] || 0 : 0;

    if (cardId.startsWith('premium_')) {
      plan.label = `Buy ${cardId.slice(8)} days`;
      if (!w.premiumOpen) plan.note = premiumClosedText(w);
      else if (!w.storeOpen || !priced(cardId)) plan.note = 'Not on sale right now. Please check back soon.';
      else plan.enabled = true;
    } else {
      const tier = cardId.slice(8);
      const name = TIER_NAME[tier];
      plan.label = `Buy ${name}`;
      if (myRank >= RANK[tier]) {
        plan.label = myRank === RANK[tier] ? 'You own this pack' : `Included in your ${TIER_NAME[myTier]} pack`;
        plan.owned = true;
        return plan;
      }
      if (myRank > 0) {
        const up = `upgrade_${myTier}_${tier}`;
        const u = product(up);
        plan.productId = up;
        if (u) plan.pence = u.pence;
        plan.label = `Upgrade to ${name}`;
        plan.upgradeFrom = myTier;
      }
      if (!w.founderOpen) plan.note = founderClosedText(w);
      else if (tier === 'legend' && w.legendLeft !== null && w.legendLeft <= 0) plan.note = 'All 300 Legend packs are taken';
      else if (!w.storeOpen || !priced(plan.productId)) plan.note = 'Not on sale right now. Please check back soon.';
      else plan.enabled = true;
    }
    if (plan.enabled && !state.me) {
      plan.needsLogin = true;
      plan.note = 'Log in above to buy.';
    }
    return plan;
  }

  // ------------------------------------------------------------------ rendering

  function renderStatus() {
    const box = $('[data-sale-status]');
    const w = windows();
    const lines = [];
    if (w.founderOpen && w.storeOpen) lines.push(`Founder packs are on sale until ${day(w.until - 1)}.`);
    else if (w.t < w.from) lines.push(`Founder packs go on sale on ${day(w.from)} and close at the end of ${day(w.until - 1)}.`);
    else if (w.t >= w.until) lines.push('Founder packs have closed. Thank you to every founder.');
    if (w.premiumOpen && w.storeOpen) lines.push('Premium time is on sale now.');
    else if (w.t < w.launchAt) lines.push(`Premium time goes on sale on opening day, ${day(w.launchAt)}.`);
    if (!w.storeOpen && !lines.length) lines.push('The store isn\'t open yet. Please check back soon.');
    const sandbox = state.cfg && state.cfg.env === 'sandbox';
    box.classList.toggle('test', !!sandbox);
    box.replaceChildren(el('b', '', sandbox ? 'Test store (sandbox): no real money is taken.' : 'Store dates'), ...lines.map((l) => el('span', '', l)));
  }

  function renderCards() {
    const w = windows();
    $$('[data-product]').forEach((card) => {
      const id = card.dataset.product;
      const plan = cardPlan(id);
      const btn = $('[data-buy]', card);
      const note = $('[data-note]', card);
      const price = $('[data-price]', card);
      if (plan.pence != null) price.textContent = money(plan.pence);
      let small = $('small', price.parentElement);
      if (plan.upgradeFrom) {
        if (!small) {
          small = el('small');
          price.parentElement.append(small);
        }
        small.textContent = `to upgrade from ${TIER_NAME[plan.upgradeFrom]}`;
      } else if (small) small.remove();
      card.classList.toggle('owned', plan.owned);
      btn.textContent = plan.label;
      btn.disabled = !plan.enabled;
      btn.dataset.buyProduct = plan.productId;
      btn.dataset.needsLogin = plan.needsLogin ? '1' : '';
      note.textContent = plan.note;
      if (id === 'founder_legend') {
        const left = $('[data-left]', card);
        left.textContent = w.legendLeft !== null && w.founderOpen ? `${w.legendLeft.toLocaleString('en-GB')} left.` : '';
      }
    });
  }

  function msgLine() {
    const p = el('p', 'msg');
    p.setAttribute('role', 'status');
    return p;
  }

  function field(label, input) {
    const f = el('div', 'field');
    const l = el('label', '', label);
    l.htmlFor = input.id;
    f.append(l, input);
    return f;
  }

  function renderLogin(box, message) {
    const form = el('form', 'store-form');
    const intro = el('p', '', 'Log in with the email and password you use in the game.');
    const row = el('div', 'form-row');
    const i1 = el('input');
    Object.assign(i1, { type: 'email', id: 'store-email', name: 'email', autocomplete: 'email', required: true });
    const i2 = el('input');
    Object.assign(i2, { type: 'password', id: 'store-password', name: 'password', autocomplete: 'current-password', required: true });
    const go = el('button', 'btn iron', 'Log in');
    go.type = 'submit';
    row.append(field('Email', i1), field('Password', i2), go);
    const msg = msgLine();
    msg.textContent = message || '';
    const signup = el('p', 'faint small');
    const a = el('a', '', 'Create one in the game');
    a.href = '/play/';
    signup.append('No account yet? ', a, '.');
    form.append(intro, row, msg, signup);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      msg.className = 'msg';
      msg.textContent = 'Logging in…';
      try {
        const res = await authFetch('token?grant_type=password', { email: i1.value.trim(), password: i2.value });
        if (!res.ok) throw new Error(await errorText(res));
        keep(await res.json());
        await loadMe();
        render();
      } catch (err) {
        msg.className = 'msg bad';
        msg.textContent = err && err.message ? err.message : 'Could not log in. Please try again.';
        go.disabled = false;
      }
    });
    box.append(form);
  }

  function renderAccount() {
    const box = $('[data-account]');
    const title = el('h2', '', 'Your account');
    title.id = 'account-title';
    box.replaceChildren(title);
    if (!state.auth) {
      box.append(el('p', 'faint', 'The realm is waking up. Your account will appear in a moment…'));
      return;
    }
    if (state.auth.mode !== 'email') {
      box.append(el('p', '', 'The store needs email accounts, and this server doesn\'t use them yet. Please check back soon.'));
      return;
    }
    if (!state.session) return renderLogin(box, state.meError);

    const me = state.me;
    if (!me) {
      box.append(el('p', '', 'You\'re logged in.'), el('p', 'faint', state.meError || 'Loading your account…'));
      box.append(logoutLine());
      return;
    }
    const facts = el('dl', 'acct');
    const fact = (k, v, cls) => {
      const row = el('div', cls || '');
      row.append(el('dt', '', k), el('dd', '', v));
      facts.append(row);
    };
    fact('Email', me.email || '–');
    const until = Number(me.premiumUntil) || 0;
    if (me.premiumActive && until > now()) fact('Premium', `Premium active until ${day(until)}`, 'gold');
    else if (until > now()) fact('Premium', `Premium starts on opening day and lasts until ${day(until)}`, 'gold');
    else fact('Premium', 'No premium');
    if (me.founderTier && TIER_NAME[me.founderTier]) {
      const no = Number(me.founderNo) || 0;
      const label = me.founderTier === 'legend' && no ? `Legend #${String(no).padStart(3, '0')}` : `${TIER_NAME[me.founderTier]} founder${no ? ` (no. ${no})` : ''}`;
      fact('Founder', label, 'gold');
    } else fact('Founder', 'Not a founder yet');
    if (Number(me.extraSlots) > 0) fact('Character slots', `+${me.extraSlots} extra`);
    box.append(facts);

    if (me.founderTier) box.append(founderNamePicker(me));
    if (me.founderTier === 'warden' || me.founderTier === 'legend') box.append(soundtrack());
    box.append(logoutLine());
  }

  function founderNamePicker(me) {
    const wrap = el('div', 'acct-part');
    wrap.append(el('h3', '', 'Your founder name'));
    const chars = Array.isArray(me.characters) ? me.characters : [];
    if (!chars.length) {
      wrap.append(el('p', 'faint small', 'Make a character in the game first, then pick it here. Its name goes in the hall of founders and on the Founders\' Stone.'));
      return wrap;
    }
    wrap.append(el('p', 'faint small', 'Pick which character\'s name appears in the hall of founders and on the Founders\' Stone.'));
    const row = el('div', 'form-row');
    const sel = el('select');
    sel.id = 'founder-name';
    if (!me.founderName) {
      const o = el('option', '', 'Choose a character…');
      o.value = '';
      sel.append(o);
    }
    for (const c of chars) {
      const o = el('option', '', `${c.name} · level ${c.level} ${VOC[c.vocation] || c.vocation || ''}`.trim());
      o.value = c.name;
      if (c.name === me.founderName) o.selected = true;
      sel.append(o);
    }
    const save = el('button', 'btn iron', 'Save');
    save.type = 'button';
    row.append(field('Character', sel), save);
    const msg = msgLine();
    save.addEventListener('click', async () => {
      if (!sel.value) {
        msg.className = 'msg bad';
        msg.textContent = 'Choose a character first.';
        return;
      }
      save.disabled = true;
      msg.className = 'msg';
      msg.textContent = 'Saving…';
      try {
        if (!(await ensureFresh())) throw new Error('Your login expired. Please log in again.');
        const res = await fetch('/api/store/founder-name', {
          method: 'POST',
          headers: { Authorization: `Bearer ${state.session.access_token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: sel.value }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j.error || `Could not save (error ${res.status}).`);
        me.founderName = sel.value;
        msg.className = 'msg ok';
        msg.textContent = `Saved. ${sel.value} is your founder name.`;
      } catch (err) {
        msg.className = 'msg bad';
        msg.textContent = err && err.message ? err.message : 'Could not save. Please try again.';
      }
      save.disabled = false;
    });
    wrap.append(row, msg);
    return wrap;
  }

  /** The download list is written into the page by the build (from the game's music table). */
  function soundtrack() {
    const wrap = el('div', 'acct-part');
    const tpl = $('[data-soundtrack-tpl]');
    const list = tpl ? tpl.content.cloneNode(true) : null;
    const n = tpl ? tpl.content.querySelectorAll('li').length : 0;
    wrap.append(el('h3', '', 'The Thornvale soundtrack'), el('p', 'faint small', `Thank you for being a founder. Here are all ${n} tracks to keep (M4A audio).`));
    if (list) wrap.append(list);
    return wrap;
  }

  function logoutLine() {
    const p = el('p', 'faint small acct-out');
    const b = el('button', 'linkish', 'Log out');
    b.type = 'button';
    b.addEventListener('click', () => {
      forget();
      render();
    });
    if (state.me && state.me.email) p.append(`Logged in as ${state.me.email}. `);
    p.append(b);
    return p;
  }

  function render() {
    renderStatus();
    renderAccount();
    renderCards();
  }

  // ------------------------------------------------------------------ checkout

  function loadPaddle() {
    if (state.paddle || !state.cfg || !state.cfg.open || !state.cfg.clientToken) return Promise.resolve(state.paddle);
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = PADDLE_JS;
      s.onload = () => {
        try {
          if (state.cfg.env === 'sandbox') window.Paddle.Environment.set('sandbox');
          window.Paddle.Initialize({ token: state.cfg.clientToken, eventCallback: onPaddleEvent });
          state.paddle = true;
        } catch {
          state.paddle = false;
        }
        resolve(state.paddle);
      };
      s.onerror = () => resolve(false);
      document.head.append(s);
    });
  }

  function onPaddleEvent(ev) {
    if (!ev || ev.name !== 'checkout.completed') return;
    const thanks = $('[data-thanks]');
    thanks.hidden = false;
    thanks.replaceChildren(el('b', '', 'Thank you for your purchase.'), el('span', '', 'Paddle will email your receipt. We\'re adding it to your account now…'));
    waitForDelivery();
  }

  async function waitForDelivery() {
    const before = state.pending || { premiumUntil: state.me ? state.me.premiumUntil : 0, founderTier: state.me ? state.me.founderTier : null };
    const thanks = $('[data-thanks]');
    const started = Date.now();
    while (Date.now() - started < 60000) {
      await new Promise((r) => setTimeout(r, 3000));
      await loadMe();
      const me = state.me;
      if (me && ((Number(me.premiumUntil) || 0) > (Number(before.premiumUntil) || 0) || me.founderTier !== before.founderTier)) {
        state.pending = null;
        await loadConfig();
        render();
        thanks.replaceChildren(el('b', '', 'Thank you. Your purchase is on your account.'), el('span', '', 'It\'s ready the next time you log in to the game.'));
        return;
      }
    }
    state.pending = null;
    render();
    const mail = el('a', '', 'support@thornvaleonline.com');
    mail.href = 'mailto:support@thornvaleonline.com';
    const span = el('span', '', 'Your payment went through, but it\'s taking longer than usual to reach your account. Please refresh this page in a few minutes. If it still isn\'t there, email ');
    span.append(mail, ' with your receipt.');
    thanks.replaceChildren(el('b', '', 'Thank you for your purchase.'), span);
  }

  async function buy(btn) {
    const id = btn.dataset.buyProduct;
    const note = $('[data-note]', btn.closest('[data-product]'));
    if (btn.dataset.needsLogin) {
      scrollTo($('#account'), 'start');
      const input = $('#store-email');
      if (input) setTimeout(() => input.focus({ preventScroll: true }), calm ? 0 : 400);
      return;
    }
    const consent = $('[data-consent]');
    const consentBox = $('[data-consent-box]');
    if (!consent.checked) {
      consentBox.classList.add('attention');
      scrollTo(consentBox, 'center');
      setTimeout(() => consent.focus({ preventScroll: true }), calm ? 0 : 400);
      if (note) note.textContent = 'Please tick the box under "Before you buy" first.';
      return;
    }
    if (!(await ensureFresh())) {
      render();
      return;
    }
    const priceId = state.cfg && state.cfg.prices ? state.cfg.prices[id] : null;
    if (!priceId) return;
    btn.disabled = true;
    const ok = await loadPaddle();
    btn.disabled = false;
    if (!ok) {
      if (note) note.textContent = 'The payment window couldn\'t load. Please turn off any blocker for this page and try again.';
      return;
    }
    state.pending = { product: id, premiumUntil: state.me.premiumUntil, founderTier: state.me.founderTier };
    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email: state.me.email },
      customData: { account: state.me.account, product: id },
    });
  }

  // ------------------------------------------------------------------ start

  async function start() {
    if (!$('[data-account]')) return;
    $$('[data-buy]').forEach((b) => b.addEventListener('click', () => buy(b)));
    const consent = $('[data-consent]');
    consent.addEventListener('change', () => {
      if (consent.checked) {
        $('[data-consent-box]').classList.remove('attention');
        renderCards();
      }
    });
    renderCards();
    state.session = loadSession();
    const [auth] = await Promise.all([
      getJson('/api/auth-config').catch(() => ({ mode: 'local' })),
      loadConfig(),
    ]);
    state.auth = auth && auth.mode === 'email' && auth.url && auth.key ? auth : { mode: 'local' };
    if (state.auth.mode === 'email' && state.session) await loadMe();
    render();
    if (state.cfg && state.cfg.open) loadPaddle(); // warm up so the checkout opens quickly
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
