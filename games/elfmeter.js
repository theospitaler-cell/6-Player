// 🥅 Elfmeterschießen – Duell. Beide wählen gleichzeitig eine Torecke (Schütze schießt, Torwart springt). Wischen/Tippen auf das Tor.
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';

const W = 560, H = 330, GX = 130, GY = 70, ZW = 100, ZH = 60, KICKS = 5, PICK_T = 7, REVEAL_T = 2.4;
const zoneAt = (x, y) => { const c = Math.floor((x - GX) / ZW), r = Math.floor((y - GY) / ZH); return c < 0 || c > 2 || r < 0 || r > 1 ? -1 : r * 3 + c; };

class Elfmeter {
  constructor(ctx) {
    this.ctx = ctx; this.running = false; this.k = 0; this.ph = 'pick'; this.pt = 0; this.goals = [0, 0]; this.sel = [-1, -1]; this.res = null; this.over = false; this.bots = {}; this.cnt = 0; this.hist = [[], []];
    this.first = ctx.rng() < 0.5 ? 0 : 1; this.lastSnap = null; this.mark = [[], []];
  }
  start() { this.running = true; }
  shooter() { return (this.k % 2 === 0) ? this.first : 1 - this.first; }
  idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  onInput(uid, input) {
    if (!this.running || this.ph !== 'pick') return;
    const i = this.idx(uid), z = input.z | 0;
    if (i < 0 || z < 0 || z > 5 || this.sel[i] !== -1) return;
    this.sel[i] = z;
    if (this.sel[0] !== -1 && this.sel[1] !== -1) this.reveal();
  }
  reveal() {
    const sh = this.shooter(), ke = 1 - sh;
    for (let i = 0; i < 2; i++) if (this.sel[i] === -1) this.sel[i] = Math.floor(Math.random() * 6);
    const saved = this.sel[sh] === this.sel[ke];
    if (!saved) this.goals[sh]++;
    this.mark[sh].push(saved ? 0 : 1);
    this.hist[sh].push(this.sel[sh]); this.hist[ke].push(this.sel[ke]);
    this.res = { sh, shot: this.sel[sh], dive: this.sel[ke], goal: !saved };
    this.ph = 'reveal'; this.pt = 0; this.ctx.sfx(saved ? 'error' : 'win'); this.ctx.vibrate(40);
    this.k++;
    // Entscheidung?
    const done = [Math.ceil(this.k / 2), Math.floor(this.k / 2)]; // Anzahl Schüsse des first / second
    const kicks = [this.first === 0 ? done[0] : done[1], this.first === 1 ? done[0] : done[1]];
    const rem = [KICKS - kicks[0], KICKS - kicks[1]];
    if (this.k >= KICKS * 2) { if (this.k % 2 === 0 && this.goals[0] !== this.goals[1]) this.over = true; }
    else if (this.goals[0] > this.goals[1] + Math.max(0, rem[1]) || this.goals[1] > this.goals[0] + Math.max(0, rem[0])) this.over = true;
  }
  update(dt) {
    if (!this.running) return;
    this.pt += dt;
    if (this.ph === 'pick' && this.pt >= PICK_T) this.reveal();
    else if (this.ph === 'reveal' && this.pt >= REVEAL_T && !this.over) { this.ph = 'pick'; this.pt = 0; this.sel = [-1, -1]; this.res = null; this.bots = {}; }
  }
  isFinished() { return this.over && this.ph === 'reveal' && this.pt >= REVEAL_T; }
  snapshot() { return { ph: this.ph, k: this.k, sh: this.shooter(), g: this.goals.slice(), ch: this.sel.map((z) => (z >= 0 ? 1 : 0)), tl: Math.ceil(Math.max(0, PICK_T - this.pt)), r: this.ph === 'reveal' ? this.res : null, m: this.mark, o: this.over ? 1 : 0 }; }
  botThink(bot, snap, dt) {
    const i = this.idx(bot.uid);
    if (this.ph !== 'pick' || this.sel[i] !== -1) return null;
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { wait: 0.8 + Math.random() * 2.5, t: 0 });
    st.t += dt; if (st.t < st.wait) return null;
    const prm = botParams(bot.botLevel);
    const isShooter = this.shooter() === i;
    const corners = [0, 2, 3, 5];
    let z = Math.random() < 0.7 ? corners[Math.floor(Math.random() * 4)] : Math.floor(Math.random() * 6);
    const oh = this.hist[1 - i];
    if (!isShooter && oh.length >= 2 && Math.random() < prm.aim * 0.5) { // Torwart: häufigste Ecke des Gegners
      const cnt = {}; oh.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; }); z = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]);
    }
    return { z };
  }
  result() {
    const [a, b] = this.ctx.players, g0 = this.goals[0], g1 = this.goals[1];
    const lab = (i) => `${this.goals[i]} Tore`;
    if (g0 === g1) return { ranks: [{ uid: a.uid, rank: 1, value: g0, label: lab(0) }, { uid: b.uid, rank: 1, value: g1, label: lab(1) }] };
    const w = g0 > g1 ? 0 : 1;
    return { ranks: [{ uid: this.ctx.players[w].uid, rank: 1, value: this.goals[w], label: lab(w) }, { uid: this.ctx.players[1 - w].uid, rank: 2, value: this.goals[1 - w], label: lab(1 - w) }] };
  }
  // Tor antippen / dorthin wischen (die Zielecke ist da, wo der Finger loslässt)
  onPointer(type, x, y) {
    if (type !== 'up' && type !== 'down') return;
    const z = zoneAt(x, y);
    if (type === 'down') { this.dragZ = z; return; }
    const zz = z >= 0 ? z : this.dragZ;
    if (zz >= 0) this.ctx.send({ z: zz, n: ++this.cnt });
  }
  render(g, snap, me) {
    this.lastSnap = snap;
    const ps = this.ctx.players, my = ps.findIndex((p) => p.uid === me);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#74c4ff'); sky.addColorStop(0.55, '#c9ecff'); sky.addColorStop(0.56, '#3f9a4f'); sky.addColorStop(1, '#2c7a3b');
    g.fillStyle = sky; rrect(g, 0, 0, W, H, 18); g.fill();
    // Tor
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(GX, GY, ZW * 3, ZH * 2);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
    for (let c = 1; c < 3; c++) { g.beginPath(); g.moveTo(GX + c * ZW, GY); g.lineTo(GX + c * ZW, GY + ZH * 2); g.stroke(); }
    g.beginPath(); g.moveTo(GX, GY + ZH); g.lineTo(GX + ZW * 3, GY + ZH); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.strokeRect(GX, GY, ZW * 3, ZH * 2);
    const mine = my >= 0 && !snap.o && snap.ph === 'pick' && snap.ch[my] === 0;
    const r = snap.r;
    if (mine) { for (let z = 0; z < 6; z++) { g.fillStyle = 'rgba(255,225,77,.12)'; g.fillRect(GX + (z % 3) * ZW + 2, GY + Math.floor(z / 3) * ZH + 2, ZW - 4, ZH - 4); } }
    const zc = (z) => [GX + (z % 3) * ZW + ZW / 2, GY + Math.floor(z / 3) * ZH + ZH / 2];
    if (r) {
      const [dx, dy] = zc(r.dive); text(g, '🧤', dx, dy, { size: 52 });
      const [sx, sy] = zc(r.shot); text(g, '⚽', sx, sy + (r.goal ? 0 : 6), { size: 30 });
      text(g, r.goal ? 'TOOOR!' : 'GEHALTEN!', W / 2, 232, { size: 34, color: r.goal ? '#ffe14d' : '#ff9bb0', stroke: 'rgba(0,0,0,.6)', strokeW: 7 });
    } else { text(g, '🧤', GX + ZW * 1.5, GY + ZH, { size: 44 }); text(g, '⚽', W / 2, 290, { size: 34 }); }
    // Spieler & Stand
    ps.forEach((p, i) => {
      const x = i === 0 ? 62 : W - 62;
      disc(g, x, 100, 24, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      text(g, p.name.slice(0, 9), x, 138, { size: 13, color: p.uid === me ? '#ffe14d' : '#fff' });
      text(g, String(snap.g[i]), x, 170, { size: 34, color: '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
      text(g, snap.sh === i ? '⚽ Schütze' : '🧤 Torwart', x, 196, { size: 12, color: '#ffe14d' });
      let dots = ''; for (let k = 0; k < KICKS; k++) dots += snap.m[i][k] === undefined ? '○' : snap.m[i][k] ? '●' : '✕';
      text(g, dots, x, 214, { size: 13, color: '#fff' });
    });
    let msg = '';
    if (snap.o && snap.ph === 'reveal') msg = snap.g[0] === snap.g[1] ? 'Unentschieden!' : `${ps[snap.g[0] > snap.g[1] ? 0 : 1].name} gewinnt!`;
    else if (snap.ph === 'pick') msg = my < 0 ? 'Beide wählen …' : (snap.ch[my] ? 'Gewählt – warte …' : (snap.sh === my ? `Schieß in eine Ecke! ⏱ ${snap.tl}` : `Spring in eine Ecke! ⏱ ${snap.tl}`));
    if (msg) text(g, msg, W / 2, 34, { size: 18, color: '#14315c', stroke: 'rgba(255,255,255,.6)', strokeW: 5 });
  }
}

export default {
  id: 'elfmeter', name: 'Elfmeter', emoji: '🥅', category: 'Sport', tags: ['sport'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'SWIPE', pointer: true, ctlWidth: 0, duration: 130,
  view: { w: W, h: H },
  howTo: ['Wischt oder tippt auf eine der 6 Torecken. Der Schütze schießt dorthin, der Torwart springt dorthin – beide gleichzeitig!', '5 Schüsse pro Spieler. Trefft ihr verschiedene Ecken, ist es ein Tor.'],
  wertung: 'Mehr Tore gewinnt. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new Elfmeter(ctx),
};
