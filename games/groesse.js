// 📏 Größen-Check – Ein Objekt ist mit seiner echten Größe gegeben (z. B. der Schiefe Turm von Pisa),
// das andere (z. B. der Eiffelturm) stellst du maßstabsgetreu ein: größer oder kleiner ziehen.
// Nach jeder Runde sieht man in Prozent, wie nah jeder dran war. 10 Duelle aus einem Pool von 28 – jede Partie anders.
import { text, rrect, disc, EMOJI } from '../core/draw.js';
import { rankByScore, skillOf } from '../core/gamekit.js';
import { mulberry32, shuffle, clamp } from '../core/util.js';
import { h } from '../core/ui.js';

const W = 560, H = 330, ROUNDS = 10, PICK_T = 14, REVEAL_T = 5.5;
const GROUND = 290;          // Bodenlinie (y)
const REF_X = 88, TGT_X = 282, SCENE_R = 398; // Bild-Bereich; rechts davon steht die Spielerliste
const MAX_H = 236;           // höchste erlaubte Darstellung

// Objekte: m = echte Größe in Metern (Höhe, bei dim 'w' die Länge), asp = Breite/Höhe der Darstellung (für Platz-Grenzen)
const O = {
  pisa: { n: 'Schiefer Turm von Pisa', m: 56, draw: 'pisa', asp: 0.3 },
  eiffel: { n: 'Eiffelturm', m: 330, draw: 'eiffel', asp: 0.4 },
  pyramide: { n: 'Cheops-Pyramide', m: 139, draw: 'pyramide', asp: 1.1 },
  burj: { n: 'Burj Khalifa', m: 828, draw: 'burj', asp: 0.15 },
  statue: { n: 'Freiheitsstatue', m: 93, e: '🗽', asp: 0.5 },
  mensch: { n: 'Mensch', m: 1.75, e: '🧍', asp: 0.4 },
  giraffe: { n: 'Giraffe', m: 5, e: '🦒', asp: 0.65 },
  elefant: { n: 'Elefant', m: 3, e: '🐘', asp: 1.1 },
  hund: { n: 'Hund', m: 0.6, e: '🐕', asp: 1.1 },
  katze: { n: 'Katze', m: 0.25, e: '🐈', asp: 1.0 },
  pinguin: { n: 'Kaiserpinguin', m: 1.1, e: '🐧', asp: 0.7 },
  trex: { n: 'T-Rex (Länge)', m: 12, e: '🦖', asp: 1.4, dim: 'w' },
  hai: { n: 'Weißer Hai (Länge)', m: 4.5, e: '🦈', asp: 1.7, dim: 'w' },
  wal: { n: 'Blauwal (Länge)', m: 25, e: '🐋', asp: 1.6, dim: 'w' },
  auto: { n: 'Auto (Länge)', m: 4.5, e: '🚗', asp: 1.8, dim: 'w' },
  bus: { n: 'Linienbus (Länge)', m: 12, e: '🚌', asp: 1.6, dim: 'w' },
  fahrrad: { n: 'Fahrrad (Länge)', m: 1.8, e: '🚲', asp: 1.3, dim: 'w' },
  baum: { n: 'Eiche', m: 25, e: '🌳', asp: 0.9 },
  haus: { n: 'Einfamilienhaus', m: 8, e: '🏠', asp: 1.0 },
  apfel: { n: 'Apfel', m: 0.08, e: '🍎', asp: 0.95 },
  ananas: { n: 'Ananas', m: 0.35, e: '🍍', asp: 0.55 },
  tennis: { n: 'Tennisball', m: 0.067, e: '🎾', asp: 1.0 },
  basket: { n: 'Basketball', m: 0.24, e: '🏀', asp: 1.0 },
  phone: { n: 'Smartphone', m: 0.15, e: '📱', asp: 0.55 },
  laptop: { n: 'Laptop (Breite)', m: 0.33, e: '💻', asp: 1.5, dim: 'w' },
};

