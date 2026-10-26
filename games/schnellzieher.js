// ⚡ Schnellzieher – Reaktionstest. Zeit wird LOKAL gemessen (fair trotz Latenz).
import { text, rrect } from '../core/draw.js';
import { randInt, gauss, r2 } from '../core/util.js';
import { botParams } from '../core/bots.js';
import { competitionRanks } from '../core/scoring.js';

const DRAWS = 3;
const FOUL_MS = 1000;
const MIN_MS = 80;      // schneller geht nicht → Host wertet es als Fehlstart
const PAUSE = 1.3;      // Sekunden Anzeige des Ergebnisses

class Schnellzieher {
  constructor(ctx) {
    this.ctx = ctx;
    // gleiche Wartezeiten für alle (Seed) → faire Aufgaben
    this.delays = Array.from({ length: DRAWS }, () => 1.4 + ctx.rng() * 3.2);
    this.i = 0; this.phase = 'idle'; this.pt = 0; this.shownAt = null;
    this.r = []; this.msg = ''; this.sent = false; this.subs = {}; this.lastN = 0;
  }
  start() { this.phase = 'wait'; this.pt = 0; this.shownAt = null; }
  update(dt) {
    if (this.phase === 'idle' || this.phase === 'done') return;
    this.pt += dt;
    if (this.phase === 'wait' && this.pt >= this.delays[this.i]) { this.phase = 'go'; this.pt = 0; this.shownAt = null; }
    else if (this.phase === 'result' && this.pt >= PAUSE) this._next();
  }
  _next() {
    this.i++;
    if (this.i >= DRAWS) { this.phase = 'done'; this._send(); return; }
    this.phase = 'wait'; this.pt = 0; this.shownAt = null; this.msg = '';
  }
  onInput(uid, input) {
    const n = input.taps | 0;
    if (n === this.lastN) return;
    this.lastN = n;
    const now = this.ctx.now();
    if (this.phase === 'wait') {
      this.r.push(FOUL_MS); this.msg = 'Fehlstart! +1000 ms';
      this.phase = 'result'; this.pt = 0;
      this.ctx.sfx('error'); this.ctx.vibrate(120);
    } else if (this.phase === 'go' && this.shownAt != null) {
      const ms = Math.max(1, Math.round(now - this.shownAt));
      this.r.push(ms); this.msg = `${ms} ms`;
      this.phase = 'result'; this.pt = 0;
      this.ctx.sfx('coin'); this.ctx.vibrate(30);
    }
  }
  _send() {
    if (this.sent) return;
    this.sent = true;
    while (this.r.length < DRAWS) this.r.push(FOUL_MS);
    this.ctx.submit({ r: this.r.slice(0, DRAWS) });
  }
  timeUp() { this.phase = 'done'; this._send(); }
  progress() { return this.r.length; }

  onSubmit(uid, d) {
    const r = (d && Array.isArray(d.r) ? d.r : []).slice(0, DRAWS).map((x) => {
      const v = Number(x);
      return Number.isFinite(v) && v >= MIN_MS ? Math.min(v, FOUL_MS) : FOUL_MS; // unter 80 ms = unmöglich
    });
    while (r.length < DRAWS) r.push(FOUL_MS);
    this.subs[uid] = r;
  }
  result() {
    const items = this.ctx.players.map((p) => {
      const r = this.subs[p.uid] || Array(DRAWS).fill(FOUL_MS * 1.5);
      return { uid: p.uid, total: r.reduce((a, b) => a + b, 0), r };
    });
    const ranked = competitionRanks(items, (a, b) => a.total - b.total);
    return { ranks: ranked.map(({ item, rank }) => ({ uid: item.uid, rank, value: item.total, label: `Ø ${Math.round(item.total / DRAWS)} ms` })) };
  }

