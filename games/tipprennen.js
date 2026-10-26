// 🏁 Tipp-Rennen – lokal simuliert (jeder Spieler auf seinem Handy), Ergebnis wird gemeldet.
import { disc, text, rrect, arrowDown, checker } from '../core/draw.js';
import { clamp, r2 } from '../core/util.js';
import { botParams } from '../core/bots.js';
import { competitionRanks } from '../core/scoring.js';

const GOAL = 70;
const MAX_TPS = 12; // Anti-Cheat: mehr als 12 Tipps/s zählen nicht

class TippRennen {
  constructor(ctx) {
    this.ctx = ctx;
    this.taps = 0; this.lastN = 0; this.t = 0; this.running = false;
    this.fin = null; this.sent = false; this.bucket = 3; this.subs = {};
  }
  start() { this.running = true; }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    this.bucket = Math.min(3, this.bucket + dt * MAX_TPS);
  }
  onInput(uid, input) {
    const n = (input.taps | 0);
    let d = n - this.lastN;
    this.lastN = n;
    if (!this.running || this.fin != null || d <= 0) return;
    d = Math.min(d, Math.floor(this.bucket));
    if (d <= 0) return;
    this.bucket -= d;
    this.taps = Math.min(GOAL, this.taps + d);
    this.ctx.sfx('tap');
    if (this.taps >= GOAL) {
      this.fin = this.t;
      this.ctx.sfx('win'); this.ctx.vibrate(80);
      this._send();
    }
  }
  _send() {
    if (this.sent) return;
    this.sent = true;
    this.ctx.submit({ t: this.fin != null ? r2(this.fin) : null, n: this.taps });
  }
  timeUp() { this.running = false; this._send(); }
  progress() { return this.taps; }

  // ---- Host: Ergebnisse einsammeln und prüfen ----
  onSubmit(uid, d) {
    let t = d && d.t != null ? Number(d.t) : null;
    let n = clamp(Number(d && d.n) || 0, 0, GOAL);
    n = Math.min(n, Math.floor(MAX_TPS * this.ctx.duration + 3));
    if (t != null && (!(t >= GOAL / (MAX_TPS + 0.5)) || t > this.ctx.duration + 3)) { t = null; n = Math.min(n, 5); } // unglaubwürdig
    this.subs[uid] = { t, n };
  }
  result() {
    const items = this.ctx.players.map((p) => ({ uid: p.uid, ...(this.subs[p.uid] || { t: null, n: 0 }) }));
    const cmp = (a, b) => {
      if (a.t != null && b.t != null) return a.t - b.t;
      if (a.t != null) return -1;
      if (b.t != null) return 1;
      return b.n - a.n;
    };
    const ranked = competitionRanks(items, cmp);
    return { ranks: ranked.map(({ item, rank }) => ({ uid: item.uid, rank, value: item.t ?? item.n, label: item.t != null ? `${item.t.toFixed(1)} s` : `${item.n} Tipps` })) };
  }

  // ---- Bots ----
  botPlan(bot) {
    const p = botParams(bot.botLevel);
    const tps = (1.5 + 7.5 * p.speed) * (0.88 + 0.24 * Math.random());
    const doneAt = GOAL / tps;
    const ok = doneAt <= this.ctx.duration;
    return { tps, doneAt: ok ? doneAt : this.ctx.duration, final: ok ? { t: r2(doneAt), n: GOAL } : { t: null, n: Math.floor(tps * this.ctx.duration) } };
  }
  botProgress(plan, t) { return Math.min(GOAL, Math.floor(plan.tps * t)); }
  botFinal(plan) { return plan.final; }

  // ---- Zeichnen ----
  render(g, snap, me) {
    const W = 560, H = 330;
    const ps = this.ctx.players;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#7cd4ff'); bg.addColorStop(1, '#bff0ff');
    g.fillStyle = bg; rrect(g, 0, 0, W, H, 18); g.fill();
    const top = 40, laneH = Math.min(46, (H - 96) / ps.length);
    const x0 = 40, x1 = W - 52;
    text(g, `Ziel: ${GOAL} Tipps`, W / 2, 18, { size: 15, color: '#14315c' });
    ps.forEach((p, i) => {
      const y = top + i * laneH + laneH / 2;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.55)';
      g.fillRect(8, y - laneH / 2 + 1, W - 16, laneH - 2);
      checker(g, x1 + 8, y - laneH / 2 + 1, 14, laneH - 2, 7, '#222', '#fff');
      const prog = p.uid === me ? this.taps : (snap.p && snap.p[p.uid]) || 0;
      const x = x0 + (x1 - x0) * clamp(prog / GOAL, 0, 1);
      const isMe = p.uid === me;
      disc(g, x, y, Math.min(15, laneH / 2 - 3), p.colorHex, p.avatar, { ring: isMe ? '#ffe14d' : p.ring });
      if (isMe) arrowDown(g, x, y - laneH / 2 + 1, '#ffe14d', 5);
    });
    const mine = this.fin != null ? `Im Ziel! ${this.fin.toFixed(1)} s` : `${this.taps} / ${GOAL}`;
    text(g, mine, W / 2, H - 38, { size: 30, color: '#fff', stroke: '#14315c', strokeW: 6 });
    text(g, 'Tippe so schnell du kannst!', W / 2, H - 12, { size: 13, color: '#14315c' });
  }
}

export default {
  id: 'tipprennen', name: 'Tipp-Rennen', emoji: '🏁', category: 'Rennen',
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 25,
  view: { w: 560, h: 330 },
  howTo: ['Tippe so schnell du kannst auf den Button.', `Wer zuerst ${GOAL} Tipps schafft, gewinnt.`],
  wertung: 'Zielzeit. Wer nicht ankommt, zählt nach Tipps.',
  create: (ctx) => new TippRennen(ctx),
};
