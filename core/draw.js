// Zeichen-Helfer für alle Spiele (Canvas 2D, logische Koordinaten).
export const FONT = '"Fredoka", "Baloo 2", system-ui, -apple-system, "Segoe UI", sans-serif';
export const EMOJI = '"Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';

export function rrect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

export function text(g, str, x, y, { size = 16, color = '#fff', align = 'center', base = 'middle', weight = 700, stroke = null, strokeW = 4 } = {}) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = base;
  if (stroke) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(str, x, y); }
  g.fillStyle = color;
  g.fillText(str, x, y);
}

export function emoji(g, e, x, y, size) {
  g.font = `${size}px ${EMOJI}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#000';
  g.fillText(e, x, y + size * 0.06);
}

/** Spieler-Scheibe: Farbe + weißer Rand + Avatar-Emoji. */
export function disc(g, x, y, r, color, avatar, { ring = '#fff', ringW = 3, alpha = 1, shadow = true } = {}) {
  g.save();
  g.globalAlpha = alpha;
  if (shadow) {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(x, y + r * 0.85, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color; g.fill();
  g.lineWidth = ringW; g.strokeStyle = ring; g.stroke();
  emoji(g, avatar, x, y, r * 1.15);
  g.restore();
}

export function arrowDown(g, x, y, color = '#ffe14d', s = 7) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = 'rgba(0,0,0,.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x - s, y - s);
  g.lineTo(x + s, y - s);
  g.lineTo(x, y + s * 0.7);
  g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

export function nameTag(g, name, x, y, { size = 11, me = false } = {}) {
  text(g, name.length > 9 ? name.slice(0, 8) + '…' : name, x, y, { size, color: me ? '#ffe14d' : '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
}

export function checker(g, x, y, w, h, size, c1, c2) {
  for (let yy = 0; yy < h; yy += size) {
    for (let xx = 0; xx < w; xx += size) {
      g.fillStyle = ((xx / size + yy / size) & 1) ? c1 : c2;
      g.fillRect(x + xx, y + yy, Math.min(size, w - xx), Math.min(size, h - yy));
    }
  }
}

export const mix = (a, b, t) => a + (b - a) * t;
/** Rahmen-/Ringfarbe einer Spielfigur (Rahmen aus dem Shop, Regenbogen animiert). */
export { ringColor } from './shop.js';
/** Wert aus prev/cur-Snapshot-Feld interpolieren (prev kann fehlen). */
export const ip = (prev, cur, alpha) => (prev == null ? cur : prev + (cur - prev) * alpha);
