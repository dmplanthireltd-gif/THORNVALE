# Thornvale — Brand Guide

**The rulebook for how Thornvale looks, sounds and speaks.** Every screen, page, artifact, image, trailer, sound and line of text follows it. It sits beside `BIBLE.md` (what the game *is*); this file says how it *presents itself*.

- **Source of truth for values:** the game's `src/style.css` (`:root` tokens) and the website's `site/styles.css`. The tables below copy those values. If code and this guide disagree, fix one of them in the same change.
- **Changing the brand:** only with the owner's OK. Update this file in **both places** (repo `BRAND.md` and the claude.ai Project doc `claude/THORNVALE-BRAND.md`) and add a Change Log row in `BIBLE.md` §13.
- **Current look:** the in-game HUD "Classic" layout (owner request 2026-10-24) built from the "Two Flanks" pieces (design 2c, shipped 2026-10-21). The darker "Iron & Ember" blackletter look from the HUD canvas was **not** chosen; don't use it.

---

## 1. Identity in one line

> **Thornvale — a realm of thorn, stone and gold.** A free 3D fantasy MMORPG in your browser, in the spirit of the classic tile-based online RPGs: dangerous, old-fashioned, social, warm by lamplight.

**Feel:** forged and hand-made, not glossy. Dark warm browns like an old wooden-and-iron interface, lit by gold. Serious about danger, friendly to newcomers. Never neon, never sci-fi, never cartoon, never "mobile-game" bright.

