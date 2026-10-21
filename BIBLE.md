# THORNVALE BIBLE

**The single source of truth for Thornvale.** Every Claude (claude.ai chat, Claude Code, Claude in Chrome, sub-agents) and every human contributor works from this file. If code and this file disagree, stop and fix one of them in the same change — never leave them out of sync.

- Bible version: **1.2** (2026-10-21)
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
site/                 ← marketing website (plain HTML/CSS/JS, no build; media/ = trailer, pictures, share image): served at / — index, news/, guide/, highscores/, faq/, rules/, privacy/, 404, robots, sitemap; site.js = live status, countdown, highscores table
supabase/schema.sql   ← database tables (keep in sync with migrations)
supabase/migrations/  ← one SQL file per schema change (applied by hand / Supabase MCP, then listed in §5)
server/
  server.ts           ← game server: tick 20 Hz, login, autosave, HTTP API, static files
  storage.ts          ← Storage interface: FileStorage (local JSON) / SupabaseStorage; characters, backups, market
  ws.ts               ← minimal WebSocket implementation
  data/               ← local JSON saves (dev only, git-ignored content)
src/
  main.ts             ← boot: start screen → local or online game
  client/Controller.ts← LocalController (offline) / NetController (online, mirror Game)
  game/               ← PURE GAME LOGIC (no DOM, no three.js)
    Game.ts           ← world state, sessions, executeCommand, tick, events
    admin.ts          ← "/" test commands (gated by Session.admin)
    combat/ core/ enemies/ entities/ inventory/ magic/ movement/
    gathering/        ← woodcutting.ts (1–99 curve, tree tiers, chop chance), fishing.ts (water, fish tiers, bite chance)
    market/           ← market.ts (offers, deliveries, MarketChange, fee)
    net/protocol.ts   ← client⇄server messages, PROTOCOL_VERSION
    npc/              ← npcs.ts, dialogue.ts, stock.ts (shop lists)
    player/           ← Player, vocations, outfits, skills.ts (combat skills, training, power level, migration values)
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
| GitHub repo | `dmplanthireltd-gif/THORNVALE` (renamed from `thornvale`; old URL redirects), branch `main` |
| Live game | https://thornvaleonline.com/play/ (also https://thornvale.onrender.com/play/). `/play` → 301 → `/play/`. Root-level `/ws`, `/api/*`, `/status` (health) |
| Render workspace | **Pro** workspace plan ($25/mo, since 2026-10-21): more bandwidth (25 GB), 15 custom domains, 1,000 build minutes/mo, team members |
| Grand opening | **1 January 2027, 00:00 UK time** (Europe/London) |
| Website | https://thornvaleonline.com — static files in `site/`, served by the game server at every path except `/play/`, `/ws`, `/api/*`, `/status`. Live player count from `/status`; countdown in `site/site.js`; highscores from `/api/highscores` (top 50 by level, online players' live levels merged in, `ADMINS` excluded, cached 60 s). Files are served with byte ranges (video). Operator in the privacy policy: Dawid Mlynarczyk (individual, UK); accounts 13+; contact support@thornvaleonline.com. |
| Domain | `thornvaleonline.com` + `www` (redirects to the root) are custom domains on the Render service. Registered at WordPress.com; DNS there: A `@` 216.24.57.1, CNAME `www` thornvale.onrender.com. The old WordPress.com site (blog id 258122271) is no longer served at the domain. |
| Render service | `thornvale`, instance type **Free** (`plan: free` in render.yaml), Frankfurt, auto-deploys on push to `main` |
| Supabase project | `thornvale`, ref `gvknnzdhxwmqimaoiref`, region eu-central-1, org `thornvale` |
| Supabase URL | https://gvknnzdhxwmqimaoiref.supabase.co |
| Publishable key (public, OK to commit) | `sb_publishable_Do-DXlXiAHd6f8xLCFo_qA_JHrsygW3` |
| claude.ai artifact (offline playable build) | https://claude.ai/artifact/Ei6rAWKjnb5bWSaNcchW3K |

**Secrets policy**
- `SUPABASE_SERVICE_KEY` (secret / service_role key) lives **only** in the Render dashboard → Environment. Never in chat, code, commits, files, artifacts, logs, project docs or reports. If you see it pasted anywhere, tell the owner to rotate it.
- Never print env vars in logs. Never echo a key back to the user.
- Publishable key and URL are public by design.

