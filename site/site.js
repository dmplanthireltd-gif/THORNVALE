// Thornvale website: live server status and the grand-opening countdown. No dependencies.
(() => {
  // 1 January 2027, 00:00 UK time. The UK is on GMT (UTC+0) in January.
  const OPENING = Date.UTC(2027, 0, 1, 0, 0, 0);

  const status = document.querySelectorAll('[data-status]');
  async function refreshStatus() {
    let text = 'Server waking up…';
    let online = false;
    try {
      const res = await fetch('/status', { cache: 'no-store' });
      if (res.ok) {
        const s = await res.json();
        const n = Number(s.online) || 0;
        text = `Server online · ${n} ${n === 1 ? 'player' : 'players'} in Thornvale`;
        online = true;
      }
    } catch {
      // keep the waking-up text; Render's free instance may be asleep
    }
    status.forEach((el) => {
      el.classList.toggle('online', online);
      const label = el.querySelector('[data-status-text]');
      if (label) label.textContent = text;
    });
  }
  if (status.length) {
    refreshStatus();
    setInterval(refreshStatus, 30000);
  }

  const boxes = document.querySelectorAll('[data-countdown]');
  function tick() {
    const left = Math.max(0, OPENING - Date.now());
    const parts = {
      days: Math.floor(left / 86400000),
      hours: Math.floor(left / 3600000) % 24,
      minutes: Math.floor(left / 60000) % 60,
    };
    boxes.forEach((box) => {
      if (left === 0) {
        box.textContent = 'The gates are open. Welcome to Thornvale!';
        return;
      }
      for (const [k, v] of Object.entries(parts)) {
        const el = box.querySelector(`[data-${k}]`);
        if (el) el.textContent = k === 'days' ? String(v) : String(v).padStart(2, '0');
      }
    });
  }
  if (boxes.length) {
    tick();
    setInterval(tick, 15000);
  }

  // Full trailer with sound in a dialog; stops when closed.
  const dialog = document.querySelector('.trailer-dialog');
  if (dialog) {
    const video = dialog.querySelector('video');
    document.querySelectorAll('[data-open-trailer]').forEach((b) => b.addEventListener('click', () => {
      dialog.showModal();
      video.currentTime = 0;
      video.play().catch(() => {});
    }));
    dialog.addEventListener('close', () => video.pause());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  // Highscores table (built with DOM methods, never innerHTML: names come from players).
  const table = document.querySelector('[data-highscores]');
  if (table) {
    const body = table.querySelector('tbody');
    const updated = document.querySelector('[data-highscores-updated]');
    const chips = document.querySelectorAll('[data-voc]');
    const VOC = { knight: 'Knight', paladin: 'Paladin', sorcerer: 'Sorcerer', druid: 'Druid' };
    let rows = [];
    let voc = '';
    const message = (text) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'faint';
      td.textContent = text;
      tr.append(td);
      body.replaceChildren(tr);
    };
    const render = () => {
      const shown = voc ? rows.filter((r) => r.vocation === voc) : rows;
      if (!shown.length) return message(rows.length ? 'Nobody of this vocation on the list yet.' : 'No adventurers yet. Be the first!');
      body.replaceChildren(...shown.map((r, i) => {
        const tr = document.createElement('tr');
        for (const v of [voc ? i + 1 : r.rank, r.name, VOC[r.vocation] ?? r.vocation, r.level]) {
          const td = document.createElement('td');
          td.textContent = String(v);
          tr.append(td);
        }
        return tr;
      }));
    };
    chips.forEach((c) => c.addEventListener('click', () => {
      voc = c.dataset.voc;
      chips.forEach((x) => x.classList.toggle('on', x === c));
      render();
    }));
    const load = async () => {
      try {
        const res = await fetch('/api/highscores', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        rows = Array.isArray(data.rows) ? data.rows : [];
        render();
        if (updated && data.updated) updated.textContent = `Last updated ${new Date(data.updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      } catch {
        message('The server is waking up. The highscores will appear in a moment…');
        setTimeout(load, 15000);
      }
    };
    load();
  }
})();
