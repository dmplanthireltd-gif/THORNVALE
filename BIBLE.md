# THORNVALE BIBLE

**The single source of truth for Thornvale.** Every Claude (claude.ai chat, Claude Code, Claude in Chrome, sub-agents) and every human contributor works from this file. If code and this file disagree, stop and fix one of them in the same change — never leave them out of sync.

- Bible version: **1.0** (2026-10-21)
- Canonical copies: `BIBLE.md` in the GitHub repo (authoritative) and `claude/THORNVALE-BIBLE.md` in the claude.ai Project "THORNVALE - GAME DEVELOPMENT" (mirror — update both together).

---

## 1. Vision and hard rules

Thornvale is a browser 3D fantasy MMORPG inspired by classic Tibia (7.x–8.x era): tile movement, a tilted top-down view, vocations, runes, spells by words, depots, NPC trading, dangerous monsters, loot.

**Hard rules (never break):**
1. **Original assets only.** No Tibia sprites, names of towns/NPCs/quests, maps, text or sounds copied. Tibia is *inspiration for mechanics and feel*. Monster *types* (dragon, minotaur, cyclops…) are generic fantasy and fine; Tibia-specific proper names are not. The world map follows the *layout* of the reference picture the owner supplied, but every town and region name is original.
2. **Never lose player progress.** Level, experience, items, gold, bank, depot and quests must survive every update. See §8.
3. **Secrets never leave the dashboards.** See §4.
4. **The logic layer stays render-agnostic.** See §6.
5. **Keep what exists.** Graphics style, systems and controls stay as they are unless the owner asks for a change. Don't "improve" by replacing.

**Owner:** dmplanthireltd (GitHub `dmplanthireltd-gif`). The owner often writes in Polish or quick English — read for intent, answer in the language they used.

---

## 2. Stack

| Part | Tech |
|---|---|
| Language | TypeScript 5.6, strict |
| Rendering | Three.js r170 (`three@^0.170.0`), MeshToonMaterial 3-step gradient, custom pixel-art pass |
| Bundler | Vite 6 |
| Server | Node ≥ 20, run with `tsx`, dependency-free WebSocket (`server/ws.ts`) |
| Database | Supabase Postgres via PostgREST (fetch, no SDK) |
| Auth | Supabase Auth (email + password, GoTrue REST, no SDK); fallback name+password (scrypt) |
| Hosting | Render free web service (Blueprint `render.yaml`) |
| Runtime deps | **only `three`**. Do not add dependencies without the owner's OK. |

---

## 3. Repository layout

```
BIBLE.md              ← this file
CLAUDE.md             ← short pointer + checklist for Claude Code
README.md             ← player/host-facing docs
render.yaml           ← Render Blueprint
supabase/schema.sql   ← database tables (keep in sync with migrations)
server/
  server.ts           ← game server: tick 20 Hz, login, autosave, HTTP API, static files
  storage.ts          ← Storage interface: FileStorage (local JSON) / SupabaseStorage
  ws.ts               ← minimal WebSocket implementation
  data/               ← local JSON saves (dev only, git-ignored content)
src/
  main.ts             ← boot: start screen → local or online game
  client/Controller.ts← LocalController (offline) / NetController (online, mirror Game)
  game/               ← PURE GAME LOGIC (no DOM, no three.js)
    Game.ts           ← world state, sessions, executeCommand, tick, events
    admin.ts          ← "/" test commands (gated by Session.admin)
    combat/ core/ enemies/ entities/ inventory/ magic/ movement/
    net/protocol.ts   ← client⇄server messages, PROTOCOL_VERSION
    npc/              ← npcs.ts, dialogue.ts, stock.ts (shop lists)
    player/           ← Player, vocations, outfits
    quests/ save/ (SaveSystem.ts, migrate.ts)
    world/            ← WorldMap.ts (tiles, floors, EnemyKind), worldGen/terrain/towns…
  render/             ← Renderer, WorldView, CreatureView, Effects, PixelPass, CameraController, Overlay, models/, textures.ts
  ui/                 ← HUD, Minimap, WorldMapView, OnlineLogin, StartScreen, OutfitPreview, icons, dom
  input/Input.ts      ← keyboard/mouse → Commands
  audio/Sfx.ts        ← synthesized Web Audio effects from game events
scripts/              ← smoke-test, net-test, storage-test, auth-test, content-test, saves
```

