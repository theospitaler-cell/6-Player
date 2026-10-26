// Bot-Stärken und Bot-Spieler.
import { COLORS } from './state.js';
import { randId } from './util.js';

/**
 * react  = Reaktionsverzögerung in Sekunden
 * aim    = Zielgenauigkeit 0..1
 * err    = Fehlerquote 0..1
 * speed  = relative Geschwindigkeit/Tipp-Rate 0..1
 */
export const BOT_PARAMS = {
  leicht: { react: 0.45, aim: 0.55, err: 0.24, speed: 0.55 },
  mittel: { react: 0.26, aim: 0.8, err: 0.1, speed: 0.78 },
  schwer: { react: 0.13, aim: 0.95, err: 0.03, speed: 1.0 },
};
export const botParams = (level) => BOT_PARAMS[level] || BOT_PARAMS.mittel;

const NAMES = ['Robo', 'Pixel', 'Blitz', 'Kiki', 'Turbo', 'Nova', 'Zack', 'Luna', 'Fizz', 'Momo', 'Bolt', 'Pip'];
const AVATARS = ['🤖', '👾', '👽', '🎃', '🦾', '🛸'];

export function newBot(players, level = 'mittel') {
  const list = Object.values(players || {});
  const usedColors = new Set(list.map((p) => p.color));
  const usedNames = new Set(list.map((p) => p.name));
  const color = (COLORS.find((c) => !usedColors.has(c.id)) || COLORS[0]).id;
  let name = NAMES.find((n) => !usedNames.has('Bot ' + n)) || 'Robo' + randId(2);
  const usedAv = new Set(list.map((p) => p.avatar));
  const avatar = AVATARS.find((a) => !usedAv.has(a)) || '🤖';
  return {
    uid: 'bot_' + randId(6),
    record: {
      name: 'Bot ' + name, avatar, color, ready: true, isBot: true, botLevel: level,
      connected: true, level: { leicht: 1, mittel: 2, schwer: 3 }[level] || 1, score: 0, wins: 0, rs: 0, joinedAt: Date.now() + Math.random(),
    },
  };
}
