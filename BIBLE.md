# THORNVALE BIBLE

**The single source of truth for Thornvale.** Every Claude (claude.ai chat, Claude Code, Claude in Chrome, sub-agents) and every human contributor works from this file. If code and this file disagree, stop and fix one of them in the same change — never leave them out of sync.

- Bible version: **1.5** (2026-10-21)
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
6. **Stay on brand.** `BRAND.md` (Project copy `claude/THORNVALE-BRAND.md`) defines the look, sound and voice: crest, wordmark, palette, fonts, UI building blocks, layout (incl. the chosen login screen), imagery, motion and words. Follow it exactly; brand changes need the owner's OK and update both copies.

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
| Payments | Paddle Billing (merchant of record: takes the money, VAT, receipts). Paddle.js is loaded from cdn.paddle.com on the website store page only; the server only receives signed webhooks (`server/payments.ts`, no SDK) |
| Runtime deps | **only `three`**. Do not add dependencies without the owner's OK. |

---

## 3. Repository layout

```
BIBLE.md              ← this file
CLAUDE.md             ← short pointer + checklist for Claude Code
BRAND.md              ← brand guide: crest, wordmark, colours, fonts, UI building blocks, layout, imagery, motion, sound, voice
README.md             ← player/host-facing docs
render.yaml           ← Render Blueprint
site/                 ← marketing website, served at / — GENERATED: edit scripts/site/ and run `npx tsx scripts/site/build.ts` (add `--no-atlas` to skip the map). Pages: index, news/, guide/, bestiary/, atlas/, soundtrack/ (nav label "Music"), highscores/, store/, founders/ (hall of founders), terms/, faq/, rules/, privacy/, 404, sitemap, favicon. Hand-written: styles.css (same look as the in-game HUD, design 2c: brown panels, gold corner brackets and diamond labels, diamond T crest, Palatino + Verdana system fonts, no web fonts), site.js (live status, countdown, ember sparks, trailer, region music, bestiary filters, atlas pan/zoom, highscores), robots.txt, media/ (trailer, pictures, share image; atlas.webp + atlas-small.jpg are generated)
scripts/site/          ← build.ts (page templates incl. /store/, /founders/, /terms/), data.ts (bestiary, towns, vocations, counts and the atlas picture read from the game's content), content/*.html (guide, FAQ, rules, privacy, terms, news text — edit these). Hand-written store scripts: site/store.js (store page: login, packs, Paddle checkout), site/founders.js (founders list)
supabase/schema.sql   ← database tables (keep in sync with migrations)
supabase/migrations/  ← one SQL file per schema change (applied by hand / Supabase MCP, then listed in §5)
server/
  server.ts           ← game server: tick 20 Hz, login, autosave, HTTP API, static files
  storage.ts          ← Storage interface: FileStorage (local JSON) / SupabaseStorage; characters, backups, market, premium perks and purchases
  payments.ts         ← Paddle: settings from env, webhook signature check, payment/refund/chargeback → storage
  ws.ts               ← minimal WebSocket implementation
  data/               ← local JSON saves (dev only, git-ignored content)
src/
  main.ts             ← boot: start screen → local or online game
  client/Controller.ts← LocalController (offline) / NetController (online, mirror Game)
  game/               ← PURE GAME LOGIC (no DOM, no three.js)
    Game.ts           ← world state, sessions, executeCommand, tick, events
    admin.ts          ← "/" test commands (gated by Session.admin)
    bosses/           ← bosses.ts (world boss spots, raids, schedule constants, DUNGEON_BOSSES), WorldEvents.ts (schedule, waves, broadcasts, loot by contribution; inside Game, never saved)
    combat/ core/ enemies/ entities/ inventory/ magic/ movement/
    gathering/        ← skills.ts (registry of every non-combat skill: id, name, Gathering/Production section, aliases, planned skills), woodcutting.ts (1–99 curve, tree tiers, chop chance), fishing.ts (water, fish tiers, bite chance), mining.ts (ore rocks, pickaxes, mine chance, gems)
    production/       ← recipes.ts (stations incl. hand-tool stations, recipes, CraftView, Make X), smithing.ts (bars, metals, pieces, anvil → item table), cooking.ts (raw → cooked food, burn chance), fletching.ts (shafts, bows, stocks, arrows), crafting.ts (tanning, sewing, gem cutting, jewellery), firemaking.ts (logs → campfires)
    market/           ← market.ts (offers, deliveries, MarketChange, fee)
    premium/          ← premium.ts (premium limits, free towns, launch and sale dates, founder tiers, cloaks, products, PremiumZone = which tiles are premium land)
    net/protocol.ts   ← client⇄server messages, PROTOCOL_VERSION
    npc/              ← npcs.ts, dialogue.ts, stock.ts (shop lists)
    player/           ← Player, vocations, outfits, skills.ts (combat skills, training, power level, migration values)
    quests/ save/ (SaveSystem.ts, migrate.ts)
    tutorial/         ← tutorial.ts (the 12 steps, hints, targets, step gifts, skip gifts, save parsing)
    world/            ← WorldMap.ts (tiles, floors, EnemyKind), worldGen/terrain/towns…, mines.ts (deterministic ore rock placement, MINE_SPOTS), tutorialIsle.ts (Wayfarer's Isle: fixed layout, built last, no random numbers)
  render/             ← Renderer, WorldView (instanced ore rocks with coloured veins, furnace/anvil/stove/tanning-rack models, lit campfires), skillFx.ts (particles for every trade skill), CreatureView, Effects, PixelPass, CameraController, Overlay, models/, textures.ts
  ui/                 ← HUD, Minimap, WorldMapView, StartScreen (the Gatehouse title screen: one central panel for every step) + OnlineLogin (account steps) + gate.css, emblems.ts (crest + vocation SVGs), OutfitPreview, icons, dom
  input/Input.ts      ← keyboard/mouse → Commands
  audio/              ← Sfx.ts (plays effects for game events and the player's own commands, button clicks), sfxlib.ts (every one-shot effect recipe: combat, magic, items, doors/chests, mining, smithing, UI), foley.ts (footsteps by ground, hits by material, monster voices, spell sweeps/hits by element), ambience.ts (wind/insects/sea/lava/cave beds + birds, frogs, drips), Music.ts + Tracks.ts (region music player, falls back to the old live synth)
scripts/              ← smoke-test, net-test, storage-test, auth-test, store-test (payments, webhook, store API), content-test, boss-test, saves
  music/              ← offline soundtrack: songs.ts (chords + melody + band per song), synth.ts (arranger, mix), instruments.ts (synthesized instruments + drum kits), render.ts → public/audio/music/*.m4a
public/ui/gate.jpg    ← title-screen background (a darkened gameplay still)
public/audio/music/   ← rendered region tracks (AAC loops, served at /play/audio/music/); re-render after editing songs
```

---

## 4. Live infrastructure and secrets

