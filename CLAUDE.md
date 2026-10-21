# Instructions for Claude (Thornvale)

**Read `BIBLE.md` first, every session.** It is the single source of truth for this project. If the code and the Bible disagree, fix one of them in the same change.

**Read `BRAND.md` before any visual, sound or wording work** (UI, HUD, login, website, artifacts, mockups, images, trailers, store text). It is the brand rulebook: crest, wordmark, colours, fonts, building blocks, layout, imagery, motion, sound and voice. Use its exact values; don't invent a new look. Brand changes need the owner's OK.

## Non-negotiables
1. **Secrets:** never write the Supabase secret/service key anywhere (chat, code, commits, docs, logs). It lives only in the Render dashboard as `SUPABASE_SERVICE_KEY`.
2. **Player progress is sacred:** follow BIBLE §8 — bump `SAVE_VERSION` + add a migration for save-shape changes, use `ITEM_RENAMES` for renamed items, never delete items from saves, never drop DB columns.
3. **Original content only** — Tibia is inspiration, never a source of assets, names or text.
4. `src/game/**` stays free of DOM/three.js; all actions go through `Controller.send` → `Game.executeCommand`.
5. Bump `PROTOCOL_VERSION` when a network message shape changes.
6. No new runtime dependencies without the owner's OK.
7. **On brand:** everything visible follows `BRAND.md` (browns + gold, Palatino/Verdana, square corners, gold corner brackets, diamond crest).

## Before every push
```
npm run typecheck && npm run test:logic && npx tsx scripts/content-test.ts && npm run test:storage && npm run test:auth && npm run test:store && npm run test:net && npm run test:bosses
```
(In the Claude cloud sandbox npm registry is blocked: use `/opt/npm-tools/node_modules/.bin/{tsc,tsx,esbuild}`.)
`test:net` needs a local server started with `PUBLIC_TEST_COMMANDS=1` (it uses test commands like /worldboss).
The sandbox has TypeScript 6 and newer @types/node than Render (TS 5.9, @types/node 20). After pushing, check the GitHub Actions **Build check** (`gh run list -R dmplanthireltd-gif/THORNVALE -L 3`); it runs Render's exact `npm install && npm run build`. Never use `globalThis.localStorage`/DOM globals in code the server tsconfig compiles.

## After every change
- Update `BIBLE.md` (and the claude.ai Project copy `claude/THORNVALE-BIBLE.md`) if IDs, schema, protocol/save version, constants, controls, infra or process changed.
- Update `BRAND.md` (and the Project copy `claude/THORNVALE-BRAND.md`) if colours, fonts, logo, UI building blocks, layout or voice changed (owner-approved only).
- Add a Change Log row (BIBLE §13). Tick Open Work (§12).
- Parallel agents: each edits only the files it was assigned.
- Ask the owner before anything irreversible.
- Every artifact you make for the owner needs a Polish / English switch (PL default).
