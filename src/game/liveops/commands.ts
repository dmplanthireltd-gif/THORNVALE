import { findRaid, RAIDS, WORLD_BOSSES } from '../bosses/bosses';
import { bossTitle } from '../bosses/WorldEvents';
import { ENEMIES } from '../enemies/enemyDefs';
import type { Game, Session } from '../Game';
import { calendarEntries, DOUBLE_HOURS, type LiveKind } from './calendar';
import { FESTIVAL_BY_ID, FESTIVALS } from './festivals';
import { emptyTaskState, SEALS_MAX } from './tasks';

/**
 * Game-master commands for world events and the task boards, typed in chat with "/"
 * (admin.ts passes on what it does not know). Like /raid: game masters always,
 * everyone on a test server.
 */
export const LIVE_HELP = [
  '/event — what is on and the calendar; /event start raid|worldboss|treasure|festival|miniboss|double [name|hours]; /event stop raid|worldboss|treasure|festival|miniboss|double (game masters; everyone in test mode)',
  '/double exp|skill|both [hours] — double experience / skill training for everyone (default 48 hours); /double off',
  '/festival hollowmoon|winterhearth|off|auto — switch a festival on or off by hand, or back to the calendar',
  '/tasks — your task board; /tasks reset (new tasks now), /tasks done (finish every task), /tasks seals N, /tasks streak N',
];

const minsLeft = (ms: number) => `${Math.max(0, Math.round(ms / 60_000))} min`;

/** English name of a calendar entry (for /event). */
function entryName(kind: LiveKind, id: string): string {
  switch (kind) {
    case 'raid': return `raid: ${RAIDS.find((r) => r.id === id)?.name ?? id}`;
    case 'worldboss': {
      const d = WORLD_BOSSES[Number(id)];
      return `world boss: ${d ? ENEMIES[d.kind].name : id}`;
    }
    case 'treasure': return 'treasure hunt';
    case 'miniboss': return `festival boss: ${FESTIVAL_BY_ID[id] ? ENEMIES[FESTIVAL_BY_ID[id].boss].name : id}`;
    case 'festival': return FESTIVAL_BY_ID[id]?.name ?? id;
    default: return kind;
  }
}

/** Lines for /event and /events (game masters; test-command replies stay English). */
export function liveStatus(game: Game): string[] {
  const ev = game.liveEvents;
  const st = ev.status();
  const now = game.now();
  const out: string[] = [];
  const f = ev.festival();
  out.push(f ? `Festival: ${f.name}${st.festOverride ? ' (started by a game master)' : ''}.` : st.festOverride ? 'Festivals: switched off by a game master.' : 'Festival: none today.');
  if (st.doubleExp > now) out.push(`Double experience: ${minsLeft(st.doubleExp - now)} left.`);
  if (st.doubleSkill > now) out.push(`Double skill: ${minsLeft(st.doubleSkill - now)} left.`);
  if (ev.treasure) out.push(`Treasure hunt: ${ev.treasure.caches.filter((c) => !c.found).length} caches hidden, ${minsLeft(ev.treasure.ends - now)} left.`);
  else out.push(`Next random treasure hunt in ${minsLeft(st.nextRandomTreasure * 1000)}.`);
  const mb = ev.miniboss;
  if (mb) out.push(`Festival boss: ${bossTitle(mb.enemy.enemyKind)} at ${mb.town} (${mb.enemy.x}, ${mb.enemy.y}).`);
  const next = calendarEntries(now, now + 2 * 86_400_000, RAIDS.map((r) => r.id), WORLD_BOSSES.length).filter((e) => e.kind !== 'festival').slice(0, 6);
  for (const e of next) out.push(`Calendar: ${new Date(e.at).toISOString().slice(5, 16).replace('T', ' ')} UTC — ${entryName(e.kind, e.id)}.`);
  return out;
}

