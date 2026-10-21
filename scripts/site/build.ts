/**
 * Builds the Thornvale website (site/) in the style of the game's HUD (design 2c: brown panels,
 * gold corner brackets, gold diamond labels and crest, Palatino).
 *
 *   npx tsx scripts/site/build.ts           # rebuild every page (+ the atlas picture)
 *   npx tsx scripts/site/build.ts --no-atlas
 *
 * Pages are plain HTML written here from templates; long-form text lives in scripts/site/content/
 * (guide, FAQ, rules, privacy, terms of sale, news posts) so it can be edited without touching code. Monster,
 * town, vocation and count facts are read from the game's own content (scripts/site/data.ts), so
 * re-run this after adding monsters, towns or spells. Output is static: the Node server serves
 * site/ as-is, no runtime dependencies.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlas, bestiary, counts, towns, vocations, type Beast } from './data';
import {
  FREE_DEPOT_SLOTS, FREE_MARKET_OFFERS, FREE_TOWNS, LEGEND_CAP, PREMIUM_DEPOT_SLOTS, PREMIUM_MARKET_OFFERS, PREMIUM_REGEN, PRODUCTS, type ProductId,
} from '../../src/game/premium/premium';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = join(ROOT, 'site');
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), 'content');
const ORIGIN = 'https://thornvaleonline.com';
const OPENING = '2027-01-01T00:00:00Z'; // midnight UK time (GMT in January)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const content = (name: string) => readFileSync(join(CONTENT, `${name}.html`), 'utf8');
const C = counts();

// ------------------------------------------------------------------ emblems (original artwork)

// the game's own crest (HUD title strip): a gold-edged diamond with a gold T
const CREST = (size = 40, cls = 'crest') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true">
<rect x="3" y="3" width="14" height="14" transform="rotate(45 10 10)" fill="#2b2621" stroke="#c9a24a" stroke-width="1.5"/>
<path d="M6.5 6.5h7v2h-2.5v6h-2v-6H6.5z" fill="#e8c26a"/></svg>`;

const EMBLEM: Record<string, string> = {
  knight: '<path d="M32 6l18 7v14c0 13-8 22-18 27C22 49 14 40 14 27V13z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 16v30M24 24h16" stroke="currentColor" stroke-width="3" fill="none"/>',
  paladin: '<path d="M18 52C40 46 46 26 40 10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M18 52L40 10" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M14 30h34M48 30l-7-5M48 30l-7 5M14 30l4-4M14 30l4 4" stroke="currentColor" stroke-width="3" fill="none"/>',
  sorcerer: '<path d="M32 8c6 10 14 15 14 27a14 14 0 0 1-28 0c0-7 4-11 7-15 1 6 4 8 6 8-2-8 1-15 1-20z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 52v6" stroke="currentColor" stroke-width="3"/>',
  druid: '<path d="M32 56V30M32 30C20 30 12 20 12 8c12 0 20 8 20 22zM32 38c10 0 18-8 18-20-10 0-18 8-18 20z" fill="none" stroke="currentColor" stroke-width="3"/>',
};
const emblem = (id: string, size = 64) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${EMBLEM[id] ?? ''}</svg>`;

const ICON: Record<string, string> = {
  pick: '<path d="M8 40L30 18M22 10c8-2 16 0 20 6M30 18c4-4 10-6 16-4" fill="none" stroke="currentColor" stroke-width="3"/>',
  skull: '<path d="M24 8c-9 0-15 6-15 15 0 6 3 9 6 11v6h18v-6c3-2 6-5 6-11 0-9-6-15-15-15z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="18" cy="23" r="3" fill="currentColor"/><circle cx="30" cy="23" r="3" fill="currentColor"/><path d="M20 40v-5M24 40v-5M28 40v-5" stroke="currentColor" stroke-width="2"/>',
  banner: '<path d="M12 6v38M12 8h24l-6 8 6 8H12" fill="none" stroke="currentColor" stroke-width="3"/>',
  scales: '<path d="M24 6v36M14 42h20M8 14h32M8 14l-5 12h10zM40 14l-5 12h10z" fill="none" stroke="currentColor" stroke-width="3"/>',
  scroll: '<path d="M12 10h22a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V12M18 18h14M18 25h14M18 32h10" fill="none" stroke="currentColor" stroke-width="3"/>',
  rune: '<path d="M24 4l16 10v20L24 44 8 34V14z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 14v20M17 20l14 8M31 20l-14 8" stroke="currentColor" stroke-width="2.5"/>',
  browser: '<rect x="6" y="9" width="36" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 17h36" stroke="currentColor" stroke-width="3"/><path d="M20 24l10 5-10 5z" fill="currentColor"/>',
  anchor: '<circle cx="24" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 14v28M12 30c0 8 6 12 12 12s12-4 12-12M16 22h16" fill="none" stroke="currentColor" stroke-width="3"/>',
};
const icon = (id: string, size = 44) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${ICON[id] ?? ''}</svg>`;

const PLAY_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';

// ------------------------------------------------------------------ layout

const NAV: [string, string][] = [
  ['/news/', 'News'], ['/guide/', 'Guide'], ['/bestiary/', 'Bestiary'], ['/atlas/', 'Atlas'],
  ['/soundtrack/', 'Music'], ['/highscores/', 'Highscores'], ['/store/', 'Store'], ['/faq/', 'FAQ'],
];

interface Page {
  path: string; // '/', '/guide/'
  title: string;
  description: string;
  body: string;
  image?: string;
  bodyClass?: string;
  /** An extra hand-written script for this page only (loaded after /site.js). */
  script?: string;
}