// (Referenz, gesucht) – wird je Runde zufällig getauscht (mal musst du größer, mal kleiner machen)
const PAIRS = [
  ['pisa', 'eiffel'], ['mensch', 'giraffe'], ['hund', 'elefant'], ['mensch', 'trex'], ['mensch', 'hai'], ['pinguin', 'mensch'],
  ['auto', 'bus'], ['fahrrad', 'auto'], ['haus', 'baum'], ['eiffel', 'statue'], ['pisa', 'statue'], ['pyramide', 'eiffel'],
  ['eiffel', 'burj'], ['statue', 'pyramide'], ['apfel', 'ananas'], ['tennis', 'basket'], ['phone', 'laptop'], ['katze', 'hund'],
  ['giraffe', 'elefant'], ['wal', 'bus'], ['hai', 'wal'], ['baum', 'pisa'], ['haus', 'pisa'], ['katze', 'mensch'],
  ['burj', 'pyramide'], ['mensch', 'elefant'], ['trex', 'wal'], ['auto', 'wal'],
];

const de = (n) => String(n).replace('.', ',');
export function fmtSize(m) {
  if (m < 1) { const cm = m * 100; return de(cm < 10 ? Math.round(cm * 10) / 10 : Math.round(cm)) + ' cm'; }
  return de(m % 1 === 0 ? m : Math.round(m * 100) / 100) + ' m';
}
export function fmtX(r) { return de(r >= 10 ? Math.round(r) : r >= 2 ? Math.round(r * 10) / 10 : Math.round(r * 100) / 100) + '×'; }

/** Genauigkeit in Prozent: 100 = exakt, 0 = um den Faktor 3 (oder mehr) daneben – nach oben wie nach unten gleich streng. */
export function accuracy(px, truePx) {
  if (!(px > 0) || !(truePx > 0)) return 0;
  return Math.round(100 * Math.max(0, 1 - Math.abs(Math.log(px / truePx)) / Math.log(3)));
}

// Regler (0..1000) ↔ Pixelhöhe, logarithmisch: gleiche Regler-Schritte = gleiche prozentuale Änderung
export const pxOf = (R, v) => R.lo * Math.pow(R.hi / R.lo, clamp(v, 0, 1000) / 1000);
export const vOf = (R, px) => clamp(1000 * Math.log(clamp(px, R.lo, R.hi) / R.lo) / Math.log(R.hi / R.lo), 0, 1000);

const capPx = (o) => (o.dim === 'w' ? Math.min(230, MAX_H * o.asp) : Math.min(MAX_H, 230 / o.asp));
const refCap = (o) => (o.dim === 'w' ? Math.min(150, MAX_H * o.asp) : Math.min(MAX_H, 150 / o.asp));

/** Alle 10 Runden einer Partie – nur aus dem Seed, daher bei allen Geräten gleich. */
export function buildRounds(seed) {
  const rng = mulberry32(((seed | 0) ^ 0x6d2b79f5) >>> 0);
  const idx = shuffle(PAIRS.map((_, i) => i), rng).slice(0, ROUNDS);
  return idx.map((pi) => {
    let [a, b] = PAIRS[pi];
    if (rng() < 0.5) [a, b] = [b, a];
    const ref = O[a], tgt = O[b];
    let k = 150 / Math.max(ref.m, tgt.m);                         // Pixel pro Meter: das größere Objekt ≈ 150 px
    let truePx = tgt.m * k, refPx = ref.m * k;
    const s = Math.min(1, capPx(tgt) / (1.6 * truePx), refCap(ref) / refPx);
    truePx *= s; refPx *= s;
    const lo = truePx / (1.9 + 2.3 * rng());
    const hi = Math.min(capPx(tgt), truePx * (1.7 + 2.3 * rng()));
    const R = { a, b, ref, tgt, refPx, truePx, lo, hi, ratio: tgt.m / ref.m, v0: 500 };
    for (let t = 0; t < 30; t++) {                                  // Startwert: nie in der Nähe der Lösung
      const v = 120 + Math.floor(rng() * 760);
      if (Math.abs(Math.log(pxOf(R, v) / truePx)) >= 0.28) { R.v0 = v; break; }
    }
    return R;
  });
}

