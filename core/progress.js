// Fortschritt: Erfolge, Tagesmissionen und Solo-Highscores. Alles lokal auf dem Gerät (profile.js).
import { profile, saveProfile, levelInfo, award } from './profile.js';
import { hashStr, mulberry32, shuffle } from './util.js';

const cnt = (k) => profile.counters[k] || 0;
const seenCount = () => Object.keys(profile.counters.seen || {}).length;
const catCount = () => Object.keys(profile.counters.cats || {}).length;

// ---------------------------------------------------------------- Erfolge
export const ACHIEVEMENTS = [
  { id: 'r1', emoji: '🎮', name: 'Erste Runde', desc: 'Spiele deine erste Runde.', reward: 20, test: () => cnt('rounds') >= 1 },
  { id: 'r10', emoji: '🎲', name: 'Warmgespielt', desc: 'Spiele 10 Runden.', reward: 30, test: () => cnt('rounds') >= 10 },
  { id: 'r50', emoji: '🔥', name: 'Dauerzocker', desc: 'Spiele 50 Runden.', reward: 80, test: () => cnt('rounds') >= 50 },
  { id: 'r200', emoji: '🚀', name: 'Party-Profi', desc: 'Spiele 200 Runden.', reward: 200, test: () => cnt('rounds') >= 200 },
  { id: 'w1', emoji: '🥇', name: 'Erster Sieg', desc: 'Gewinne eine Runde.', reward: 25, test: () => cnt('roundWins') >= 1 },
  { id: 'w10', emoji: '🏅', name: 'Gewinner', desc: 'Gewinne 10 Runden.', reward: 60, test: () => cnt('roundWins') >= 10 },
  { id: 'w50', emoji: '👑', name: 'Unschlagbar', desc: 'Gewinne 50 Runden.', reward: 150, test: () => cnt('roundWins') >= 50 },
  { id: 'streak3', emoji: '⚡', name: 'Serie', desc: 'Gewinne 3 Runden hintereinander.', reward: 60, test: () => cnt('bestStreak') >= 3 },
  { id: 'p1', emoji: '🎉', name: 'Party-Gänger', desc: 'Beende eine Party.', reward: 30, test: () => cnt('parties') >= 1 },
  { id: 'p5', emoji: '🥳', name: 'Stammgast', desc: 'Beende 5 Partys.', reward: 70, test: () => cnt('parties') >= 5 },
  { id: 'pw1', emoji: '🏆', name: 'Party-König', desc: 'Gewinne eine Party.', reward: 50, test: () => cnt('partyWins') >= 1 },
  { id: 'pw5', emoji: '💎', name: 'Champion', desc: 'Gewinne 5 Partys.', reward: 150, test: () => cnt('partyWins') >= 5 },
  { id: 'g10', emoji: '🧭', name: 'Entdecker', desc: 'Spiele 10 verschiedene Spiele.', reward: 60, test: () => seenCount() >= 10 },
  { id: 'g25', emoji: '🗺️', name: 'Weltenbummler', desc: 'Spiele 25 verschiedene Spiele.', reward: 150, test: () => seenCount() >= 25 },
  { id: 'cat6', emoji: '🌈', name: 'Allrounder', desc: 'Spiele Spiele aus 6 Kategorien.', reward: 70, test: () => catCount() >= 6 },
  { id: 'six', emoji: '👥', name: 'Volles Haus', desc: 'Spiele eine Party mit 6 Spielern.', reward: 60, test: () => cnt('sixParty') >= 1 },
  { id: 'ko1', emoji: '⚔️', name: 'Kämpfer', desc: 'Spiele ein K.-o.-Turnier.', reward: 40, test: () => cnt('koPlayed') >= 1 },
  { id: 'kow', emoji: '🥊', name: 'Turniersieger', desc: 'Gewinne ein K.-o.-Turnier.', reward: 120, test: () => cnt('koWins') >= 1 },
  { id: 'solo10', emoji: '🤖', name: 'Trainingsfleiß', desc: 'Spiele 10 Runden im Solo-Training.', reward: 40, test: () => cnt('solo') >= 10 },
  { id: 'buy1', emoji: '🛍️', name: 'Shopper', desc: 'Kaufe etwas im Shop.', reward: 15, test: () => cnt('buys') >= 1 },
  { id: 'buy5', emoji: '🎁', name: 'Sammler', desc: 'Kaufe 5 Dinge im Shop.', reward: 60, test: () => cnt('buys') >= 5 },
  { id: 'lv5', emoji: '⭐', name: 'Level 5', desc: 'Erreiche Level 5.', reward: 50, test: () => levelInfo().level >= 5 },
  { id: 'lv10', emoji: '🌟', name: 'Level 10', desc: 'Erreiche Level 10.', reward: 120, test: () => levelInfo().level >= 10 },
  { id: 'fr1', emoji: '🤝', name: 'Freunde', desc: 'Füge einen Freund hinzu.', reward: 40, test: () => cnt('friends') >= 1 },
  { id: 'hs5', emoji: '📈', name: 'Rekordjäger', desc: 'Stelle in 5 Spielen einen Solo-Highscore auf.', reward: 60, test: () => Object.keys(profile.highscores).length >= 5 },
];

