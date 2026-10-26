// Spielerprofil (nur auf diesem Gerät): Name, Avatar, Level, XP, Münzen, Einstellungen.
import { lsGet, lsSet, clamp } from './util.js';
import { AVATARS, COLORS } from './state.js';

const KEY = 'pp6.profile.v1';

const DEFAULT = () => ({
  name: '',
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  color: COLORS[Math.floor(Math.random() * COLORS.length)].id,
  xp: 0,
  coins: 0,
  stats: { parties: 0, wins: 0, rounds: 0, roundWins: 0 },
  settings: { music: true, sound: true, vibration: true, tapSide: 'R' },
  lastParty: null, // zuletzt abgeschlossene Party-ID (Belohnung nur einmal)
});

export const profile = Object.assign(DEFAULT(), lsGet(KEY, {}));
profile.stats = Object.assign(DEFAULT().stats, profile.stats || {});
profile.settings = Object.assign(DEFAULT().settings, profile.settings || {});

export function saveProfile() { lsSet(KEY, profile); }

/** Gesamt-XP, die für das Erreichen von Level L nötig sind. */
export const xpForLevel = (L) => 50 * L * (L - 1);

export function levelInfo(xp = profile.xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, base, next, frac: clamp((xp - base) / (next - base), 0, 1), into: xp - base, need: next - base };
}

export function award(xp, coins) {
  const before = levelInfo().level;
  profile.xp += Math.max(0, Math.round(xp));
  profile.coins += Math.max(0, Math.round(coins));
  const after = levelInfo().level;
  saveProfile();
  return { leveledUp: after > before, level: after };
}

/** Belohnung für eine Runde: Platz 1 von n bringt am meisten. */
export function roundReward(rank, n) {
  const share = n > 1 ? (n - rank) / (n - 1) : 1;
  return { xp: Math.round(8 + 14 * share), coins: Math.round(4 + 10 * share) };
}

export function partyReward(place, n) {
  const share = n > 1 ? (n - place) / (n - 1) : 1;
  return { xp: Math.round(15 + 35 * share), coins: Math.round(10 + 40 * share) };
}
