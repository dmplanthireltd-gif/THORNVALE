/**
 * Game texts that hold generated parts the templates cannot see into, handled by code:
 * the "look" line of an item ("Plate Armour: Arm 10 · lvl 30+ · 120 oz — traders pay 400 gold.")
 * is rebuilt from the item itself in the player's language.
 */
import { describeItem, ITEMS, type ItemDef } from '../game/inventory/items';
import { QUESTS } from '../game/quests/quests';
import { describeItemL } from './describe';
import { registerSpecial, registerTexts, rowsOf } from './gameText';
import { t } from './i18n';
import { trName } from './gameText';

let byName: Map<string, ItemDef> | null = null;

/** Called by load.ts once the tables are registered. */
export function installSpecials(): void {
registerSpecial((s) => {
  const i = s.indexOf(': ');
  if (i < 1) return null;
  byName ??= new Map(Object.values(ITEMS).map((d) => [d.name, d]));
  const d = byName.get(s.slice(0, i));
  if (!d) return null;
  const rest = s.slice(i + 2);
  if (!rest.startsWith(describeItem(d))) return null;
  return `${trName(d.name)}: ${describeItemL(d)}${d.value && rest.includes(' — traders pay ') ? ` — ${t('traders pay {value} gold.', { value: d.value })}` : ''}`;
});

// accepting a quest answers "Good." + its progress line without the word "still" (Game.dialogueAction)
{
  const known = new Map(rowsOf('texts'));
  const extra: Record<string, readonly [string, string]> = {};
  for (const q of QUESTS) {
    const row = known.get(q.progress);
    const short = q.progress.replace('still ', '');
    if (row && short !== q.progress) extra[short] = row;
  }
  registerTexts(extra);
}
}
