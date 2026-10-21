# Instructions for Claude (Thornvale)

**Read `BIBLE.md` first, every session.** It is the single source of truth for this project. If the code and the Bible disagree, fix one of them in the same change.

## Non-negotiables
1. **Secrets:** never write the Supabase secret/service key anywhere (chat, code, commits, docs, logs). It lives only in the Render dashboard as `SUPABASE_SERVICE_KEY`.
2. **Player progress is sacred:** follow BIBLE §8 — bump `SAVE_VERSION` + add a migration for save-shape changes, use `ITEM_RENAMES` for renamed items, never delete items from saves, never drop DB columns.
3. **Original content only** — Tibia is inspiration, never a source of assets, names or text.
4. `src/game/**` stays free of DOM/three.js; all actions go through `Controller.send` → `Game.executeCommand`.
5. Bump `PROTOCOL_VERSION` when a network message shape changes.
6. No new runtime dependencies without the owner's OK.

## Before every push
```
npm run typecheck && npm run test:logic && npx tsx scripts/content-test.ts && npm run test:storage && npm run test:auth && npm run test:net
```
(In the Claude cloud sandbox npm registry is blocked: use `/opt/npm-tools/node_modules/.bin/{tsc,tsx,esbuild}`.)

## After every change
- Update `BIBLE.md` (and the claude.ai Project copy `claude/THORNVALE-BIBLE.md`) if IDs, schema, protocol/save version, constants, controls, infra or process changed.
- Add a Change Log row (BIBLE §13). Tick Open Work (§12).
- Parallel agents: each edits only the files it was assigned.
- Ask the owner before anything irreversible.
