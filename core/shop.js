// Shop: Figuren und Rahmen, bezahlt mit im Spiel verdienten Münzen (kein Echtgeld, keine Werbung).
import { profile, saveProfile } from './profile.js';
import { AVATARS } from './state.js';

/** Premium-Figuren: Stufe bestimmt den Preis. */
const T = { common: 100, rare: 250, epic: 500, legend: 1000 };
const fig = (e, tier, name) => ({ id: 'fig:' + e, kind: 'figur', emoji: e, name, tier, price: T[tier] });
export const FIGURES = [
  fig('🦝', 'common', 'Waschbär'), fig('🐨', 'common', 'Koala'), fig('🐻', 'common', 'Bär'), fig('🦔', 'common', 'Igel'),
  fig('🐗', 'common', 'Wildschwein'), fig('🦓', 'common', 'Zebra'), fig('🐊', 'common', 'Krokodil'), fig('🦩', 'common', 'Flamingo'),
  fig('🦈', 'rare', 'Hai'), fig('🐺', 'rare', 'Wolf'), fig('🦅', 'rare', 'Adler'), fig('🐆', 'rare', 'Leopard'),
  fig('🦂', 'rare', 'Skorpion'), fig('🦇', 'rare', 'Fledermaus'), fig('😎', 'rare', 'Coole Socke'), fig('🤠', 'rare', 'Cowboy'),
  fig('👻', 'epic', 'Geist'), fig('🧙', 'epic', 'Zauberer'), fig('🧛', 'epic', 'Vampir'), fig('🧜', 'epic', 'Meerjungfrau'),
  fig('🦸', 'epic', 'Superheld'), fig('🤡', 'epic', 'Clown'), fig('🥳', 'epic', 'Partykönig'),
  fig('🐉', 'legend', 'Drache'), fig('👑', 'legend', 'Krone'), fig('💎', 'legend', 'Diamant'), fig('🔥', 'legend', 'Flamme'),
];

const frm = (id, name, hex, price, extra = {}) => ({ id: 'frm:' + id, kind: 'rahmen', frame: id, name, hex, price, ...extra });
export const FRAMES = [
  { id: 'frm:weiss', kind: 'rahmen', frame: 'weiss', name: 'Weiß', hex: '#ffffff', price: 0 },
  frm('lila', 'Lila', '#b66bff', 150), frm('pink', 'Pink', '#ff5fd2', 150), frm('cyan', 'Cyan', '#34e7ff', 150),
  frm('gold', 'Gold', '#ffd23f', 300), frm('neon', 'Neon-Grün', '#39ff14', 300), frm('flamme', 'Flamme', '#ff6b2d', 400),
  frm('schwarz', 'Schwarz', '#111111', 300), frm('regenbogen', 'Regenbogen', '#ff4d6d', 800, { rainbow: true }),
];
export const FRAME_BY_ID = Object.fromEntries(FRAMES.map((f) => [f.frame, f]));
export const TIER_LABEL = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legend: 'Legendär' };

export const isFreeAvatar = (e) => AVATARS.includes(e);
export const owns = (id) => !!profile.unlocked[id];
export const ownsAvatar = (e) => isFreeAvatar(e) || owns('fig:' + e);
export const ownsFrame = (f) => f === 'weiss' || owns('frm:' + f);
export const ownedAvatars = () => AVATARS.concat(FIGURES.filter((f) => owns(f.id)).map((f) => f.emoji));

/** Rahmenfarbe fürs Canvas (Regenbogen wandert durch die Farben). */
export function ringColor(frameId, t = performance.now()) {
  const f = FRAME_BY_ID[frameId] || FRAME_BY_ID.weiss;
  return f.rainbow ? `hsl(${Math.floor(t / 8) % 360}, 90%, 62%)` : f.hex;
}
export const frameHex = (frameId) => (FRAME_BY_ID[frameId] || FRAME_BY_ID.weiss).hex;

/** → { ok, reason } */
export function buy(item) {
  if (owns(item.id)) return { ok: false, reason: 'Schon gekauft' };
  if (profile.coins < item.price) return { ok: false, reason: `Dir fehlen noch ${item.price - profile.coins} 🪙` };
  profile.coins -= item.price;
  profile.unlocked[item.id] = true;
  saveProfile();
  return { ok: true };
}
export function equipFrame(frameId) { if (ownsFrame(frameId)) { profile.equipped.frame = frameId; saveProfile(); return true; } return false; }
export function equipAvatar(e) { if (ownsAvatar(e)) { profile.avatar = e; saveProfile(); return true; } return false; }
