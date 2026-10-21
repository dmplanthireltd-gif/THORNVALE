# Thornvale

A top-down 3D fantasy MMORPG in the spirit of classic Tibia, built with **Three.js + TypeScript + Vite** and a small dependency-free **Node multiplayer server**.
Every creature, building and item is real 3D geometry built procedurally in code and drawn through a pixel-art pass (32 art pixels per tile, dark outlines). The game uses no sprites and downloads no assets. All designs are original.

## Run it

```bash
npm install
npm run dev          # single player at http://localhost:5173
npm run build        # type-check (client + server) and build into dist/
npm run server       # multiplayer server: serves dist/ and the game on http://localhost:8080
npm run test:logic   # headless simulation test of every system (no browser needed)
```

Requires Node 18+. For multiplayer, run `npm run build` and then `npm run server`, and open `http://localhost:8080` in several browsers. On the title screen choose **Connect**. The address is filled in for you when the page is served by the server. Characters are stored by name in `server/data/characters.json`.

Server settings come from environment variables: `PORT` (8080), `MAX_PLAYERS` (50), `STATIC_DIR`, `DATA_FILE`, and for test commands `ALLOW_ADMIN=1` (everyone) or `ADMINS="Name One,Name Two"`. Offline, test commands are always on.

## Host it online for free (Render)