  botPlan(bot) {
    const p = botParams(bot.botLevel);
    const mean = 560 - 330 * p.speed; // leicht ≈ 380 ms, schwer ≈ 230 ms
    const r = []; let t = 0;
    for (let i = 0; i < DRAWS; i++) {
      const foul = Math.random() < p.err * 0.35;
      const ms = foul ? FOUL_MS : Math.max(130, Math.round(mean + gauss() * 45 * (1.6 - p.speed)));
      r.push(ms); t += this.delays[i] + (foul ? 0.3 : ms / 1000) + PAUSE;
    }
    return { r, doneAt: t, final: { r } };
  }
  botProgress(plan, t) {
    let acc = 0, done = 0;
    for (let i = 0; i < DRAWS; i++) { acc += this.delays[i] + (plan.r[i] >= FOUL_MS ? 0.3 : plan.r[i] / 1000) + PAUSE; if (t >= acc) done++; }
    return done;
  }
  botFinal(plan) { return plan.final; }

  render(g, snap, me) {
    const W = 560, H = 340, PW = 338; // links das Signal, rechts die Mitspieler
    let col = '#3a3f5c', big = 'Gleich geht’s los…', sub = '';
    if (this.phase === 'wait') { col = '#d93a4a'; big = 'WARTE…'; sub = 'Nicht zu früh tippen!'; }
    else if (this.phase === 'go') {
      col = '#27c46b'; big = 'ZIEH!'; sub = 'Jetzt tippen!';
      if (this.shownAt == null) this.shownAt = this.ctx.now(); // ab dem Moment, in dem es gezeichnet wird
    } else if (this.phase === 'result') { col = '#3d6fdc'; big = this.msg; sub = this.i + 1 < DRAWS ? 'Nächster Versuch gleich…' : ''; }
    else if (this.phase === 'done') { col = '#7a4fd1'; big = 'Fertig!'; sub = 'Warte auf die anderen…'; }
    g.fillStyle = col; rrect(g, 0, 0, PW, H, 18); g.fill();
    text(g, big, PW / 2, 118, { size: 42, color: '#fff', stroke: 'rgba(0,0,0,.25)', strokeW: 6 });
    text(g, sub, PW / 2, 172, { size: 17, color: 'rgba(255,255,255,.9)' });
    text(g, `Versuch ${Math.min(this.i + 1, DRAWS)} / ${DRAWS}`, PW / 2, 232, { size: 15, color: 'rgba(255,255,255,.85)' });
    text(g, this.r.length ? this.r.map((x) => (x >= FOUL_MS ? '✗' : x + ' ms')).join('  ·  ') : ' ', PW / 2, 276, { size: 16, color: '#fff' });
    // Mitspieler
    const ps = this.ctx.players;
    g.fillStyle = 'rgba(0,0,0,.28)'; rrect(g, PW + 14, 0, W - PW - 14, H, 18); g.fill();
    text(g, 'Mitspieler', PW + 14 + (W - PW - 14) / 2, 24, { size: 15, color: 'rgba(255,255,255,.8)' });
    const rowH = Math.min(40, (H - 50) / ps.length);
    ps.forEach((p, i) => {
      const y = 52 + i * rowH + rowH / 2;
      const isMe = p.uid === me;
      const done = isMe ? this.r.length : (snap.p && snap.p[p.uid]) || 0;
      text(g, p.avatar, PW + 36, y, { size: 20 });
      text(g, p.name.slice(0, 9), PW + 54, y, { size: 13, align: 'left', color: isMe ? '#ffe14d' : '#fff' });
      for (let k = 0; k < DRAWS; k++) {
        g.fillStyle = k < done ? '#2fd67b' : 'rgba(255,255,255,.25)';
        g.beginPath(); g.arc(W - 56 + k * 18, y, 5.5, 0, 7); g.fill();
      }
    });
  }
}

export default {
  id: 'schnellzieher', name: 'Schnellzieher', emoji: '⚡', category: 'Reaktion',
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 26,
  view: { w: 560, h: 340 },
  howTo: ['Warte, bis der Bildschirm GRÜN wird – dann sofort tippen!', 'Zu früh getippt = Fehlstart (+1 s). Drei Versuche, die schnellste Gesamtzeit gewinnt.'],
  wertung: 'Summe der Reaktionszeiten (niedriger ist besser).',
  create: (ctx) => new Schnellzieher(ctx),
};
