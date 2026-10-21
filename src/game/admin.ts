import type { Game, Session } from './Game';
import { ITEMS, type ItemDef } from './inventory/items';
import { SPELL_LIST } from './magic/spells';
import { expForLevel } from './player/Player';
import { isVocation, VOCATIONS } from './player/vocations';

/**
 * Test / game-master commands, typed in chat with a leading "/".
 * Always available offline; a server enables them per character
 * (see ALLOW_ADMIN and ADMINS in server/server.ts).
 */
export const ADMIN_HELP = [
  '/level N — set your level (1–1000)',
  '/exp N — gain N experience',
  '/gold N — get N gold (overflow goes to the bank)',
  '/item name [qty] — get an item by id or name',
  '/spells — learn every spell of your vocation',
  '/heal — full health and mana',
  '/god — toggle invulnerability',
  '/kill — kill your current target',
  '/goto place — teleport to a place (e.g. /goto caldera) or /goto x y z',
  '/vocation name — change vocation',
];

export function findItem(query: string): ItemDef | null | ItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const id = q.replace(/\s+/g, '_');
  if (ITEMS[id]) return ITEMS[id];
  const all = Object.values(ITEMS);
  const byName = all.find((d) => d.name.toLowerCase() === q);
  if (byName) return byName;
  const partial = all.filter((d) => d.id.includes(id) || d.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  return partial.length ? partial.slice(0, 8) : null;
}

export function runAdminCommand(game: Game, s: Session, text: string): void {
  const pid = s.id;
  const p = s.player;
  const say = (t: string, kind: 'info' | 'warn' | 'loot' = 'info') => game.msg(pid, t, kind);
  const [cmdRaw, ...rest] = text.slice(1).trim().split(/\s+/);
  const cmd = (cmdRaw ?? '').toLowerCase();
  const arg = rest.join(' ');
  const num = (v: string | undefined, def: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : def;
  };
  const invChanged = () => {
    game.events.emit({ type: 'inventoryChanged', to: pid });
    s.wantsSave = true;
  };

  switch (cmd) {
    case 'help':
    case '?':
      for (const l of ADMIN_HELP) say(l);
      return;
    case 'level':
    case 'lvl': {
      const lvl = Math.max(1, Math.min(1000, num(rest[0], p.level)));
      p.level = lvl;
      p.exp = expForLevel(lvl);
      game.refreshStats(s);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      game.events.emit({ type: 'levelUp', id: pid, level: lvl });
      s.wantsSave = true;
      say(`You are now level ${lvl}.`);
      return;
    }
    case 'exp': {
      const n = Math.max(0, num(rest[0], 0));
      const before = p.level;
      p.gainExp(n);
      game.refreshStats(s);
      if (p.level > before) {
        p.hp = p.maxHp;
        p.mana = p.maxMana;
        game.events.emit({ type: 'levelUp', id: pid, level: p.level });
      }
      s.wantsSave = true;
      say(`+${n} experience (level ${p.level}).`);
      return;
    }
    case 'gold':
    case 'money': {
      const n = Math.max(1, Math.min(10_000_000, num(rest[0], 1000)));
      // carry what your capacity allows (gold weighs 0.1 oz a coin), bank the rest
      const canCarry = Math.max(0, Math.floor((p.capacity - s.inventory.weight()) / 0.1));
      const carry = Math.min(n, canCarry);
      const left = (carry ? s.inventory.add('gold', carry) : 0) + (n - carry);
      if (left) s.bank += left;
      invChanged();
      say(left ? `You get ${n - left} gold; ${left} went to your bank account (withdraw it at any banker).` : `You get ${n} gold.`, 'loot');
      return;
    }
    case 'item':
    case 'i': {
      let qty = 1;
      let name = arg;
      const last = rest[rest.length - 1];
      if (rest.length > 1 && /^\d+$/.test(last ?? '')) {
        qty = Math.max(1, Math.min(1000, Number(last)));
        name = rest.slice(0, -1).join(' ');
      }
      const found = findItem(name);
      if (!found) return say(`No item matches "${name}".`, 'warn');
      if (Array.isArray(found)) return say(`Which one? ${found.map((d) => d.id).join(', ')}`, 'warn');
      const left = s.inventory.add(found.id, qty);
      invChanged();
      if (left === qty) return say('Your backpack is full. Equip a bigger backpack or make room.', 'warn');
      say(`You get ${qty - left}× ${found.name}${left ? ` (${left} did not fit)` : ''}.`, 'loot');
      return;
    }
    case 'spells': {
      for (const sp of SPELL_LIST) if (sp.vocations.includes(p.vocation)) s.spells.add(sp.id);
      game.events.emit({ type: 'spellsChanged', to: pid });
      s.wantsSave = true;
      say(`You know every ${VOCATIONS[p.vocation].name.toLowerCase()} spell now.`);
      return;
    }
    case 'heal':
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      game.events.emit({ type: 'heal', targetId: pid, amount: p.maxHp });
      return;
    case 'god':
      p.god = !p.god;
      say(p.god ? 'God mode on: nothing can hurt you.' : 'God mode off.');
      return;
    case 'kill': {
      const t = game.getEnemy(p.targetId);
      if (!t || t.dead) return say('Target a monster first.', 'warn');
      game.adminKill(p, t);
      return;
    }
    case 'goto':
    case 'tp': {
      const nums = rest.map(Number);
      if (rest.length >= 2 && nums.every((n) => Number.isFinite(n))) {
        const [x, y, z = p.z] = nums;
        if (!game.world.inBounds(x, y)) return say('That is outside the world.', 'warn');
        game.teleport(p, x, y, z);
        return;
      }
      const q = arg.toLowerCase();
      if (!q) return say(`Places: ${game.world.regions.filter((r) => (r.x1 - r.x0) * (r.y1 - r.y0) > 60).map((r) => r.name).join(', ')}`);
      const r = game.world.regions.find((x) => x.name.toLowerCase() === q) ?? game.world.regions.find((x) => x.name.toLowerCase().includes(q));
      if (!r) return say(`No place called "${arg}".`, 'warn');
      const t = r.temple ?? { x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2), z: r.z0 };
      game.teleport(p, t.x, t.y, t.z);
      say(`Teleported to ${r.name}.`);
      return;
    }
    case 'vocation':
    case 'voc': {
      const v = arg.toLowerCase();
      if (!isVocation(v)) return say('Vocations: knight, paladin, sorcerer, druid.', 'warn');
      p.vocation = v;
      game.refreshStats(s);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      game.events.emit({ type: 'spellsChanged', to: pid });
      game.events.emit({ type: 'equipmentChanged', id: pid });
      s.wantsSave = true;
      say(`You are now a ${VOCATIONS[v].name.toLowerCase()}.`);
      return;
    }
    default:
      say(`Unknown command "/${cmd}". Type /help.`, 'warn');
  }
}