// ---------------------------------------------------------------- Tagesmissionen
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const MISSIONS = {
  play5: { text: 'Spiele 5 Runden', target: 5, reward: 30, on: (m, e) => { if (e === 'round') m.progress++; } },
  win2: { text: 'Gewinne 2 Runden', target: 2, reward: 40, on: (m, e, d) => { if (e === 'round' && d.rank === 1) m.progress++; } },
  cats3: { text: 'Spiele 3 verschiedene Kategorien', target: 3, reward: 40, on: (m, e, d) => { if (e === 'round' && d.category) { m.cats = m.cats || {}; m.cats[d.category] = 1; m.progress = Object.keys(m.cats).length; } } },
  party1: { text: 'Beende eine Party', target: 1, reward: 30, on: (m, e) => { if (e === 'party') m.progress++; } },
  solo3: { text: 'Spiele 3 Runden im Solo-Training', target: 3, reward: 25, on: (m, e, d) => { if (e === 'round' && d.solo) m.progress++; } },
  streak2: { text: 'Gewinne 2 Runden hintereinander', target: 2, reward: 50, on: (m, e, d) => { if (e === 'round') { m.run = d.rank === 1 ? (m.run || 0) + 1 : 0; m.progress = Math.max(m.progress, m.run); } } },
  humans3: { text: 'Spiele eine Party mit mindestens 3 Menschen', target: 1, reward: 40, on: (m, e, d) => { if (e === 'party' && d.humans >= 3) m.progress++; } },
  newgame: { text: 'Probiere ein neues Spiel aus', target: 1, reward: 35, on: (m, e, d) => { if (e === 'round' && d.firstTime) m.progress++; } },
};
export const MISSION_IDS = Object.keys(MISSIONS);

/** Stellt sicher, dass für heute 3 Missionen da sind (täglich neu, pro Gerät zufällig aber stabil). */
export function ensureMissions(date = today()) {
  const cur = profile.missions;
  if (cur && cur.day === date && Array.isArray(cur.list) && cur.list.length) return cur;
  const seed = hashStr(date + '|' + (profile.name || '') + '|' + (profile.avatar || ''));
  const picks = shuffle(MISSION_IDS, mulberry32(seed)).slice(0, 3);
  profile.missions = { day: date, list: picks.map((id) => ({ id, progress: 0, done: false, claimed: false })) };
  saveProfile();
  return profile.missions;
}

export function claimMission(id) {
  const ms = ensureMissions();
  const m = ms.list.find((x) => x.id === id);
  if (!m || !m.done || m.claimed) return 0;
  m.claimed = true;
  const r = MISSIONS[id].reward;
  award(0, r);
  saveProfile();
  return r;
}

// ---------------------------------------------------------------- Highscores (Solo)
/** Spiele, bei denen der Wert (value) „höher = besser“ bzw. „niedriger = besser“ ist. */
export const HS_HIGH = new Set(['taube', 'wurf', 'shuriken', 'maulwurf', 'wisch', 'farbwort', 'farbgedaechtnis', 'quiz', 'schaetzen', 'winkel', 'wortblitz', 'timing', 'takt', 'matheblitz', 'sterne', 'balance']);
export const HS_LOW = new Set(['schnellzieher']);
export const hasHighscore = (id) => HS_HIGH.has(id) || HS_LOW.has(id);

/** → true, wenn es ein neuer Bestwert ist. */
export function updateHighscore(gameId, value, label) {
  if (!hasHighscore(gameId) || !Number.isFinite(Number(value))) return false;
  const v = Number(value), old = profile.highscores[gameId];
  const better = !old || (HS_LOW.has(gameId) ? v < old.value : v > old.value);
  if (!better) return false;
  profile.highscores[gameId] = { value: v, label: label || String(v) };
  saveProfile();
  return true;
}
export function resetHighscores() { profile.highscores = {}; saveProfile(); }

// ---------------------------------------------------------------- Ereignisse
/**
 * track('round', {rank, n, gameId, category, solo}) | ('party', {place, n, humans, ko}) | ('buy') | ('friends', {count}) | ('check')
 * Gibt zurück: { achievements: [...], missions: [...] } – neu freigeschaltet bzw. fertig geworden.
 */
export function track(evt, d = {}) {
  const c = profile.counters;
  c.seen = c.seen || {}; c.cats = c.cats || {};
  let firstTime = false;
  if (evt === 'round') {
    c.rounds = cnt('rounds') + 1;
    if (d.rank === 1) { c.roundWins = cnt('roundWins') + 1; c.streak = cnt('streak') + 1; c.bestStreak = Math.max(cnt('bestStreak'), c.streak); } else c.streak = 0;
    if (d.solo) c.solo = cnt('solo') + 1;
    if (d.gameId) { firstTime = !c.seen[d.gameId]; c.seen[d.gameId] = 1; }
    if (d.category) c.cats[d.category] = 1;
  } else if (evt === 'party') {
    if (d.ko) { c.koPlayed = cnt('koPlayed') + 1; if (d.place === 1) c.koWins = cnt('koWins') + 1; } else { c.parties = cnt('parties') + 1; if (d.place === 1) c.partyWins = cnt('partyWins') + 1; }
    if (d.n >= 6) c.sixParty = cnt('sixParty') + 1;
  } else if (evt === 'buy') c.buys = cnt('buys') + 1;
  else if (evt === 'friends') c.friends = Math.max(cnt('friends'), d.count || 0);

  const doneM = [];
  const ms = ensureMissions();
  for (const m of ms.list) {
    if (m.done) continue;
    const def = MISSIONS[m.id];
    if (!def) continue;
    def.on(m, evt, { ...d, firstTime }, profile);
    if (m.progress >= def.target) { m.done = true; doneM.push(def.text); }
  }
  const newA = [];
  for (const a of ACHIEVEMENTS) {
    if (!profile.achieved[a.id] && a.test()) { profile.achieved[a.id] = Date.now(); award(0, a.reward); newA.push(a); }
  }
  saveProfile();
  return { achievements: newA, missions: doneM };
}