1. Put this folder in a GitHub repository.
2. On [render.com](https://dashboard.render.com/register) choose **New + → Blueprint** and pick the repository. Render reads `render.yaml`, builds the client and starts the server.
3. Open `https://<your-service>.onrender.com`, choose **Connect**. The server address is filled in automatically, so share the link with friends.

Free plan notes: the service sleeps after 15 minutes without players and takes about a minute to wake up. Its disk is wiped on restarts, so characters in `server/data/characters.json` are lost until saves move to a database (planned: Supabase). Test commands are off online unless you set `ALLOW_ADMIN=1` or list character names in `ADMINS` in the Render dashboard.

## Controls

| Action | Input |
| --- | --- |
| Move (8 directions) | WASD / arrows; Q E Z C or numpad 7 9 1 3 for diagonals |
| Turn without moving | Ctrl + arrows / WASD; Ctrl+R turns clockwise |
| Walk to a tile | Left-click the ground or the minimap |
| Attack | Left-click a monster. Melee chases; bows, crossbows, spears and wands shoot from range |
| Talk / trade / bank / travel / learn spells | Left-click an NPC |
| Use ladders, rope spots, loose stones, lockers, chests | Left-click them |
| Trade with a player, heal a friend | Right-click the player |
| Items | Left-click to use or equip; right-click for the menu (hotkey, depot, trade offer, drop); click equipment to take it off |
| Hotkeys | 1 – 0 (spells, potions, runes); assign them from the spellbook or the item menu. Shared cooldowns stop spamming: attack 2 s, healing 1 s, support 1 s, potions 1 s, shown above the action bar |
| Runes | Click a rune (or its hotkey) and aim with the crosshair: area runes show the circle they will hit; right-click or Esc cancels. Single-target runes hit your target, healing runes can be aimed at a friend |
| Battle list | Right sidebar: everyone on screen with health; click to attack or talk |
| Chat / spells | Enter, then type. Saying spell words casts the spell (`exura`, `exori gran`, `exura sio "Name"`) |
| Targeting | Tab / Space for the next monster · Esc clears the target or closes windows |
| Zoom | Mouse wheel (whole-pixel steps in pixel mode) |
| Test console | F8 or ` — set level, gold, items, gear sets, learn spells, god mode, teleport. Also chat commands: `/help`, `/level 100`, `/gold 10000`, `/item dragon helm`, `/goto caldera` |
| World map | M — every floor of the whole world; wheel zooms, drag pans, click walks |
| Save (offline) | Save button / Ctrl+S; it also autosaves |

## The world

The map is 224 × 176 tiles and has seven floors, from +2 (towers, the elven canopy) down to −4 (the Demon Pit). Floors connect by stairs, ladders, rope spots (you need a rope) and loose stones (you need a shovel; the hole closes again).

| Area | Levels | What's there |
| --- | --- | --- |
| Thornvale | town | Temple, depot and bank (with a loft), smith, magic shop, outfitter, spell trainer, harbour |
| Greywood, Miller's Farm, Old Graveyard, Howling Hills | 1+ | Rats, wolves, skeletons |
| Grimtusk Fortress | 10+ | Walls, gates, four towers with archer platforms, a two-floor keep and an underground treasury. Orcs, spearmen, shamans, warriors, berserkers, leaders and a warlord |
| Grimpeak Mountains & Caves | 8+ / 15+ | Cliffs, a plateau with a watchtower, caves with a rope-spot exit |
| Watchpost Brann | outpost | Quartermaster quests, locker, temple |
| Silverbough Woods & Fortress | 12+ / 15+ | An elven fortress with platforms on two floors, railing bridges, a hidden grove and a dig-down vault. Elves, scouts, arcanists and wardens |
| Cinderreach & the Caldera | 35+ / 70+ | Lava fields, dragons and dragon lords, a hoard |
| Ruins of Varkh → the Descent | 10+ to 100+ | Four dungeon floors: the Crypt, Burning Catacombs (fire fields), Abyssal Halls (behemoths), the Demon Pit. Includes a secret cell |
| Palmreach & its jungle | 20+ to 60+ | Port town reached by ship, rivers, swamps (poison), the Temple of the Sunken Eye, the Mire Caves and the Hydra Nest |

## Systems

- **Vocations:** knight, paladin, sorcerer and druid. Each has its own HP, mana and capacity growth, damage scaling and item and spell rules.
- **Equipment:** ten slots (helmet, amulet, backpack, armour, weapon, shield or spellbook, legs, ring, ammunition, boots) and about 100 items.
  - Worn helmets, armour, leg armour, boots, weapons and shields show on the character. In the Outfit window you can switch this off for the classic look, where only your outfit shows.
  - Each item has attack, defence, armour, weight, level and vocation requirements, element damage and resistances.
  - Two-handed weapons free the shield slot, ammunition must match the weapon, and capacity limits what you carry.
- **Distance combat:** bows and crossbows use arrows or bolts, spears and stars are used up when thrown, and wands and rods cost mana per shot. Walls block line of sight, and monsters shoot back.
- **Spells:** 20 spells, including exura, exura gran, exura vita, exura sio, exori, exori gran, exori con, exori hur, exori vis, exori flam, exori frigo, exevo gran mas vis, haste, magic shield and light.
  - Each has mana, level, vocation, cooldowns (its own and its group's), range or area, and a formula.
  - Runes are stackable charges.
- **Monsters:** 24 kinds with melee, ranged, area and healing abilities, elemental resistances, kiting archers, leashing and respawns. Experience is shared by damage dealt.
- **NPCs:** shops (buy and sell), banks (deposit, withdraw, transfer), ships, spell trainers and quest givers.
  - Your personal depot is reachable from any locker.
  - Player-to-player trade only completes when both sides accept, and checks that everything fits.
- **Quests:** ten kill quests chained across the regions, with item and experience rewards.

## Camera & rendering rules

- `OrthographicCamera` only, tilted **32°** from vertical (looking north from the south, so faces and worn gear are visible), north up, smooth follow, wheel zoom.
- One tile = one world unit. Movement is tile by tile with interpolation, in 8 directions, and diagonals are refused when either orthogonal neighbour is blocked. A* uses the same rule.
- The player's floor is drawn at height 0, and the floor below shows dimmed under open towers and plateaus. The floor above hides while you stand beneath it. Roofs vanish indoors, and canopies and cliffs near creatures turn translucent.
- Underground is dark except for the light around you (light spell, sunstone ring).
- The pixel pass renders at 32 px per tile, upscales with nearest-neighbour filtering and outlines depth edges. Toggle it with **Pixels** in the sidebar.

## Architecture

```
src/
  game/        simulation: no Three.js or DOM. Runs identically in the browser and on the server
    Game.ts    sessions, update loop, commands, combat, magic, items, depot, bank, trade, dialogue, saves
    world/     WorldMap (floors, links, regions), Builder, worldGen (the whole map), village
    enemies/   24 monster definitions, AI (abilities, kiting, leashing)
    magic/     spells          inventory/  items, backpack + equipment + depot
    npc/       NPCs, dialogue  quests/     quest chain         player/  vocations, outfits
    net/       protocol: commands, snapshots, mirror application
  client/      Controller: LocalController (single player) / NetController (WebSocket mirror)
  render/      Three.js: WorldView (floors), Renderer (views, picking, lighting), models, effects, pixel pass
  ui/          HUD, minimap, start screen, outfit preview
  input/       keyboard + mouse → commands
server/        dependency-free WebSocket server running the authoritative Game at 20 ticks/s
scripts/       smoke-test.ts: headless test of every system
```

The UI never calls game rules directly. Everything goes through `Controller.send(command)`. Offline, that command runs locally; online, it goes to the server, which sends back snapshots and events. That is why the same HUD and renderer work for both modes.
