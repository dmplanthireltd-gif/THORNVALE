import { FESTIVALS, festivalByDate, festivalWindow } from './festivals';

/**
 * The world event calendar (pure: no DOM, no three.js). Fixed times are UTC, so
 * every player sees the same schedule whatever their clock says:
 *
 *   every day 12:00   treasure hunt (30 minutes)
 *   every day 18:00   a raid on a town (the town changes every day)
 *   Sat + Sun 20:00   an announced world boss (10 minutes' warning)
 *   festival days     the festival mini-boss at 03:00, 09:00, 15:00 and 21:00
 *   festival dates    Hollow Moon 20 Oct – 2 Nov, Winterhearth 15 Dec – 5 Jan
 *
 * On top of these the random world bosses and raids of bosses/WorldEvents.ts keep
 * coming (every 3–6 h and 2–4 h), and a random treasure hunt every 4–8 hours.
 * Double experience and double skill weekends are started by a game master.
 * liveops/LiveEvents.ts runs it; the calendar window shows the next days.
 */

export type LiveKind = 'raid' | 'worldboss' | 'treasure' | 'festival' | 'miniboss' | 'double_exp' | 'double_skill';

export interface CalendarEntry {
  /** When it starts (ms, UTC). Raids: the first wave; world bosses: the awakening. */
  at: number;
  kind: LiveKind;
  /** Raid id, world boss index, festival id… */
  id: string;
  /** Ends (ms) for things with a fixed length (treasure hunts, festivals). */
  end?: number;
}

export const TREASURE_HOUR_UTC = 12;
export const RAID_HOUR_UTC = 18;
export const WORLD_BOSS_HOUR_UTC = 20;
export const MINIBOSS_HOURS_UTC = [3, 9, 15, 21];
/** A treasure hunt lasts this long (ms). */
export const TREASURE_MS = 30 * 60_000;
/** Warnings before a calendar event starts (ms): world bosses, raids (bosses.ts RAID_WARNING), the rest. */
export const WORLD_BOSS_NOTICE_MS = 10 * 60_000;
export const RAID_NOTICE_MS = 5 * 60_000;
export const SHORT_NOTICE_MS = 5 * 60_000;
/** Random treasure hunts between the fixed ones: seconds from one to the next. */
export const RANDOM_TREASURE_INTERVAL: [number, number] = [4 * 3600, 8 * 3600];
/** Default length of a game master's double weekend (hours). */
export const DOUBLE_HOURS = 48;

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Which raid the calendar sends on a day (cycles through every raid). */
export function calendarRaid(dayIndex: number, raidIds: string[]): string {
  const n = raidIds.length || 1;
  return raidIds[((dayIndex % n) + n) % n] ?? '';
}

/**
 * Every fixed calendar entry that starts in [from, to). `raidIds` and `worldBosses`
 * are the ids from bosses/bosses.ts (passed in so this module stays tiny).
 */
export function calendarEntries(from: number, to: number, raidIds: string[], worldBosses: number): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  const firstDay = Math.floor(from / DAY) - 1;
  const lastDay = Math.floor(to / DAY) + 1;
  for (let d = firstDay; d <= lastDay; d++) {
    const base = d * DAY;
    const dow = new Date(base).getUTCDay();
    out.push({ at: base + TREASURE_HOUR_UTC * HOUR, kind: 'treasure', id: 'daily', end: base + TREASURE_HOUR_UTC * HOUR + TREASURE_MS });
    if (raidIds.length) out.push({ at: base + RAID_HOUR_UTC * HOUR, kind: 'raid', id: calendarRaid(d, raidIds) });
    if ((dow === 6 || dow === 0) && worldBosses > 0) {
      // Saturday and Sunday: each weekend day a different one, round the list
      const n = Math.floor(d / 7) * 2 + (dow === 0 ? 1 : 0);
      out.push({ at: base + WORLD_BOSS_HOUR_UTC * HOUR, kind: 'worldboss', id: String(((n % worldBosses) + worldBosses) % worldBosses) });
    }
    const fest = festivalByDate(base + 12 * HOUR);
    if (fest) for (const h of MINIBOSS_HOURS_UTC) out.push({ at: base + h * HOUR, kind: 'miniboss', id: fest.id });
  }
  for (const f of FESTIVALS) {
    for (const probe of [from, from + 200 * DAY]) {
      const w = festivalWindow(f, probe);
      if (w.end > from && w.start < to && !out.some((e) => e.kind === 'festival' && e.id === f.id && e.at === w.start)) out.push({ at: w.start, kind: 'festival', id: f.id, end: w.end });
    }
  }
  return out.filter((e) => (e.kind === 'festival' ? (e.end ?? e.at) > from && e.at < to : e.at >= from && e.at < to)).sort((a, b) => a.at - b.at);
}

/** Lead time of a calendar entry: when its warning goes out before `at`. */
export function noticeMs(kind: LiveKind): number {
  return kind === 'worldboss' ? WORLD_BOSS_NOTICE_MS : kind === 'raid' ? RAID_NOTICE_MS : kind === 'festival' ? 0 : SHORT_NOTICE_MS;
}