// ---------------------------------------------------------------- Zeichnen
const sprites = new Map();
/** Emoji → zugeschnittenes Bild (exakte Umrisse), damit „Höhe“ wirklich die sichtbare Höhe ist. Ohne DOM (Tests): null. */
function getSprite(e) {
  if (sprites.has(e)) return sprites.get(e);
  let s = null;
  try {
    if (typeof document !== 'undefined') {
      const S = 192, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.font = `140px ${EMOJI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(e, S / 2, S / 2 + 8);
      const d = x.getImageData(0, 0, S, S).data;
      let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        if (d[(yy * S + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      }
      if (x1 > x0 && y1 > y0) s = { c, bx: x0, by: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 };
    }
  } catch { s = null; }
  sprites.set(e, s);
  return s;
}

const CUSTOM = {
  eiffel(g, x, y0, hh) {
    const w = (f) => f * hh;
    g.save();
    g.fillStyle = '#7a6a58'; g.strokeStyle = '#4e4034'; g.lineWidth = Math.max(1, hh * 0.006); g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x - w(0.2), y0);
    g.lineTo(x - w(0.115), y0 - w(0.2)); g.lineTo(x - w(0.07), y0 - w(0.45)); g.lineTo(x - w(0.045), y0 - w(0.62));
    g.lineTo(x - w(0.014), y0 - w(0.86)); g.lineTo(x, y0 - hh); g.lineTo(x + w(0.014), y0 - w(0.86));
    g.lineTo(x + w(0.045), y0 - w(0.62)); g.lineTo(x + w(0.07), y0 - w(0.45)); g.lineTo(x + w(0.115), y0 - w(0.2));
    g.lineTo(x + w(0.2), y0);
    g.lineTo(x + w(0.15), y0); g.quadraticCurveTo(x, y0 - w(0.22), x - w(0.15), y0);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#4e4034';
    g.fillRect(x - w(0.125), y0 - w(0.205), w(0.25), w(0.02));
    g.fillRect(x - w(0.052), y0 - w(0.625), w(0.104), w(0.016));
    g.beginPath(); g.lineWidth = Math.max(0.6, hh * 0.004);
    for (const [ya, yb, wa, wb] of [[0.02, 0.2, 0.17, 0.1], [0.22, 0.44, 0.1, 0.06], [0.46, 0.61, 0.058, 0.04]]) {
      g.moveTo(x - w(wa), y0 - w(ya)); g.lineTo(x + w(wb), y0 - w(yb));
      g.moveTo(x + w(wa), y0 - w(ya)); g.lineTo(x - w(wb), y0 - w(yb));
    }
    g.stroke();
    g.restore();
  },
  pisa(g, x, y0, hh) {
    const bw = hh * 0.28, tiers = 8, th = hh / tiers;
    g.save();
    g.translate(x - hh * 0.03, y0); g.rotate(0.07);       // der Turm hängt schief
    for (let i = 0; i < tiers; i++) {
      const top = i === tiers - 1, tw = top ? bw * 0.72 : bw, yy = -(i + 1) * th;
      g.fillStyle = i % 2 ? '#f3eee2' : '#e8e1d0'; g.fillRect(-tw / 2, yy, tw, th + 0.5);
      g.fillStyle = '#8b826d';
      const n = top ? 4 : 5;
      for (let k = 0; k < n; k++) g.fillRect(-tw / 2 + (k + 0.5) * tw / n - hh * 0.004, yy + th * 0.28, hh * 0.008, th * 0.5);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(-tw / 2, yy + th - hh * 0.006, tw, hh * 0.006);
    }
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(bw * 0.2, -hh, bw * 0.3, hh);
    g.restore();
  },
  pyramide(g, x, y0, hh) {
    const hw = hh * 0.55;
    g.save();
    g.fillStyle = '#e2bb66'; g.beginPath(); g.moveTo(x - hw, y0); g.lineTo(x, y0 - hh); g.lineTo(x + hw, y0); g.closePath(); g.fill();
    g.fillStyle = '#c99c45'; g.beginPath(); g.moveTo(x, y0 - hh); g.lineTo(x + hw, y0); g.lineTo(x + hw * 0.1, y0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,80,20,.35)'; g.lineWidth = Math.max(0.6, hh * 0.004); g.beginPath();
    for (let i = 1; i < 6; i++) { const f = i / 6; g.moveTo(x - hw * (1 - f), y0 - hh * f); g.lineTo(x + hw * (1 - f), y0 - hh * f); }
    g.stroke();
    g.restore();
  },
  burj(g, x, y0, hh) {
    const w = (f) => f * hh;
    const steps = [[0.07, 0], [0.07, 0.3], [0.052, 0.3], [0.052, 0.55], [0.036, 0.55], [0.036, 0.78], [0.02, 0.78], [0.012, 0.9], [0, 1]];
    g.save();
    g.fillStyle = '#9dbbe0'; g.strokeStyle = '#5b7ba3'; g.lineWidth = Math.max(0.8, hh * 0.004);
    g.beginPath();
    steps.forEach(([hw, f], i) => { if (i === 0) g.moveTo(x - w(hw), y0 - w(f)); else g.lineTo(x - w(hw), y0 - w(f)); });
    for (let i = steps.length - 1; i >= 0; i--) g.lineTo(x + w(steps[i][0]), y0 - w(steps[i][1]));
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x - w(0.02), y0 - w(0.78), w(0.014), w(0.78));
    g.restore();
  },
};

/** Zeichnet das Objekt mit seiner Grundlinie bei y0, horizontal um x zentriert. px = Höhe (bei dim 'w': Breite). */
function drawObj(g, o, x, y0, px, alpha = 1) {
  if (!(px > 0.5)) return;
  g.save();
  g.globalAlpha = alpha;
  if (o.draw) CUSTOM[o.draw](g, x, y0, px);
  else {
    const sp = getSprite(o.e);
    if (sp) {
      const sc = o.dim === 'w' ? px / sp.bw : px / sp.bh, dw = sp.bw * sc, dh = sp.bh * sc;
      g.drawImage(sp.c, sp.bx, sp.by, sp.bw, sp.bh, x - dw / 2, y0 - dh, dw, dh);
    } else {
      g.font = `${px * 0.85}px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
      g.fillText(o.e, x, y0 - px * 0.1);
    }
  }
  g.restore();
}

