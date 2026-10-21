// Thornvale hall of founders (/founders/ only), from /api/founders. DOM methods only: names come
// from players. Legends first (numbered), then Wardens, then Wayfarers.
(() => {
  'use strict';
  const box = document.querySelector('[data-founders]');
  if (!box) return;
  const SALE_FROM = Date.UTC(2026, 11, 1); // 1 December 2026, UK time
  const GROUPS = [
    ['legend', 'Legends', 'Only 300, numbered'],
    ['warden', 'Wardens', ''],
    ['wayfarer', 'Wayfarers', ''],
  ];
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function empty(text) {
    const div = el('div', 'roll-empty plate');
    const a = el('a', 'btn iron', 'See the founder packs');
    a.href = '/store/#founders';
    div.append(el('p', 'lede', text), a);
    box.replaceChildren(div);
  }
  const notYet = 'Founder packs go on sale on 1 December 2026. The first founders will appear here.';
  async function load() {
    let rows;
    try {
      const res = await fetch('/api/founders', { cache: 'no-store' });
      if (res.status === 404) return empty(notYet);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      rows = Array.isArray(data.rows) ? data.rows : [];
    } catch {
      box.replaceChildren(el('p', 'faint center', 'The realm is waking up. The founders will appear in a moment…'));
      setTimeout(load, 15000);
      return;
    }
    if (!rows.length) return empty(Date.now() < SALE_FROM ? notYet : 'No founders have picked their name yet. Be the first.');
    const parts = [];
    for (const [tier, title, note] of GROUPS) {
      const list = rows.filter((r) => r.tier === tier);
      if (!list.length) continue;
      list.sort((a, b) => (tier === 'legend' ? (Number(a.no) || 1e9) - (Number(b.no) || 1e9) : String(a.name).localeCompare(String(b.name))));
      const sec = el('section', `roll-group roll-${tier}`);
      const head = el('header', 'roll-head');
      const kicker = el('p', 'kicker left');
      kicker.append(el('span', '', note ? `${list.length.toLocaleString('en-GB')} · ${note}` : list.length.toLocaleString('en-GB')));
      head.append(el('h2', '', title), kicker);
      const ul = el('ul', 'roll-list');
      for (const r of list) {
        const li = el('li');
        if (tier === 'legend' && Number(r.no)) li.append(el('span', 'no', `#${String(r.no).padStart(3, '0')}`));
        li.append(el('b', '', String(r.name)));
        ul.append(li);
      }
      sec.append(head, ul);
      parts.push(sec);
    }
    box.replaceChildren(...parts);
  }
  load();
})();