**Render environment variables:** `BOTS` (computer players; default 6 in test mode, 0 otherwise; never saved, left out of /status and highscores, names end in [Bot]), `BOT_LEVEL` (default 500), `TEST_MODE` (default ON in code when unset: test commands for everyone except /god and /kill, and START_LEVEL defaults to 20 — set `TEST_MODE=0` before the grand opening), `START_LEVEL` (test servers: every character is raised to at least this level at login; currently "20" for testing — set to "1" before the grand opening), `NODE_VERSION=20`, `MAX_PLAYERS=50`, `ALLOW_ADMIN=1` (testing phase = test mode: everyone may use the `/` commands and the ` console except `/god` and `/kill`; names in `ADMINS` get everything — set back to 0 before the grand opening), `ADMINS=""` (comma-separated character names that are game masters; the owner's character **Ouriolis** is always a game master via `OWNER_CHARACTERS` in server.ts), `PVP=1` (player-versus-player on; `0` turns it off — offline single-player never has PvP), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY` (secret), optional `MAX_CHARACTERS` (default 5).

**Startup log lines to check after a deploy:**
- `Login: email (Supabase Auth)` — email accounts active (else "name + password").
- `Saves: Supabase database` — persistence active (else "files" = **progress is lost on restart**, because Render's disk is wiped).

**Render plan rules:** the workspace plan (Pro) and the service's instance type are separate. `render.yaml` `plan:` must always match the instance type chosen in the dashboard, otherwise a Blueprint sync changes it back. If the owner upgrades the instance (Starter `0.5c-512mb`, Standard `1c-2g`, Pro `2c-4g`…), update `plan:` in render.yaml and this table in the same commit.

**Known platform limits:** the Free instance sleeps after 15 min idle (first visit takes ~1 min) and wipes its disk on restart — saves are safe only because they go to Supabase. Any paid instance removes the sleep. Supabase built-in email only sends a few mails/hour and only to team members → real players need custom SMTP (Resend/Brevo) or "Confirm email" switched off.

---

## 5. Data model (Supabase)

Defined in `supabase/schema.sql`. Migrations applied so far: `thornvale_save_data`, `characters_owned_by_auth_users`, `player_market`.

| Table | Columns | Notes |
|---|---|---|
| `accounts` | name_key PK, display_name, salt, hash, created_at, last_login | Only for name+password mode (no Supabase Auth) |
| `characters` | name_key PK, owner_id uuid → auth.users (on delete set null), display_name, data jsonb (SaveData), save_version int, level, vocation, updated_at | One row per character; `data` is the whole save |
| `character_backups` | id identity, name_key, data jsonb, save_version, reason, created_at | Written **before** every migration |
| `market_offers` | id text PK, seller_key, seller_name, item_id, qty int >0, price bigint >0 (per piece), created_at, expires_at | Player market sell offers; the items are in escrow here. Migration `supabase/migrations/20261021_player_market.sql` (applied to Supabase 2026-10-21 as migration `player_market`; server logs "Market: open") |
| `market_deliveries` | id text PK, name_key, gold bigint, items jsonb, reason, created_at | Gold from sales / items of expired offers for characters that were offline; handed out at their next login (or depot/market visit), then deleted |

- Row Level Security is **on with no policies**: only the server (service key) can read/write. Never add public policies or let the browser talk to these tables.
- `name_key` = lowercased character name. Max 5 characters per account.
- **Market storage order (never lose anything):** every market change is a `MarketChange` stored in this order: (1) new offers + new deliveries, (2) save the characters involved, (3) shrink/delete offers and delete delivered deliveries. A crash can at worst hand something out twice, never lose it. Each save remembers received delivery ids (`market.claimed`), so a delivery left over after a crash is not paid twice. Never edit an offline character's save to pay them — use a delivery.
- Schema changes: write a new Supabase migration **and** update `schema.sql` in the same commit. Additive only (new nullable columns, new tables). Never drop or rename columns holding player data.

---

## 6. Architecture rules

1. **`src/game/**` imports nothing from `render/`, `ui/`, `input/`, `audio/`, DOM or three.js.** It must run in Node (server, tests).
2. **Every player action is a `Command`** sent through `Controller.send(...)` → `Game.executeCommand`. UI/input never mutate game state directly. Offline = LocalController runs it locally; online = NetController sends it, the server is authoritative.
3. **Game → view communication is via the event bus** (`core/events.ts`). Renderer, HUD and Sfx subscribe; they never poll internal fields they don't own.
4. **Online:** server ticks at 20 Hz and sends snapshots (`VIEW_RADIUS = 20`). The client keeps a mirror Game (`simulate:false`) and applies snapshots. Messages arriving before the HUD exists go to the backlog.
5. **Protocol:** `PROTOCOL_VERSION` (currently **13**) in `net/protocol.ts`. Bump it whenever a message shape changes; client and server must deploy together (they do — same repo, one Render service).
6. **PvP** (server option `PVP`, passed as `GameOptions.pvp`; off offline). Rules live in `Game` (`pvpProblem`, `onPvpAttack`, `onPvpKill`); every PvP hit passes `applyDamage`, which re-checks them:
   - Players block players, like monsters do, **except inside protection zones** (temples, depots, town doors) where they pass through each other. Logging in or teleporting onto an occupied tile is allowed.
   - No attacking from inside, or into, a protection zone. Attacker and target must both be level ≥ 8.
   - Melee, distance, wands/rods, targeted spells, targeted runes hurt players. Area spells and area runes hurt players in the area too, never the caster, never anyone in a protection zone. Players have no `def`: armour and resistances come from their gear.
   - **Secure mode** (per player, default on, saved; command `secureMode`, HUD button "PvP: secure"/"PvP: open"): refuses attacks on unmarked players and spares them from your area attacks. Skulled players and people who attacked you recently can always be attacked.
   - **White skull:** attacking an unmarked player who did not attack you first (self-defence is free) → white skull, refreshed on every attack.
   - **Unjustified kill:** killing an unmarked player who did not attack you. 3 within 24 h → **red skull**. A red-skulled player who dies drops the whole backpack (equipment stays) on the spot.
   - **PZ lock:** attacking a player locks you out of protection zones (status line shows "PZ-locked Ns"). There is no logout check (closing the game logs out at once).
   - Death by a player: normal death penalty, "You were killed by NAME", the killer is told "You killed NAME".
   - Skull times and kill timestamps are wall-clock ms (they keep running while offline and across restarts).
7. Admin/test commands are typed in chat with `/` (`/help` lists them). Offline always allowed; online only for names in `ADMINS` or when `ALLOW_ADMIN=1`. Dev console opens with the **`** key.

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
| Waves / beams | face N/E/S/W only (diagonal facing → east/west); wave cone widths 1,3,3,5,5…; beam = straight line | magic/spells.ts |
| Rune fields | fire 45 s, energy 30 s, poison 60 s, magic wall 20 s; tick every 2 s; not in protection zones; never saved | items.ts, Game.ts |
| Poison | `buffs.poisoned` seconds, damage every 2 s; from venom fields and earth monster attacks (35%); cured by exana pox / antidote rune | Game.ts |
| Music | `src/audio/Music.ts`: "The Open Road" (fields, 88 bpm), "Hearth and Lantern" (protection zones, 96 bpm), "Below the Stone" (z<0, 60 bpm); switches at phrase ends | audio/Music.ts |
| Party | `PARTY_SHARE_RANGE = 30`, `PARTY_SHARE_BONUS = 1.2`, level rule lowest ≥ ⌈2/3 × highest⌉; parties are not saved (logout leaves the party) | Game.ts |
| Autosave | every 30 s + on logout + on SIGTERM | server/server.ts |
| Skills | start 10 (magic level 0); tries for next level = base × growth^(level−10) (magic: 1600 × growth^ML); base fist/club/sword/axe 50, distance 30, shielding 100. Growth knight 1.1 melee / 1.4 dist / 1.1 shield / 3.0 magic; paladin 1.2 / 1.1 / 1.1 / 1.4; mages 2.0 (fist 1.5) / 2.0 / 1.5 / 1.1. 1 try per attack made, 1 per attack received with a shield, 1 per mana point spent | player/skills.ts |
| Skill effect | damage/healing formulas use **power level** = 0.5 × level + 0.5 + POWER[voc][skill] × (skill − start) instead of the level; POWER knight melee 0.8 / dist 1.6 / magic 5, paladin 1.2 / 0.8 / 2, mages 2.5 / 2.5 / 0.75. At the "typical" skill power = level (old balance). Miss chance −0.08% per skill point (min 2%); shielding +0.6% defence per point; magic level +0.3% wand/rod damage per point | player/skills.ts, combat.ts, Game.ts |
| Woodcutting | levels 1–99, classic gathering curve (83 xp for 2, 13,034,431 for 99); chop every `CHOP_INTERVAL = 2` s; chance = tree base + 0.8%/level above requirement + 0.6%/axe attack above 12 (5–90%). Tree → logs (lvl 1, 25 xp, always falls, regrows 25–45 s); Pine → pine_logs (15, 45 xp, falls 1/4, 40–70 s); Palm → palm_logs (25, 70 xp, 1/5, 50–90 s); JungleTree → teak_logs (35, 90 xp, 1/6, 70–120 s). Stumps are not saved (regrow on restart) | gathering/woodcutting.ts |
| Fishing | levels 1–99 on the same curve as woodcutting; needs a `fishing_rod` (backpack or hands); use open water (`Ground.Water`/`DeepWater` with no object) within `FISH_RANGE = 3` tiles in sight, no walking; a cast every `FISH_INTERVAL = 2.5` s; walking, attacking, leaving range stop it. Per cast: 1% old boot (1 xp), 1% treasure (10 xp: 20–80 gold, or a small ruby/sapphire/emerald, sunstone ring, ring of vigour, sapphire ring), otherwise bite chance = min(75%, 35% + 0.4%/level) × wariness. A bite tries the best fish the water and level allow first, each with 35% + 2%/level above its requirement (20–80%), the last one always bites. Fish: fish (small fish, lvl 1, 10 xp, any water), trout (10, 25 xp, any), pike (20, 40, shallow), salmon (30, 60, shallow), ice_fish (40, 80, water with snow/ice ground within 3 tiles), swordfish (50, 110, deep water only). Wariness: a 3×3 spot gets −15% bite per catch from the 6th (`SPOT_WARY_AFTER`), min 30%; it forgets one catch every `SPOT_RECOVER_SECONDS = 20` s; not saved | gathering/fishing.ts, Game.ts |
| Market | fee 1% of total (min 1 gold, bank first then backpack); max `MARKET_MAX_OFFERS = 20` offers per character; price 1–100,000,000 per piece; offers expire after 30 days (items return via delivery); stand within 2 tiles of the board | market/market.ts, Game.ts |
| PvP min level | `PVP_MIN_LEVEL = 1` (owner: PvP from level 1) | Game.ts |
| White skull | `WHITE_SKULL_MS` 15 min, refreshed per attack; self-defence window also 15 min | Game.ts |
| Red skull | `UNJUST_KILLS_FOR_RED = 3` unjustified kills within `UNJUST_WINDOW_MS` 24 h → `RED_SKULL_MS` 24 h | Game.ts |
| PZ lock | `PZ_LOCK_SECONDS = 60` after attacking a player | Game.ts |

---

## 8. Save data and migration (PRIORITY)

File: `src/game/save/migrate.ts`. Current **`SAVE_VERSION = 7`** (v2→v3: new world, everyone respawns at the Thornvale temple; v3→v4: `pvp` block — secure mode, skull expiry times, unjustified-kill timestamps — everyone starts unmarked with secure mode on; v4→v5: `skills` (from `legacySkills(vocation, level)`: every weapon skill and magic level at the value where power level ≥ character level, so nobody hits or heals less; shielding by vocation), `gathering.woodcutting = 0`, `market.claimed = []`; v5→v6: `friends = []`; v6→v7: `gathering.fishing = 0`, woodcutting kept).

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
- **Spells (words; id = words with `_`):** the list in `magic/spells.ts` is authoritative. Trainers: Master Elias + every town trainer (`EXTRA_SPELLS.elias` in npc/stock.ts).
  - *Healing:* exura, exura ico, exura gran, exura vita, exura sio "name, exura san (paladin), exura gran mas res (mass heal, druid), exana pox (cure poison).
  - *Attack, one target:* exori hur, exori con, exori san, exori vis, exori flam, exori frigo, exori tera, exori mort (sorcerer).
  - *Attack, around you:* exori, exori gran, exori mas (knight, radius 2), exori mas grav, exevo mas san, exevo gran mas vis, exevo gran mas frigo, exevo gran mas flam (sorcerer), exevo gran mas tera (druid).
  - *Waves (cone in front):* exevo flam hur, exevo vis hur (sorcerer); exevo frigo hur, exevo tera hur (druid). *Beams (line in front):* exevo vis lux, exevo gran vis lux (sorcerer).
  - *Support:* utani hur, utani gran hur, utamo vita, utevo lux, utevo gran lux, utevo vis lux, utana vid (invisible to monsters), exiva "name (direction/distance), exani tera (magic rope), exani hur up / exani hur down (levitate), exeta res (challenge, knight), utevo res ina "creature (illusion).
  - *Conjuring:* exevo con, exevo con ferro, exevo con aquila, exevo lanca, exevo pan (food), exevo con flam (flaming arrows), exevo con pox (venom arrows), exevo con mort (bolts).
  - *Rune spells (1 `blank_rune` + mana + level → runes):* adori min vis → spark_rune, adori vis → thunderbolt_rune, adori flam → ember_rune, adori mas flam → fireball_rune, adori frigo → icicle_rune, adori mas frigo → avalanche_rune, adori tera → rockspike_rune, adori mas tera → stoneshower_rune, adori mas vis → stormcloud_rune, adori gran mort → death_rune, adori san → sunlance_rune, adevo mas hur → blast_rune, adura gran → soothing_rune, adura vita → healing_rune, adana pox → antidote_rune, adana ani → snare_rune, adevo grav flam/vis/pox → flame/static/venom_field_rune, adevo mas flam/vis/pox → firebloom/stormbloom/venombloom_rune, adevo mas grav flam/vis/pox → flame/static/venom_barrier_rune, adevo grav tera → arcane_wall_rune, adito grav → dispel_rune.
- **Map objects added for rune fields:** `Obj.EnergyField = 42`, `Obj.PoisonField = 43`, `Obj.MagicWall = 44` (fire fields reuse `Obj.FireField`). Only ever placed temporarily by `Game.placeField`.
- **Map objects for skills/market:** `Obj.MarketBoard = 45` (one in every town depot, placed by `placeMarketBoards` in worldGen), `Obj.Stump = 46` (felled tree, temporary, `Game.stumps`).
- **Skills (save keys):** `fist`, `club`, `sword`, `axe`, `distance`, `shielding`, `magic`; gathering: `woodcutting` (xp in `gathering.woodcutting`), `fishing` (xp in `gathering.fishing`, save v7+). Own-player snapshot fields `wc` and `fx`. Event `fish` {id, x, y, z, got}.
- **Woodcutting items:** `logs`, `pine_logs`, `palm_logs`, `teak_logs` (materials: general traders, quest givers and outfitters buy them). The existing `hatchet` (Woodcutter's Axe) is sold by smiths, outfitters and Zuri; any axe works for chopping (best usable one counts).
- **Fishing items:** tool `fishing_rod` (tool type `fishing`; sold by every outfitter, Zuri, every ship captain and ferryman); fish (food, cheapest first) `fish` (the old Fish item = small fish), `trout`, `pike`, `salmon`, `ice_fish`, `swordfish` — bought by outfitters, general traders and quest givers (everyone who buys logs) and by harbour captains/ferrymen; junk `old_boot` (material). `FISH_ITEMS` in gathering/fishing.ts. No cooks/taverns exist yet.
- **Items:** `src/game/inventory/items.ts` is authoritative (~100+). Runes, potions, weapons, armour sets, tools, loot.
- **Monsters:** `EnemyKind` in `world/WorldMap.ts`, stats in `enemies/enemyDefs.ts`. Includes the classic set plus the ice-region set (frost_dragon, ice_golem, crystal_spider, frost_giant, frost_giantess, ice_witch, barbarian_*, frostkin*, dire_penguin, silver_rabbit, winter_wolf, polar_bear) and scorpion, mummy, scarab, minotaur(+archer/mage), cyclops, dwarf(+soldier/guard), bandit, amazon, valkyrie, bear, deer, snake, lizard_sentinel/templar.
- **NPCs:** `npc/npcs.ts`; shop lists in `npc/stock.ts` (EXTRA_SELLS / EXTRA_BUYS merged into NPCS). Services: shop, bank, depot, travel, quests.
- Every new item needs: definition, icon (`ui/icons.ts`), and if equippable a model (`render/models/`). Every new monster needs: def, rig/model, loot table, spawn. `scripts/content-test.ts` checks these links.

---

## 10. Controls (don't change without the owner)

Arrows/WASD + numpad diagonals move · **Ctrl+direction** turns · **Ctrl+R** turns clockwise · click to walk (A*) · right-click = use/look/context menu · Atk/Bal/Def + Follow/Stand buttons · drag items (onto a player = trade; to ground = throw; ground items to another tile; onto lockers/tables; runes onto battle-list rows; to slots/containers) · **F1–F12** hotbar (12 slots) · runes aimed with a crosshair (area preview) · **M** world map · **H** help · **`** dev console · Enter/chat for spells and `/` commands · click/right-click a tree with an axe = chop · click/right-click water within 3 tiles with a fishing rod = fish · use a market board (in depots) = Market window · Skills panel in the left side column (click its title to fold). Worn equipment always shows on the character (owner decision 2026-10-21; the old "classic look" option was removed).

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
- [ ] Supabase Auth: "Confirm email" off (or custom SMTP). Done 2026-10-21: Site URL `https://thornvaleonline.com`; redirect URLs `https://thornvaleonline.com/**`, `https://www.thornvaleonline.com/**`, `https://thornvale.onrender.com/**`.
- [x] New 640 × 800 world (14 towns: Thornvale, Westmarch, Elderglen, Stonedeep, Highmoor, Millbrook, Valdrheim, Aurelion, Briarwatch, Corvane, Saltmere, Palmreach, Sunspire, Dunewatch). Owner asked to skip Zao/Yalahar/Darashia/Rookgaard/Liberty Bay equivalents to save time; Zao and Rookgaard were never built, the others (Briarwatch+Emberhold, Dunewatch, Saltmere) were already built and kept for now — owner may ask to remove them later.
- [x] Ice-region (7.92-style) and classic monsters (35 new), 63 items, 5 spells, 3 buff potions; content-test.
- [x] Remaining Tibia-8.0-style spells: 54 new spells (waves, beams, exori mort, mass heal, exura san, exana pox, utani gran hur, lights, utana vid, exiva, exani tera, levitate, challenge, creature illusion, food/ammo conjuring, 27 rune spells), blank runes, 21 new runes incl. fields/bombs/walls/magic wall/dispel/snare, poison condition.
- [ ] Spells skipped for now: utevo res (summon creature) and adeta sio (convince creature) — no friendly-monster AI yet; adana mort (animate dead), adevo ina (chameleon), adito tera (disintegrate) — no systems for them; exana mort — no curse condition in the game (curses came after 8.0).
- [ ] Dark realistic monster models (owner chose this style; sample of 4 in progress, behind `?monsters=dark`).
- [x] Ground items can be dragged to other tiles (`moveBag`); items can be put on depot lockers, tables, counters, crates, barrels (`Game.SURFACES`); depot lockers are placed every second tile.
- [x] Minimap: wheel zoom, right-drag pan, double-click centre. Battle list: click title to fold, drag bottom edge to resize.
- [x] Trade items: drag an item onto a player (world or battle list) or into the trade window (`tradeItem`); click your offered item to take it back.
- [x] Fight stance Atk/Bal/Def (+20% dealt & +15% taken / normal / −30% dealt & −25% taken, weapon attacks only) and Follow/Stand (`fightMode`, remembered per browser).
- [x] Luring: monsters have no leash, never run home and never regenerate; when they lose their target they idle where they are (`Enemy.homeX/homeY`). Monster heal spells still exist.
- [x] Skills like the classic game (fist, club, sword, axe, distance, shielding, magic level) trained by use, shown in a left-side Skills panel (save v5). Fishing added under Gathering (save v7).
- [x] Woodcutting (chop trees with an axe → logs, levels 1–99, sell to traders) and a player market (market board in every depot).
- [ ] **Apply Supabase migration `supabase/migrations/20261021_player_market.sql`** (tables `market_offers`, `market_deliveries`), then restart the server and check the log line "Market: open". Until then the market says it is closed.
- [x] Fishing (rod + water within 3 tiles → 6 fish tiers by level and water kind, rare boot/treasure, wary spots, levels 1–99, sell to traders and captains) — save v7, protocol 12.
- [ ] Later: more gathering skills (mining), cooking fish, a rare special tree, market buy offers and price history.
- [x] Runes on the battle list: drag a rune onto a row, or pick a rune (hotkey/click) and click a row (`useRuneOn`).
- [x] PvP: player collision outside protection zones, secure mode, white/red skulls, PZ lock, red-skull backpack loss (server env `PVP`).
- [ ] PvP later (owner decision): logout block while PZ-locked / in a fight, skulls on the minimap, party/guild war marks, frags list.
- [ ] Better spell effects (Effects.ts).
- [ ] Integrate, test all, push, refresh artifact.
- [ ] Owner decision: upgrade the thornvale service from Free to a paid instance (Starter is enough for ~50 players) so the server never sleeps; then set `plan:` in render.yaml.
- [ ] **Graphics overhaul (owner decision 2026-10-21):** replace the whole look with a darker, "brutal" dark-fantasy style. Gameplay, controls, camera, tiles, systems and saves stay exactly the same — visuals only (`src/render/**`, `ui/icons.ts`, textures, models, effects, HUD skin). Start after the new map is live, with a side-by-side test area for the owner to approve. Style direction still to be chosen.
- [ ] Before the grand opening: set `TEST_MODE=0` (also turns bots off), `ALLOW_ADMIN` back to "0" and `START_LEVEL` back to "1" (render.yaml and Render dashboard).
- [ ] Later: custom SMTP for recovery mails; more map/game polish.
- [x] Website at thornvaleonline.com from `site/`, game at `/play/` (2026-10-21).
- [x] Website pages: guide, highscores, FAQ, rules, privacy (2026-10-21).
- [x] Website graphics: full trailer with game music (`site/media/trailer-full.webm|mp4`, 44 s: title card, captions, town, amazons, frost dragon, demon pit, desert, end card) behind "Watch the trailer"; silent 14 s hero loop (`trailer.webm|mp4`). Recorded in the owner's Mac Chrome by canvas + Web Audio capture with an offline test character, world-card and news pictures, share image `og-image.jpg` (2026-10-21).
- [ ] Website: more news posts; refresh the trailer after big visual changes (e.g. the graphics overhaul). Keep guide/FAQ in step with gameplay changes.
- [ ] Owner: set up email forwarding support@thornvaleonline.com → owner's Gmail (WordPress.com → Domains → thornvaleonline.com → Email → Email forwarding).
- [ ] New sign-in and character screens (email + password, up to 5 characters per account, "Play offline" kept) replacing the current start screen.
- [ ] Grand opening on **1 January 2027, 00:00 UK time**: countdown on site and title screen, "create account and claim your names early" sign-up, square social post.

---

## 13. Change Log

| Date | Commit | Change | Save ver | Protocol |
|---|---|---|---|---|
| 2026-10 | 545248d | First playable: 3D client, server, Render setup | 1 | 2 |
| 2026-10 | 7de245b | Supabase saves, account login, save migrations + backups | 2 | 3 |
| 2026-10 | 55d38a3 | Email accounts with password recovery (Supabase Auth) | 2 | 3 |
| 2026-10-21 | 5bc8b26 | BIBLE.md + CLAUDE.md added | 2 | 3 |
| 2026-10-21 | 6a2ea6d | Open Work: marketing website, new sign-in/character screens, grand opening (design stage, no code yet) | 2 | 3 |
| 2026-10-21 | 965a3d6 | Render workspace upgraded to Pro (service still Free instance) | 2 | 3 |
| 2026-10-21 | 4c04878 | Repo renamed to dmplanthireltd-gif/THORNVALE; grand opening date set to 1 January 2027 | 2 | 3 |
| 2026-10-21 | c93fc10 | Website planned on WordPress.com (superseded by the next row) | 2 | 3 |
| 2026-10-21 | 4a07415 | Game moved to /play/ (Vite base '/play/'); marketing website from `site/` served at the root by server.ts; domain thornvaleonline.com on Render | 2 | 3 |
| 2026-10-21 | 8fa1064 | New 640×800 world (14 towns), 35 monsters, 63 items, 5 spells, buff potions; saves v3 respawn everyone at the Thornvale temple | 3 | 4 |
| 2026-10-21 | 0eb9396 | Move ground items, items on lockers/tables, depot gaps, minimap zoom/pan, foldable/resizable battle list, runes on battle list | 3 | 5 |
| 2026-10-21 | — | Item trading by drag-and-drop, fight stance + follow/stand, lurable monsters (no leash/home-healing) | 3 | 6 |
| 2026-10-21 | — | PvP (`PVP` env, default on): players block each other outside protection zones, secure mode, white/red skulls, PZ lock, red skull drops the backpack | 4 | 7 |
| 2026-10-21 | — | Removed the classic-look option: worn equipment always changes the character's look | 4 | 7 |
| 2026-10-21 | — | Classic spell list: 54 spells (waves, beams, mass heal, cure poison, invisibility, find person, magic rope, levitate, challenge, illusion, rune conjuring from blank runes), 22 new items (blank rune + 21 runes), rune fields and magic walls, poison condition | 4 | 8 |
| 2026-10-21 | — | Adventure music (3 original pieces synthesized live: road / town / underground, Music on/off + volume); PvP from level 1 | 4 | 8 |
| 2026-10-21 | — | Bigger/longer speech text; party system (invite/join/leave/pass leader via right-click, Party panel, no friendly fire) with shared experience (+20%, same floor within 30 tiles, lowest level ≥ 2/3 of highest; leader switches it on/off) | 4 | 9 |
| 2026-10-21 | — | More blood on hits; blood splats and death pools stay on the floor (dry darker, vanish after 3 min) — `src/render/Blood.ts`, render-only | 4 | 9 |
| 2026-10-21 | — | Website: guide, highscores (/api/highscores), FAQ, rules, privacy pages; byte-range file serving | 4 | 9 |
| 2026-10-21 | — | Classic skills (fist/club/sword/axe/distance/shielding/magic level, trained by use, Skills panel, `/skill`), woodcutting (trees → logs, stumps regrow, levels 1–99), player market (market board in every depot, escrow, 1% fee, deliveries to offline sellers; new tables `market_offers`, `market_deliveries`). Old characters get skills that keep their damage | 5 | 10 |
| 2026-10-21 | — | Follow (right-click any creature), Inspect window (level, vocation, health, skull, party, worn equipment), friends list with requests/accept/online status (saved: save v6 `friends`), bigger name tags (14 px) | 6 | 11 |
| 2026-10-21 | — | Website graphics: hero trailer video, world-card/news pictures, share image and social tags on every page | 6 | 11 |
| 2026-10-21 | — | Test server: `START_LEVEL` env (render.yaml "20") raises characters to that level at login; `setLevel` shared by `/level` | 6 | 11 |
| 2026-10-21 | — | Fishing skill: fishing rod, fish in water within 3 tiles (small fish, trout, pike, salmon, ice fish, swordfish by level and water kind), rare old boot/treasure, fished-out spots, Skills panel row, `/fishing N`; captains sell rods, traders and captains buy fish | 7 | 12 |
| 2026-10-21 | — | Movable/resizable side panels (grip bar, bottom-edge resize, side bar width), resizable chat area, action bar can float on top of the game view (`src/ui/panels.ts`, layout in localStorage, Reset layout in Help); test server: `ALLOW_ADMIN=1` | — | — |
| 2026-10-21 | — | Test mode: with `ALLOW_ADMIN=1` everyone gets the test commands except `/god` and `/kill` (`Session.testOnly`); `ADMINS` names keep everything | — | — |
| 2026-10-21 | — | Website: hero trailer replaced with real gameplay footage (29 s, WebM + MP4) | — | — |
| 2026-10-21 | — | `TEST_MODE` env, ON by default in code (no dashboard change needed): test commands for everyone (not /god, /kill), START_LEVEL default 20 | — | — |
| 2026-10-21 | — | Delete a character from the account screen (type the name to confirm; backup kept in `character_backups`; `POST /api/characters/delete`); test bots (`server/bots.ts`); game-master pop-ups `/warn Name, text` and `/broadcast` (full admins only, `adminNotice` event); Arcane Wall Rune shown as "Magic Wall Rune" (id unchanged) | — | — |
| 2026-10-21 | — | Owner's character Ouriolis is always a game master (`OWNER_CHARACTERS` in server.ts) | — | — |
| 2026-10-21 | — | Website: cinematic trailer with music (Watch the trailer pop-up) and new hero loop | — | — |
| 2026-10-21 | — | Lag fix: A* reuses scratch arrays (was allocating ~4.6 MB per search on the 640×800 map) and gathers creature positions once per search; snapshots leave out unchanged inv/quests/spells/skills/friends; bots use short path searches. Server tick ~2× faster, worst spikes 40 ms → 5 ms | — | 13 |