const accColor = (a) => (a >= 85 ? '#5dffa0' : a >= 60 ? '#ffe14d' : '#ff7a95');

// ---------------------------------------------------------------- Spiel
class Groesse {
  constructor(ctx) {
    this.ctx = ctx; this.rounds = buildRounds(ctx.seed); this.running = false;
    this.ph = 'pick'; this.pt = 0; this.rd = 0; this.done = 0;
    this.sc = {}; this.vals = {}; this.lock = {}; this.res = null; this.bots = {};
    this.n = 0; this.lv = this.rounds[0].v0; this.myLock = false; this.lastRd = 0; this.drag = false; this.sentAt = 0;
    ctx.players.forEach((p) => { this.sc[p.uid] = 0; });
    this.freshRound();
  }
  R() { return this.rounds[Math.min(this.rd, ROUNDS - 1)]; }
  freshRound() {
    const R = this.R();
    this.vals = {}; this.lock = {}; this.res = null;
    for (const p of this.ctx.players) this.vals[p.uid] = R.v0;
  }
  start() { this.running = true; }

  onInput(uid, input) {
    if (!this.running || this.ph !== 'pick' || this.lock[uid] || !Object.prototype.hasOwnProperty.call(this.sc, uid) || !input) return;
    const a = Number(input.a);
    if (!Number.isFinite(a)) return;
    this.vals[uid] = Math.round(clamp(a, 0, 1000));
    if (input.ok) {
      this.lock[uid] = true;
      if (this.ctx.players.every((p) => this.lock[p.uid])) this.reveal();
    }
  }
  reveal() {
    const R = this.R();
    const px = [], acc = [];
    for (const p of this.ctx.players) {
      const v = pxOf(R, this.vals[p.uid]), a = accuracy(v, R.truePx);
      px.push(Math.round(v * 10) / 10); acc.push(a);
      this.sc[p.uid] += a;
    }
    this.res = { px, acc };
    this.done++;
    this.ph = 'reveal'; this.pt = 0; this.ctx.sfx('win');
  }
  update(dt) {
    if (!this.running) return;
    this.pt += dt;
    if (this.ph === 'pick' && this.pt >= PICK_T) this.reveal();
    else if (this.ph === 'reveal' && this.pt >= REVEAL_T) {
      this.rd++; this.pt = 0;
      if (this.rd >= ROUNDS) { this.ph = 'over'; return; }
      this.ph = 'pick'; this.freshRound();
    }
  }
  isFinished() { return this.ph === 'over'; }
  snapshot() {
    const R = this.R();
    return {
      ph: this.ph, rd: Math.min(this.rd, ROUNDS - 1), tl: Math.ceil(Math.max(0, PICK_T - this.pt)),
      lk: this.ctx.players.map((p) => (this.lock[p.uid] ? 1 : 0)), res: this.res, sc: this.ctx.players.map((p) => this.sc[p.uid]),
      tp: Math.round(R.truePx * 10) / 10,
    };
  }

