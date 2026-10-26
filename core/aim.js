// Zeiger-Hilfen für Spiele mit Zielen (AIM) und Wischen (SWIPE). Alles in logischen Spielkoordinaten.
import { clamp } from './util.js';

/** Schleuder-Prinzip: ziehen und loslassen. Der Wurf geht ENTGEGEN der Zugrichtung. */
export class AimDrag {
  constructor({ maxPull = 90, minPull = 12 } = {}) { this.maxPull = maxPull; this.minPull = minPull; this.active = false; this.x0 = 0; this.y0 = 0; this.x1 = 0; this.y1 = 0; }
  down(x, y) { this.active = true; this.x0 = this.x1 = x; this.y0 = this.y1 = y; }
  move(x, y) { if (this.active) { this.x1 = x; this.y1 = y; } }
  /** Gibt {dx, dy, power 0..1, angle} zurück oder null (zu kurz). */
  up(x, y) {
    if (!this.active) return null;
    this.active = false;
    return this.vector(x, y);
  }
  vector(x = this.x1, y = this.y1) {
    const dx = this.x0 - x, dy = this.y0 - y; // Gegenrichtung = Wurfrichtung
    const len = Math.hypot(dx, dy);
    if (len < this.minPull) return null;
    const k = Math.min(len, this.maxPull);
    return { dx: (dx / len), dy: (dy / len), power: clamp(k / this.maxPull, 0, 1), angle: Math.atan2(dy, dx) };
  }
  cancel() { this.active = false; }
}

/** Zeichnet Zielhilfe: Gummiband + gepunktete Flugrichtung. */
export function drawAim(g, aim, color = '#ffe14d', ox = null, oy = null) {
  if (!aim.active) return;
  const v = aim.vector();
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(aim.x0, aim.y0); g.lineTo(aim.x1, aim.y1); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(aim.x0, aim.y0, 7, 0, 7); g.fill();
  if (v) {
    const sx = ox == null ? aim.x0 : ox, sy = oy == null ? aim.y0 : oy;
    g.setLineDash([2, 9]); g.strokeStyle = color; g.lineWidth = 5;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + v.dx * (40 + v.power * 90), sy + v.dy * (40 + v.power * 90)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = color; g.font = '700 13px sans-serif'; g.textAlign = 'center';
    g.fillText(`${Math.round(v.power * 100)}%`, aim.x1, aim.y1 - 12);
  }
  g.restore();
}

/** Erkennt Wischrichtungen: 'up' | 'down' | 'left' | 'right' (oder null bei zu kurzem Weg). */
export class SwipeDetector {
  constructor({ minDist = 28, maxMs = 700 } = {}) { this.minDist = minDist; this.maxMs = maxMs; this.active = false; }
  down(x, y) { this.active = true; this.x0 = x; this.y0 = y; this.t0 = performance.now(); this.x1 = x; this.y1 = y; }
  move(x, y) { this.x1 = x; this.y1 = y; }
  up(x, y) {
    if (!this.active) return null;
    this.active = false;
    const dx = x - this.x0, dy = y - this.y0;
    if (Math.hypot(dx, dy) < this.minDist || performance.now() - this.t0 > this.maxMs) return null;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return { dir, dx, dy, len: Math.hypot(dx, dy) };
  }
}
export const DIRS = ['up', 'right', 'down', 'left'];
export const DIR_ARROW = { up: '⬆️', right: '➡️', down: '⬇️', left: '⬅️' };
