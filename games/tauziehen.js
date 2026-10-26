// 🪢 Tauziehen – Team-Spiel, vom Host simuliert. Jeder Tipp zieht das Seil zur eigenen Seite.
import { text, rrect, disc, arrowDown, ip } from '../core/draw.js';
import { clamp, r2, r3 } from '../core/util.js';
import { TEAM_COLORS } from '../core/state.js';
import { botParams } from '../core/bots.js';

const MAX_TPS = 12;    // Anti-Cheat: höchstens 12 Tipps/s pro Spieler zählen
const IMPULSE = 0.03;  // Seilbewegung je Tipp (geteilt durch Teamgröße → faire Ungleichgewichte)

class Tauziehen {
  constructor(ctx) {
    this.ctx = ctx;
    this.x = 0; this.running = false; this.over = false; this.winner = null;
    this.size = [0, 0];
    ctx.players.forEach((p) => { this.size[p.team]++; });
    this.st = {}; this.bots = {};
    ctx.players.forEach((p) => { this.st[p.uid] = { last: 0, pending: 0, tokens: 3, act: 0 }; });
  }
  start() { this.running = true; }
  onInput(uid, input) {
    const s = this.st[uid];
    if (!s) return;
    const n = input.taps | 0;
    if (n > s.last) { s.pending += n - s.last; s.last = n; }
  }
  update(dt) {
    if (!this.running || this.over) return;
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      s.tokens = Math.min(3, s.tokens + MAX_TPS * dt);
      const take = Math.min(s.pending, Math.floor(s.tokens));
      s.tokens -= take; s.pending = 0; // überzählige Tipps verfallen
      if (take > 0) {
        this.x += (p.team === 0 ? -1 : 1) * (IMPULSE / this.size[p.team]) * take;
        s.act = Math.min(1, s.act + 0.3 * take);
      }
      s.act = Math.max(0, s.act - dt * 3);
    }
    this.x = clamp(this.x, -1, 1);
    if (this.x <= -1) { this.over = true; this.winner = 0; }
    else if (this.x >= 1) { this.over = true; this.winner = 1; }
  }
  isFinished() { return this.over; }
  snapshot() { return { x: r3(this.x), a: this.ctx.players.map((p) => r2(this.st[p.uid].act)) }; }

  botThink(bot, snap, dt) {
    const p = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { acc: 0, taps: 0, f: 1, ft: 0 });
    b.ft -= dt;
    if (b.ft <= 0) { b.f = 0.75 + Math.random() * 0.5; b.ft = 0.8 + Math.random(); }
    b.acc += (2.5 + 5.5 * p.speed) * b.f * dt;
    const n = Math.floor(b.acc);
    b.acc -= n; b.taps += n;
    return { taps: b.taps };
  }

  result() {
    const w = this.winner != null ? this.winner : (Math.abs(this.x) < 0.005 ? 'draw' : (this.x < 0 ? 0 : 1));
    const teamRanks = w === 'draw' ? [{ team: 0, rank: 1 }, { team: 1, rank: 1 }] : [{ team: w, rank: 1 }, { team: 1 - w, rank: 2 }];
    const t = (team) => teamRanks.find((x) => x.team === team).rank;
    const ranks = this.ctx.players.map((p) => ({ uid: p.uid, rank: t(p.team), value: r2(this.x), label: t(p.team) === 1 ? (w === 'draw' ? 'Unentschieden' : 'Sieg') : 'Niederlage' }));
    return { ranks, teamRanks };
  }

  render(g, snap, me, alpha, prev) {
    const W = 560, H = 320;
    const x = ip(prev && prev.x, snap.x, alpha);
    g.fillStyle = '#9be36b'; rrect(g, 0, 0, W, H, 18); g.fill();
    // Team-Zonen
    g.fillStyle = 'rgba(255,77,109,.28)'; g.fillRect(0, 0, W / 2, H);
    g.fillStyle = 'rgba(61,139,255,.28)'; g.fillRect(W / 2, 0, W / 2, H);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(W / 2 - 1.5, 0, 3, H);
    const L = 70, R = W - 70, cy = 142, range = (R - L) / 2 - 8;
    // Siegmarken
    for (const sx of [W / 2 - range, W / 2 + range]) { g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(sx - 1.5, cy - 40, 3, 80); }
    // Seil
    const kx = W / 2 + x * range;
    g.lineCap = 'round';
    g.strokeStyle = '#7a4a1e'; g.lineWidth = 9;
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const px = 20 + (W - 40) * i / 40, py = cy + Math.sin(i * 0.9) * 1.6; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
    g.strokeStyle = '#c8924a'; g.lineWidth = 4; g.setLineDash([6, 8]);
    g.beginPath(); g.moveTo(20, cy); g.lineTo(W - 20, cy); g.stroke(); g.setLineDash([]);
    // Fahne am Knoten
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#8a5a00'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(kx, cy - 38); g.lineTo(kx + 22, cy - 26); g.lineTo(kx, cy - 14); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#8a5a00'; g.lineWidth = 3; g.beginPath(); g.moveTo(kx, cy - 40); g.lineTo(kx, cy + 8); g.stroke();
    // Spieler pro Team
    const ps = this.ctx.players;
    [0, 1].forEach((team) => {
      const mem = ps.map((p, i) => ({ p, i })).filter((o) => o.p.team === team);
      mem.forEach((o, k) => {
        const act = ip(prev && prev.a[o.i], snap.a[o.i], alpha) || 0;
        const baseX = team === 0 ? 34 + k * 40 : W - 34 - k * 40;
        const bob = Math.sin(performance.now() / 70 + k) * 4 * act;
        const y = cy + 74 + (k % 2) * 4 + bob;
        disc(g, baseX, y, 16, o.p.colorHex, o.p.avatar, { ring: o.p.uid === me ? '#ffe14d' : TEAM_COLORS[team].hex });
        if (o.p.uid === me) arrowDown(g, baseX, y - 22, '#ffe14d', 5);
      });
      text(g, TEAM_COLORS[team].name, team === 0 ? 14 : W - 14, 22, { size: 15, align: team === 0 ? 'left' : 'right', color: '#fff', stroke: 'rgba(0,0,0,.45)', strokeW: 4 });
    });
    text(g, '← zieh zu deiner Seite!', W / 2, H - 16, { size: 13, color: 'rgba(0,0,0,.55)' });
  }
}

export default {
  id: 'tauziehen', name: 'Tauziehen', emoji: '🪢', category: 'Sport',
  min: 2, max: 6, teams: 'only', duel: false, humansOnly: false,
  sync: 'host', controls: 'TAP', duration: 30,
  view: { w: 560, h: 320 },
  howTo: ['Zwei Teams ziehen am Seil – tippe so schnell du kannst!', 'Wer das Seil auf seine Seite zieht (oder am Ende vorne liegt), gewinnt.'],
  wertung: 'Siegerteam Platz 1, Verlierer Platz 2. Alle im Team bekommen dieselben Punkte.',
  create: (ctx) => new Tauziehen(ctx),
};