  /** Bots schätzen mit Streuung je nach Stufe und geben nach 2,5–8,5 s ab. */
  botThink(bot, snap, dt) {
    if (this.ph !== 'pick' || this.lock[bot.uid]) return null;
    const R = this.R();
    let st = this.bots[bot.uid];
    if (!st || st.rd !== this.rd) {
      const sigma = 0.45 * (1 - skillOf(bot.botLevel)) + 0.04;
      const gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      st = this.bots[bot.uid] = { rd: this.rd, t: 0, wait: 2.5 + Math.random() * 6, v: Math.round(vOf(R, R.truePx * Math.exp(sigma * gauss))) };
    }
    st.t += dt;
    return st.t < st.wait ? null : { a: st.v, ok: 1 };
  }
  result() {
    const n = Math.max(1, this.done);
    return { ranks: rankByScore(this.ctx.players, (p) => this.sc[p.uid], { label: (u, s) => `${Math.round(s / n)} % Ø` }) };
  }

  // ------------------------------------------------------------ Eingabe (Regler + Ziehen am Bild)
  sendLive(final = false, ok = false) {
    const now = performance.now();
    if (!final && now - this.sentAt < 110) return;
    this.sentAt = now;
    const o = { a: Math.round(this.lv), n: ++this.n };
    if (ok) o.ok = 1;
    this.ctx.send(o);
  }
  syncRound(snap) {
    if (this.lastRd === snap.rd) return;
    this.lastRd = snap.rd; this.lv = this.rounds[Math.min(snap.rd, ROUNDS - 1)].v0; this.myLock = false; this.drag = false;
    if (this.range) this.range.value = String(this.lv);
  }
  canEdit() {
    const s = this.lastSnap, mi = s ? this.ctx.players.findIndex((p) => p.uid === this.ctx.me) : -1;
    return !!s && s.ph === 'pick' && mi >= 0 && !s.lk[mi] && !this.myLock;
  }
  onPointer(type, x, y) {
    if (type === 'down') { if (!this.canEdit() || x > SCENE_R) return; this.drag = true; }
    if (!this.drag) return;
    if (type === 'up' || type === 'cancel') { this.drag = false; if (this.canEdit()) this.sendLive(true); return; }
    const R = this.R();
    this.lv = vOf(R, GROUND - y);
    if (this.range) this.range.value = String(Math.round(this.lv));
    this.sendLive();
  }
  mountUI(box) {
    const range = this.range = h('input', { type: 'range', class: 'w-range', min: '0', max: '1000', step: '1', value: String(this.lv), 'aria-label': 'Größe' });
    range.addEventListener('input', () => { if (!this.canEdit()) { range.value = String(Math.round(this.lv)); return; } this.lv = Number(range.value); this.sendLive(); });
    range.addEventListener('change', () => { if (this.canEdit()) this.sendLive(true); });
    const nudge = (label, dir) => {
      const b = h('button', { class: 'w-kbkey gr-nudge', type: 'button', 'aria-label': dir > 0 ? 'größer' : 'kleiner' }, label);
      let timer = null;
      const step = () => { if (!this.canEdit()) return; this.lv = clamp(this.lv + dir * 6, 0, 1000); range.value = String(Math.round(this.lv)); this.sendLive(); };
      const stop = () => { if (timer) { clearInterval(timer); timer = null; if (this.canEdit()) this.sendLive(true); } };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(); stop(); timer = setInterval(step, 70); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, stop);
      return b;
    };
    const go = h('button', { class: 'w-kbkey send', type: 'button' }, 'Abschicken ✓');
    go.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!this.canEdit()) return; this.myLock = true; this.sendLive(true, true); });
    this.ui = h('div', { class: 'w-slider gr-ui' },
      h('div', { class: 'w-disp small' }, '↕ Größe einstellen'),
      h('div', { class: 'gr-row' }, nudge('−', -1), range, nudge('＋', 1)),
      h('div', { class: 'gr-labels' }, h('span', null, '◀ kleiner'), h('span', null, 'größer ▶')),
      go);
    box.appendChild(this.ui);
  }
  updateUI(snap) {
    if (!this.ui || !snap) return;
    this.lastSnap = snap; this.syncRound(snap);
    this.ui.classList.toggle('lock', !this.canEdit());
  }

  // ------------------------------------------------------------ Zeichnen
  render(g, snap, me) {
    this.lastSnap = snap; this.syncRound(snap);
    const ps = this.ctx.players, mi = ps.findIndex((p) => p.uid === me), R = this.rounds[Math.min(snap.rd, ROUNDS - 1)];
    const reveal = snap.ph === 'reveal' && snap.res;
    g.fillStyle = '#2b3a67'; rrect(g, 0, 0, W, H, 18); g.fill();
    // Szene (nichts darf in die Spielerliste hineinragen)
    g.save(); g.beginPath(); g.rect(0, 0, SCENE_R, H); g.clip();
    g.fillStyle = '#3d7a4a'; g.fillRect(0, GROUND, SCENE_R, H - GROUND);
    g.fillStyle = '#5fae6e'; g.fillRect(0, GROUND, SCENE_R, 3);
    drawObj(g, R.ref, REF_X, GROUND, R.refPx);
    const myPx = mi >= 0 ? pxOf(R, this.lv) : pxOf(R, 500);
    if (reveal) {
      drawObj(g, R.tgt, TGT_X, GROUND, R.truePx);
      ps.forEach((p, i) => {
        const y = GROUND - snap.res.px[i], dx = 335 + (i % 3) * 20;
        g.strokeStyle = p.colorHex; g.lineWidth = 2; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(190, y); g.lineTo(dx, y); g.stroke(); g.setLineDash([]);
        disc(g, dx, y, 9, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      });
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(180, GROUND - R.truePx); g.lineTo(SCENE_R - 10, GROUND - R.truePx); g.stroke();
    } else {
      drawObj(g, R.tgt, TGT_X, GROUND, myPx, mi >= 0 ? 1 : 0.5);
      if (mi >= 0 && snap.ph === 'pick') {
        const top = GROUND - myPx;
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(190, top); g.lineTo(SCENE_R - 20, top); g.stroke(); g.setLineDash([]);
        disc(g, TGT_X + 92, top, 11, '#ffffff', '↕', { ring: '#ffe14d' });
      }
    }
    g.restore();
    // Beschriftung unter dem Boden
    text(g, R.ref.n, REF_X, GROUND + 15, { size: 11, color: '#e8f3ea' });
    text(g, fmtSize(R.ref.m), REF_X, GROUND + 30, { size: 12, color: '#ffe14d' });
    text(g, R.tgt.n, TGT_X, GROUND + 15, { size: 11, color: '#e8f3ea' });
    text(g, reveal ? fmtSize(R.tgt.m) : '?', TGT_X, GROUND + 30, { size: 12, color: reveal ? '#5dffa0' : '#ffe14d' });
    // Kopf
    text(g, `Runde ${Math.min(snap.rd + 1, ROUNDS)} / ${ROUNDS}`, 14, 14, { size: 12, align: 'left', color: '#c9d6ff' });
    text(g, `Wie groß ist: ${R.tgt.n}?`, SCENE_R / 2, 15, { size: 16 });
    text(g, reveal ? `${fmtX(R.ratio)} so groß wie ${R.ref.n}` : `Vergleiche mit: ${R.ref.n} (${fmtSize(R.ref.m)})`, SCENE_R / 2, 36, { size: 12, color: reveal ? '#5dffa0' : '#ffe14d' });
    // Spielerliste
    const rowH = Math.min(44, 236 / Math.max(1, ps.length));
    ps.forEach((p, i) => {
      const y = 62 + i * rowH;
      g.fillStyle = p.uid === me ? 'rgba(255,225,77,.16)' : 'rgba(0,0,0,.22)'; rrect(g, 408, y - rowH / 2 + 2, 144, rowH - 4, 10); g.fill();
      disc(g, 428, y, 13, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring, alpha: snap.ph === 'pick' && !snap.lk[i] ? 0.65 : 1 });
      text(g, p.name.slice(0, 8), 446, y - 7, { size: 12, align: 'left' });
      text(g, `Σ ${snap.sc[i]}`, 446, y + 8, { size: 11, align: 'left', color: '#c9d6ff' });
      if (reveal) text(g, `${snap.res.acc[i]} %`, 546, y, { size: 17, align: 'right', color: accColor(snap.res.acc[i]) });
      else text(g, snap.lk[i] ? '✅' : '…', 540, y, { size: 15, align: 'right' });
    });
    // Hinweis
    if (!reveal) {
      const msg = mi < 0 ? 'Du schaust zu 👀' : (snap.lk[mi] || this.myLock) ? 'Abgegeben – warte auf die anderen …' : `⏱ ${snap.tl}`;
      text(g, msg, 478, 318, { size: 13, color: snap.tl <= 4 && snap.ph === 'pick' ? '#ff7a95' : '#fff' });
    }
  }
}

export default {
  id: 'groesse', name: 'Größen-Check', emoji: '📏', category: 'Denken', tags: ['wissen'],
  min: 2, max: 6, teams: 'none', duel: false,
  sync: 'turns', controls: 'PICK', pointer: true, ctlWidth: 0.4, duration: 205,
  view: { w: W, h: H },
  howTo: [
    'Ein Objekt hat seine echte Größe (z. B. der Schiefe Turm von Pisa). Mach das andere (z. B. den Eiffelturm) maßstabsgetreu groß!',
    'Zieh am Bild nach oben oder unten – oder nimm den Regler mit − und ＋. Dann „Abschicken“.',
    'Nach jeder Runde siehst du in Prozent, wie nah jeder dran war. 10 Duelle, jede Partie mit anderen Paaren.',
  ],
  wertung: 'Genauigkeit in Prozent pro Runde (100 % = exakt), Summe über 10 Runden. Bots schätzen mit Abweichung je nach Stufe.',
  create: (ctx) => new Groesse(ctx),
};