export function runLiveCommand(game: Game, s: Session, cmd: string, rest: string[]): boolean {
  const pid = s.id;
  const say = (t: string, kind: 'info' | 'warn' = 'info') => game.msg(pid, t, kind);
  const ev = game.liveEvents;
  const we = game.worldEvents;
  const gm = () => {
    if (s.testOnly && !game.testMode) {
      say('Only game masters can run world events.', 'warn');
      return false;
    }
    return true;
  };
  const hours = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : DOUBLE_HOURS;
  };
  const double = (what: string, h: number) => {
    if (what === 'off' || what === 'stop') {
      const a = ev.stopDouble('exp'), b = ev.stopDouble('skill');
      return say(a || b ? 'Double experience and skill are off.' : 'Nothing double was running.');
    }
    if (what !== 'exp' && what !== 'skill' && what !== 'both') return say('Usage: /double exp|skill|both [hours] or /double off', 'warn');
    if (what !== 'skill') ev.startDouble('exp', h);
    if (what !== 'exp') ev.startDouble('skill', h);
    return say(`Double ${what === 'both' ? 'experience and skill' : what === 'exp' ? 'experience' : 'skill'} for ${h} hours.`);
  };
  switch (cmd) {
    case 'event':
    case 'ev': {
      const sub = (rest[0] ?? '').toLowerCase();
      const what = (rest[1] ?? '').toLowerCase();
      const arg = rest.slice(2).join(' ');
      if (!sub || sub === 'list') {
        for (const l of liveStatus(game)) say(l);
        for (const l of we.upcoming().slice(0, 2)) say(l);
        return true;
      }
      if (!gm()) return true;
      if (sub === 'start') {
        switch (what) {
          case 'raid': {
            const r = findRaid(arg) ?? RAIDS[Math.floor(Math.random() * RAIDS.length)];
            if (we.raid) return say(`A raid is already running: ${we.raid.def.name}.`, 'warn'), true;
            we.startRaidNow(r);
            return say(`Raid "${r.name}" on ${r.town} starts in 30 seconds.`), true;
          }
          case 'worldboss':
          case 'wb': {
            const def = WORLD_BOSSES.find((w) => ENEMIES[w.kind].name.toLowerCase().includes(arg.toLowerCase())) ?? WORLD_BOSSES[0];
            if (we.worldBoss) return say('A world boss is already up.', 'warn'), true;
            const e = we.startWorldBoss(def);
            return say(e ? `${bossTitle(def.kind)} is up at ${e.x}, ${e.y}, ${e.z}.` : 'No room for it right now.', e ? 'info' : 'warn'), true;
          }
          case 'treasure': {
            const mins = Number(rest[2]);
            return say(ev.startTreasure(Number.isFinite(mins) && mins > 0 ? mins * 60_000 : undefined) ? 'Treasure hunt started.' : 'A treasure hunt is already on (or no place was found).', 'info'), true;
          }
          case 'festival': {
            const f = ev.setFestival(arg || FESTIVALS[0].id);
            return say(f && f !== 'auto' ? `${f.name} is on (until /festival auto).` : `Festivals: ${FESTIVALS.map((x) => x.id).join(', ')}.`, f ? 'info' : 'warn'), true;
          }
          case 'miniboss':
          case 'boss': {
            const f = ev.festival();
            if (!f) return say('No festival is on: start one first (/festival hollowmoon).', 'warn'), true;
            const town = ev.startMiniboss(f);
            return say(town ? `${bossTitle(f.boss)} marches on ${town}.` : 'Already out, or no room at any town.', town ? 'info' : 'warn'), true;
          }
          case 'double':
            double(arg.split(/\s+/)[0] || 'both', hours(rest[3] ?? rest[2]));
            return true;
        }
        say('Usage: /event start raid|worldboss|treasure|festival|miniboss|double [name|hours]', 'warn');
        return true;
      }
      if (sub === 'stop') {
        let ok = false;
        switch (what) {
          case 'raid': ok = we.stopRaid(); break;
          case 'worldboss': case 'wb': ok = we.stopWorldBoss(); break;
          case 'treasure': ok = ev.endTreasure(true); break;
          case 'festival': ok = ev.setFestival('off') === null; break;
          case 'miniboss': case 'boss': {
            const mb = ev.miniboss;
            if (mb && !mb.enemy.dead) { game.despawnEnemy(mb.enemy); ok = true; }
            break;
          }
          case 'double': ok = ev.stopDouble('exp') || ev.stopDouble('skill'); break;
          default: say('Usage: /event stop raid|worldboss|treasure|festival|miniboss|double', 'warn'); return true;
        }
        say(ok ? `Stopped: ${what}.` : `Nothing to stop: ${what}.`, ok ? 'info' : 'warn');
        return true;
      }
      say('Usage: /event, /event start …, /event stop …', 'warn');
      return true;
    }
    case 'double': {
      if (!gm()) return true;
      double((rest[0] ?? 'both').toLowerCase(), hours(rest[1]));
      return true;
    }
    case 'festival': {
      if (!gm()) return true;
      const m = (rest[0] ?? '').toLowerCase();
      if (!m) {
        const f = ev.festival();
        return say(f ? `Festival on: ${f.name}.` : 'No festival is on.'), true;
      }
      const f = ev.setFestival(m);
      if (f === 'auto') say('Festivals follow the calendar again.');
      else if (f) say(`${f.name} is on (until /festival auto).`);
      else if (m === 'off') say('Festivals are off (until /festival auto).');
      else say(`Festivals: ${FESTIVALS.map((x) => x.id).join(', ')}, off, auto.`, 'warn');
      return true;
    }
    case 'tasks': {
      const sub = (rest[0] ?? '').toLowerCase();
      const st = s.tasks;
      if (!sub) {
        game.taskSys.ensure(s);
        for (const t of [...st.daily, ...st.weekly]) say(`${st.daily.includes(t) ? 'Daily' : 'Weekly'}: ${t.k} ${t.t} ${t.h}/${t.n}${t.c ? ' (claimed)' : ''}.`);
        return say(`Seals ${st.seals}, streak ${st.streak} (best ${st.best}), tasks done ${st.done}.`), true;
      }
      if (!gm()) return true;
      if (sub === 'reset') {
        const keep = { seals: st.seals, streak: st.streak, best: st.best, last: st.last, done: st.done };
        Object.assign(st, emptyTaskState(), keep);
        game.taskSys.ensure(s, true);
        return say('New tasks are on your board.'), true;
      }
      if (sub === 'done') {
        for (const t of [...st.daily, ...st.weekly]) t.h = t.n;
        return say('Every task is finished: claim them at a task board.'), true;
      }
      if (sub === 'seals') {
        st.seals = Math.max(0, Math.min(SEALS_MAX, Math.floor(Number(rest[1]) || 0)));
        return say(`You have ${st.seals} task seals.`), true;
      }
      if (sub === 'streak') {
        st.streak = Math.max(0, Math.min(1000, Math.floor(Number(rest[1]) || 0)));
        return say(`Login streak set to ${st.streak} days.`), true;
      }
      say('Usage: /tasks, /tasks reset, /tasks done, /tasks seals N, /tasks streak N', 'warn');
      return true;
    }
  }
  return false;
}
