# Dead Locks — context for any AI (or developer) opening this repo

Read this first if you are working on **Dead Locks**. For anything else in this repo (the Thornvale RPG),
read `CLAUDE.md`, `BIBLE.md` and `BRAND.md` instead.

## 1. What this repo is

This repository holds two separate things owned by Dawid (the owner):

| Project | What it is | Where |
|---|---|---|
| **Thornvale** | Online RPG (TypeScript, three.js, Supabase), the main product of this repo | `src/`, `server/`, `BIBLE.md` |
| **Dead Locks** (formerly "Bunker 47") | Round-based co-op zombie FPS with a Rasta / reggae / sound-system theme | `games/bunker47*`, `server/bunker.ts` |

Dead Locks rides on the Thornvale server (same Render web service) at an unlisted address.
Live: https://thornvaleonline.com/bunker47-563f4cb0f8/ (path set by `BUNKER_PATH` in `server/bunker.ts`).

## 2. Ground rules (non-negotiable)

1. **Never write secrets anywhere** (code, commits, docs, chat, logs). The Supabase secret key lives only in the
   Render dashboard as `SUPABASE_SERVICE_KEY`. If you ever see a real key, do not copy it.
2. **Do not publish / push to `main` without the owner's say-so.** Pushing to `main` deploys to the live site
   automatically (Render). Collaborators: work on a branch and open a pull request.
3. **Original content only.** No ripped assets, no real people's likenesses (e.g. no Bob Marley face, no real
   studio names such as "Studio One"), no copyrighted lyrics or logos. Invented artists / posters only.
   Asset packs must be free-to-use (CC0 or a clear free licence); record the source and licence in
   `server/bunker.ts` next to the file entry.
4. **No new runtime dependencies** without the owner's OK. The game is one HTML file that loads three.js r128
   from a CDN; keep it that way.
5. **Ask before anything irreversible** (deleting files, dropping database columns, rewriting history).
   Database changes are additive only: add columns / views, never drop.
6. **Log every release** as a row in the Change Log table in `BIBLE.md` (§13), e.g. "Dead Locks v6: …".
7. **On brand:** browns + gold, Rasta red / gold / green accents, square corners, gold corner brackets.
   Exact values are in `BRAND.md`.
8. Commit messages for AI-made commits end with a `Co-Authored-By:` line for the AI that wrote them.

## 3. Files

| Path | Purpose |
|---|---|
| `games/bunker47.html` | **The whole game** (~6,500 lines: HTML, CSS, JS in one file). |
| `games/bunker47-gun-*.glb` | Gun models (Styloo Guns pack, Guns & Explosives pack — CC0). |
| `games/bunker47-prop-*.glb` | Props: palms, plants, grenades, C4, claymore, flare gun, etc. |
| `games/bunker47-arms.glb` | Rigged first-person arms (PSX First Person Arms) with 18 animation clips. |
| `games/bunker47-tex-*.jpg` | PBR textures (diffuse / normal / roughness). |
| `games/bunker47-zs-*.mp3` | Zombie sounds; `vo-*.mp3` voice lines; `deadlock.mp3` boss theme; `song.mp3` radio song. |
| `server/bunker.ts` | Serves the page and every asset (whitelist `BUNKER_SONGS`), the co-op websocket relay `/b47ws`, and the leaderboard API `/api/b47/scores`. |
| `supabase/migrations/2026102*_bunker47_*.sql` | Leaderboard table `b47_scores` (+ `map` column) and view `b47_lifetime`. |

**Adding an asset:** put it in `games/` as `bunker47-<name>`, add `'<name>': resolve(join(HERE, '..', 'games', 'bunker47-<name>'))`
to `BUNKER_SONGS` in `server/bunker.ts` (with a licence comment), then load it in the game by `<name>`
(the page fetches assets relative to its own URL). Files not in the whitelist are not served.

## 4. How the game works (inside `games/bunker47.html`)

Sections are marked with `// =====` banners, in this order: renderer/post-processing → procedural textures →
building helpers → world data → materials → map builders (Bunker, Yard Night, Studio Lot, Dead Lock Records) →
map assembly → guns → humanoids/zombie bodies → audio → effects → viewmodel → state → zombie visuals →
host simulation → client sync → player → remote players → world visuals → HUD → networking → flow → input → boot.

Key ideas:
- **Maps:** `MAP_IDS = ['bunker','yard','studio']`, chosen on the menu (stored in localStorage `b47map`, or `?map=` in the URL;
  the page reloads to switch). `MAPID`, `YARD`, `LOT` (studio) flags select map data. `MD` holds the current map's data
  (bounds, spawn, rooms, set pieces). `DOORS`, `WINS` (barricade windows), `INTER` (everything you can press F on) are per map.
- **Building:** `place(x,z,ry,y)` makes a group; `gb()` / `gc()` add boxes / cylinders (pushed into `rayWorld` for bullets
  unless `{ray:false}`); `colRect()` / `colliders` for walls; `prop(name,…)` places a loaded GLB.
  Raised floors use `XDECKS` / `XRAMPS` with nav links built by `navBuild()`.