| Thing | Value |
|---|---|
| GitHub repo | `dmplanthireltd-gif/THORNVALE` (renamed from `thornvale`; old URL redirects), branch `main` |
| Live game | https://thornvaleonline.com/play/ (also https://thornvale.onrender.com/play/). `/play` → 301 → `/play/`. Root-level `/ws`, `/api/*`, `/status` (health) |
| Render workspace | **Pro** workspace plan ($25/mo, since 2026-10-21): more bandwidth (25 GB), 15 custom domains, 1,000 build minutes/mo, team members |
| Grand opening | **1 January 2027, 00:00 UK time** (Europe/London) |
| Website | https://thornvaleonline.com — static files in `site/`, served by the game server at every path except `/play/`, `/ws`, `/api/*`, `/status`. Live player count from `/status`; countdown in `site/site.js`; highscores from `/api/highscores` (top 50 by level, online players' live levels merged in, `ADMINS` excluded, cached 60 s). Files are served with byte ranges (video). Operator in the privacy policy: Dawid Mlynarczyk (individual, UK); accounts 13+; contact support@thornvaleonline.com. Store at `/store/` (premium and founder packs, Paddle checkout), founders list at `/founders/`, terms of sale at `/terms/`. |
| Store API | `GET /api/store/config` (open?, Paddle env + client token + price ids, products, sale windows, Legends left), `GET /api/store/me` (Bearer token: account id, premium end, founder tier/number, founder name, characters), `POST /api/store/founder-name`, `GET /api/founders`, `POST /api/pay/webhook` (Paddle → server; signed; webhook URL in Paddle: https://thornvaleonline.com/api/pay/webhook) |
| Domain | `thornvaleonline.com` + `www` (redirects to the root) are custom domains on the Render service. Registered at WordPress.com; DNS there: A `@` 216.24.57.1, CNAME `www` thornvale.onrender.com. The old WordPress.com site (blog id 258122271) is no longer served at the domain. |
| Render service | `thornvale`, instance type **Free** (`plan: free` in render.yaml), Frankfurt, auto-deploys on push to `main` |
| Supabase project | `thornvale`, ref `gvknnzdhxwmqimaoiref`, region eu-central-1, org `thornvale` |
| Supabase URL | https://gvknnzdhxwmqimaoiref.supabase.co |
| Publishable key (public, OK to commit) | `sb_publishable_Do-DXlXiAHd6f8xLCFo_qA_JHrsygW3` |
| claude.ai artifact (offline playable build) | https://claude.ai/artifact/Ei6rAWKjnb5bWSaNcchW3K |

**Secrets policy**
- `SUPABASE_SERVICE_KEY` (secret / service_role key) lives **only** in the Render dashboard → Environment. Never in chat, code, commits, files, artifacts, logs, project docs or reports. If you see it pasted anywhere, tell the owner to rotate it.
- Never print env vars in logs. Never echo a key back to the user.
- `PADDLE_WEBHOOK_SECRET` is a secret too: Render dashboard only, same rules as the service key.
- Publishable key and URL are public by design; so are `PADDLE_CLIENT_TOKEN` and Paddle price ids.

**Render environment variables:** `BOTS` (computer players; default 6 in test mode, 0 otherwise; never saved, left out of /status and highscores, names end in [Bot]), `BOT_LEVEL` (default 500), `TEST_MODE` (default ON in code when unset: test commands for everyone except /god and /kill, and START_LEVEL defaults to 20 — set `TEST_MODE=0` before the grand opening), `START_LEVEL` (test servers: every character is raised to at least this level at login — never on the tutorial island: that happens when it leaves the island; currently "20" for testing — set to "1" before the grand opening), `NODE_VERSION=20`, `MAX_PLAYERS=50`, `ALLOW_ADMIN=1` (testing phase = test mode: everyone may use the `/` commands and the ` console except `/god` and `/kill`; names in `ADMINS` get everything — set back to 0 before the grand opening), `ADMINS=""` (comma-separated character names that are game masters; the owner's character **Ouriolis** is always a game master via `OWNER_CHARACTERS` in server.ts), `PVP=1` (player-versus-player on; `0` turns it off — offline single-player never has PvP), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_KEY` (secret), optional `MAX_CHARACTERS` (default 5; founder packs add 1–2 per account). Store: `PREMIUM` (premium rules: enforced unless `TEST_MODE` is on; `1`/`0` forces it), `PADDLE_ENV` (`sandbox` or `production`), `PADDLE_CLIENT_TOKEN` (public), `PADDLE_WEBHOOK_SECRET` (**secret**), `PADDLE_PRICES` (`product_id=pri_…` pairs, comma-separated, product ids in §9).

**Startup log lines to check after a deploy:**
- `Login: email (Supabase Auth)` — email accounts active (else "name + password").
- `Saves: Supabase database` — persistence active (else "files" = **progress is lost on restart**, because Render's disk is wiped).
- `Tutorial flags: table` — the `account_flags` table is found (else "derived": the skip rule is worked out from the account's character saves, and new flags are not stored).
- `Premium: enforced …` / `open to everyone (test mode)` and `Store: open (Paddle …)` or `Store: closed (reason)`.

**Render plan rules:** the workspace plan (Pro) and the service's instance type are separate. `render.yaml` `plan:` must always match the instance type chosen in the dashboard, otherwise a Blueprint sync changes it back. If the owner upgrades the instance (Starter `0.5c-512mb`, Standard `1c-2g`, Pro `2c-4g`…), update `plan:` in render.yaml and this table in the same commit.

**Known platform limits:** the Free instance sleeps after 15 min idle (first visit takes ~1 min) and wipes its disk on restart — saves are safe only because they go to Supabase. Any paid instance removes the sleep. Supabase built-in email only sends a few mails/hour and only to team members → real players need custom SMTP (Resend/Brevo) or "Confirm email" switched off.

---

## 5. Data model (Supabase)

Defined in `supabase/schema.sql`. Migrations applied so far: `thornvale_save_data`, `characters_owned_by_auth_users`, `player_market`, `premium_store`, `account_flags` (2026-10-21; backfilled the 4 email accounts that already owned characters).

| Table | Columns | Notes |
|---|---|---|
| `accounts` | name_key PK, display_name, salt, hash, created_at, last_login | Only for name+password mode (no Supabase Auth) |
| `characters` | name_key PK, owner_id uuid → auth.users (on delete set null), display_name, data jsonb (SaveData), save_version int, level, vocation, updated_at | One row per character; `data` is the whole save |
| `character_backups` | id identity, name_key, data jsonb, save_version, reason, created_at | Written **before** every migration |
| `market_offers` | id text PK, seller_key, seller_name, item_id, qty int >0, price bigint >0 (per piece), created_at, expires_at | Player market sell offers; the items are in escrow here. Migration `supabase/migrations/20261021_player_market.sql` (applied to Supabase 2026-10-21 as migration `player_market`; server logs "Market: open") |
| `market_deliveries` | id text PK, name_key, gold bigint, items jsonb, reason, created_at | Gold from sales / items of expired offers for characters that were offline; handed out at their next login (or depot/market visit), then deleted |
| `account_flags` | account_key text PK (`auth:<user id>` or `name:<name_key>`), tutorial_done_at, created_at | Set when a character of the account finishes Wayfarer's Isle; kept when that character is deleted. Later characters may skip the island. Without the table the server falls back to the saves: an account counts as done when it owns a character with save_version < 11 or `data.tutorial.state = 'done'`. Migration `supabase/migrations/20261021_account_flags.sql` |
| `account_perks` | owner_id uuid PK (Supabase Auth user, no FK on purpose), premium_until, founder_tier (wayfarer/warden/legend), founder_no (Legend number, unique, never reused), extra_slots, founder_name, flagged (chargeback), updated_at | One row per account; can be rebuilt from `purchases`. Migration `supabase/migrations/20261022_premium_store.sql` |
| `purchases` | id identity, provider, txn (unique with provider), owner_id, product, days, tier, amount_minor, currency, status (completed/refunded/chargeback), raw jsonb, created_at, updated_at | The payment ledger; never deleted (accounting) |

- Row Level Security is **on with no policies**: only the server (service key) can read/write. Never add public policies or let the browser talk to these tables.
- `name_key` = lowercased character name. Max 5 characters per account (+ `extra_slots`).
- **Payments (never lose a purchase):** `thornvale_grant_purchase(...)` writes the ledger row and grants the days/tier in one transaction; the same provider transaction twice returns `duplicate`. `thornvale_revoke_purchase(provider, txn, 'refund'|'chargeback')`: a refund takes the days back and recomputes the tier from the remaining payments; a chargeback takes the days back and sets `flagged` (looks stay until the owner decides). Execute is revoked from `public`, `anon`, `authenticated` (service key only).
- **Market storage order (never lose anything):** every market change is a `MarketChange` stored in this order: (1) new offers + new deliveries, (2) save the characters involved, (3) shrink/delete offers and delete delivered deliveries. A crash can at worst hand something out twice, never lose it. Each save remembers received delivery ids (`market.claimed`), so a delivery left over after a crash is not paid twice. Never edit an offline character's save to pay them — use a delivery.
- Schema changes: write a new Supabase migration **and** update `schema.sql` in the same commit. Additive only (new nullable columns, new tables). Never drop or rename columns holding player data.

---

## 6. Architecture rules

1. **`src/game/**` imports nothing from `render/`, `ui/`, `input/`, `audio/`, DOM or three.js.** It must run in Node (server, tests).
2. **Every player action is a `Command`** sent through `Controller.send(...)` → `Game.executeCommand`. UI/input never mutate game state directly. Offline = LocalController runs it locally; online = NetController sends it, the server is authoritative.
3. **Game → view communication is via the event bus** (`core/events.ts`). Renderer, HUD and Sfx subscribe; they never poll internal fields they don't own.
- **Performance rules:** never allocate per-map arrays per call (the world is 512k tiles per floor); never loop over all creatures inside a per-tile callback; send bulky snapshot parts only when changed.
4. **Online:** server ticks at 20 Hz and sends snapshots (`VIEW_RADIUS = 20`). The client keeps a mirror Game (`simulate:false`) and applies snapshots. Messages arriving before the HUD exists go to the backlog.
5. **Protocol:** `PROTOCOL_VERSION` (currently **20**) in `net/protocol.ts`. Bump it whenever a message shape changes; client and server must deploy together (they do — same repo, one Render service).
6. **PvP** (server option `PVP`, passed as `GameOptions.pvp`; off offline). Rules live in `Game` (`pvpProblem`, `onPvpAttack`, `onPvpKill`); every PvP hit passes `applyDamage`, which re-checks them:
   - Players block players, like monsters do, **except inside protection zones** (temples, depots, town doors) where they pass through each other. Logging in or teleporting onto an occupied tile is allowed.
   - No attacking from inside, or into, a protection zone. Attacker and target must both be level ≥ 8.
   - Melee, distance, wands/rods, targeted spells, targeted runes hurt players. Area spells and area runes hurt players in the area too, never the caster, never anyone in a protection zone. Players have no `def`: armour and resistances come from their gear.
   - **Secure mode** (per player, default on, saved; command `secureMode`, HUD button "PvP: secure"/"PvP: open"): refuses attacks on unmarked players and spares them from your area attacks. Skulled players and people who attacked you recently can always be attacked.
   - **White skull:** attacking an unmarked player who did not attack you first (self-defence is free) → white skull, refreshed on every attack.
   - **Unjustified kill:** killing an unmarked player who did not attack you. 3 within 24 h → **red skull**. A red-skulled player who dies drops the backpack and **everything worn** into the dead body.
   - **PZ lock:** attacking a player locks you out of protection zones (status line shows "PZ-locked Ns"). There is no logout check (closing the game logs out at once).
   - **Death loot (every player death, monsters too):** a dead body (`GroundBag.corpse` = name, `PLAYER_CORPSE_LIFETIME` 300 s) stays where you fell. The backpack with everything in it always goes into the body; each worn item drops with `DEATH_ITEM_CHANCE` 0.25. Anyone can open the body (click it → loot window: click an item, or Take all; command `pickup {id, take}`: index, -1 all, -2 walk up). Walking over a body never loots it. A worn **Hearthward Amulet** (`hearthward_amulet`, Mirella 10 000 gp) saves everything and crumbles — not on a red skull. Bots never leave bodies or items.
   - Death by a player: normal death penalty, "You were killed by NAME", the killer is told "You killed NAME".
   - Skull times and kill timestamps are wall-clock ms (they keep running while offline and across restarts).
7. **Premium** (premium/premium.ts; `GameOptions.premium` = server env `PREMIUM`, enforced unless `TEST_MODE`; offline and in test mode every character gets everything). Premium belongs to the account (`Session.perks`, from `account_perks`, set by the server **before** the save is applied and refreshed every 60 s and right after a payment). Rules in `Game`: `isPremium`, `premiumLand` (PremiumZone: every island beyond the six free heartland towns; stairs never cross the border), `depotCap`, `offerCap`, `outfitLock`, `setPerks`/`refreshPerks`, `checkPremium` (once a second). **Nothing is ever taken away:** a character on premium land without premium is teleported to a free temple with everything it carries; the depot list always has 120 slots and items above a free depot's 60 stay (new items wait); offers above 20 stay; a premium/founder outfit falls back to a free one and can be picked again later. Ship captains refuse premium destinations; death without premium wakes you in Thornvale if your home temple is on premium land. Never sell anything with stats.
8. Admin/test commands are typed in chat with `/` (`/help` lists them). Offline always allowed; online only for names in `ADMINS` or when `ALLOW_ADMIN=1`. Dev console opens with the **`** key.

---

## 7. Game constants (change only deliberately, update here)

| Constant | Value | Where |
|---|---|---|
| Camera | orthographic, tilt `CAMERA_TILT_DEG = 32`, looking north from south | render/CameraController.ts |
| Pixel art | `TILE_PX = 32` art pixels per tile, depth-edge outline | render/PixelPass.ts |
| Monster models | **Dark realistic style** for every monster (owner decision 2026-10-21): muted gritty colours, glowing eyes where they fit (never on deer/rabbits), lore weapons/armour, scars and blood. Models live in `render/models/darkRigs*.ts` (`darkRigsCore.ts` = merged per-limb meshes cached per kind + 2 materials per creature; `darkRigsParts.ts` = humanoid assembler, weapons, shields). Bosses reuse their base kind's model (tinted, crowned). `?monsters=classic` in the URL shows the old models (debug only). New monsters get a dark model | render/models/darkRigs*.ts |
| Floors | `FLOOR_MIN = -4` … `FLOOR_MAX = 2`, FLOOR_H 3.4; z=0 ground | game/world/WorldMap.ts |
| World size | target 640 × 800 tiles (new map in progress) | world/ |
| Movement | 8 directions, no corner cutting, click-to-move A* | movement/pathfinding.ts |
| Server tick | 1/20 s | server/server.ts |
| Inventory | `POCKET_SLOTS = 8`, `DEPOT_SLOTS = 60` (free), depot list length `DEPOT_MAX_SLOTS = 120` (premium), 10 equipment slots | inventory/Inventory.ts |
| Equip slots | head, amulet, backpack, armor, weapon, shield, legs, ring, ammo, feet | inventory/items.ts |
| Cooldown groups | attack 2 s, heal 1 s, support 1 s, potion 1 s | magic/spells.ts |
| Throw range | 7 tiles | Game.ts |
| Ground bag lifetime | 180 s | Game.ts |
| Area runes | shape `dx² + dy² ≤ r² + r` | Game.ts |
| Waves / beams | face N/E/S/W only (diagonal facing → east/west); wave cone widths 1,3,3,5,5…; beam = straight line | magic/spells.ts |
| Rune fields | fire 45 s, energy 30 s, poison 60 s, magic wall 20 s; tick every 2 s; not in protection zones; never saved | items.ts, Game.ts |
| Poison | `buffs.poisoned` seconds, damage every 2 s; from venom fields and earth monster attacks (35%); cured by exana pox / antidote rune | Game.ts |
| Music | 11 original looping tracks, each played by its own instrument band: town (Hearth and Lantern, fiddle/lute/accordion, protection zones), fields (The Open Road, whistle/guitar), forest (Whispering Pines, DarkGrass ≥35%), jungle (The Green Deep, pan pipes/marimba/hand drums), swamp (Mirewater, Swamp ≥30%), snow (Frostfang, celesta/harp), desert (Sunspire, oud/ney/darbuka), volcano (Cinderfall, horns/taiko; also lava caves), deep (Below the Stone, z<0), sea (Saltwind, water ≥40%), battle (Steel and Thunder, 7 s after combat, never in protection zones). Region sampled every 1 s over 9×9 tiles, must hold 2.5 s; crossfade 1.6 s (battle 0.5 s); each track resumes where it left off | audio/Tracks.ts, scripts/music/songs.ts |
| Party | `PARTY_SHARE_RANGE = 30`, `PARTY_SHARE_BONUS = 1.2`, level rule lowest ≥ ⌈2/3 × highest⌉; parties are not saved (logout leaves the party) | Game.ts |
| Walking speed | speed = 220 + 2 × (level − 1); seconds per tile = 120 / speed, clamped 0.1–0.6 (level 1 ≈ 0.55, 20 ≈ 0.46, 100 ≈ 0.29, 500 ≈ 0.10); haste multiplies on top | Game.refreshStats |
| Autosave | every 30 s + on logout + on SIGTERM | server/server.ts |
| Skills | start 10 (magic level 0); tries for next level = base × growth^(level−10) (magic: 1600 × growth^ML); base fist/club/sword/axe 50, distance 30, shielding 100. Growth knight 1.1 melee / 1.4 dist / 1.1 shield / 3.0 magic; paladin 1.2 / 1.1 / 1.1 / 1.4; mages 2.0 (fist 1.5) / 2.0 / 1.5 / 1.1. 1 try per attack made, 1 per attack received with a shield, 1 per mana point spent | player/skills.ts |
| Skill effect | damage/healing formulas use **power level** = 0.5 × level + 0.5 + POWER[voc][skill] × (skill − start) instead of the level; POWER knight melee 0.8 / dist 1.6 / magic 5, paladin 1.2 / 0.8 / 2, mages 2.5 / 2.5 / 0.75. At the "typical" skill power = level (old balance). Miss chance −0.08% per skill point (min 2%); shielding +0.6% defence per point; magic level +0.3% wand/rod damage per point | player/skills.ts, combat.ts, Game.ts |
| Woodcutting | levels 1–99, classic gathering curve (83 xp for 2, 13,034,431 for 99); chop every `CHOP_INTERVAL = 2` s; chance = tree base + 0.8%/level above requirement + 0.6%/axe attack above 12 (5–90%). Tree → logs (lvl 1, 25 xp, always falls, regrows 25–45 s); Pine → pine_logs (15, 45 xp, falls 1/4, 40–70 s); Palm → palm_logs (25, 70 xp, 1/5, 50–90 s); JungleTree → teak_logs (35, 90 xp, 1/6, 70–120 s). Stumps are not saved (regrow on restart) | gathering/woodcutting.ts |
| Fishing | levels 1–99 on the same curve as woodcutting; needs a `fishing_rod` (backpack or hands); use open water (`Ground.Water`/`DeepWater` with no object) within `FISH_RANGE = 3` tiles in sight, no walking; a cast every `FISH_INTERVAL = 2.5` s; walking, attacking, leaving range stop it. Per cast: 1% old boot (1 xp), 1% treasure (10 xp: 20–80 gold, or a small ruby/sapphire/emerald, sunstone ring, ring of vigour, sapphire ring), otherwise bite chance = min(75%, 35% + 0.4%/level) × wariness. A bite tries the best fish the water and level allow first, each with 35% + 2%/level above its requirement (20–80%), the last one always bites. Fish: fish (small fish, lvl 1, 10 xp, any water), trout (10, 25 xp, any), pike (20, 40, shallow), salmon (30, 60, shallow), ice_fish (40, 80, water with snow/ice ground within 3 tiles), swordfish (50, 110, deep water only). Wariness: a 3×3 spot gets −15% bite per catch from the 6th (`SPOT_WARY_AFTER`), min 30%; it forgets one catch every `SPOT_RECOVER_SECONDS = 20` s; not saved | gathering/fishing.ts, Game.ts |
| Non-combat skills | registry `NONCOMBAT_SKILLS` in gathering/skills.ts; all on the woodcutting 1–99 curve; xp cap 200,000,000; one shared `Game.gainSkill`. Skills panel sections: Gathering (woodcutting, fishing, mining) and Production (blacksmithing, fletching, crafting, cooking, firemaking). Planned (not built): construction, alchemy (`PLANNED_SKILLS`). Combat skills stay classic Tibia-style; every RuneScape-style skill is non-combat (owner decision) | gathering/skills.ts |
| Mining | use an ore rock while carrying a pickaxe (backpack or hands); a swing every `MINE_INTERVAL = 2.4` s; walking/attacking/leaving stops it. Chance = ore base + 0.8%/level above requirement + 7%/pickaxe tier above bronze (5–90%). Ores (level, xp, base chance, deplete chance, respawn s): copper 1/18/50%/1/5–8, tin 1/18/50%/1/5–8, iron 15/35/42%/1/9–14, coal 30/50/32%/½/25–40, silver 40/40/30%/1/45–75, gold 50/65/28%/1/50–80, starsteel 60/80/24%/1/100–150, darkstone 75/125/20%/1/180–260. A depleted rock becomes `DepletedRock` rubble (in `Game.stumps`, synced like stumps, not saved). Gem 1/80 per ore (small sapphire 40, emerald 30, ruby 20, diamond 10). Pickaxes (tier, level): bronze 1/1, iron 2/10, steel 3/25, starsteel 4/45 | gathering/mining.ts, Game.ts |
| Blacksmithing | furnace (smelt) and anvil (smith, needs `smithing_hammer`) in every smithy; one item every 2.4 s, Make 1/5/X/All (max `MAX_BATCH = 100`), walking/attacking/out of materials stops it; window closes beyond 1 tile. Bars (level, xp, ores): bronze 1/6 copper+tin, iron 15/12 iron ore (50% +2%/level success), silver 20/14, steel 30/18 iron+2 coal, gold 40/22, starsteel 50/30 starsteel+4 coal, darkstone 80/50 darkstone+8 coal. Anvil: metal level + piece offset (dagger 0, axe 1, mace 2, helmet 3, arrowheads 4 (×10), bolts 5 (×10), pickaxe 5 (2 bars), sword 6 (2), boots 7 (2), shield 8 (3), legs 11 (3), armour 14 (5)); a piece may make several items, each its own recipe `smith:<item>` at the same level (bronze helmet → bronze helm + chain coif). xp per bar bronze 12, iron 25, steel 37, silver 30, starsteel 50, gold 45, darkstone 75. Metals start at bronze 1, iron 15, steel 30, silver 35 (armour only), starsteel 50, gold 55 (armour only), darkstone 80 | production/smithing.ts, recipes.ts, Game.ts |
| Production window | one generic window for every station (`CraftView`): recipe list by group tab, Make 1/5/X/All (max 100). Map stations (furnace, anvil, campfire, stove, tanning rack) close beyond 1 tile or when the object is gone (a fire burnt out). Hand-tool stations (knife, needle, chisel, tinderbox — `StationDef.obj = null`, opened by using the tool or a listed material from the backpack) work where you stand; leaving the tile stops the work but the window stays open. A recipe may train another skill than the station shows (jewellery at the furnace trains crafting): `CraftView` rows carry `skill` and `locked` | production/recipes.ts, Game.ts |
| Firemaking | use a tinderbox → pick logs: logs 1/40 xp (burns 60–80 s), pine 15/60 (70–90), palm 30/90 (80–105), teak 45/135 (90–120). Lights an `Obj.Campfire` on your tile (open ground: no object, field, stairs; never in a protection zone), then you step aside (W, E, S, N, diagonals); Make X lays a line. Lit fires live in `Game.fires`, are not saved, are cooking stations and block the tile. One every 2.4 s | production/firemaking.ts, Game.ts |
| Cooking | campfire (any, built or lit) or stove (one per depot; Thornvale's is in the Hall of Learning beside the crowded depot). 2.4 s each. Chance not to burn = 55% at the food's level +2%/level on a campfire (sure 23 levels above), 65% +2%/level on a stove (sure 18 above); a burn leaves `burnt_food`, no xp. Foods (level/xp): raw_meat→meat 1/30, raw_fish→fish 1/30, raw_trout→trout 10/50, raw_ham→ham 15/60, raw_pike→pike 20/70, raw_salmon→salmon 30/90, raw_ice_fish→ice_fish 40/115, raw_swordfish→swordfish 50/140. Raw food cannot be eaten; using it beside a fire/stove opens that station | production/cooking.ts |
| Fletching | knife (hand tool; also opened by using arrow shafts or feathers), 1.8 s each. Shafts: logs 1 (15 shafts, 5 xp), pine 15 (20, 10), palm 30 (25, 15), teak 45 (30, 20). Bows (level, logs, xp): hunting_bow 5/1/10, longbow 10/2/20, pine_shortbow 20/1/33, composite_bow 25/3/50, palm_shortbow 35/1/67, sylvan_bow 40/3/83, teak_shortbow 50/1/100, elven_longbow 55/3/117. Crossbows: wooden_stock 8 (2 logs, 12 xp), light_crossbow 12 (stock + iron bar, 25), teak_stock 46 (2 teak, 60), heavy_crossbow 48 (teak stock + 2 steel bars, 90). Arrows, 10 shafts + 10 feathers + 10 arrowheads → 10 (no knife needed): arrow 1/13 (bronze), onyx_arrow 15/25 (iron), hawkeye_arrow 30/50 (steel), starsteel_arrow 50/75, darkstone_arrow 75/125 | production/fletching.ts |
| Crafting | tanning rack (one per smithy, 1.8 s): wolf_pelt→leather 1/10 xp, bear_hide→2 leather 10/22, winter_wolf_fur→tanned_fur 15/20, polar_bear_fur→2 tanned_fur 30/40. Needle + thread (2.4 s): leather_helmet 1, leather_boots 4, leather_legs 7, leather_armor 10, bag 12, backpack 18; fur_cap 20, fur_boots 23, fur_legs 26, fur_armor 30, fur_bag 33, fur_backpack 40; explorer_pack 50 (3 minotaur leather + 2 leather). Chisel: small sapphire/emerald/ruby/diamond → cut_* at 20/27/34/43 (50/68/85/108 xp). Furnace jewellery: sunstone_ring 15 (silver bar), sapphire_ring 25, frost_pendant 30, jade_amulet 35, ring_of_vigor 38 (silver + cut gem), ring_of_swiftness 45, garnet_amulet 50, amulet_of_warding 55 (gold + cut gem), ring_of_might 65 (gold + cut diamond + cut ruby). Full table in crafting.ts | production/crafting.ts |
| Market | fee 1% of total (min 1 gold, bank first then backpack); max offers per character `FREE_MARKET_OFFERS = 20` / `PREMIUM_MARKET_OFFERS = 40`; price 1–100,000,000 per piece; offers expire after 30 days (items return via delivery); stand within 2 tiles of the board | market/market.ts, Game.ts |
| PvP min level | `PVP_MIN_LEVEL = 1` (owner: PvP from level 1) | Game.ts |
| White skull | `WHITE_SKULL_MS` 15 min, refreshed per attack; self-defence window also 15 min | Game.ts |
| Red skull | `UNJUST_KILLS_FOR_RED = 3` unjustified kills within `UNJUST_WINDOW_MS` 24 h → `RED_SKULL_MS` 24 h | Game.ts |
| PZ lock | `PZ_LOCK_SECONDS = 60` after attacking a player | Game.ts |
| Dungeon bosses | elite, respawn 1–4 h of game time (`def.respawn` 3600–14400 s) ±10% (`BOSS_RESPAWN_JITTER`); enrage below 30% health (`def.enrage`: ×1.5 damage, attacks and abilities ×0.7 interval); summons capped per ability (`maxAlive`), give no exp/loot, vanish with their master, leave after `SUMMON_LIFETIME = 600` s; respawn state kept in memory only | enemies/enemyDefs.ts, bosses/bosses.ts |
| World bosses | one at a time, next one `WORLD_BOSS_INTERVAL` 3–6 h after server start / the last one; at a random one of 3 fixed spots each; leave after `WORLD_BOSS_LIFETIME = 2700` s (45 min); exp by damage share; loot by contribution (damage + `HEAL_WEIGHT = 2` × healing on players who fought it within `ENGAGE_SECONDS = 30`): personal bag per player with ≥ `WORLD_BOSS_MIN_SHARE` 0.5%, gold × share×4 (0.1–1.5), each table entry rolled 1 + ⌊share×20⌋ times (max 5, +1 for the top contributor); backpack → depot → ground | bosses/bosses.ts, WorldEvents.ts |
| Raids | at most one; next one `RAID_INTERVAL` 2–4 h after start / the last raid; warning `RAID_WARNING = 300` s before the first wave (`GM_RAID_WARNING = 30` s for /raid); 3 waves at 0 / 4–5 / 8–10 min from 2–3 sides, boss with the last wave; ends `RAID_DURATION = 1200` s after the first wave or when every raider is dead; leftovers despawn; raiders march on the town and stop at protection zones | bosses/bosses.ts, WorldEvents.ts |
| /boss monsters | leave after `GM_BOSS_LIFETIME = 1800` s | bosses/bosses.ts |
| Tutorial | Wayfarer's Isle, box x 72–127, y 308–358, floors −1..0 (`ISLE`), west of Thornvale in open sea, free land (not premium); shrine/temple (100, 322, 0); protection zone "Wayfarer's Rest" x 94–119, y 315–332. 12 steps (`TUTORIAL_STEPS`): walk to the guide (≤ 2 tiles), talk to her, open the supply chest (= the vocation's starter kit minus the bag), wear weapon + armour, slay 3 rats, loot a bag + eat food, cast any spell, down the cellar hole and out by rope, buy from Tobin, store an item in the depot + bank gold, fish or chop (optional), sail with Captain Wren (free, one way, allowed from step 11). Gifts: start = bag + 2 cheese; step 6 done 25 gold; step 7 done 1 mana potion; step 8 start rope; step 11 start fishing rod. Skippers get the same (`skipGifts`) plus one health potion. No PvP, no experience loss and no death loot on the island; spare cellar rope and spare chest gear are handed out once; finished characters are never left on the island | tutorial/tutorial.ts, world/tutorialIsle.ts, Game.ts |
| Premium | free towns `FREE_TOWNS` = thornvale, westmarch, elderglen, stonedeep, highmoor, millbrook (+ islands reached by their ferries: Fernwick, Cyclops Isle); depot 60 / 120; market offers 20 / 40; regeneration ×1.5 out of combat only, never while PZ-locked (offline/test mode: only with bought premium); reserved login places `PREMIUM_RESERVED_SHARE = 0.1` of `MAX_PLAYERS`; warning in game when < 3 days are left | premium/premium.ts, Game.ts, server.ts |
| Store dates | founder packs on sale `FOUNDER_SALE_FROM` 1 Dec 2026 00:00 to `FOUNDER_SALE_UNTIL` 1 Feb 2027 00:00 (UK = UTC in winter); premium on sale from `LAUNCH_AT` 1 Jan 2027 00:00; founder days start at `max(purchase, LAUNCH_AT)`; other premium days start at purchase; days add on top of what is left; `LEGEND_CAP = 300` | premium/premium.ts |
| Prices (pence, VAT incl.; the charged price is set in Paddle) | premium_30 599, premium_90 1599, premium_180 2999, premium_365 5499; founder_wayfarer 999 (60 days), founder_warden 2499 (180 days, +1 slot), founder_legend 4999 (365 days, +2 slots, numbered); upgrade_wayfarer_warden 1500 (+120 days), upgrade_wayfarer_legend 4000 (+305), upgrade_warden_legend 2500 (+185) | premium/premium.ts PRODUCTS |

---

## 8. Save data and migration (PRIORITY)

File: `src/game/save/migrate.ts`. Current **`SAVE_VERSION = 11`** (v2→v3: new world, everyone respawns at the Thornvale temple; v3→v4: `pvp` block — secure mode, skull expiry times, unjustified-kill timestamps — everyone starts unmarked with secure mode on; v4→v5: `skills` (from `legacySkills(vocation, level)`: every weapon skill and magic level at the value where power level ≥ character level, so nobody hits or heals less; shielding by vocation), `gathering.woodcutting = 0`, `market.claimed = []`; v5→v6: `friends = []`; v6→v7: `gathering.fishing = 0`, woodcutting kept; v7→v8: `gathering.mining = 0`, `gathering.smithing = 0`, woodcutting and fishing kept; v8→v9: `gathering.fletching/crafting/cooking/firemaking = 0`, every other skill kept; v9→v10: `cosmetics = { hideCloak: false, hideTitle: false }` — founder looks shown; premium itself is on the account, never in the save; v10→v11: `tutorial = { state: 'done', step: 12 }` — everyone from before the tutorial counts as having finished it and stays where they are). The `tutorial` block is `{ state: 'active' | 'done' | 'skipped', step, flags?, count? }`; anything unreadable counts as done (never traps anyone on the island. The `gathering` block holds every non-combat skill by its registry id (gathering/skills.ts); a new skill = new id + migration that sets it to 0.

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
- **Map objects for skills/market:** `Obj.MarketBoard = 45` (one in every town depot, placed by `placeMarketBoards` in worldGen), `Obj.Stump = 46` (felled tree, temporary, `Game.stumps`). Mining: `CopperRock = 47`, `TinRock = 48`, `IronRock = 49`, `CoalRock = 50`, `SilverRock = 51`, `GoldRock = 52`, `StarsteelRock = 53`, `DarkstoneRock = 54`, `DepletedRock = 55` (temporary rubble, `Game.stumps`). Blacksmithing: `Furnace = 56`, `Anvil = 57` (one each in every smithy, `placeSmithies` in worldGen). Cooking: `Stove = 58` (one in every depot, or the nearest house with room). Crafting: `TanningRack = 59` (one in every smithy). Firemaking reuses `Campfire = 21` (temporary, `Game.fires`). Founders: `FoundersStone = 60` (one, on the Thornvale temple plaza behind the altar, `placeFoundersStone` in worldGen; using it reads out the Legend names, `Game.foundersStone`). All solid.
- **Ore rock locations** (`MINE_SPOTS` in world/mines.ts, deterministic, placed after `ensureConnected`, never cutting a path): copper/tin in the fields around Thornvale, Eastfold, Westmarch, Millbrook, Glimmer Vale, Highmoor (+iron), Corvane; Fernwick Cave (z−1, copper/tin/iron); Greyspine Mountains (z0, copper/tin/iron/coal); Stonedeep Mines (z−1, 42 rocks: copper/tin/iron/coal); Deep Delvings (z−2: iron/coal/silver/gold); Molten Deep (z−3: coal/gold/starsteel/darkstone); Valdrheim Outskirts (iron/coal/tin); Crystal Mines (z−1: coal/silver/gold) and Crystal Depths (z−2: silver/gold/starsteel); Infernal Rift (z−2: starsteel/darkstone); Scorched Crags (z0: coal/silver/gold); Behemoth Depths (z−2: starsteel/darkstone). Starsteel and darkstone are never on the surface.
- **Skills (save keys):** `fist`, `club`, `sword`, `axe`, `distance`, `shielding`, `magic`; gathering: `woodcutting` (xp in `gathering.woodcutting`), `fishing` (xp in `gathering.fishing`, save v7+), `mining`, `smithing` (save v8+; shown as "Blacksmithing"), `fletching`, `crafting`, `cooking`, `firemaking` (save v9+). Own-player snapshot field `gx` {skill: xp} (replaced `wc`/`fx` in protocol 15) and `cw` (station window, `CraftView`; protocol 16 adds `note` and per-recipe `skill`, `locked`, `label`), both sent only when changed (`onlyChanged`). Snapshot `fi` = lit campfires near the player ("x,y,z", protocol 16, only when changed; the client shows exactly that list). Commands `craft` {recipe, count; 0 = stop} and `craftClose`. Events `fish` {id, x, y, z, got}, `mine` {id, x, y, z, got, depleted}, `craft` {id, x, y, z, station, made}, `craftChanged` {to}. Admin: `/skill <name> N` for every skill, plus `/mining N`, `/smithing N`, `/fletching N`, `/crafting N`, `/cooking N`, `/firemaking N`.
- **Woodcutting items:** `logs`, `pine_logs`, `palm_logs`, `teak_logs` (materials: general traders, quest givers and outfitters buy them). The existing `hatchet` (Woodcutter's Axe) is sold by smiths, outfitters and Zuri; any axe works for chopping (best usable one counts).
- **Fishing items:** tool `fishing_rod` (tool type `fishing`; sold by every outfitter, Zuri, every ship captain and ferryman); fish (food, cheapest first) `fish` (the old Fish item = small fish), `trout`, `pike`, `salmon`, `ice_fish`, `swordfish` — bought by outfitters, general traders and quest givers (everyone who buys logs) and by harbour captains/ferrymen; junk `old_boot` (material). `FISH_ITEMS` in gathering/fishing.ts. Since save v9 a catch is the raw fish (`raw_fish`, `raw_trout`, `raw_pike`, `raw_salmon`, `raw_ice_fish`, `raw_swordfish` — `RAW_FISH_ITEMS`); cooking turns it into the old fish item. Old cooked fish in saves stay as they are. Everyone who buys fish buys raw fish too. No taverns exist.
- **Mining items:** ores `copper_ore`, `tin_ore`, `iron_ore` (the old loot item), `coal`, `silver_ore`, `gold_ore`, `starsteel_ore`, `darkstone_ore` (`ORE_ITEMS`); tools `bronze_pickaxe`, `iron_pickaxe`, `steel_pickaxe`, `starsteel_pickaxe` (tool type `mining`). Every smith sells bronze/iron/steel pickaxes and the `smithing_hammer` (tool type `hammer`); outfitters sell bronze pickaxes. Gems from rocks are existing `small_*` gems.
- **Blacksmithing items:** bars `bronze_bar`, `iron_bar`, `silver_bar`, `steel_bar`, `gold_bar`, `starsteel_bar`, `darkstone_bar` (`BAR_ITEMS`); every smith buys ores, bars and arrowheads (`SMITH_MATERIALS`). The anvil makes existing items where one fits (bronze: hatchet, short_sword, chain_helmet/legs/armor, bolt; iron: battle_axe, iron_mace, iron_sword, iron_helmet, iron_shield, plate_armor; steel: barbarian_axe, morning_star, bastard_sword, plate_legs, piercing_bolt) and these new ones: `bronze/iron/steel/starsteel/darkstone_dagger`, `bronze_mace`, `starsteel_/darkstone_` sword/axe/mace/shield/helm/legs/plate, `bronze_shield`, `steel_shield`, `steel_helmet`, `steel_plate`, `iron_legs`, `bronze/iron/steel/starsteel/darkstone_arrowheads` (material for future fletching). Full table: `SMITH_ITEMS` in production/smithing.ts.
- **Fletching / crafting / cooking / firemaking items (save v9):** tools `tinderbox`, `knife`, `needle`, `chisel` (tool types of the same names); materials `thread`, `feather` (sold; feathers also drop from dire penguins), `arrow_shaft`, `wooden_stock`, `teak_stock`, `bear_hide` (bear loot), `leather`, `tanned_fur`, `cut_sapphire`, `cut_emerald`, `cut_ruby`, `cut_diamond`, `raw_meat` (wolf, winter wolf, deer, bear, polar bear, silver rabbit), `raw_ham` (deer, bear, polar bear), the six raw fish, `burnt_food`; bows `longbow`, `pine_shortbow`, `palm_shortbow`, `teak_shortbow`; arrows `starsteel_arrow`, `darkstone_arrow`. Everything else they make is an existing item. Sellers: every outfitter, Zuri, Brann, Aldric and every quest giver sell tinderbox/knife/needle/chisel/thread/feather (`PRODUCTION_TOOLS` in npc/stock.ts); smiths also sell chisels. Buyers: general traders and quest givers buy every material; outfitters buy `PRODUCTION_GOODS` (shafts, stocks, hides, leather, fur, raw food, new bows); bankers buy cut gems.
- **Gear sets** (`src/game/inventory/sets.ts`, `SETS`; `ItemDef.setId` is filled in from that table, not saved): wearing 2+ pieces of one set adds its 2-piece bonus, 4+ pieces add the 4-piece bonus on top. Computed in `Game.gearBonuses` / `Game.activeSets` (used by `refreshStats`, `resist`, `magicBonus`, `attackBonus`); shown in item tooltips (`describeItem`) and the Inspect window. Set ids and piece ids are stable forever. New pieces live in `SET_ITEM_SPECS`, monster drops in `SET_DROPS` (merged into loot in enemyDefs.ts), shop lists in `SET_SELLS` / `SET_BUYS` (merged in npc/stock.ts). Looks: `render/models/gearLooks.ts` (`SET_LOOK`, `ITEM_LOOK`: material ramp, trim, gem, helm/body/legs/boots/shield style, emblem, cape, plume, horns, spikes) is shared by the icons (`ui/gearIcons.ts`) and the 3D gear (`render/models/gear3d.ts`, weapons.ts). New gear: add a look there (or rely on the id prefix / old colour tables).

| Set (id) | Lvl | Voc | Pieces | 2 pieces | 4 pieces (extra) | Source |
|---|---|---|---|---|---|---|
| Leather (`leather`) | 1 | all | `leather_helmet`, `leather_armor`, `leather_legs`, `leather_boots` | +10 hp | speed +3%, hp regen +1 | Smiths sell it; bandits, orcs and elves drop it |
| Chain (`chain`) | 1 | all | `chain_helmet`, `chain_armor`, `chain_legs`, `chain_boots` | +15 hp | +15 hp, physical 2% | Smiths sell it; bronze at the anvil; orcs and skeletons drop it |
| Furclad (`fur`) | 1 | all | `fur_cap`, `fur_armor`, `fur_legs`, `fur_boots` | ice 3% | +30 hp, ice 5% | Barbarians and frostkin; Warden Brann sells cap and boots |
| Bronze (`bronze`) | 1 | all | `bronze_helmet`, `bronze_armor`, `bronze_legs`, `bronze_boots`, `bronze_shield` | +15 hp | +25 hp, hp regen +1 | Anvil (bronze); smiths sell it; bandits and dwarves drop it |
| Iron (`iron`) | 8 | all | `iron_helmet`, `iron_armor`, `iron_legs`, `iron_boots`, `iron_shield` | +25 hp | +35 hp, physical 2% | Anvil (iron); smiths sell it; dwarf soldiers, orc warriors and minotaurs drop it |
| Plate (`plate`) | 20 | knight/paladin | `plate_helmet`, `plate_armor`, `plate_legs`, `plate_boots`, `tower_shield` | +40 hp | +40 hp, physical 4% | Anvil (iron and steel); smiths sell it; orc leaders, dwarf guards and behemoths drop it |
| Steel (`steel`) | 18 | knight/paladin | `steel_helmet`, `steel_plate`, `steel_legs`, `steel_boots`, `steel_shield` | +50 hp | +60 hp, hp regen +1, physical 3% | Anvil (steel); smiths sell it; barbarian brutetamers and behemoths drop it |
| Moonsilver (`moonsilver`) | 35 | knight/paladin | `moonsilver_helm`, `moonsilver_armor`, `moonsilver_legs`, `moonsilver_boots`, `moonsilver_shield` | death 4%, holy 3% | +60 hp, +60 mana, death 6%, holy 4% | Anvil (silver); mummies and ghouls drop it |
| Starsteel (`starsteel`) | 45 | knight/paladin | `starsteel_helm`, `starsteel_plate`, `starsteel_legs`, `starsteel_boots`, `starsteel_shield` | +80 hp | +70 hp, energy 5%, physical 3% | Anvil (starsteel); fire elementals and behemoths drop it |
| Gilded (`gilded`) | 55 | knight/paladin | `gilded_helmet`, `gilded_armor`, `gilded_legs`, `gilded_boots`, `gilded_shield` | +100 hp | +50 hp, hp regen +2, physical 4%, fire 5% | Anvil (gold); mummies, scarabs and behemoths drop it |
| Darkstone (`darkstone`) | 60 | knight/paladin | `darkstone_helm`, `darkstone_plate`, `darkstone_legs`, `darkstone_boots`, `darkstone_shield` | +120 hp | +80 hp, death 6%, physical 4% | Anvil (darkstone); demons and dragon lords drop it |
| Dwarven (`dwarven`) | 12 | all | `dwarven_helmet`, `dwarven_armor`, `dwarven_legs`, `dwarven_boots`, `dwarven_shield` | hp regen +1 | +60 hp, earth 4% | Dwarves of Stonedeep |
| Boneguard (`bone`) | 15 | all | `bone_helm`, `bone_armor`, `bone_legs`, `bone_boots`, `bone_shield` | death 4% | hp regen +2, death 5%, earth 3% | Skeletons, ghouls and mummies |
| Knight's Vow (`knights_vow`) | 40 | knight | `vow_helm`, `vow_armor`, `vow_legs`, `vow_boots`, `vow_blade` | +100 hp | +100 hp, hp regen +3, holy 6%, death 4% | Lizard templars, valkyries and orc warlords |
| Crownguard (`crownguard`) | 50 | knight/paladin | `crownguard_helm`, `crownguard_armor`, `crownguard_legs`, `crownguard_boots`, `crownguard_shield` | +80 hp, +40 mana | speed +5%, hp regen +2, physical 4% | Orc warlords, frost giantesses, valkyries and minotaur mages |
| Frostforged (`frostforged`) | 50 | knight/paladin | `frost_helm`, `frost_plate`, `frost_legs`, `frostforged_boots`, `frostscale_shield` | ice 5% | +120 hp, ice 6%, physical 2% | Frost dragons, ice golems and frost giants |
| Dragonscale (`dragonscale`) | 35 | knight/paladin | `dragon_helm`, `dragon_scale_mail`, `dragonscale_legs`, `dragonscale_boots`, `dragon_shield` | fire 5% | +120 hp, fire 6%, earth 3% | Dragons and dragon lords |
| Hellforged (`hellforged`) | 80 | knight | `demon_helm`, `demonplate`, `demon_legs`, `hellforged_boots`, `demon_shield` | fire 5%, death 5% | +250 hp, hp regen +3, physical 5% | Demons |
| Ranger's (`ranger`) | 20 | paladin | `ranger_hood`, `ranger_jerkin`, `ranger_leggings`, `ranger_boots` | attack +1 | +40 hp, speed +4%, attack +1 | Outfitters sell it; elf scouts and amazons drop it |
| Silverbough (`elven`) | 30 | paladin | `elven_circlet`, `elven_mail`, `elven_leggings`, `elven_boots`, `elven_longbow` | attack +1, earth 4% | speed +5%, mana regen +1, attack +2 | Elf wardens and scouts |
| Spellwoven (`spellwoven`) | 25 | sorcerer/druid | `spellwoven_hat`, `spellwoven_robe`, `spellwoven_skirt`, `spellwoven_shoes` | +60 mana, magic +2% | mana regen +2, magic +3% | Magic shops sell it; elf arcanists, orc shamans and minotaur mages drop it |
| Rimeweave (`rimeweave`) | 40 | sorcerer/druid | `frost_circlet`, `glacier_robe`, `glacier_kilt`, `glacier_boots` | +50 mana, ice 5% | mana regen +2, magic +4% | Ice witches, frostkin windcallers and crystal spiders |
| Wardbreaker (`wardbreaker`) | 100 | knight | `wardbreaker_helm`, `wardbreaker_plate`, `wardbreaker_legs`, `wardbreaker_boots`, `wardbreaker_maul` | +200 hp, attack +2 | hp regen +4, attack +4, physical 6% | Very rare: demons, behemoths, dragon lords and frost dragons |
| Skyfeather (`skyfeather`) | 90 | paladin | `skyfeather_cowl`, `skyfeather_vest`, `skyfeather_legs`, `skyfeather_boots`, `skyfeather_bow` | speed +5%, attack +2 | +150 hp, speed +5%, attack +3 | Very rare: demons, hydras, dragon lords and frost dragons |
| Voidweave (`voidweave`) | 90 | sorcerer/druid | `voidweave_hood`, `voidweave_robe`, `voidweave_skirt`, `voidweave_boots`, `void_codex` | +150 mana, magic +4% | mana regen +4, magic +6%, death 6% | Very rare: demons, ice witches, hydras and frost dragons |

- **Tutorial:** regions `Wayfarer's Isle` (whole island) and `Wayfarer's Rest` (safe, temple); destination `wayfarers_isle`; chest id `isle_supply_chest`; NPCs `isle_guide` (Guide Maren, `NpcDef.tutor` → dialogue option "What should I do now?" = action `tutorial:hint`), `isle_trader` (Tobin: shop + bank), `isle_captain` (Captain Wren: travel `thornvale`, price 0, ends the tutorial at the Thornvale temple). Step ids `walk, talk, chest, gear, rats, loot, spell, cellar, shop, depot, gather, sail`. Save key `tutorial`. Hello field `skipTutorial` (new characters), command `tutorialSkip`, own-player snapshot field `tu` {s, st, f, n, cs} (only when changed), events `tutorialChanged` (local, derived), `tutorialStep` {step}, `tutorialDone` {skipped}. `/api/characters` returns `tutorialDone`. Admin `/tutorial` (everyone), `/tutorial step N|done|skip|reset` (game masters only; reset stores everything carried in the depot first). Offline flag: localStorage `thornvale.tutorialDone`. Name + password servers: every name is its own account, so skipping is never offered there.
- **Items:** `src/game/inventory/items.ts` is authoritative (~400; set pieces from sets.ts). Runes, potions, weapons, armour sets, tools, loot. Display renames for sets (ids unchanged): demon_helm/demonplate/demon_legs/demon_shield → Hellforged Helm/Plate/Greaves/Bulwark; frost_helm → Frostforged Helm; dragon_helm/dragon_scale_mail/dragon_shield → Dragonscale …; elven_circlet/elven_mail/elven_leggings → Silverbough …; frost_circlet/glacier_robe/glacier_boots → Rimeweave ….
- **Bosses** (`EnemyKind`, stats in enemies/enemyDefs.ts with `boss`, `title`, `enrage`; rigs `BOSS_LOOK` in render/models/rigs.ts = an existing rig scaled up (`ENEMY_SCALE`), recoloured, gold crown on the head, glowing ring at the feet). Dungeon bosses (placed by `bossLair` in world/areas.ts; unique item in brackets): `boss_ironjaw` Ughrak Ironjaw, Warchief of Grimtusk — Grimtusk Fortress, 1 h (`ironjaw_helm`); `boss_bonebound` Lord Ossric, the Bonebound — Westmarch Catacombs, 1 h (`bonebound_amulet`); `boss_delving_king` Grimbold Ashanvil, the Delving King — Deep Delvings, 1.5 h (`ashanvil_hammer`); `boss_labyrinth_lord` Gorhorn, Lord of the Labyrinth — Minotaur Hold z−1, 1.5 h (`labyrinth_greaves`); `boss_venom_oracle` Sszarak, the Venom Oracle — Temple Undercroft, 2 h (`oracle_rod`); `boss_ember_matriarch` Kaerith, Mother of Flames — Dragon Lair, 2.5 h (`matriarch_scalemail`); `boss_sand_king` Ankhset, the Undying Sand King — Pharaoh's Vault, 3 h (`sandking_crown`); `boss_mire_hydra` Mirewretch, the Hundred-Fanged — Hydra Nest, 3 h (`hundred_fang_bow`); `boss_rime_wyrm` Hrimgaard, the Rime Wyrm — Frost Dragon Lair, 3 h (`hrimgaard_fang`); `boss_ashen_sovereign` Vorthazul, the Ashen Sovereign — The Demon Pit, 4 h (`sovereign_wand`, `ashen_will_ring`). World bosses (`WORLD_BOSSES`): `wb_mountain` Gorrumvald, the Mountain That Walks (Highmoor Downs / Greyspine Mountains / Scorched Crags; `mountainheart_shield`, `colossus_maul`); `wb_storm_serpent` Vaelith, the Storm Serpent (Saltmere Shore / Mangrove Mire / Corvane Grove; `stormcoil_wand`, `tidecrest_boots`); `wb_blight_mother` Nhalgrith, the Blight Mother (Mistwood / Spider Glade / Palmreach Jungle; `blightweave_robe`, `broodmother_crossbow`). Raids (`RAIDS`, id → town, boss): `orc_warband` → Westmarch outskirts, `raid_tusk_warlord` Grashnak Tuskbreaker; `restless_dead` → Thornvale Old Graveyard, `raid_grave_warden` Sexton Morrow; `frost_march` → Valdrheim outskirts, `raid_frost_jarl` Hjalmvar Rimeborn; `scarab_swarm` → Sunspire outskirts, `raid_swarm_queen` Ixtara. All 17 uniques are listed in `BOSS_UNIQUES` (items.ts).
- **Monster abilities:** `ranged`, `blast`, `nova`, `heal`, plus (bosses) `wave` (cone towards the target along the main axis), `beam` (line), `summon` (`summon` kind, `count`, `maxAlive`). Monsters spawned at run time (`Game.spawnEnemy`: raids, world bosses, summons, /boss) are `dynamic`: never respawn, leave after their corpse fades (`despawn` event), and go to clients with their kind (`ek` in the creature snapshot, protocol 17).
- **Events:** `announce` {title, text, style worldboss|raid|boss, big} (HUD: centred banner when `big`, always a log line, message kind `event`), `despawn` {id}. Snapshot field `wev` (world map markers for an active world boss and raid; only when changed).
- **Admin (bosses):** `/raid name` (30 s warning), `/worldboss name` — game masters, and everyone when the server runs in `TEST_MODE` (`GameOptions.testMode`); `/boss name` (any boss next to you, 30 min) and `/events` (timers) — game masters only.
- **Monsters:** `EnemyKind` in `world/WorldMap.ts`, stats in `enemies/enemyDefs.ts`. Includes the classic set plus the ice-region set (frost_dragon, ice_golem, crystal_spider, frost_giant, frost_giantess, ice_witch, barbarian_*, frostkin*, dire_penguin, silver_rabbit, winter_wolf, polar_bear) and scorpion, mummy, scarab, minotaur(+archer/mage), cyclops, dwarf(+soldier/guard), bandit, amazon, valkyrie, bear, deer, snake, lizard_sentinel/templar.
- **Premium and founders:** products (Paddle prices map to these ids in `PADDLE_PRICES`) `premium_30`, `premium_90`, `premium_180`, `premium_365`, `founder_wayfarer`, `founder_warden`, `founder_legend`, `upgrade_wayfarer_warden`, `upgrade_wayfarer_legend`, `upgrade_warden_legend`. Founder tiers `wayfarer` (title "Founder", cloak `ember`), `warden` ("Founder Warden", `gold`, +1 slot, Warden outfit), `legend` ("Legend #027", `crimson`, +2 slots, Warden outfit, name on the Founders' Stone). Outfit types `warlord`, `mystic` (premium) and `warden` (Warden and Legend founders). Player fields `cloak`, `title`, `premium` (crown in Inspect); snapshot fields per player `ck`, `tt`, `pr`, own `pm` (PremiumView: enforced, on, until, tier, no, depotCap, offerCap) and `cos` ([show cloak, show title]), protocol 18. Command `cosmetics` {cloak?, title?}. Admin (game masters only, session only, never saved): `/premium N` (days, 0 = none), `/founder wayfarer|warden|legend|none [number]`.
- **NPCs:** `npc/npcs.ts`; shop lists in `npc/stock.ts` (EXTRA_SELLS / EXTRA_BUYS merged into NPCS). Services: shop, bank, depot, travel, quests.
- Every new item needs: definition, icon (`ui/icons.ts`), and if equippable a model (`render/models/`). Every new monster needs: def, rig/model, loot table, spawn. `scripts/content-test.ts` checks these links.

---

## 10. Controls (don't change without the owner)

Arrows/WASD + numpad diagonals move · **Ctrl+direction** turns · **Ctrl+R** turns clockwise · click to walk (A*) · right-click = use/look/context menu · Combat panel (left flank): Attack/Balance/Defend + Follow/Stand + Secure/Open PvP · drag items (onto a player = trade; to ground = throw; ground items to another tile; onto lockers/tables; runes onto battle-list rows; to slots/containers) · **F1–F12** hotbar (12 slots) · runes aimed with a crosshair (area preview) · **M** world map · **H** help · **`** dev console · Enter/chat for spells and `/` commands · click/right-click a tree with an axe = chop · click/right-click water within 3 tiles with a fishing rod = fish · click/right-click an ore rock with a pickaxe = mine · use a furnace / anvil (smithies) = Smithing window (Make 1/5/X/All, walking stops it) · use (double-click or right-click → Use) a knife / needle / chisel / tinderbox in the backpack = its production window · click a campfire or stove = Cooking · click a tanning rack (smithies) = Tanning · use a market board (in depots) = Market window · tutorial objective bar over the bottom of the game view (step, hint, direction arrow; "Skip tutorial" needs two clicks and shows only for accounts that may skip) · "Skip the tutorial" tick box in the hero creator (unticked; only for accounts that finished the island) · Outfit window: premium/founder outfits show (premium)/(founder) when locked; founders get Cloak shown/hidden and Title shown/hidden buttons · use the Founders' Stone (Thornvale temple plaza) = read the Legend names · Skills panel in the left flank (click its title to fold) · **HUD layout "two flanks" (owner choice 2026-10-21, design 2c):** slim title strip on top (crest, THORNVALE, area · floor, online/offline); left flank = character (level badge, HP/MP/XP, cap, buffs), Combat, Skills, Battle, Party; right flank = Map (+ World map), menu (Spells, Quests, Friends, Outfit, Help, Settings), Equipment, Pockets/Backpack, hover line; game view in the middle with the target bar hanging at its top centre, action bar + chat below. Settings window holds the **layout preset** ("Two flanks" = design 2c, default; "Full view" = design 3c: the game view fills the screen and the same panels float in five docks — status + skills top-left, map + battle + party top-right, chat bottom-left, menu + action bar + combat bottom-centre, equipment + inventory bottom-right; saved as `thornvale.hudLayout`), Pixels, sound on/off + main volume, a **sound mix** (0–150 % per group: your footsteps, creatures, weapons and hits, spells and magic, items and world, interface and alerts, ambience — `SFX_CATS` / `SOUND_CAT` in audio/Sfx.ts, saved as `thornvale.sfxMix`), music + volume, Save (offline), Test console, Reset layout. Panels can still be dragged between the flanks and resized (saved as `thornvale.panelLayout.v2`). Style: the existing bronze palette + gold accents (diamond before panel titles, gold corner brackets on the view). Worn equipment always shows on the character (owner decision 2026-10-21; the old "classic look" option was removed).

---

## 11. Working process (all Claudes)

**Before work**
1. Read this Bible. Read `CLAUDE.md`. Check the Change Log and Open Work below.
2. Pull latest `main`. Never work from an old zip or artifact copy.

**While working**
- One owner per file at a time. When several agents run in parallel, each gets an explicit list of files it may edit; nobody else touches them until it finishes. Shared files (`Game.ts`, `items.ts`, `protocol.ts`, `WorldMap.ts`) are edited by one agent at a time.
- Match existing style: 2-space indent, single quotes, semicolons, named exports, small pure functions in `game/`, comments explain *why*.
- No new runtime dependencies. No copying Tibia assets.
- **Every artifact for the owner (galleries, previews, test builds, docs pages) has a Polish / English switch** (PL default, choice remembered in the browser). The owner asked for this on 2026-10-21.

**Before pushing (all must pass)**
```
npm run typecheck
npm run test:logic      # smoke test
npx tsx scripts/content-test.ts
npm run test:storage
npm run test:auth
npm run test:net
npm run test:bosses     # bosses, world bosses, raids, admin commands
npm run test:store      # payments: signatures, grants, refunds, chargebacks, store API, webhook
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
- [ ] Dark realistic monster models — now the default look. Done: skeleton, orc warrior, demon, wolf; (a) rat, snake, deer, silver rabbit, bears, winter wolf, dire penguin; (b) orcs, bandit, amazon, valkyrie. To do: batches c–h (all other monsters); bosses follow their base monster.
- [x] Ground items can be dragged to other tiles (`moveBag`); items can be put on depot lockers, tables, counters, crates, barrels (`Game.SURFACES`); depot lockers are placed every second tile.
- [x] Minimap: wheel zoom, right-drag pan, double-click centre. Battle list: click title to fold, drag bottom edge to resize.
- [x] Trade items: drag an item onto a player (world or battle list) or into the trade window (`tradeItem`); click your offered item to take it back.
- [x] Fight stance Atk/Bal/Def (+20% dealt & +15% taken / normal / −30% dealt & −25% taken, weapon attacks only) and Follow/Stand (`fightMode`, remembered per browser).
- [x] Luring: monsters have no leash, never run home and never regenerate; when they lose their target they idle where they are (`Enemy.homeX/homeY`). Monster heal spells still exist.
- [x] Skills like the classic game (fist, club, sword, axe, distance, shielding, magic level) trained by use, shown in a left-side Skills panel (save v5). Fishing added under Gathering (save v7).
- [x] Woodcutting (chop trees with an axe → logs, levels 1–99, sell to traders) and a player market (market board in every depot).
- [ ] **Apply Supabase migration `supabase/migrations/20261021_player_market.sql`** (tables `market_offers`, `market_deliveries`), then restart the server and check the log line "Market: open". Until then the market says it is closed.
- [x] Fishing (rod + water within 3 tiles → 6 fish tiers by level and water kind, rare boot/treasure, wary spots, levels 1–99, sell to traders and captains) — save v7, protocol 12.
- [x] Mining (8 ore rocks, 4 pickaxes, gems, rubble that refills) and blacksmithing (furnace + anvil in every smithy, 7 bars, anvil recipes per metal, Make X) — save v8, protocol 15. Generic non-combat skill registry (gathering/skills.ts) with Gathering/Production sections.
- [x] Fletching, crafting, cooking and firemaking (production skills 1–99, one generic production window, hand-tool stations, stoves in depots, tanning racks in smithies, lit campfires, raw fish/meat, burnt food) — save v9, protocol 16.
- [ ] Later: construction, alchemy; a rare special tree; market buy offers and price history. Balance check for fletched bow prices (e.g. 3 teak logs → elven longbow worth 2,500 to NPCs).
- [x] Detailed item icons (metal tiers, shading, rivets, gems) and detailed worn 3D gear (plates, pauldrons, capes, crests, horns, greaves, gauntlets, per-type weapon models); 25 gear sets with 2-/4-piece bonuses, smithed metal sets (bronze → darkstone incl. silver and gold), shop sets and rare endgame sets (2026-10-21).
- [ ] Gear sets later: sets for boss and quest gear; set bonus on a character sheet.
- [x] Runes on the battle list: drag a rune onto a row, or pick a rune (hotkey/click) and click a row (`useRuneOn`).
- [x] PvP: player collision outside protection zones, secure mode, white/red skulls, PZ lock, red-skull backpack loss (server env `PVP`).
- [ ] PvP later (owner decision): logout block while PZ-locked / in a fight, skulls on the minimap, party/guild war marks, frags list.
- [x] Better spell effects (Effects.ts): classic tile-sprite effects, animated fields, magic wall (2026-10-21). Polish continues.
- [x] Bosses: 10 dungeon bosses (one per region), 3 world bosses on a 3–6 h schedule with loot by contribution, 4 raids on a 2–4 h schedule, 17 unique items, `/raid`, `/worldboss`, `/boss`, `/events` (protocol 17).
- [ ] Later (bosses): a sound for announcements, boss kill statistics on the website, more raids (one per town), deliveries for world boss shares of players who log out before the kill.
- [ ] Integrate, test all, push, refresh artifact.
- [ ] PL/EN language option in the game itself (HUD, menus, NPC dialogue) so the artifact test build also has it.
- [ ] Owner decision: upgrade the thornvale service from Free to a paid instance (Starter is enough for ~50 players) so the server never sleeps; then set `plan:` in render.yaml.
- [ ] **Graphics overhaul (owner decision 2026-10-21):** replace the whole look with a darker, "brutal" dark-fantasy style. Gameplay, controls, camera, tiles, systems and saves stay exactly the same — visuals only (`src/render/**`, `ui/icons.ts`, textures, models, effects, HUD skin). Start after the new map is live, with a side-by-side test area for the owner to approve. Style direction still to be chosen. HUD: owner tried dark styles (Iron & Ember, Parchment, Runestone, Blood Moon, Wildwood, Pixel Forge — mockups on the claude.ai canvas "Thornvale HUD layouts") and chose to keep the current bronze look, refined (done 2026-10-21, see §10).
- [ ] Before the grand opening: set `TEST_MODE=0` (also turns bots off **and switches premium rules on**), `ALLOW_ADMIN` back to "0" and `START_LEVEL` back to "1" (render.yaml and Render dashboard).
- [x] Premium accounts and founder packs (2026-10-21): free heartland + 8 premium towns, depot 120, 40 offers, reserved places, out-of-combat regen, 2 premium outfits; founder packs Wayfarer/Warden/Legend with titles, cloaks, Warden outfit, extra slots, numbered Legends and the Founders' Stone; Paddle webhook + ledger in Supabase; store, founders and terms pages — save v10, protocol 18.
- [ ] **Owner: Paddle.** Create a Paddle account (sandbox first), the 10 products/prices (ids in §9, prices in §7), a client-side token and a notification destination to `https://thornvaleonline.com/api/pay/webhook` with events `transaction.completed`, `adjustment.created`, `adjustment.updated`. Put `PADDLE_ENV`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICES` in the Render dashboard. Test a sandbox purchase, then switch to `production` before 1 December 2026.
- [ ] Owner: decide who sells (individual or company) with the accountant; have the terms of sale (`scripts/site/content/terms.html`) checked.
- [ ] Founders later: early name claims for founders (needs the new sign-in screens), the Legend vote on a region/boss name, the Founders page linked from the account screen. If the opening date moves, shift founder premium (`premium_until`) by the same amount in SQL and change `LAUNCH_AT`.
- [ ] Later (store): cosmetic shop, a tradable premium token for the market (fraud lock after purchase), auto-renewing premium.
- [ ] Later: custom SMTP for recovery mails; more map/game polish.
- [x] Website at thornvaleonline.com from `site/`, game at `/play/` (2026-10-21).
- [x] Website pages: guide, highscores, FAQ, rules, privacy (2026-10-21).
- [x] Website graphics: full trailer with game music (`site/media/trailer-full.webm|mp4`, 44 s: title card, captions, town, amazons, frost dragon, demon pit, desert, end card) behind "Watch the trailer"; silent 14 s hero loop (`trailer.webm|mp4`). Recorded in the owner's Mac Chrome by canvas + Web Audio capture with an offline test character, world-card and news pictures, share image `og-image.jpg` (2026-10-21).
- [x] Audio overhaul: 11 region tracks with real-instrument bands (synthesized offline), footsteps by ground, hits by monster material, monster voices, ambience beds, element spell waves/beams and hits (2026-10-21).
- [x] Sound effects pass: every effect rebuilt (layered synth recipes in `src/audio/sfxlib.ts`) plus new ones for mining, smithing, weapon-specific swings, shield blocks, equip/unequip by material, eat/drink, doors, chests, stairs, item moves, quest, respawn, spell words, chat, UI clicks and campfire crackle (2026-10-21).
- [ ] Audio: owner to listen in game and pick favourites/changes (soundtrack page artifact); more songs per region later (day/night variants).
- [x] Website overhaul in the in-game HUD's style (design 2c: brown panels, gold corner brackets, gold diamond labels and crest, letter-spaced THORNVALE, Palatino): spark-lit hero with countdown, vocations, atlas, region music player, bestiary, features, gallery; new pages Bestiary (all monsters from game data, filters), Atlas (world map rendered from buildWorld, pan/zoom, towns) and Soundtrack (2026-10-21).
- [ ] Website: re-run `scripts/site/build.ts` after adding monsters, towns or spells. Share image `site/media/og-image.jpg` redrawn in the HUD style (2026-10-21).
- [ ] Website: more news posts; refresh the trailer after big visual changes (e.g. the graphics overhaul). Keep guide/FAQ in step with gameplay changes.
- [ ] Owner: set up email forwarding support@thornvaleonline.com → owner's Gmail (WordPress.com → Domains → thornvaleonline.com → Email → Email forwarding).
- [x] New sign-in and character screens: "The Gatehouse" (design A, chosen 2026-10-21). Log in / Create account tabs, Keep me signed in (off = this tab only), Forgot password, Play offline; "Who rides out today?" hero list with 5 slots, Enter / New hero / Delete (type the name); shared hero creator (name, vocation, outfit, 3D preview); live realm count and opening countdown; Herald news strip (text in `HERALD` in StartScreen.ts). Login logic unchanged.
- [x] Tutorial stage: Wayfarer's Isle, 12 steps, objective bar with direction arrow, skip for accounts that finished it once (save v11, protocol 20, table `account_flags` applied 2026-10-21).
- [ ] Tutorial later: walk it on the test server with fresh characters and tune texts/timings; maybe let players try all four vocations on the island (owner chose "pick at creation" for now); re-render the website atlas so it shows the island.
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
| 2026-10-21 | — | Smaller snapshots: other players' name/level/look/gear only resent when changed (per receiver); snapshot ~11 KB → ~6 KB. Monsters already sleep when no player is within 24 tiles | — | 14 |
| 2026-10-21 | — | Clear rune icons: solid element-colour stone, drawn pictogram per rune family (bolt, burst, skull, cross, field, wall…) and a short name strip (`RUNE_LABEL` in ui/icons.ts — add a label for every new rune) | — | — |
| 2026-10-21 | — | Mining (copper, tin, iron, coal, silver, gold, starsteel, darkstone rocks in fields, Greyspine, Stonedeep mines and deep caves; 4 pickaxes; rare gems; rocks turn to rubble and refill) and blacksmithing (furnace + anvil in every smithy: smelt 7 bars, smith daggers to plate armour, pickaxes and arrowheads, Make X); smiths buy ores and bars; Skills panel Gathering / Production; `/mining N`, `/smithing N`; generic skill registry for later skills | 8 | 15 |
| 2026-10-21 | — | Walking speed follows a classic level curve (slower at low level, faster at high level) | — | — |
| 2026-10-21 | — | Audio overhaul: 11 region music tracks (new forest + swamp zones) played by synthesized instrument bands (`scripts/music/`, `public/audio/music/`), material footsteps/hits, monster voices, ambience, element spell sounds | — | — |
| 2026-10-21 | — | Spell/rune effects in the classic tile-sprite style: one procedurally painted pixel-art atlas (8-frame 32×32 bursts per element, heal sparkles, mana rings, poff, buff/teleport rings, missile sprites) drawn by a single instanced mesh; every tile of an area/UE/wave/beam bursts; missiles fly as sprites; fire/energy/poison fields animate on every tile (also when synced online); translucent rune-lit magic wall; deeper UE sounds; subtle shake for big blasts (off with reduced motion). Render/audio only | — | — |
| 2026-10-21 | — | Sound effects pass: all effects rebuilt in `src/audio/sfxlib.ts` + new mining, smithing, weapon swings, blocks, equip, eat/drink, door/chest/stairs, item, quest, respawn, UI and campfire sounds | — | — |
| 2026-10-21 | — | HUD re-arranged into "two flanks" (design 2c): title strip, left flank (character with level badge, Combat incl. PvP secure, Skills, Battle, Party), right flank (Map, 6-button menu, Equipment, Pockets/Backpack), target bar at the top centre of the view, new Settings window (pixels, sound, music, save, test console, reset layout); gold diamond panel titles, gold view corners and vignette. Saved panel layouts reset once (`thornvale.panelLayout.v2`). UI only | — | — |
| 2026-10-21 | — | Fletching (knife: shafts, short/long bows per log, crossbow stocks and crossbows, arrows from shafts + feathers + arrowheads), crafting (tanning rack in every smithy, needle + thread leather/fur armour and bags, chisel gem cutting, rings and amulets at the furnace), cooking (campfires and a stove in every depot; fishing now gives raw fish, monsters drop raw meat/ham; burning falls with level), firemaking (tinderbox lights campfires that burn 1–2 min); generic production window with hand-tool stations; tools sold by outfitters and traders; `/fletching`, `/crafting`, `/cooking`, `/firemaking N` | 9 | 16 |
| 2026-10-21 | — | Website overhaul in the in-game HUD style (design 2c), generated by `scripts/site/build.ts` from game data: new Bestiary, Atlas and Soundtrack pages, spark-lit hero with live countdown, region music player, new share image | — | — |
| 2026-10-21 | — | Bosses, world bosses and raids: 10 dungeon bosses with titles, crowns, own rigs, 2–4 abilities (nova, waves, beams, summons, heals, enrage below 30%), guaranteed rare loot and 17 unique items; 3 colossal world bosses every 3–6 h at fixed spots (server-wide broadcast, loot bags by contribution incl. healing, exp by damage, gone after 45 min); 4 raids every 2–4 h (warning 5 min before, 3 waves, raid boss, 20 min, raiders never enter protection zones); HUD announcement banner, boss crown and title on name plates, world map markers; `/raid`, `/worldboss` (everyone in test mode), `/boss`, `/events` (game masters). No save change | — | 17 |
| 2026-10-21 | — | Rune fields no longer also draw the old static flames (WorldView.isRuneField); follow smoke test made robust | — | — |
| 2026-10-21 | — | Process: every artifact gets a PL/EN switch; screenshot gallery artifact (DWGwwy4R5taKtW54oKnWJP) | — | — |
| 2026-10-21 | — | Dark realistic monsters are the default: skeleton, orc warrior, demon, wolf (bigger, brighter eyes and blood, stronger contrast); one shared merged mesh per limb, 7–14 draw calls per monster instead of 18–34; `?monsters=classic` shows the old ones | — | — |
| 2026-10-21 | — | Gear sets and detailed items: 25 sets (leather, chain, furclad, bronze, iron, plate, steel, moonsilver, starsteel, gilded, darkstone, dwarven, boneguard, Knight's Vow, Crownguard, Frostforged, Dragonscale, Hellforged, Ranger's, Silverbough, Spellwoven, Rimeweave, Wardbreaker, Skyfeather, Voidweave) with 2- and 4-piece bonuses (tooltips, Inspect window), 67 new pieces (drops, shops, anvil: boots for every metal, silver and gold armour), redrawn equipment icons and much more detailed 3D gear and weapons; set display names (ids unchanged) | — | — |
| 2026-10-21 | — | Brand guide `BRAND.md` (+ Project copy `claude/THORNVALE-BRAND.md`): crest, wordmark, palette, fonts, building blocks, layout, imagery, motion, sound, voice; referenced from CLAUDE.md and §1 | — | — |
| 2026-10-21 | — | Title screen redesigned as "The Gatehouse" (StartScreen.ts, OnlineLogin.ts, gate.css): brand look, central panel for log in / account / heroes / create / offline / password reset; same login logic and API | — | — |
| 2026-10-21 | — | Premium accounts and founder packs: free heartland (6 towns) and 8 premium towns beyond the sea (ships refuse, free temples catch anyone left there, nothing is taken away), depot 60/120, market offers 20/40, reserved login places, faster regeneration out of combat, premium outfits Warlord and Mystic; founder packs Wayfarer/Warden/Legend (premium from opening day, titles under the name, cloaks over armour, Warden outfit, extra character slots, numbered Legends, Founders' Stone in Thornvale); Paddle checkout on the website (`/store/`, `/founders/`, `/terms/`), signed webhook, purchases ledger and grant/refund functions in Supabase (`account_perks`, `purchases`), `/premium`, `/founder` | 10 | 18 |
| 2026-10-21 | — | Dark monsters batch (a): rat, snake, deer, silver rabbit, bear, polar bear, winter wolf, dire penguin (3–8 draw calls each instead of 13–27) | — | — |
| 2026-10-21 | — | HUD brand pass (BRAND.md): diamond level badge and markers, live green diamond with "N online" from `/status`, target bar hangs from the top of the view, 2 px frame edge, wider label spacing, flat HUD buttons, gold corner brackets on windows, gold focus ring, no rounded corners. `BRAND.md` added to the repo. UI only | — | — |
| 2026-10-21 | — | Settings: layout presets "Two flanks" (2c) and "Full view" (3c, floating docks over a full-screen view; switches live, no reload) and a sound mix with its own slider per group (your footsteps, creatures, weapons and hits, spells and magic, items and world, interface and alerts, ambience; 0–150 %). Each sound now plays through its group's gain stage. UI/audio only | — | — |
| 2026-10-21 | — | Dark monsters batch (b): orc, orc spearman, shaman, berserker, leader, warlord, bandit, amazon, valkyrie (6–9 draw calls each instead of 24–43); thicker axe blades | — | — |
| 2026-10-21 | — | Death loot: dead player bodies you open and loot (backpack always, 25% per worn item), Hearthward Amulet protects and crumbles; red skull loses everything worn too | — | 19 |
| 2026-10-21 | — | Game masters (OWNER_CHARACTERS + ADMINS env) always have premium (staffPerks, until 2100) | — | — |
| 2026-10-21 | — | Tutorial stage: new characters start on Wayfarer's Isle (west of Thornvale, free land) and learn the game in 12 steps with Guide Maren, Tobin and Captain Wren; objective bar with direction arrow; no PvP, experience loss or death loot there. Accounts that finished it once may skip it (tick box in the hero creator, Skip button on the island) and get the same gear. New table `account_flags`; existing characters count as finished | 11 | 20 |