function layout(p: Page): string {
  const url = ORIGIN + p.path;
  const image = p.image ?? `${ORIGIN}/media/og-image.jpg`;
  const nav = NAV.map(([href, label]) => `<a href="${href}"${p.path.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Thornvale">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1d1915">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
<script src="/site.js" defer></script>${p.script ? `\n<script src="${p.script}" defer></script>` : ''}
</head>
<body${p.bodyClass ? ` class="${p.bodyClass}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="top-in">
    <a class="brand" href="/" aria-label="Thornvale home">${CREST(30)}<span>Thornvale</span></a>
    <nav class="nav" aria-label="Main">${nav}</nav>
    <span class="realm" data-status><i aria-hidden="true"></i><span data-status-text>Realm</span></span>
    <a class="btn ember" href="/play/">Play free</a>
  </div>
</header>
<main id="main">
${p.body}
</main>
<footer class="foot">
  <div class="foot-in">
    <div class="foot-brand">
      <a class="brand" href="/">${CREST(36)}<span>Thornvale</span></a>
      <p>A free fantasy MMORPG you play in your browser. Every town, creature, song and line of text is original.</p>
      <p class="faint">© 2026 Thornvale</p>
    </div>
    <nav class="foot-col" aria-label="Play">
      <h2>Play</h2>
      <a href="/play/">Enter the realm</a><a href="/guide/">Game guide</a><a href="/store/">Store</a><a href="/faq/">FAQ</a><a href="/rules/">Rules</a>
    </nav>
    <nav class="foot-col" aria-label="The world">
      <h2>The world</h2>
      <a href="/bestiary/">Bestiary</a><a href="/atlas/">Atlas</a><a href="/soundtrack/">Soundtrack</a><a href="/highscores/">Highscores</a><a href="/founders/">Founders</a><a href="/news/">News</a>
    </nav>
    <div class="foot-col">
      <h2>Contact</h2>
      <span class="sel">support@thornvaleonline.com</span>
      <a href="/terms/">Terms of sale</a>
      <a href="/privacy/">Privacy</a>
    </div>
  </div>
</footer>
<dialog class="trailer" data-trailer aria-label="Thornvale trailer">
  <form method="dialog"><button class="x" aria-label="Close the trailer">×</button></form>
  <video controls playsinline preload="none" poster="/media/trailer-full-poster.jpg">
    <source src="/media/trailer-full.webm" type="video/webm">
    <source src="/media/trailer-full.mp4" type="video/mp4">
  </video>
</dialog>
</body>
</html>
`;
}

/** A page heading band shared by the inner pages. */
const banner = (kicker: string, title: string, lede: string, extra = '') => `<section class="band">
  <div class="band-in">
    <p class="kicker"><span>${kicker}</span></p>
    <h1>${title}</h1>
    <p class="lede">${lede}</p>${extra}
  </div>
</section>`;

// ------------------------------------------------------------------ shared facts

const MUSIC = [
  ['town', 'Hearth and Lantern', 'Towns and temples', 'Fiddle, lute, recorder, accordion, bodhrán'],
  ['fields', 'The Open Road', 'Grassland, roads and farmland', 'Tin whistle, strummed guitar, strings'],
  ['forest', 'Whispering Pines', 'Old woods and dark forests', 'Flute and fiddle over finger-picked harp'],
  ['jungle', 'The Green Deep', 'Jungles', 'Pan pipes, marimba, kalimba, hand drums'],
  ['swamp', 'Mirewater', 'Swamps and bogs', 'A lonely cello and ocarina over low voices'],
  ['snow', 'Frostfang', 'Snowfields and glaciers', 'Celesta and flute over harp and slow strings'],
  ['desert', 'Sunspire', 'Deserts and tombs', 'Oud, ney flute, dulcimer and darbuka'],
  ['volcano', 'Cinderfall', 'Lava fields and fire caves', 'Horns, driving cellos, choir and taiko'],
  ['deep', 'Below the Stone', 'Caves and dungeons', 'Music box and ocarina over choir and harp'],
  ['sea', 'Saltwind', 'Coasts and open water', 'Concertina, fiddle and whistle, a sea waltz'],
  ['battle', 'Steel and Thunder', 'Every fight outside town', 'Brass, marcato strings, timpani and snare'],
] as const;

const ELEMENT_LABEL: Record<string, string> = { physical: 'Physical', fire: 'Fire', energy: 'Energy', ice: 'Ice', earth: 'Earth', death: 'Death', holy: 'Holy', life: 'Life', drown: 'Drowning', poison: 'Poison' };
const el = (e: string) => `<span class="el el-${e}">${ELEMENT_LABEL[e] ?? e}</span>`;
const n = (v: number) => v.toLocaleString('en-GB');

const VOC_EXTRA: Record<string, { line: string; stats: [string, number][] }> = {
  knight: { line: 'Stands in the fire so others don\'t have to.', stats: [['Might', 5], ['Magic', 1], ['Range', 1], ['Healing', 1]] },
  paladin: { line: 'Picks the fight from forty paces away.', stats: [['Might', 3], ['Magic', 2], ['Range', 5], ['Healing', 2]] },
  sorcerer: { line: 'Turns a crowded cave into an empty one.', stats: [['Might', 1], ['Magic', 5], ['Range', 4], ['Healing', 1]] },
  druid: { line: 'Keeps the warband standing, then freezes what\'s left.', stats: [['Might', 1], ['Magic', 4], ['Range', 3], ['Healing', 5]] },
};

const stats = (s: [string, number][]) => `<dl class="stats">${s.map(([k, v]) => `<div><dt>${k}</dt><dd><span class="pips" style="--v:${v}" aria-label="${v} of 5"></span></dd></div>`).join('')}</dl>`;

function beastCard(b: Beast, full: boolean): string {
  const chips = [
    ...b.weak.map((e) => `<li>${el(e)}<small>weak</small></li>`),
    ...b.strong.map((e) => `<li>${el(e)}<small>resists</small></li>`),
    ...b.immune.map((e) => `<li>${el(e)}<small>immune</small></li>`),
  ].join('');
  const abilities = b.abilities.length
    ? `<ul class="abil">${b.abilities.map((a) => `<li>${el(a.element)} ${esc(a.name)} <small>${a.kind === 'heal' ? 'heals' : `${a.min}–${a.max}`}</small></li>`).join('')}</ul>`
    : '';
  const loot = b.loot.slice(0, full ? 8 : 3).map((l) => `<li class="r-${l.rarity}">${esc(l.name)} <small>${l.chance >= 1 ? 'always' : `${Math.max(0.1, Math.round(l.chance * 1000) / 10)}%`}</small></li>`).join('');
  return `<article class="beast plate t-${b.tier.toLowerCase()}" data-name="${esc(b.name.toLowerCase())}" data-tier="${b.tier}" data-exp="${b.exp}" data-hp="${b.hp}" data-weak="${b.weak.join(' ')}">
  <header><h3>${esc(b.name)}</h3><span class="tier">${b.tier}</span></header>
  <dl class="nums"><div><dt>Health</dt><dd>${n(b.hp)}</dd></div><div><dt>Experience</dt><dd>${n(b.exp)}</dd></div><div><dt>Hits</dt><dd>${b.hit[0]}–${b.hit[1]}</dd></div></dl>
  ${chips ? `<ul class="res">${chips}</ul>` : '<p class="faint small">No weaknesses known.</p>'}
  ${full ? `${abilities}${loot ? `<details><summary>Loot</summary><ul class="loot">${loot}</ul></details>` : ''}` : ''}
</article>`;
}

// ------------------------------------------------------------------ pages

function home(): Page {
  const beasts = bestiary();
  // the six that give the most experience: the realm's heaviest hitters
  const featured = [...beasts].sort((a, b) => b.exp - a.exp).slice(0, 6);
  const T = towns();
  const pins = T.map((t) => `<span class="pin" style="left:${((t.x / 640) * 100).toFixed(2)}%;top:${((t.y / 800) * 100).toFixed(2)}%"><i aria-hidden="true"></i><b>${esc(t.name)}</b></span>`).join('');
  const ticker = [
    `${C.towns} towns`, `${MUSIC.length - 1} regions with their own music`, `${C.monsters} kinds of monster`, `${C.spells} spells and runes`,
    `${C.items} items`, 'Mining · smithing · fishing · woodcutting', 'Open PvP with skulls', 'Player market', 'No download', 'Free to play',
  ];
  const tick = ticker.map((t) => `<span>${t}</span>`).join('');
  const body = `
<section class="hero">
  <video class="hero-video" autoplay muted loop playsinline preload="metadata" poster="/media/trailer-poster.jpg" aria-hidden="true">
    <source src="/media/trailer.webm" type="video/webm"><source src="/media/trailer.mp4" type="video/mp4">
  </video>
  <canvas class="embers" data-embers aria-hidden="true"></canvas>
  <div class="hero-in">
    ${CREST(108, 'crest hero-crest')}
    <h1 class="mega"><span class="sr">Thornvale: </span><span aria-hidden="true">Thornvale</span></h1>
    <p class="motto">A realm of thorn, stone and gold</p>
    <p class="hero-lede">A free 3D fantasy MMORPG that plays in your browser. Choose a vocation, hunt across ${C.towns} towns and ${MUSIC.length - 1} wild regions, and carve your name into the hall of heroes.</p>
    <div class="cta">
      <a class="btn ember big" href="/play/">Play free now</a>
      <button class="btn iron big" type="button" data-open-trailer>${PLAY_ICON}Watch the trailer</button>
    </div>
    <div class="gate plate" data-countdown data-opening="${OPENING}">
      <p class="gate-k">The gates open · 1 January 2027 · midnight UK time</p>
      <div class="clock" role="timer" aria-label="Time until the grand opening">
        <div><b data-days>–</b><span>days</span></div>
        <div><b data-hours>–</b><span>hours</span></div>
        <div><b data-minutes>–</b><span>minutes</span></div>
        <div><b data-seconds>–</b><span>seconds</span></div>
      </div>
      <p class="gate-note">The test realm is open now. Accounts and names you claim today carry over to launch.</p>
    </div>
  </div>
  <a class="scroll-cue" href="#paths" aria-label="Scroll down"><span aria-hidden="true"></span></a>
</section>

<div class="ticker" aria-label="Thornvale in numbers"><div class="ticker-track">${tick}${tick}</div></div>

<section class="sec" id="paths">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Four vocations</span></p><h2>Choose your path</h2><p class="lede">Every hero begins in a town with a name and a calling. What you become after that is up to you, your skills and the company you keep.</p></header>
    <div class="paths">
      ${vocations().map((v) => `<article class="path plate" data-voc="${v.id}">
        <div class="emblem">${emblem(v.id, 72)}</div>
        <h3>${esc(v.name)}</h3>
        <p class="path-line">${esc(VOC_EXTRA[v.id]?.line ?? '')}</p>
        <p>${esc(v.blurb)}</p>
        ${stats(VOC_EXTRA[v.id]?.stats ?? [])}
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="sec sec-dark">
  <div class="sec-in split">
    <div>
      <header class="sec-head left"><p class="kicker"><span>The world</span></p><h2>An archipelago of ${C.towns} towns</h2><p class="lede">Ride the ferries from the crown city of Aurelion to the frozen halls of Valdrheim, the dunes of Sunspire and the dwarf mines below Stonedeep. Seven floors deep, from rooftops to lava caves.</p></header>
      <ul class="facts">
        <li><b>${C.towns}</b> towns with smiths, mages, banks and quests</li>
        <li><b>7</b> floors from the towers to the deepest caves</li>
        <li><b>${MUSIC.length - 1}</b> regions, each with its own song</li>
      </ul>
      <a class="btn iron" href="/atlas/">Open the atlas</a>
    </div>
    <a class="map-frame plate" href="/atlas/" aria-label="Open the atlas of Thornvale">
      <img src="/media/atlas-small.jpg" alt="Map of the Thornvale archipelago: green islands with towns and roads, snowfields in the north, desert in the south-east and lava in the north" width="640" height="800" loading="lazy">
      <div class="pins" aria-hidden="true">${pins}</div>
    </a>
  </div>
</section>

<section class="sec">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Original soundtrack</span></p><h2>Hear the realm</h2><p class="lede">Every region has its own theme, played by its own band of instruments. Walk from the fields into the jungle and the music changes with you.</p></header>
    <ol class="songs" data-songs>
      ${MUSIC.map(([id, title, where, inst]) => `<li><button class="song plate" type="button" data-song="/play/audio/music/${id}.m4a" aria-pressed="false">
        <span class="song-play" aria-hidden="true"></span>
        <span class="song-txt"><b>${title}</b><span>${where}</span><small>${inst}</small></span>
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </button></li>`).join('')}
    </ol>
    <p class="center"><a class="link" href="/soundtrack/">The full soundtrack</a></p>
  </div>
</section>

<section class="sec sec-blood">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>${C.monsters} kinds of monster</span></p><h2>What waits in the dark</h2><p class="lede">From rats in the sewers to dragon lords in their lairs. Learn what each one fears before it learns what you're made of.</p></header>
    <div class="beasts">${featured.map((b) => beastCard(b, false)).join('')}</div>
    <p class="center"><a class="btn iron" href="/bestiary/">Open the bestiary</a></p>
  </div>
</section>

<section class="sec">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Life in Thornvale</span></p><h2>More than a hunt</h2></header>
    <div class="feats">
      <article class="feat plate">${icon('pick')}<h3>Gather and forge</h3><p>Mine copper to starsteel, smelt bars and hammer out your own armour. Fish the rivers, fell the forests.</p></article>
      <article class="feat plate">${icon('skull')}<h3>Open PvP</h3><p>Fight anyone outside town. Skulls mark the killers, protection zones keep the peace, secure mode keeps you honest.</p></article>
      <article class="feat plate">${icon('banner')}<h3>Warbands and friends</h3><p>Form a party, share the spoils and the experience, and keep your friends one click away.</p></article>
      <article class="feat plate">${icon('scales')}<h3>A player market</h3><p>Post offers on the market boards and trade face to face. Every coin in the realm is earned by a player.</p></article>
      <article class="feat plate">${icon('rune')}<h3>${C.spells} spells and runes</h3><p>Waves of fire, beams of energy, walls of magic and runes that turn a fight. Learn them from the mages in town.</p></article>
      <article class="feat plate">${icon('browser')}<h3>Nothing to install</h3><p>Open the page and play. Your character is saved on the server, so you can pick it up from any computer.</p></article>
    </div>
  </div>
</section>

<section class="sec sec-dark">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>From the realm</span></p><h2>See it for yourself</h2></header>
    <div class="gallery">
      <button class="shot shot-big plate" type="button" data-open-trailer><img src="/media/trailer-poster.jpg" alt="" width="1280" height="720" loading="lazy"><span class="shot-play">${PLAY_ICON}Watch the trailer</span></button>
      <figure class="shot plate"><img src="/media/world-towns.jpg" alt="A walled town with houses, a market and a temple" width="1200" height="675" loading="lazy"><figcaption>Towns</figcaption></figure>
      <figure class="shot plate"><img src="/media/world-hunting.jpg" alt="A hunter fighting monsters in the wilds" width="1200" height="675" loading="lazy"><figcaption>The hunt</figcaption></figure>
      <figure class="shot plate"><img src="/media/world-dungeons.jpg" alt="A torch-lit dungeon corridor" width="1200" height="675" loading="lazy"><figcaption>Below the stone</figcaption></figure>
    </div>
  </div>
</section>

<section class="sec">
  <div class="sec-in duo">
    <a class="news-card plate" href="/news/the-thornvale-server-is-live/">
      <img src="/media/news-server-live.jpg" alt="" width="800" height="450" loading="lazy">
      <div><p class="kicker left"><span>Latest news · 21 October 2026</span></p><h3>The Thornvale server is live</h3><p>Create an account, make up to five characters and start exploring right now.</p></div>
    </a>
    <a class="hall plate" href="/highscores/">
      ${CREST(64)}
      <h3>The hall of heroes</h3>
      <p>The highest-levelled adventurers of the realm, updated every minute. Is your name up there yet?</p>
      <span class="btn iron">See the highscores</span>
    </a>
  </div>
  <div class="sec-in">
    <a class="promo plate" href="/store/">
      <div class="promo-txt">
        <p class="kicker left"><span>Founder packs · 1 December 2026 to 31 January 2027</span></p>
        <h3>Back Thornvale as a founder</h3>
        <p>Premium time, a founder cloak and your name in the hall of founders. Sold for two months only. Looks and comfort, never power.</p>
      </div>
      <span class="btn iron">See the founder packs</span>
    </a>
  </div>
</section>

<section class="final">
  <canvas class="embers" data-embers aria-hidden="true"></canvas>
  <div class="final-in">
    <h2 class="mega small">Your legend starts tonight</h2>
    <p class="lede">Free in your browser. No download. The gates open fully on 1 January 2027.</p>
    <div class="cta"><a class="btn ember big" href="/play/">Enter Thornvale</a><a class="btn iron big" href="/guide/">Read the guide</a></div>
  </div>
</section>`;
  return {
    path: '/',
    title: 'Thornvale – a free dark-fantasy MMORPG in your browser',
    description: `Thornvale is a free 3D fantasy MMORPG you play in your browser. ${C.towns} towns, ${C.monsters} kinds of monster, four vocations, open PvP, crafting and an original soundtrack. Grand opening 1 January 2027.`,
    body,
    bodyClass: 'home',
  };
}

function bestiaryPage(): Page {
  const beasts = bestiary();
  const tiers = ['Harmless', 'Easy', 'Fair', 'Tough', 'Deadly', 'Legendary'];
  const elems = ['fire', 'energy', 'ice', 'earth', 'death', 'holy', 'physical'];
  const body = `${banner(`${beasts.length} creatures`, 'The bestiary', 'Every creature in Thornvale, how hard it hits, what it carries and what it fears. Read straight from the game, so it is always up to date.')}
<section class="sec tight">
  <div class="sec-in">
    <form class="filters plate" data-beast-filters role="search" onsubmit="return false">
      <label class="field"><span>Search</span><input type="search" name="q" placeholder="Dragon, orc, spider…" autocomplete="off"></label>
      <label class="field"><span>Weak to</span><select name="weak"><option value="">Any element</option>${elems.map((e) => `<option value="${e}">${ELEMENT_LABEL[e]}</option>`).join('')}</select></label>
      <label class="field"><span>Sort by</span><select name="sort"><option value="exp">Experience</option><option value="hp">Health</option><option value="name">Name</option></select></label>
      <fieldset class="tiers"><legend>Danger</legend>${tiers.map((t) => `<label class="chip"><input type="checkbox" name="tier" value="${t}" checked><span>${t}</span></label>`).join('')}</fieldset>
    </form>
    <p class="count" data-beast-count aria-live="polite">${beasts.length} creatures</p>
    <div class="beasts all" data-beasts>${beasts.map((b) => beastCard(b, true)).join('')}</div>
  </div>
</section>`;
  return { path: '/bestiary/', title: 'Bestiary – Thornvale', description: `All ${beasts.length} creatures of Thornvale with their health, experience, attacks, weaknesses and loot.`, body };
}

function atlasPage(): Page {
  const T = towns();
  const pins = T.map((t) => `<button class="pin" type="button" data-town="${t.key}" style="left:${((t.x / 640) * 100).toFixed(2)}%;top:${((t.y / 800) * 100).toFixed(2)}%"><i aria-hidden="true"></i><b>${esc(t.name)}</b></button>`).join('');
  const list = T.map((t) => `<li><button type="button" data-goto="${t.key}"><b>${esc(t.name)}</b><span>${esc(t.flavour.charAt(0).toUpperCase() + t.flavour.slice(1))} · by ${t.travel}</span></button></li>`).join('');
  const body = `${banner('The known world', 'Atlas of Thornvale', `The surface of the archipelago, painted from the game's own map. Drag to look around, use the buttons or your mouse wheel to zoom, and pick a town to fly to it.`)}
<section class="sec tight">
  <div class="sec-in atlas">
    <div class="atlas-view plate" data-atlas>
      <div class="atlas-zoom" data-atlas-inner>
        <img src="/media/atlas.webp" alt="Map of the Thornvale archipelago" width="1280" height="1600" draggable="false">
        <div class="pins">${pins}</div>
      </div>
      <div class="atlas-tools"><button class="btn iron sq" type="button" data-zoom="1" aria-label="Zoom in">+</button><button class="btn iron sq" type="button" data-zoom="-1" aria-label="Zoom out">−</button><button class="btn iron sq" type="button" data-zoom="0" aria-label="Show the whole map">⤢</button></div>
    </div>
    <aside class="atlas-side plate">
      <h2 class="side-h">Towns</h2>
      <ol class="towns">${list}</ol>
      <h2 class="side-h">Legend</h2>
      <ul class="legend">
        <li><i style="background:#46683a"></i>Grassland and forest</li><li><i style="background:#2c5626"></i>Jungle</li><li><i style="background:#c4ac74"></i>Desert</li>
        <li><i style="background:#dee2e4"></i>Snow and ice</li><li><i style="background:#e25c1e"></i>Lava</li><li><i style="background:#8c7652"></i>Roads</li>
      </ul>
    </aside>
  </div>
</section>`;
  return { path: '/atlas/', title: 'Atlas – Thornvale', description: `A map of the Thornvale archipelago with all ${T.length} towns.`, body };
}

function soundtrackPage(): Page {
  const body = `${banner('Original soundtrack', 'Music of the realm', `Eleven themes composed for Thornvale. Each region has its own band of instruments, and the music follows you as you travel. Every note is generated by the game's own synthesizer: no samples, no recordings.`)}
<section class="sec tight">
  <div class="sec-in">
    <ol class="songs wide" data-songs>
      ${MUSIC.map(([id, title, where, inst], i) => `<li><button class="song plate" type="button" data-song="/play/audio/music/${id}.m4a" aria-pressed="false">
        <span class="num">${String(i + 1).padStart(2, '0')}</span>
        <span class="song-play" aria-hidden="true"></span>
        <span class="song-txt"><b>${title}</b><span>${where}</span><small>${inst}</small></span>
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </button></li>`).join('')}
    </ol>
    <p class="center faint">Tracks loop without a gap, just as they do in the game. Battle music takes over during fights outside town.</p>
  </div>
</section>`;
  return { path: '/soundtrack/', title: 'Soundtrack – Thornvale', description: 'Listen to the eleven original region themes of Thornvale.', body };
}

function highscoresPage(): Page {
  const body = `${banner('The hall of heroes', 'Highscores', 'The highest-levelled adventurers of the realm. Updated every minute while the server is awake.')}
<section class="sec tight">
  <div class="sec-in narrow">
    <div class="tabs" role="group" aria-label="Show vocation">
      <button type="button" class="chip-btn on" data-voc="">All</button><button type="button" class="chip-btn" data-voc="knight">Knights</button><button type="button" class="chip-btn" data-voc="paladin">Paladins</button><button type="button" class="chip-btn" data-voc="sorcerer">Sorcerers</button><button type="button" class="chip-btn" data-voc="druid">Druids</button>
    </div>
    <ol class="podium" data-podium aria-label="Top three"></ol>
    <div class="table plate">
      <table data-highscores>
        <thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Vocation</th><th scope="col">Level</th></tr></thead>
        <tbody><tr><td colspan="4" class="faint">Loading the hall of heroes…</td></tr></tbody>
      </table>
    </div>
    <p class="faint center" data-highscores-updated></p>
  </div>
</section>`;
  return { path: '/highscores/', title: 'Highscores – Thornvale', description: 'The highest-level characters in Thornvale, by vocation.', body };
}

const doc = (path: string, title: string, description: string, name: string): Page => ({
  path, title, description,
  body: `<section class="sec doc-sec"><div class="sec-in"><div class="doc plate">${content(name)}</div></div></section>`,
});

// ------------------------------------------------------------------ store and founders

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const price = (id: ProductId) => money(PRODUCTS[id].pence);
const townName = new Map(towns().map((t) => [t.key, t.name]));
const FREE_TOWN_NAMES = FREE_TOWNS.map((k) => townName.get(k) ?? k);
const PREMIUM_TOWN_NAMES = towns().filter((t) => !(FREE_TOWNS as readonly string[]).includes(t.key)).map((t) => t.name);

/** One pack card. store.js fills in the live price, button label and note. */
function packCard(id: ProductId, title: string, lead: string, ticks: string[], opts: { cls?: string; badge?: string; primary?: boolean; save?: string; leadExtra?: string } = {}): string {
  const p = PRODUCTS[id];
  return `<article class="pack plate${opts.cls ? ` ${opts.cls}` : ''}" data-product="${id}">
        ${opts.badge ? `<span class="badge">${opts.badge}</span>` : ''}
        <h3>${title}</h3>
        ${lead ? `<p class="pack-lead">${lead}${opts.leadExtra ?? ''}</p>` : ''}
        <div class="price"><span data-price>${money(p.pence)}</span></div>
        ${opts.save ? `<p class="save">${opts.save}</p>` : ''}
        ${ticks.length ? `<ul class="ticks">${ticks.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
        <div class="pack-foot"><button type="button" class="btn${opts.primary ? ' ember' : ' iron'}" data-buy disabled>Buy ${title}</button><p class="pack-note" data-note></p></div>
      </article>`;
}

function storePage(): Page {
  const nn = (i: number) => String(i + 1).padStart(2, '0');
  const tracks = `<ol class="tracks">${MUSIC.map(([id, title], i) => `<li><a href="/play/audio/music/${id}.m4a" download="Thornvale ${nn(i)} - ${title}.m4a"><span>${nn(i)}</span><b>${title}</b></a></li>`).join('')}</ol>`;
  const row = (k: string, free: string, prem: string, same = false) => `<tr${same ? ' class="same"' : ''}><th scope="row">${k}</th><td>${free}</td><td>${prem}</td></tr>`;
  const body = `${banner('Store', 'Premium and founder packs', 'Thornvale is free to play. Premium opens up the rest of the world and makes life a little more comfortable. It never makes you stronger: nothing with stats is ever sold.',
    `\n    <div class="notice plate" data-sale-status role="status"><b>Checking the store…</b></div>`)}

<section class="sec tight store-account" id="account" aria-labelledby="account-title">
  <div class="sec-in">
    <div class="notice plate ok" data-thanks role="status" hidden></div>
    <div class="store-duo">
      <div class="store-panel plate" data-account>
        <h2 id="account-title">Your account</h2>
        <p class="faint">Checking your login…</p>
      </div>
      <div class="store-panel plate warm">
        <h2>Before you buy</h2>
        <p>Purchases go to your whole Thornvale account, so every character on it shares them. Log in with the same email and password you use in the game.</p>
        <label class="consent" data-consent-box>
          <input type="checkbox" data-consent>
          <span>I want my purchase delivered straight away. I understand that once premium time or founder items are delivered I lose my 14-day right to cancel, except for the founder refund promise. If I am under 18, a parent or guardian has agreed. <a href="/terms/">Terms of sale</a></span>
        </label>
        <p class="faint small">Payments are handled by Paddle. Prices include UK VAT, and Paddle shows the price in your own currency at checkout.</p>
      </div>
    </div>
    <template data-soundtrack-tpl>${tracks}</template>
  </div>
</section>

<section class="sec sec-dark" id="founders" aria-labelledby="founders-title">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Founder packs · 1 December 2026 to 31 January 2027</span></p><h2 id="founders-title">Be a founder of Thornvale</h2><p class="lede">Founder packs are sold for two months only and never again. Your founder premium starts on opening day, 1 January 2027, so you don't lose a single day before the gates open.</p></header>
    <div class="packs">
      ${packCard('founder_wayfarer', 'Wayfarer', 'A first step on the road.', [
        `<b>${PRODUCTS.founder_wayfarer.days} days</b> of premium`,
        'The <b>Founder</b> title',
        "<b>Founder's Cloak</b> in ember, worn over your armour (looks only)",
        'Your name in the <a href="/founders/">hall of founders</a>',
      ])}
      ${packCard('founder_warden', 'Warden', 'Everything in Wayfarer, and more.', [
        `<b>${PRODUCTS.founder_warden.days} days</b> of premium instead of ${PRODUCTS.founder_wayfarer.days}`,
        "Founder's Cloak in <b>gold</b>",
        'A <b>6th character slot</b>',
        `The <b>Thornvale soundtrack</b> (${MUSIC.length} tracks) to download`,
        'The Founder title and your name in the hall of founders',
      ], { cls: 'featured', badge: 'Recommended', primary: true })}
      ${packCard('founder_legend', 'Legend', 'Everything in Warden, and your mark on the world.', [
        `<b>${PRODUCTS.founder_legend.days} days</b> of premium`,
        'A numbered title, for example <b>Legend #027</b>',
        "Founder's Cloak in <b>crimson and gold</b>",
        'A <b>7th character slot</b>',
        "Your name carved on the <b>Founders' Stone</b> in the Thornvale temple",
        'A <b>vote</b> on the name of a future region or boss',
        'The soundtrack and the 6th slot too',
      ], { cls: 'pack-legend', badge: `Only ${LEGEND_CAP} · numbered`, leadExtra: ' <span class="left-n" data-left></span>' })}
    </div>
    <p class="faint small store-after">Already a founder? During the sale you can move up by paying only the difference: Wayfarer to Warden ${price('upgrade_wayfarer_warden')}, Wayfarer to Legend ${price('upgrade_wayfarer_legend')}, Warden to Legend ${price('upgrade_warden_legend')}. Log in and the upgrade price shows on the pack. Buying another pack on the same account adds its premium days, but not another title.</p>
  </div>
</section>

<section class="sec" id="premium" aria-labelledby="premium-title">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Premium time · on sale from 1 January 2027</span></p><h2 id="premium-title">Premium time</h2><p class="lede">One-off purchases, never a subscription. Nothing renews by itself. Days count down in real time, and buying more adds them on top of what you have.</p></header>
    <div class="packs premium">
      ${packCard('premium_30', '30 days', 'Try the whole world for a month.', [])}
      ${packCard('premium_90', '90 days', '', [], { save: 'Save 11%' })}
      ${packCard('premium_180', '180 days', '', [], { save: 'Save 17%' })}
      ${packCard('premium_365', '365 days', '', [], { cls: 'featured', badge: 'Best value', save: 'Save 24%' })}
    </div>
  </div>
</section>

<section class="sec sec-dark" id="compare" aria-labelledby="compare-title">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Free and premium</span></p><h2 id="compare-title">What premium gives you</h2><p class="lede">Premium belongs to your account, so all your characters share it.</p></header>
    <div class="table plate compare-box">
      <table class="compare">
        <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Premium</th></tr></thead>
        <tbody>
          ${row('Towns', `${FREE_TOWNS.length} towns and the land around them`, `All ${C.towns} towns and their regions`)}
          ${row('Ship routes', 'Routes between free towns', 'Every ship route')}
          ${row('Depot', `${FREE_DEPOT_SLOTS} slots`, `${PREMIUM_DEPOT_SLOTS} slots`)}
          ${row('Market offers', `${FREE_MARKET_OFFERS} at a time`, `${PREMIUM_MARKET_OFFERS} at a time`)}
          ${row('Full server', 'Wait in the queue', 'A reserved place')}
          ${row('Health and mana regeneration', 'Normal', `${PREMIUM_REGEN} times faster, out of combat only`)}
          ${row('Character appearance', 'Every option, free', 'The same', true)}
          ${row('Inspect window', '–', 'A premium crown')}
          ${row('Vocations, levels, spells, skills', 'All of them', 'The same', true)}
          ${row('PvP, parties, trading', 'All of them', 'The same', true)}
          ${row('Items with stats', 'Never sold', 'Never sold', true)}
        </tbody>
      </table>
    </div>
    <div class="store-duo">
      <div class="store-panel plate"><h3>Free towns</h3><ul class="town-chips">${FREE_TOWN_NAMES.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="store-panel plate"><h3>Premium adds</h3><ul class="town-chips prem">${PREMIUM_TOWN_NAMES.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>
  </div>
</section>

<section class="sec" id="safety" aria-label="When premium runs out and the opening-day promise">
  <div class="sec-in store-duo">
    <div class="store-panel plate">
      <p class="kicker left"><span>Safety net</span></p>
      <h2>When premium runs out</h2>
      <p>Nothing is ever deleted.</p>
      <ul class="ticks">
        <li>A character standing in a premium region is moved to a free temple, with everything it carries.</li>
        <li>An overfull depot keeps every item. New items wait until it's back under ${FREE_DEPOT_SLOTS}.</li>
        <li>Market offers above ${FREE_MARKET_OFFERS} stay up until they sell or expire.</li>
      </ul>
    </div>
    <div class="store-panel plate warm">
      <p class="kicker left"><span>Opening-day promise</span></p>
      <h2>If the opening moves, you lose nothing</h2>
      <ul class="ticks">
        <li>Founder premium starts whenever the server actually opens, even if that's later than 1 January 2027.</li>
        <li>Until opening day you can have a full refund of a founder pack, no questions asked. Just email <a href="mailto:support@thornvaleonline.com">support@thornvaleonline.com</a>.</li>
      </ul>
    </div>
  </div>
</section>

<section class="sec sec-dark" id="store-faq" aria-labelledby="store-faq-title">
  <div class="sec-in">
    <header class="sec-head"><p class="kicker"><span>Questions</span></p><h2 id="store-faq-title">Store questions</h2></header>
    <div class="doc plate"><div>
      <details><summary>Is it pay-to-win?</summary>
        <p>No. Everyone gets the same vocations, levels, spells, skills, PvP, parties and trading. We never sell items with stats. Premium gives more places to explore and more room to store and trade, and the faster regeneration only works out of combat.</p></details>
      <details><summary>Do all my characters get it?</summary>
        <p>Yes. Premium and founder packs belong to your account, so every character on it shares them.</p></details>
      <details><summary>What if the opening moves?</summary>
        <p>Founder premium starts whenever the server actually opens, so you never lose days. And until opening day you can ask for a full refund of a founder pack, no questions asked.</p></details>
      <details><summary>Can I get a refund?</summary>
        <p>Founder packs: yes, a full refund on request until opening day. Premium time: once it's delivered to your account, the 14-day right to cancel ends, but if something has gone wrong, email us and we'll look at it fairly. The details are in the <a href="/terms/">terms of sale</a>.</p></details>
      <details><summary>Who handles payment?</summary>
        <p>Paddle, our reseller. Paddle takes the payment, handles VAT and sends your receipt. We never see your card details. Prices include UK VAT, and Paddle shows your local currency.</p></details>
      <details><summary>Is there a subscription?</summary>
        <p>No. Every purchase is one-off. Nothing renews and nothing is charged again unless you buy more.</p></details>
      <p>Anything else? Email <a href="mailto:support@thornvaleonline.com">support@thornvaleonline.com</a>.</p>
    </div></div>
  </div>
</section>`;
  return {
    path: '/store/', title: 'Premium and founder packs – Thornvale',
    description: 'Premium time and founder packs for Thornvale. Premium opens more of the world and adds comfort, never power. Founder packs are on sale from 1 December 2026 to 31 January 2027 only.',
    body, bodyClass: 'store', script: '/store.js',
  };
}

function foundersPage(): Page {
  const body = `${banner('Founders', 'Hall of founders', "These heroes backed Thornvale before its gates opened. Legends are carved on the Founders' Stone in the Thornvale temple, in the order they joined.")}
<section class="sec tight">
  <div class="sec-in narrow">
    <div class="roll" data-founders aria-live="polite"><p class="faint center">Loading the founders…</p></div>
    <p class="faint small center roll-note">Founder packs are sold from 1 December 2026 to 31 January 2027 only. Founders choose which of their characters' names appears here. <a href="/store/#founders">See the founder packs</a>.</p>
  </div>
</section>`;
  return {
    path: '/founders/', title: 'Hall of founders – Thornvale',
    description: 'The founders of Thornvale: every player who backed the world before the grand opening with a Legend, Warden or Wayfarer pack.',
    body, script: '/founders.js',
  };
}

function newsList(): Page {
  const body = `${banner('Chronicle', 'News', 'Updates from the realm: new lands, new monsters, server news and the road to the grand opening.')}
<section class="sec tight"><div class="sec-in narrow">
  <a class="news-card plate wide" href="/news/the-thornvale-server-is-live/">
    <img src="/media/news-server-live.jpg" alt="" width="800" height="450" loading="lazy">
    <div><p class="kicker left"><span>21 October 2026</span></p><h2>The Thornvale server is live</h2><p>Create an account, make up to five characters and start exploring right now, in your browser, with nothing to download.</p><span class="link">Read more</span></div>
  </a>
</div></section>`;
  return { path: '/news/', title: 'News – Thornvale', description: 'News and updates from Thornvale.', body };
}

function notFound(): Page {
  const body = `<section class="lost"><canvas class="embers" data-embers aria-hidden="true"></canvas><div class="lost-in">
  <p class="kicker"><span>404</span></p>
  <h1 class="mega small">This path leads nowhere</h1>
  <p class="lede">The page you were looking for isn't here. Head back to town, or jump straight into the game.</p>
  <div class="cta"><a class="btn ember big" href="/play/">Play Thornvale</a><a class="btn iron big" href="/">Back to town</a></div>
</div></section>`;
  return { path: '/404', title: 'Not found – Thornvale', description: 'This page does not exist.', body };
}

// ------------------------------------------------------------------ write

function write(path: string, html: string): void {
  const file = path === '/404' ? join(SITE, '404.html') : join(SITE, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const pages: Page[] = [
  home(), bestiaryPage(), atlasPage(), soundtrackPage(), highscoresPage(), newsList(),
  doc('/news/the-thornvale-server-is-live/', 'The Thornvale server is live – Thornvale', "Thornvale's first online server is up: create an account and start exploring.", 'news-server-live'),
  doc('/guide/', 'Game guide – Thornvale', 'How to start playing Thornvale: controls, vocations, spells, items, travel and PvP.', 'guide'),
  doc('/faq/', 'FAQ – Thornvale', 'Answers to common questions about Thornvale.', 'faq'),
  doc('/rules/', 'Rules – Thornvale', 'The rules of play in Thornvale.', 'rules'),
  storePage(), foundersPage(),
  doc('/terms/', 'Terms of sale – Thornvale', 'The terms for buying premium time and founder packs for Thornvale, and how refunds work.', 'terms'),
  doc('/privacy/', 'Privacy – Thornvale', 'What Thornvale collects and why.', 'privacy'),
  notFound(),
];
for (const p of pages) write(p.path, layout(p));

writeFileSync(join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.filter((p) => p.path !== '/404').map((p) => `  <url><loc>${ORIGIN}${p.path}</loc></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(SITE, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${CREST(20).replace(/<svg[^>]*>|<\/svg>/g, '')}</svg>\n`);

if (!process.argv.includes('--no-atlas')) atlas(join(SITE, 'media', 'atlas'));
console.log(`Built ${pages.length} pages in site/`);
