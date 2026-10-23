import { t } from '../i18n/i18n';
/**
 * Movable, resizable side panels (like the classic client's side bar):
 *  - drag a panel by the grip bar at its top to another place, in either column;
 *  - drag the handle at its bottom edge to make it taller or shorter (double-click: automatic height);
 *  - drag the left edge of the side bar to make the whole side bar wider or narrower (double-click: default).
 * The layout is remembered in this browser. "Reset layout" in the help window puts everything back.
 */
// v2: the two-flank HUD (2026-10-21) — older saved layouts described the old two-column side bar
const KEY = 'thornvale.panelLayout.v2';

interface Layout {
  cols: string[][];
  heights: Record<string, number>;
  side?: number;
  bottom?: number;
  hotbarTop?: boolean;
}

function load(): Layout | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Layout) : null;
  } catch {
    return null;
  }
}

function store(l: Layout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage off */
  }
}

export function resetPanelLayout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage off */
  }
  location.reload();
}

/** The panel's name: its second class ("panel battle" → "battle"). */
function keyOf(p: HTMLElement): string {
  return [...p.classList].find((c) => c !== 'panel') ?? 'panel';
}

export function makePanelsMovable(sidebar: HTMLElement, cols: HTMLElement[], onResize: () => void): void {
  const panels = () => cols.flatMap((c) => [...c.children].filter((x): x is HTMLElement => x instanceof HTMLElement && x.classList.contains('panel')));
  const save = () => {
    const l: Layout = { cols: cols.map((c) => [...c.children].filter((x) => x.classList.contains('panel')).map((x) => keyOf(x as HTMLElement))), heights: {}, side: saved?.side };
    for (const p of panels()) if (p.style.height) l.heights[keyOf(p)] = parseInt(p.style.height, 10);
    saved = l;
    store(l);
  };
  let saved = load();

  // grips and resize handles
  for (const p of panels()) {
    p.classList.add('movable');
    const grip = document.createElement('div');
    grip.className = 'panel-grip';
    grip.title = t('Drag to move this panel');
    p.prepend(grip);
    const rs = document.createElement('div');
    rs.className = 'panel-resize';
    rs.title = t('Drag to resize · double-click: automatic height');
    p.appendChild(rs);

    grip.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const ph = document.createElement('div');
      ph.className = 'panel-placeholder';
      ph.style.height = `${p.offsetHeight}px`;
      p.after(ph);
      const r = p.getBoundingClientRect();
      const dy = e.clientY - r.top;
      p.classList.add('dragging-panel');
      p.style.width = `${r.width}px`;
      p.style.left = `${r.left}px`;
      p.style.top = `${r.top}px`;
      const move = (ev: MouseEvent) => {
        p.style.top = `${ev.clientY - dy}px`;
        p.style.left = `${ev.clientX - r.width / 2}px`;
        // which column, which slot
        let col = cols[0];
        let best = Infinity;
        for (const c of cols) {
          const cr = c.getBoundingClientRect();
          const d = ev.clientX < cr.left ? cr.left - ev.clientX : ev.clientX > cr.right ? ev.clientX - cr.right : 0;
          if (d < best) { best = d; col = c; }
        }
        const others = [...col.children].filter((x) => x !== p && x !== ph && x.classList.contains('panel')) as HTMLElement[];
        const before = others.find((o) => { const orr = o.getBoundingClientRect(); return ev.clientY < orr.top + orr.height / 2; });
        if (before) col.insertBefore(ph, before);
        else {
          // keep non-panel bits (like the hover line) at the end of the column
          const tail = [...col.children].find((x) => x !== ph && x !== p && !x.classList.contains('panel'));
          col.insertBefore(ph, tail ?? null);
        }
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        ph.replaceWith(p);
        p.classList.remove('dragging-panel');
        p.style.width = '';
        p.style.left = '';
        p.style.top = '';
        save();
        onResize();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    rs.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY;
      const h0 = p.offsetHeight;
      const move = (ev: MouseEvent) => {
        p.style.height = `${Math.max(48, Math.min(window.innerHeight - 40, h0 + ev.clientY - y0))}px`;
        p.classList.add('sized');
        onResize();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        save();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    rs.addEventListener('dblclick', () => {
      p.style.height = '';
      p.classList.remove('sized');
      save();
      onResize();
    });
  }

  // side bar width
  const edge = document.createElement('div');
  edge.className = 'sidebar-edge';
  edge.title = t('Drag to make the side bar wider or narrower · double-click: default');
  sidebar.appendChild(edge);
  const setSide = (px: number | undefined) => {
    if (px) document.documentElement.style.setProperty('--side', `${px}px`);
    else document.documentElement.style.removeProperty('--side');
    window.dispatchEvent(new Event('resize'));
  };
  edge.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = sidebar.offsetWidth;
    const move = (ev: MouseEvent) => {
      const w = Math.max(200, Math.min(Math.floor(window.innerWidth * 0.6), w0 + (x0 - ev.clientX)));
      setSide(w);
      if (saved) saved.side = w;
      else saved = { cols: [], heights: {}, side: w };
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      save();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  edge.addEventListener('dblclick', () => {
    if (saved) saved.side = undefined;
    setSide(undefined);
    save();
  });

  // restore
  if (saved) {
    const byKey = new Map(panels().map((p) => [keyOf(p), p]));
    saved.cols.forEach((keys, i) => {
      const col = cols[i];
      if (!col) return;
      const tail = [...col.children].find((x) => !x.classList.contains('panel'));
      for (const k of keys) {
        const p = byKey.get(k);
        if (p) col.insertBefore(p, tail ?? null);
      }
    });
    for (const [k, h] of Object.entries(saved.heights ?? {})) {
      const p = byKey.get(k);
      if (p && h > 0) { p.style.height = `${h}px`; p.classList.add('sized'); }
    }
    if (saved.side) setSide(saved.side);
  }
}

/**
 * The bottom area (action bar + chat): drag its top edge to make it taller or shorter
 * (double-click: default), and the action bar can sit below the game view or on top of it.
 */
export function makeBottomResizable(root: HTMLElement, bottom: HTMLElement, hotbar: HTMLElement): void {
  const l: Layout = load() ?? { cols: [], heights: {} };
  const keep = () => {
    const cur = load() ?? { cols: [], heights: {} };
    cur.bottom = l.bottom;
    cur.hotbarTop = l.hotbarTop;
    store(cur);
  };
  const setBottom = (px: number | undefined) => {
    if (px) document.documentElement.style.setProperty('--bottom', `${px}px`);
    else document.documentElement.style.removeProperty('--bottom');
    window.dispatchEvent(new Event('resize'));
  };
  const edge = document.createElement('div');
  edge.className = 'bottom-edge';
  edge.title = t('Drag to make the chat area taller or shorter · double-click: default');
  root.appendChild(edge);
  edge.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = bottom.offsetHeight;
    const move = (ev: MouseEvent) => {
      l.bottom = Math.max(110, Math.min(Math.floor(window.innerHeight * 0.65), h0 + (y0 - ev.clientY)));
      setBottom(l.bottom);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      keep();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  edge.addEventListener('dblclick', () => { l.bottom = undefined; setBottom(undefined); keep(); });

  // action bar position: under the game view (default) or along its top edge
  const place = () => {
    if (l.hotbarTop) { root.appendChild(hotbar); hotbar.classList.add('floating-top'); }
    else { bottom.prepend(hotbar); hotbar.classList.remove('floating-top'); }
  };
  const btn = document.createElement('button');
  btn.className = 'btn tiny hotbar-move';
  btn.textContent = '⇅';
  btn.title = t('Move the action bar to the top of the game view / back down');
  btn.addEventListener('click', () => { l.hotbarTop = !l.hotbarTop; place(); keep(); });
  hotbar.appendChild(btn);
  if (l.bottom) setBottom(l.bottom);
  place();
}
