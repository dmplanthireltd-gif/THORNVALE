// Thornvale website: live realm status, opening countdown, ember sparks, trailer, region music,
// bestiary filters, atlas pan/zoom and highscores. Plain script, no dependencies.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- realm status
  const status = $('[data-status]');
  if (status) {
    const text = $('[data-status-text]', status);
    const check = async () => {
      try {
        const r = await fetch('/status', { cache: 'no-store' });
        if (!r.ok) throw new Error();
        const d = await r.json();
        const n = Number(d.online) || 0;
        status.className = 'realm up';
        text.textContent = `Realm online · ${n} ${n === 1 ? 'wanderer' : 'wanderers'}`;
      } catch {
        status.className = 'realm down';
        text.textContent = 'Realm waking…';
      }
    };
    check();
    setInterval(check, 60000);
  }

  // ---------------------------------------------------------------- countdown
  const gate = $('[data-countdown]');
  if (gate) {
    const at = Date.parse(gate.dataset.opening || '2027-01-01T00:00:00Z');
    const part = (k) => $(`[data-${k}]`, gate);
    const pad = (v) => String(v).padStart(2, '0');
    const tick = () => {
      let s = Math.max(0, Math.floor((at - Date.now()) / 1000));
      if (!s) {
        $('.gate-k', gate).textContent = 'The gates are open';
        $('.clock', gate).hidden = true;
        return;
      }
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      part('days').textContent = String(d);
      part('hours').textContent = pad(h);
      part('minutes').textContent = pad(m);
      part('seconds').textContent = pad(s);
      setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  }

  // ---------------------------------------------------------------- ember sparks
  if (!calm) {
    for (const c of $$('[data-embers]')) {
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      let w = 0, h = 0, dpr = 1, on = true;
      const sparks = [];
      const size = () => {
        dpr = Math.min(2, devicePixelRatio || 1);
        w = c.clientWidth; h = c.clientHeight;
        c.width = w * dpr; c.height = h * dpr;
      };
      const spawn = (y) => ({
        x: Math.random() * w, y: y ?? h + 10, r: 0.6 + Math.random() * 2.2,
        vy: 0.3 + Math.random() * 1.1, vx: (Math.random() - 0.5) * 0.4, life: 0, max: 220 + Math.random() * 380, t: Math.random() * 6,
      });
      size();
      addEventListener('resize', size);
      const count = () => Math.round(Math.min(90, w / 14));
      for (let i = 0; i < count(); i++) sparks.push(spawn(Math.random() * h));
      new IntersectionObserver((e) => { on = e[0].isIntersecting; if (on) requestAnimationFrame(draw); }).observe(c);
      function draw() {
        if (!on) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        while (sparks.length < count()) sparks.push(spawn());
        for (const s of sparks) {
          s.life++; s.t += 0.03;
          s.y -= s.vy; s.x += s.vx + Math.sin(s.t) * 0.35;
          const a = Math.max(0, Math.min(1, s.life / 40, (s.max - s.life) / 80));
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          g.addColorStop(0, `rgba(255,214,150,${a})`);
          g.addColorStop(0.35, `rgba(255,128,48,${a * 0.6})`);
          g.addColorStop(1, 'rgba(200,60,20,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2); ctx.fill();
          if (s.life > s.max || s.y < -20) Object.assign(s, spawn());
        }
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    }
  }

  // ---------------------------------------------------------------- trailer
  const dialog = $('[data-trailer]');
  if (dialog && dialog.showModal) {
    const video = $('video', dialog);
    $$('[data-open-trailer]').forEach((b) => b.addEventListener('click', () => {
      stopSong();
      dialog.showModal();
      video.currentTime = 0;
      video.play().catch(() => {});
    }));
    dialog.addEventListener('close', () => video.pause());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  // ---------------------------------------------------------------- region music
  const audio = new Audio();
  audio.loop = true;
  let playing = null;
  function stopSong() {
    audio.pause();
    if (playing) playing.setAttribute('aria-pressed', 'false');
    playing = null;
  }
  $$('[data-song]').forEach((b) => b.addEventListener('click', () => {
    if (playing === b) return stopSong();
    stopSong();
    audio.src = b.dataset.song;
    audio.currentTime = 0;
    audio.play().then(() => { playing = b; b.setAttribute('aria-pressed', 'true'); }).catch(() => {});
  }));

  // ---------------------------------------------------------------- bestiary
  const filters = $('[data-beast-filters]');
  if (filters) {
    const grid = $('[data-beasts]');
    const cards = $$('.beast', grid);
    const counter = $('[data-beast-count]');
    const apply = () => {
      const q = filters.q.value.trim().toLowerCase();
      const weak = filters.weak.value;
      const tiers = new Set($$('input[name=tier]:checked', filters).map((i) => i.value));
      const key = filters.sort.value;
      let shown = 0;
      for (const c of cards) {
        const ok = (!q || c.dataset.name.includes(q)) && (!weak || c.dataset.weak.split(' ').includes(weak)) && tiers.has(c.dataset.tier);
        c.hidden = !ok;
        if (ok) shown++;
      }
      const sorted = [...cards].sort((a, b) => key === 'name' ? a.dataset.name.localeCompare(b.dataset.name) : Number(b.dataset[key]) - Number(a.dataset[key]));
      grid.append(...sorted);
      counter.textContent = `${shown} ${shown === 1 ? 'creature' : 'creatures'}`;
    };
    filters.addEventListener('input', apply);
    filters.addEventListener('change', apply);
    apply();
  }

  // ---------------------------------------------------------------- atlas
  const view = $('[data-atlas]');
  if (view) {
    const inner = $('[data-atlas-inner]', view);
    const W = 1280, H = 1600;
    let s = 1, x = 0, y = 0;
    const fit = () => Math.min(view.clientWidth / W, view.clientHeight / H);
    const clamp = () => {
      const vw = view.clientWidth, vh = view.clientHeight;
      s = Math.max(fit(), Math.min(2.5, s));
      x = W * s <= vw ? (vw - W * s) / 2 : Math.min(0, Math.max(vw - W * s, x));
      y = H * s <= vh ? (vh - H * s) / 2 : Math.min(0, Math.max(vh - H * s, y));
      inner.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      inner.querySelectorAll('.pin').forEach((p) => { p.style.scale = String(Math.min(2.2, 1 / s)); });
    };
    const zoomAt = (f, cx, cy) => {
      const ns = Math.max(fit(), Math.min(2.5, s * f));
      x = cx - ((cx - x) * ns) / s; y = cy - ((cy - y) * ns) / s; s = ns;
      clamp();
    };
    const center = (px, py, ns) => {
      s = ns; x = view.clientWidth / 2 - px * s; y = view.clientHeight / 2 - py * s;
      inner.style.transition = calm ? '' : 'transform .5s ease';
      clamp();
      setTimeout(() => { inner.style.transition = ''; }, 520);
    };
    s = fit(); clamp();
    addEventListener('resize', clamp);
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = view.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    const pts = new Map();
    let last = null, pinch = 0;
    view.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      view.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      view.classList.add('grab');
    });
    view.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = view.getBoundingClientRect();
        if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch = d;
        return;
      }
      x += e.clientX - last.x; y += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      clamp();
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; if (!pts.size) view.classList.remove('grab'); const p = [...pts.values()][0]; if (p) last = { ...p }; };
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    $$('[data-zoom]', view).forEach((b) => b.addEventListener('click', () => {
      const z = Number(b.dataset.zoom);
      if (!z) { s = fit(); clamp(); return; }
      zoomAt(z > 0 ? 1.4 : 1 / 1.4, view.clientWidth / 2, view.clientHeight / 2);
    }));
    const pick = (key) => {
      const pin = $(`.pin[data-town="${key}"]`, inner);
      if (!pin) return;
      $$('.pin.on', inner).forEach((p) => p.classList.remove('on'));
      $$('[data-goto].on').forEach((p) => p.classList.remove('on'));
      pin.classList.add('on');
      $(`[data-goto="${key}"]`)?.classList.add('on');
      center((parseFloat(pin.style.left) / 100) * W, (parseFloat(pin.style.top) / 100) * H, 1.3);
    };
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => { pick(b.dataset.goto); view.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); }));
    $$('.pin[data-town]', inner).forEach((p) => p.addEventListener('click', () => pick(p.dataset.town)));
  }

  // ---------------------------------------------------------------- highscores (DOM methods only: names come from players)
  const table = $('[data-highscores]');
  if (table) {
    const body = $('tbody', table);
    const podium = $('[data-podium]');
    const updated = $('[data-highscores-updated]');
    const VOC = { knight: 'Knight', paladin: 'Paladin', sorcerer: 'Sorcerer', druid: 'Druid' };
    let rows = [], voc = '';
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; };
    const message = (text) => {
      const tr = el('tr'); const td = el('td', 'faint', text); td.colSpan = 4; tr.append(td);
      body.replaceChildren(tr); podium.replaceChildren();
    };
    const render = () => {
      const shown = voc ? rows.filter((r) => r.vocation === voc) : rows;
      if (!shown.length) return message(rows.length ? 'Nobody of this vocation on the list yet.' : 'No heroes yet. Be the first!');
      podium.replaceChildren(...shown.slice(0, 3).map((r, i) => {
        const li = el('li', 'plate');
        li.append(el('span', 'place', ['I', 'II', 'III'][i]), el('span', 'who', r.name), el('span', 'what', `Level ${r.level} · ${VOC[r.vocation] ?? r.vocation}`));
        return li;
      }));
      body.replaceChildren(...shown.map((r, i) => {
        const tr = el('tr');
        for (const v of [i + 1, r.name, VOC[r.vocation] ?? r.vocation, r.level]) tr.append(el('td', '', v));
        return tr;
      }));
    };
    $$('[data-voc]').forEach((c) => c.addEventListener('click', () => {
      voc = c.dataset.voc;
      $$('[data-voc]').forEach((x) => x.classList.toggle('on', x === c));
      render();
    }));
    const load = async () => {
      try {
        const r = await fetch('/api/highscores', { cache: 'no-store' });
        if (!r.ok) throw new Error();
        const d = await r.json();
        rows = Array.isArray(d.rows) ? d.rows : [];
        render();
        if (updated && d.updated) updated.textContent = `Last updated ${new Date(d.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      } catch {
        message('The realm is waking up. The hall of heroes will appear in a moment…');
        setTimeout(load, 15000);
      }
    };
    load();
  }

  // ---------------------------------------------------------------- opening news sign-up
  $$('[data-notify]').forEach((form) => {
    const msg = $('[data-notify-msg]', form);
    const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('ok', !!ok); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('Enter a valid email address.');
      if (!form.consent.checked) return say('Tick the box to say we may email you about the opening.');
      const btn = $('button', form);
      btn.disabled = true;
      try {
        const r = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, consent: true, source: form.dataset.source || 'website' }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
        form.classList.add('done');
        say('Thank you! We will email you when the gates open.', true);
      } catch (err) {
        say(err.message || 'Something went wrong. Please try again.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---------------------------------------------------------------- reveal on scroll
  if (!calm && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const t = e.target; t.classList.add('in'); io.unobserve(t); setTimeout(() => { t.classList.remove('reveal', 'in'); t.style.transitionDelay = ''; }, 1200); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.sec-head, .path, .beast:not(.all .beast), .feat, .song, .shot, .map-frame, .news-card, .hall, .facts li').forEach((e, i) => {
      e.classList.add('reveal');
      e.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(e);
    });
  }
})();