---

## 4. Live infrastructure and secrets

| Thing | Value |
|---|---|
| GitHub repo | `dmplanthireltd-gif/thornvale` (shown as THORNVALE), branch `main` |
| Live game | https://thornvale.onrender.com (health: `/status`) |
| Render service | `thornvale`, free plan, Frankfurt, auto-deploys on push to `main` |
| Supabase project | `thornvale`, ref `gvknnzdhxwmqimaoiref`, region eu-central-1, org `thornvale` |
| Supabase URL | https://gvknnzdhxwmqimaoiref.supabase.co |
| Publishable key (public, OK to commit) | `sb_publishable_Do-DXlXiAHd6f8xLCFo_qA_JHrsygW3` |
| claude.ai artifact (offline playable build) | https://claude.ai/artifact/Ei6rAWKjnb5bWSaNcchW3K |

**Secrets policy**
- `SUPABASE_SERVICE_KEY` (secret / service_role key) lives **only** in the Render dashboard → Environment. Never in chat, code, commits, files, artifacts, logs, project docs or reports. If you see it pasted anywhere, tell the owner to rotate it.
- Never print env vars in logs. Never echo a key back to the user.
- Publishable key and URL are public by design.

**Render environment variables:** `NODE_VERSION=20`, `MAX_PLAYERS=50`, `ALLOW_ADMIN=0`, `ADMINS=""` (comma-separated character names allowed to use `/` commands online), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY` (secret), optional `MAX_CHARACTERS` (default 5).

**Startup log lines to check after a deploy:**
- `Login: email (Supabase Auth)` — email accounts active (else "name + password").
- `Saves: Supabase database` — persistence active (else "files" = **progress is lost on restart**, because Render's disk is wiped).

**Known platform limits:** Render free sleeps after 15 min idle (first visit takes ~1 min). Supabase built-in email only sends a few mails/hour and only to team members → real players need custom SMTP (Resend/Brevo) or "Confirm email" switched off.

---

## 5. Data model (Supabase)

Defined in `supabase/schema.sql`. Migrations applied so far: `thornvale_save_data`, `characters_owned_by_auth_users`.

| Table | Columns | Notes |
|---|---|---|
| `accounts` | name_key PK, display_name, salt, hash, created_at, last_login | Only for name+password mode (no Supabase Auth) |
| `characters` | name_key PK, owner_id uuid → auth.users (on delete set null), display_name, data jsonb (SaveData), save_version int, level, vocation, updated_at | One row per character; `data` is the whole save |
| `character_backups` | id identity, name_key, data jsonb, save_version, reason, created_at | Written **before** every migration |

- Row Level Security is **on with no policies**: only the server (service key) can read/write. Never add public policies or let the browser talk to these tables.
- `name_key` = lowercased character name. Max 5 characters per account.
- Schema changes: write a new Supabase migration **and** update `schema.sql` in the same commit. Additive only (new nullable columns, new tables). Never drop or rename columns holding player data.

---

## 6. Architecture rules

1. **`src/game/**` imports nothing from `render/`, `ui/`, `input/`, `audio/`, DOM or three.js.** It must run in Node (server, tests).
2. **Every player action is a `Command`** sent through `Controller.send(...)` → `Game.executeCommand`. UI/input never mutate game state directly. Offline = LocalController runs it locally; online = NetController sends it, the server is authoritative.
3. **Game → view communication is via the event bus** (`core/events.ts`). Renderer, HUD and Sfx subscribe; they never poll internal fields they don't own.
4. **Online:** server ticks at 20 Hz and sends snapshots (`VIEW_RADIUS = 20`). The client keeps a mirror Game (`simulate:false`) and applies snapshots. Messages arriving before the HUD exists go to the backlog.
5. **Protocol:** `PROTOCOL_VERSION` (currently **3**) in `net/protocol.ts`. Bump it whenever a message shape changes; client and server must deploy together (they do — same repo, one Render service).
6. Admin/test commands are typed in chat with `/` (`/help` lists them). Offline always allowed; online only for names in `ADMINS` or when `ALLOW_ADMIN=1`. Dev console opens with the **`** key.

---

## 7. Game constants (change only deliberately, update here)

| Constant | Value | Where |
|---|---|---|
| Camera | orthographic, tilt `CAMERA_TILT_DEG = 32`, looking north from south | render/CameraController.ts |
| Pixel art | `TILE_PX = 32` art pixels per tile, depth-edge outline | render/PixelPass.ts |
| Floors | `FLOOR_MIN = -4` … `FLOOR_MAX = 2`, FLOOR_H 3.4; z=0 ground | game/world/WorldMap.ts |
| World size | target 640 × 800 tiles (new map in progress) | world/ |
| Movement | 8 directions, no corner cutting, click-to-move A* | movement/pathfinding.ts |
| Server tick | 1/20 s | server/server.ts |
| Inventory | `POCKET_SLOTS = 8`, `DEPOT_SLOTS = 60`, 10 equipment slots | inventory/Inventory.ts |
| Equip slots | head, amulet, backpack, armor, weapon, shield, legs, ring, ammo, feet | inventory/items.ts |
| Cooldown groups | attack 2 s, heal 1 s, support 1 s, potion 1 s | magic/spells.ts |
| Throw range | 7 tiles | Game.ts |
| Ground bag lifetime | 180 s | Game.ts |
| Area runes | shape `dx² + dy² ≤ r² + r` | Game.ts |
| Autosave | every 30 s + on logout + on SIGTERM | server/server.ts |

---

## 8. Save data and migration (PRIORITY)

File: `src/game/save/migrate.ts`. Current **`SAVE_VERSION = 2`**.

- Every save stores `version`. On load, `migrateSave()` upgrades it step by step: `MIGRATIONS[n]` turns version n into n+1.
- **Changed the save shape?** → bump `SAVE_VERSION`, add `MIGRATIONS[old]`, add a case to the smoke test, note it in the Change Log below.
- **Renamed an item id?** → add `old: 'new'` to `ITEM_RENAMES`. Never just rename.
- **Removed an item?** → do nothing special. The item goes to the save's `lostItems` and is returned to the depot automatically if that id (or a rename) ever exists again. Never strip items from saves.
- The server backs up the raw save to `character_backups` **before** migrating.
- A save from a **newer** version (`'newer'`) is never loaded or overwritten; `'invalid'` is refused. Login is rejected with a message instead.
- Moving the world (new map): migration sets x = −1 → character respawns at its temple. Use the same trick, never leave players inside walls.
- Tools: `npm run saves:backup`, `saves:import`, `saves:check` (check runs every stored save through migrateSave without writing).

---

## 9. Content IDs (glossary)

IDs are `snake_case`, English, stable forever once shipped (they live in saves). Display names may change freely.

- **Vocations:** `knight`, `paladin`, `sorcerer`, `druid`.
- **Spells (words):** exura, exura ico, exura gran, exura vita, exura sio, exori, exori gran, exori hur, exori con, exori san, exori vis, exori flam, exori frigo, exori tera, exevo gran mas vis, exevo gran mas frigo, exevo mas san, utani hur, utamo vita, utevo lux, exori mas grav, exevo con, exevo con ferro, exevo con aquila, exevo lanca (+ any added by the content work — the list in `magic/spells.ts` is authoritative).
- **Items:** `src/game/inventory/items.ts` is authoritative (~100+). Runes, potions, weapons, armour sets, tools, loot.
- **Monsters:** `EnemyKind` in `world/WorldMap.ts`, stats in `enemies/enemyDefs.ts`. Includes the classic set plus the ice-region set (frost_dragon, ice_golem, crystal_spider, frost_giant, frost_giantess, ice_witch, barbarian_*, frostkin*, dire_penguin, silver_rabbit, winter_wolf, polar_bear) and scorpion, mummy, scarab, minotaur(+archer/mage), cyclops, dwarf(+soldier/guard), bandit, amazon, valkyrie, bear, deer, snake, lizard_sentinel/templar.
- **NPCs:** `npc/npcs.ts`; shop lists in `npc/stock.ts` (EXTRA_SELLS / EXTRA_BUYS merged into NPCS). Services: shop, bank, depot, travel, quests.
- Every new item needs: definition, icon (`ui/icons.ts`), and if equippable a model (`render/models/`). Every new monster needs: def, rig/model, loot table, spawn. `scripts/content-test.ts` checks these links.

---

## 10. Controls (don't change without the owner)

Arrows/WASD + numpad diagonals move · **Ctrl+direction** turns · **Ctrl+R** turns clockwise · click to walk (A*) · right-click = use/look/context menu · drag items (to ground = throw, to slots/containers) · **F1–F12** hotbar (12 slots) · runes aimed with a crosshair (area preview) · **M** world map · **H** help · **`** dev console · Enter/chat for spells and `/` commands. Option "keep outfit" hides equipment on the character (classic look).

---

## 11. Working process (all Claudes)

**Before work**
1. Read this Bible. Read `CLAUDE.md`. Check the Change Log and Open Work below.
2. Pull latest `main`. Never work from an old zip or artifact copy.

**While working**
- One owner per file at a time. When several agents run in parallel, each gets an explicit list of files it may edit; nobody else touches them until it finishes. Shared files (`Game.ts`, `items.ts`, `protocol.ts`, `WorldMap.ts`) are edited by one agent at a time.
- Match existing style: 2-space indent, single quotes, semicolons, named exports, small pure functions in `game/`, comments explain *why*.
- No new runtime dependencies. No copying Tibia assets.

**Before pushing (all must pass)**
```
npm run typecheck
npm run test:logic      # smoke test
npx tsx scripts/content-test.ts
npm run test:storage
npm run test:auth
npm run test:net
```
Then `npm run build` (on Render or a machine with npm registry access).

**Deploy:** push to `main` → Render builds `npm install --include=dev && npm run build`, starts `npm run server`. Check the two log lines in §4. Then update the artifact build if the owner wants the offline version refreshed.

**Commits:** clear English message describing the change for a player/owner. Never commit `server/data/*.json` with real player data, never commit secrets.

**After work**
- Update this Bible (both copies) if you changed: any ID, schema, protocol version, save version, constant in §7, controls, infrastructure, or process.
- Add a line to the Change Log.
- Tell the owner in plain words what changed and what (if anything) they must do manually.

**Approvals:** ask the owner before anything hard to undo: deleting data, dropping tables, rotating keys, changing hosting, force-push, big redesigns. Don't repeat a tool action the owner already rejected without asking.

---

## 12. Open work (keep current)

- [ ] Render: `SUPABASE_SERVICE_KEY` set in dashboard; verify both startup log lines.
- [ ] Supabase Auth: Site URL `https://thornvale.onrender.com`, redirect URLs, "Confirm email" off (or custom SMTP).
- [ ] New 640 × 800 world following the owner's reference layout, original names; old areas dropped; chunked WorldView.
- [ ] Ice-region (7.92-style) and classic monsters, items, spells, buff potions, conjure spells; content-test.
- [ ] Better spell effects (Effects.ts).
- [ ] Integrate, test all, push, refresh artifact.
- [ ] Later: custom SMTP for recovery mails; more map/game polish.

---

## 13. Change Log

| Date | Commit | Change | Save ver | Protocol |
|---|---|---|---|---|
| 2026-10 | 545248d | First playable: 3D client, server, Render setup | 1 | 2 |
| 2026-10 | 7de245b | Supabase saves, account login, save migrations + backups | 2 | 3 |
| 2026-10 | 55d38a3 | Email accounts with password recovery (Supabase Auth) | 2 | 3 |
| 2026-10-21 | — | BIBLE.md + CLAUDE.md added | 2 | 3 |
