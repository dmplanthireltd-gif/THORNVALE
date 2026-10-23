/**
 * Registers every translation table. Imported once by the client (ui/lang.ts) and by the tests.
 * Tables (all keyed by the exact English text, rows are [Polish, Brazilian Portuguese]):
 *   tables/ui.ts         the client's own labels, buttons, tooltips, help (used with `t()`)
 *   tables/messages.ts   game message templates with {placeholders} (server and offline game)
 *   tables/texts.ts      whole game sentences: dialogue options, NPC lines, tutorial, quests, notes…
 *   tables/names.ts      names: items, monsters, spells, NPCs, roles, places, sets, skills…
 */
import { register } from './i18n';
import { registerMessages, registerNames, registerTexts } from './gameText';
import { UI } from './tables/ui';
import { MESSAGES } from './tables/messages';
import { TEXTS } from './tables/texts';
import { NAMES } from './tables/names';
import { installSpecials } from './specials';

register(UI);
registerMessages(MESSAGES);
registerTexts(TEXTS);
registerNames(NAMES);
// after the tables: code-built texts (item look lines, quest progress variants)
installSpecials();