**Fixed facts used in marketing** (check the game before quoting numbers; the website reads them from game data):
- Grand opening: **1 January 2027, 00:00 UK time.** Test realm open now; accounts and names carry over.
- Four vocations: **Knight, Paladin, Sorcerer, Druid.**
- Free, plays in the browser, nothing to install. Up to 5 heroes per account.
- Site: **thornvaleonline.com** · game: **thornvaleonline.com/play/** · contact: **support@thornvaleonline.com**.

---

## 2. Logo

### The crest
A gold-edged **diamond** (a square turned 45°) on dark brown, holding a gold **T**. It is the game's mark: favicon, title strip, login, website, share images.

```svg
<svg viewBox="0 0 20 20" aria-hidden="true">
  <rect x="3" y="3" width="14" height="14" transform="rotate(45 10 10)" fill="#2b2621" stroke="#c9a24a" stroke-width="1.5"/>
  <path d="M6.5 6.5h7v2h-2.5v6h-2v-6H6.5z" fill="#e8c26a"/>
</svg>
```
- Stroke `1.5` at small sizes (≤ 30 px), `1.2` at large sizes (≥ 60 px).
- Large uses may add a soft gold glow: `drop-shadow(0 0 18px rgba(232,194,106,.45))`.
- Don't recolour, outline, rotate, stretch, add a shield behind it, or put it on a light background.

### The wordmark
**THORNVALE** in capitals, Palatino bold, **letter-spacing 0.16–0.22 em**, gold.
- Small (title strips, nav): `700 15–22px`, colour `#e8c26a`, spacing `0.22em`.
- Hero (title screens, website hero): `700`, `40–150px`, gold gradient `#fff3c4 → #f0cf7a → #c9a24a → #7a5a20` (top to bottom) clipped to text, with `drop-shadow(0 4px 0 #000)` and a gentle gold glow. Add `margin-right: -0.16em` so wide spacing still centres.
- Crest goes **left of** the wordmark (inline) or **above** it (stacked). Gap ≈ half the cap height.
- In running text the name is written normally: "Thornvale".

---

## 3. Colour

### Core palette (game `src/style.css` tokens)

| Role | Token | Hex | Use |
|---|---|---|---|
| Deepest edge | `--bevel-lo` | `#0d0b09` | Outer borders, inset shadows, rivets of darkness |
| Frame | — | `#1d1915` | The HUD frame / page ground, title strips, panel headers |
| Dark ground | `--panel-edge` | `#14110e` | Section backgrounds, darker bands |
| Panel | `--panel` | `#2b2621` | Panel/card fill (website: gradient `#2e2823 → #25201b`) |
| Panel raised | `--panel-2` | `#36302a` | Hover fills, raised parts |
| Slot / input | `--slot` | `#1a1714` | Item slots, inputs, chat log, recessed areas |
| Inset line | — | `#4a4034` | 1 px inner line on every panel and slot |
| Bevel light | `--bevel-hi` | `#5d5246` | Top-left highlight on raised buttons |
| Bronze | — | `#5a4a30` | Frame outline, separators, outer edges |
| Bronze mid | — | `#8a7340` | Badges, inactive diamonds |
| **Accent gold** | `--accent` | `#c9a24a` | Corner brackets, diamonds, active borders |
| **Gold** | `--gold` | `#e8c26a` | Names, wordmark, important values, links |
| Pale gold | — | `#ffe9a8` | Text on active ("on") buttons, hover highlights |
| Label gold | — | `#d4ad55` | Small uppercase labels and panel titles |
| **Ink** | `--ink` | `#e8dfcc` | Body text |
| Ink bright | — | `#f5eedd` | Headlines on dark |
| **Muted** | `--muted` | `#a99d86` | Secondary text, captions, hints |

The website uses the same values under longer names (`--iron-0..4`, `--line`, `--bronze*`, `--gold*`, `--bone*`, `--muted`); keep the two in step.

**Proportions:** about 80 % browns, 15 % ink text, 5 % gold. Gold is earned: names, the one primary action, active states, the crest. Never a gold background over large areas.

### Game state colours (fixed: players learn them)

| Meaning | Hex |
|---|---|
| Health bar | `#3ccf3c` (website stats may use `#a8231c` blood red for danger) |
| Mana bar | `#3e7fe0` |
| Experience bar | `#d9a520` |
| Online / OK | `#3ccf3c` |
| Danger / warning text | `#ff7a6a`; blood `#a8231c` / `#e05a3a` |
| Item rarity edge | common `#4a3f30` · uncommon `#3f7a3a` · rare `#3a5fa8` · legendary `#b8701f` |
| Rarity text (web) | uncommon `#8fd17a` · rare `#7fb2ff` · legendary `#ffb84d` |

**Chat / log colours:** info `#e8e8e8` · combat `#c8c8c8` · loot `#9fe07a` · quest `#ffd84a` · warn `#ff7a6a` · level `#ffe27a` (bold) · NPC `#7ac8ff` · chat `#ffe23a` · trade `#e0a0ff` · event `#ffb84a` (bold).

**Elements** (chips, spell UI, bestiary): fire `#ff9a5a` · energy `#c9a2ff` · ice `#9fd8f2` · earth `#a9d06a` · death `#c6a8d0` · holy `#f6dc8c` · physical = ink. Chips use the colour for text, a dark tint of it for the border, and ~12 % of it as fill.

### Contrast
Body text on panels must reach 4.5 : 1 (ink `#e8dfcc` and muted `#a99d86` on `#2b2621` both pass). Never put muted text on `#36302a` or lighter.

---

## 4. Typography

No web fonts. Thornvale uses the same system fonts as the game, so everything loads instantly and matches the HUD.

| Role | Stack | Style |
|---|---|---|
| **Serif** (names, headlines, body text, website text) | `'Palatino Linotype', 'Book Antiqua', Palatino, 'URW Palladio L', Georgia, serif` | Regular 400 / bold 700; italic for taglines and flavour lines |
| **Label** (HUD UI text, small labels, stats, hotkeys) | `Verdana, Tahoma, system-ui, sans-serif` | 600–700, 10–14 px |

Rules:
- **Panel titles / kickers / labels:** Verdana 700, 10–13 px, UPPERCASE, `letter-spacing 0.12–0.18em`, colour `#d4ad55`, preceded by a 5–6 px gold diamond (`#c9a24a`, square rotated 45°).
- **Headlines:** Palatino 700. Website section heads 46–76 px; in-game window titles 16–26 px. `text-wrap: balance`.
- **Names** (heroes, monsters, towns, items of note): Palatino 700 in gold `#e8c26a` (hostile targets `#ff8a7a`).
- **Navigation and buttons on the website:** Palatino with `font-variant: small-caps`, slight letter-spacing.
- **Numbers** in tables and counters: `font-variant-numeric: tabular-nums`.
- Body text 15–18 px (game windows 13–15 px), line-height 1.4–1.6, lines ≤ 70 characters.

---

## 5. Building blocks

All of these exist in code (`src/style.css`, `site/styles.css`); reuse, don't reinvent.

- **Frame:** the whole UI is one dark frame `#1d1915`, 2 px `#0d0b09` border with a 1 px `#5a4a30` inner line. Panels sit in it with 6 px gaps.
- **Panel:** fill `#2b2621`, border 1 px `#0d0b09`, inset line `inset 0 0 0 1px #4a4034`. Square corners. **No rounded corners anywhere.**
- **Panel header strip:** `#1d1915` with `box-shadow: 0 1px 0 #5a4a30`, holding a label (see Typography) and optional right-hand info in muted text.
- **Gold corner brackets:** L-shaped 2 px `#c9a24a` marks, 12–18 px long, inset 4–12 px from each corner. Use on feature panels, the game view, dialogs and hero cards. One set per element, never nested.
- **Diamonds:** the shape language. Bullets, label markers, map pins, level badges and vocation emblems sit in diamonds (`transform: rotate(45deg)`). Use them instead of circles or dots.
- **Title strip:** 32–40 px bar on top: crest · THORNVALE · thin separator · where you are · spacer · status (green diamond + "12 online").
- **Buttons:**
  - *Primary (one per screen):* forged gold, `linear-gradient(180deg,#f6dc8e,#e0b85a 45%,#b48a34)`, text `#1d1915` bold Palatino small caps, border `#0d0b09`, inner highlight `#fff3c4` and shadow `#7a5a20`, glow `0 6px 22px rgba(232,194,106,.25)`. Height 46–58 px.
  - *Secondary (iron):* `linear-gradient(180deg,#3e362e,#2b2621)`, ink text, bevel `inset 1px 1px 0 #6a5e50, inset -1px -1px 0 #120f0c`, outline `#5a4a30`.
  - *HUD button:* `#3a332b`, Verdana 600 12 px, same bevel.
  - *On / selected:* fill `#4f4126`, border `#c9a24a`, text `#ffe9a8`.
- **Inputs:** fill `#1a1714`, `inset 2px 2px 0 #0d0b09` + `0 0 0 1px #4a4034`, text `#f5eedd`, label above in uppercase Verdana. Focus: 2–3 px gold outline `#ffe9a8`.
- **Slots / tiles:** recessed `#1a1714`, `inset 2px 2px 0 #0d0b09`, border `#4a3f30` (or rarity colour).
- **Hanging plate:** information that belongs to the view (target bar, countdown, hero name) hangs from the top edge of the game view as a panel with no top border.
- **Bars:** 15–17 px, black track `#0c0a08`, solid fill with a 2–3 px lighter top line, white bold numbers with a 1 px black shadow.
- **Focus and touch:** every interactive element has a visible gold focus ring; touch targets ≥ 44 px on the website.

---

## 6. Layout

- **Game layout (owner request 2026-10-24, "like Tibia"):** **"Classic"** is the default: the title strip on top, the game view on the left/centre (gold corner brackets, target bar hanging from its top), and on the right one or two columns of stackable **mini-windows** on the frame colour `#1d1915` with 4 px gaps. A mini-window is a normal panel (fill `#2b2621`, 1 px `#0d0b09` border, `#4a4034` inset line, square corners) with a 23 px header strip (`#1d1915`, `0 1px 0 #5a4a30`), a gold diamond + Verdana 700 11 px uppercase label in `#d4ad55` (letter-spacing 0.14 em), muted info on the right and two 17 px iron buttons (− fold, ✕ close). A fixed control bar of iron HUD buttons tops the right column. The health/mana bar and the action bars sit on frame-coloured strips docked to an edge of the view (striped bronze `#8a7340` grip), or float over the view as panels with the drop shadow `0 4px 14px rgba(0,0,0,.55)`. The "How many?" box is a small panel with gold corner brackets, a Palatino gold title and the one "on" button. Other presets in Settings → Layout: "Two flanks" (design 2c, the 2026-10-21 look) and "Full view" (design 3c: the view fills the screen, the windows and chat float over it with the drop shadow).
- **Game, "Two flanks" preset:** the left flank holds character, Combat, Skills, Battle and Party; the right flank holds Map, menu, Equipment, Pockets and Backpack; hotbar and chat sit under the view. Controls and layout don't change without the owner (BIBLE §10).
- **Login / start screen (chosen 2026-10-21: "A · The Gatehouse")** has these parts:
  - **Background:** a darkened gameplay still filling the screen.
  - **Header:** the title strip, showing realm status and the countdown.
  - **Centre:** the stacked crest and hero wordmark with the tagline, above **one central panel**. The panel has Log in / Create account tabs, Email, Password, Forgot password?, Keep me signed in, the gold "Enter the realm" button, "or", and "Play offline".
  - **Footer:** a Herald news strip along the bottom.
  - **Hero step:** "Who rides out today?" uses the same backdrop and a central list of 5 slots (vocation diamond, gold name, "Level 20 Knight · resting in Thornvale"). Empty slots are dashed, with "Enter as …" in gold and "Delete …" as a quiet link.
- **Website:** dark bands of `#1d1915` / `#14110e`, content max 1240 px, generous section spacing (64–120 px), centred section heads (diamond label → headline → muted lede). Each page has one gold primary action.

---

## 7. Imagery

- **Use real game imagery only:** screenshots, recorded footage, the world atlas (`site/media/atlas*.jpg|webp`, rendered from the game map) and in-game art. No stock photos, no AI-generated art, no other games' assets (BIBLE §1).
- **Grade:** slightly desaturated (`saturate(.7–.85)`) and darkened (`brightness(.55–.8)`) under a radial vignette to `#0d0b09`, so gold text reads on top.
- **Captions** on images: small-caps Palatino in ink with a soft black text-shadow.
- **Emblems and icons:** simple 3 px stroke line drawings in gold or ink (vocations: shield-and-cross Knight, bow Paladin, flame Sorcerer, sprouting leaf Druid). No emoji, no filled clip-art.
- **Share images (1200 × 630):** atlas on the right, dark fade to the left, crest + THORNVALE + one line + "Gates open 1 January 2027" + thornvaleonline.com, inside a bronze frame with gold corner brackets (`site/media/og-image.jpg`).

---

## 8. Motion

- **Calm and warm.** Embers/sparks drifting up (website hero, final call, 404), a slow gold glow pulse on the hero wordmark, gentle rise-in of sections on scroll, a living green diamond for "online".
- Durations 0.2–0.8 s, ease-out. No bouncing, spinning or flashing.
- Always respect `prefers-reduced-motion`: stop sparks, glows, tickers and reveals.

---

## 9. Sound

- **Music:** an original soundtrack. Each region has its own theme played by its own band of synthesized instruments (folk fiddle and lute in towns, pan pipes and hand drums in jungles, oud and darbuka in deserts, horns and taiko at volcanoes, brass and timpani in battle). It is generated in code (`scripts/music/`), with no samples.
- **Effects:** layered, material-aware and synthesized (`src/audio/sfxlib.ts`, `foley.ts`). Footsteps follow the ground, hits follow the monster's material, and monsters have their own voices. Combat (swings, hits, blocks, bows, arrows, falls) sounds natural, not electronic: it is rendered offline from physical models of metal, wood, flesh, bone and air (`scripts/sfx/`), never from sample packs.
- **Brand sounds:** soft wooden clicks for buttons, coins for gold, a brass fanfare with bells for level-up. A website may offer music only behind a play button, never on autoplay.

---

## 10. Voice and words

- **Plain British English** in short sentences, written for players rather than developers. Slightly old-world flavour in names and headings only ("Who rides out today?", "The gates open", "Hall of heroes"), never in instructions or errors.
- **Words we use:** hero (a player's character in marketing and login; "character" is fine in help text), realm, wanderers (players online), Herald (announcements), Chronicle (news), Hall of heroes (highscores), protection zone, vocation, depot, rune.
- **Errors and help:** say what happened and what to do: "Wrong email or password." "That name is taken, try another."
- **Numbers:** written as digits with thousands separators (1,240 gold).
- **Never:** Tibia's proper names, "MMO" jargon walls, all-caps sentences, exclamation-mark spam, emoji.
- **Languages:** the owner reads Polish and English. **Every artifact or preview page made for the owner has a Polish / English switch (Polish by default, remembered in the browser).** Game copy is written in English and shown in English, Polish or Brazilian Portuguese (the player's choice, owner request 2026-10-23; same plain voice in each language). Website copy is English unless the owner asks otherwise.

---

## 11. Quick checklist (before shipping anything visual)

1. Browns and gold only, from the palette above, with gold used sparingly and one gold primary action.
2. Palatino for words and Verdana capitals for labels, with no web fonts.
3. Square corners, 1 px inset lines, gold corner brackets where it's a feature, diamonds instead of dots.
4. The crest and wordmark are drawn exactly as specified.
5. The imagery is real game footage, graded dark.
6. Reduced motion is respected and focus rings are visible, with contrast of at least 4.5:1.
7. The copy is plain British English and fits the voice.
8. Owner artifacts have the PL/EN switch.
9. If the brand changed, both copies of this file are updated and a Change Log row added.
