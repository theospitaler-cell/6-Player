// Gemeinsame Konstanten und einfacher globaler Zustand.
export const MAX_PLAYERS = 6;

export const COLORS = [
  { id: 'red', hex: '#ff4d6d', name: 'Rot' },
  { id: 'blue', hex: '#3d8bff', name: 'Blau' },
  { id: 'green', hex: '#2fd67b', name: 'Grün' },
  { id: 'yellow', hex: '#ffcf33', name: 'Gelb' },
  { id: 'purple', hex: '#b66bff', name: 'Lila' },
  { id: 'orange', hex: '#ff8a3d', name: 'Orange' },
];
export const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex]));
export const TEAM_COLORS = [
  { id: 0, hex: '#ff4d6d', name: 'Rotes Team', short: 'Rot', emoji: '🔴' },
  { id: 1, hex: '#3d8bff', name: 'Blaues Team', short: 'Blau', emoji: '🔵' },
];

export const AVATARS = ['🦊', '🐸', '🐱', '🐼', '🦄', '🐙', '🐵', '🦁', '🐧', '🐯', '🤖', '👾', '🥷', '🦖', '🐝', '🍉', '🐶', '🐰', '🦉', '🐲'];

export const BOT_LEVELS = ['leicht', 'mittel', 'schwer'];
export const BOT_LEVEL_LABEL = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };

export const CATEGORIES = {
  Arena: '🥊', Sport: '⚽', Rennen: '🏁', Geschick: '🎯', Reaktion: '⚡',
  Denken: '🧠', Brett: '♟️', Party: '🎉', Koop: '🤝',
};

export const DEFAULT_SETTINGS = {
  mode: 'vote',          // 'admin' | 'vote' | 'random'
  partyType: 'cup',      // 'cup' | 'free'
  rounds: 7,
  onlyOnce: true,
  teamMode: 'aus',       // 'aus' | 'zufall' | 'fest'
  fillBots: false,       // mit Bots auf 4 Spieler auffüllen
  botLevel: 'mittel',
  botTakeover: true,
  timeFactor: 1,         // 0.75 | 1 | 1.5
  colorMemorySec: 3,
  doubleFinal: true,
  off: {},               // abgeschaltete Spiele  { spielId: true }
  offCats: {},           // abgeschaltete Kategorien { Kategorie: true }
};

export const TIMING = {
  intro: 4000,
  countdown: 3500,
  result: 5500,
  scoreboard: 4000,
  vote: 15000,
  roll: 2800,
};

// Sehr einfacher Event-Emitter + globaler App-Zustand
const listeners = new Map();
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt)?.delete(fn);
}
export function emit(evt, data) {
  for (const fn of listeners.get(evt) || []) {
    try { fn(data); } catch (e) { console.error('Listener-Fehler', evt, e); }
  }
}

export const app = {
  tp: null,          // aktiver Online-/Demo-Transport
  localTp: null,     // immer lokal (Solo-Training)
  online: false,     // true = echtes Firebase
  netError: null,    // Text, wenn Firebase nicht ging
  connected: false,
  party: null,       // aktuelle Party (core/party.js)
};
