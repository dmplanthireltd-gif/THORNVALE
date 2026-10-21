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
})();