- **Co-op:** one player is the **host** and runs the simulation (`hostStep`, zombies in `sim`); others receive snapshots and
  events (`zv` = zombie visuals). Messages go through the `/b47ws` relay (rooms by game code, max 8). If you change a
  network message shape, keep old clients working or bump a version check on both sides.
- **Weapons:** table `WPN` (stats), `PAP_MOD` (upgraded "Remix" versions), `STYG` (which GLB each gun uses + fitting:
  length, rotation, offsets). `gunModel(k)` builds the gun, `styFit()` fits the GLB onto it. `wallBuy(k, cost, x, z, nx, nz)`
  places a wall gun. Bullet penetration: `penOf()`.
- **First-person view:** separate scene `wScene` + camera `wCam`. `vmSet(k)` swaps the held gun; `vmUpdate(dt)` animates
  sway / recoil / reload. The `ARMS` rig (arms.glb) holds every gun with two-bone IK (`armsHoldGun`, `ikArm`, `handQuat`)
  and plays its own clips for knife / guitar melee (`armsSwing`).
- **Zombies:** procedural sculpted bodies (`humanoid`), limb loss, set-piece sleeping zombies on the studio map (`placeSetPieces`),
  boss every 10 rounds. Damage to the player: `hurt()` (0.7 s grace after a hit; zombie damage ramps with the round in `attackLogic`).
- **Labels / signs:** `textSprite()` returns a flat panel (snapped onto the wall behind it by `flattenLabels()` after the map is built);
  pass `{bill:1}` only for things that should face the camera (player names, pickups).
- **Performance:** after building, `mergeStatic()` merges static scenery by material (originals stay on layer 1 so raycasts still hit them;
  `mergeWatch()` releases anything the game later moves / hides / recolours). `poolLights()` keeps only the 8 nearest ceiling spotlights real.
  `?nomerge` in the URL turns merging off for debugging. Keep new moving objects working by simply moving them — the watcher handles it.
- **Saved in the browser (localStorage):** `b47opt` options, `b47look` character, `b47n` name, `b47map`, `b47runs` best nights,
  `b47life` lifetime totals, `b47best`, `b47q`, `b47s`, `b47dl`, `b47clash`. Never rename or wipe these without a migration.
- **Leaderboard:** `GET /api/b47/scores` → `{rows, life}`; `POST` `{name, round, kills, heads, points, squad, map}`.
  Scores are sanity-checked on the server, not trusted.

Controls: mouse aim / fire / ADS · R reload · F buy, open, rebuild, revive · Q or 1-3 swap · V knife · G grenade ·
X Chill Grenade · T flashlight · C crouch / slide · Tab scoreboard · Esc pause.
Controller (Xbox / standard pad, Gamepad API, code in the `game controller` block: `padPoll`, `padPlay`, `padMenu`): left stick move (click = sprint) · right stick look (click = knife) · RT fire · LT aim · A jump · B crouch/slide · X use (reload if nothing to use) · Y swap · RB/LB grenades · D-pad flashlight / scoreboard / weapons · Menu pause. Menus: gold focus ring, A select, B back.

## 5. Running and testing

- **Locally (whole server):** `npm install`, `npm run build`, then `npm run server`; open
  `http://localhost:8080/bunker47-563f4cb0f8/` (port from `PORT`, default 8080). The game page itself needs no build step. Without Supabase settings the leaderboard keeps scores in memory.
- **Before pushing** run the repo checks listed in `CLAUDE.md` ("Before every push"); GitHub Actions "Build check" must pass.
- **Game testing:** the game has no unit tests. Test in a browser: boot each map (`?map=bunker`, `?map=yard`, `?map=studio`),
  check the console for errors, buy a wall gun, open a door, reload, knife, get hit, finish a round, open the leaderboard.
  Headless Chromium (Playwright) with SwiftShader works for screenshots.

## 6. Current state and open work (as of Dead Locks v6, 2026-10-25)

Done: three playable maps (The Bunker, Yard Night, Dead Lock Records studio), co-op up to 8, perks, Remix (upgrade) desk,
mystery crate, wall buys, story mission, boss, PSX arms on every gun, flat wall signs, fair damage + hit warnings,
leaderboard with map + lifetime kills, merged-mesh performance pass.

Open (owner's checklist): Studio Easter egg quest · Carnival Day map · raised levels for Bunker / Yard Night ·
throwables and traps (models already in `games/`) · flare gun · clothed player characters for co-op
(Quaternius / Kenney Survivors) · TRELLIS zombie models + Mixamo animations · per-gun sounds and proper reload
animations · arm sleeves · per-map leaderboard filter · further performance on low-end devices.

## 7. Working with the owner

Dawid is not a programmer: explain results in plain language, show screenshots of visual changes, keep
changes small and reviewable, and say clearly what is live and what is not.
