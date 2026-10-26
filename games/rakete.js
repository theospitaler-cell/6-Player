// 🚀 Raketenstart – Koop! Alle tippen gemeinsam, um die Rakete zu betanken. Schafft ihr den Start in 20 Sekunden?
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';
import { competitionRanks } from '../core/scoring.js';
import { clamp, r1, r2 } from '../core/util.js';

const W = 560, H = 330, MAX_TPS = 12, PER = 85;

class Rakete {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.st = {}; this.bots = {}; this.goal = PER * ctx.players.length; this.total = 0; this.launched = null;
    ctx.players.forEach((p) => { this.st[p.uid] = { last: 0, pending: 0, tokens: 3, taps: 0, act: 0 }; });
  }
  start() { this.running = true; }
  onInput(uid, input) { const s = this.st[uid]; if (!s) return; const n = input.taps | 0; if (n > s.last) { s.pending += n - s.last; s.last = n; } }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    if (this.launched != null) return;
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      s.tokens = Math.min(3, s.tokens + MAX_TPS * dt);
      const take = Math.min(s.pending, Math.floor(s.tokens));
      s.tokens -= take; s.pending = 0;
      s.taps += take; this.total += take; s.act = Math.max(0, take ? 1 : s.act - dt * 4);
    }
    if (this.total >= this.goal) { this.launched = this.t; this.ctx.sfx('fanfare'); this.ctx.vibrate(120); }
  }
  isFinished() { return this.launched != null && this.t > this.launched + 2.5; }
  snapshot() { return { t: r1(this.t), f: r2(Math.min(1, this.total / this.goal)), l: this.launched != null ? r1(this.launched) : -1, p: this.ctx.players.map((p) => this.st[p.uid].taps) }; }
  botThink(bot, snap, dt) {
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { acc: 0, taps: 0 });
    b.acc += (2.5 + 5 * prm.speed) * (0.8 + Math.random() * 0.4) * dt;
    const n = Math.floor(b.acc); b.acc -= n; b.taps += n;
    return { taps: b.taps };
  }
  result() {
    const ok = this.launched != null;
    const items = this.ctx.players.map((p) => ({ uid: p.uid, taps: this.st[p.uid].taps }));
    return { ranks: competitionRanks(items, (a, b) => b.taps - a.taps).map(({ item, rank }) => ({ uid: item.uid, rank, value: item.taps, label: `${item.taps} Tipps · ${ok ? 'Start geglückt 🚀' : 'Absturz 💥'}` })) };
  }
  render(g, snap, me) {
    const ps = this.ctx.players;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b0f3a'); sky.addColorStop(1, '#3a5fb0');
    g.fillStyle = sky; rrect(g, 0, 0, W, H, 18); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 30; i++) g.fillRect((i * 97) % W, (i * 41 + snap.t * (snap.l >= 0 ? 120 : 0)) % (H - 40), 2, 2);
    g.fillStyle = '#2f6b3a'; g.fillRect(0, H - 36, W, 36);
    const launched = snap.l >= 0, lift = launched ? Math.min(300, (snap.t - snap.l) * 130) : 0;
    const rx = 140, ry = H - 110 - lift;
    if (!launched && snap.f > 0.05) { text(g, '🔥', rx, ry + 54, { size: 18 + snap.f * 16 }); }
    if (launched) text(g, '🔥', rx, ry + 62, { size: 40 });
    text(g, '🚀', rx, ry, { size: 70 });
    // Tankanzeige
    g.fillStyle = 'rgba(0,0,0,.4)'; rrect(g, 20, 40, 24, 200, 10); g.fill();
    g.fillStyle = snap.f >= 1 ? '#2fd67b' : '#ffd23f'; const fh = 200 * snap.f; rrect(g, 20, 40 + 200 - fh, 24, Math.max(8, fh), 10); g.fill();
    text(g, `${Math.round(snap.f * 100)} %`, 32, 256, { size: 13 });
    text(g, launched ? 'START! 🎉' : `Noch ${Math.max(0, Math.ceil(20 - snap.t))} s`, W / 2 + 30, 26, { size: 22, color: launched ? '#ffe14d' : '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
    // Beiträge
    const max = Math.max(1, ...snap.p);
    ps.forEach((p, i) => {
      const y = 70 + i * 34;
      text(g, p.avatar, 290, y, { size: 20 });
      g.fillStyle = 'rgba(0,0,0,.35)'; rrect(g, 310, y - 8, 200, 16, 8); g.fill();
      g.fillStyle = p.colorHex; rrect(g, 310, y - 8, Math.max(10, 200 * snap.p[i] / max), 16, 8); g.fill();
      text(g, String(snap.p[i]), 520, y, { size: 13, align: 'left', color: p.uid === me ? '#ffe14d' : '#fff' });
    });
    if (!launched) text(g, 'Alle zusammen: tippt so schnell ihr könnt!', W / 2 + 30, H - 14, { size: 14, color: 'rgba(255,255,255,.85)' });
  }
}

export default {
  id: 'rakete', name: 'Raketenstart', emoji: '🚀', category: 'Koop', tags: ['koop', 'party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'TAP', duration: 20,
  view: { w: W, h: H },
  howTo: ['Alle zusammen: Tippt wie wild, um die Rakete zu betanken!', 'Schafft ihr den Tank in 20 Sekunden, hebt sie ab. Wer am meisten beigetragen hat, bekommt die meisten Punkte.'],
  wertung: 'Rang nach eigenen Tipps (Koop: gemeinsames Ziel!).',
  create: (ctx) => new Rakete(ctx),
};
