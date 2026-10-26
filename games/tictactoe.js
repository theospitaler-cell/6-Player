// ❌⭕ Tic-Tac-Toe – Duell, Züge werden vom Host geprüft.
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';

const MOVE_TIME = 9;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const BX = 150, BY = 12, CELL = 100; // Brett-Position im Canvas (600×350)

const winnerOf = (b) => { for (const l of LINES) if (b[l[0]] > -1 && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { w: b[l[0]], line: l }; return null; };

/** Minimax (perfekt) – Bots machen je nach Stufe Fehler. */
function best(b, me) {
  const other = 1 - me;
  const score = (bd, turn, depth) => {
    const w = winnerOf(bd);
    if (w) return w.w === me ? 10 - depth : depth - 10;
    if (bd.every((x) => x > -1)) return 0;
    let res = turn === me ? -99 : 99;
    for (let i = 0; i < 9; i++) {
      if (bd[i] > -1) continue;
      bd[i] = turn;
      const s = score(bd, 1 - turn, depth + 1);
      bd[i] = -1;
      res = turn === me ? Math.max(res, s) : Math.min(res, s);
    }
    return res;
  };
  let bestMove = -1, bestS = -99;
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (b[i] > -1) continue;
    b[i] = me;
    const s = score(b, other, 1);
    b[i] = -1;
    if (s > bestS) { bestS = s; moves.length = 0; }
    if (s === bestS) moves.push(i);
  }
  bestMove = moves[Math.floor(Math.random() * moves.length)];
  return bestMove;
}

class TicTacToe {
  constructor(ctx) {
    this.ctx = ctx;
    this.b = Array(9).fill(-1);
    this.turn = ctx.rng() < 0.5 ? 0 : 1;
    this.tl = MOVE_TIME; this.running = false; this.over = false; this.winner = -1; this.line = null; this.draw = false;
    this.bots = {}; this.cnt = 0;
  }
  start() { this.running = true; this.tl = MOVE_TIME; }
  _idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  _place(k) {
    this.b[k] = this.turn;
    const w = winnerOf(this.b);
    if (w) { this.over = true; this.winner = w.w; this.line = w.line; }
    else if (this.b.every((x) => x > -1)) { this.over = true; this.draw = true; }
    else { this.turn = 1 - this.turn; this.tl = MOVE_TIME; }
    this.ctx.sfx(this.over ? 'win' : 'pop');
  }
  onInput(uid, input) {
    if (!this.running || this.over) return;
    if (this._idx(uid) !== this.turn) return;
    const k = input.cell | 0;
    if (k < 0 || k > 8 || this.b[k] !== -1) return;
    this._place(k);
  }
  update(dt) {
    if (!this.running || this.over) return;
    this.tl -= dt;
    if (this.tl <= 0) { // Zeit abgelaufen → Zufallszug
      const free = this.b.map((x, i) => (x === -1 ? i : -1)).filter((i) => i >= 0);
      this._place(free[Math.floor(Math.random() * free.length)]);
    }
  }
  isFinished() { return this.over; }
  snapshot() { return { b: this.b.slice(), t: this.turn, w: this.winner, l: this.line || [], d: this.draw ? 1 : 0, o: this.over ? 1 : 0, tl: Math.ceil(Math.max(0, this.tl)) }; }

  botThink(bot, snap, dt) {
    if (this.over) return null;
    const idx = this._idx(bot.uid);
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { bt: 0, wait: 0 }); // je Bot ein eigener Denk-Timer
    if (idx !== this.turn) { st.bt = 0; st.wait = 0; return null; }
    const p = botParams(bot.botLevel);
    if (!st.wait) st.wait = 0.5 + p.react * 3 * Math.random();
    st.bt += dt;
    if (st.bt < st.wait) return null;
    st.bt = 0; st.wait = 0;
    const free = this.b.map((x, i) => (x === -1 ? i : -1)).filter((i) => i >= 0);
    const k = Math.random() < p.err * 2.2 ? free[Math.floor(Math.random() * free.length)] : best(this.b.slice(), idx);
    return { cell: k };
  }

  result() {
    const [a, b] = this.ctx.players;
    if (this.winner < 0) return { ranks: [{ uid: a.uid, rank: 1, label: 'Unentschieden' }, { uid: b.uid, rank: 1, label: 'Unentschieden' }] };
    const win = this.ctx.players[this.winner], lose = this.ctx.players[1 - this.winner];
    return { ranks: [{ uid: win.uid, rank: 1, label: 'Sieg' }, { uid: lose.uid, rank: 2, label: 'Niederlage' }] };
  }

  // Tipp auf das Spielfeld → Eingabe an den Host
  onPointer(type, x, y) {
    if (type !== 'down') return;
    const cx = Math.floor((x - BX) / CELL), cy = Math.floor((y - BY) / CELL);
    if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return;
    this.ctx.send({ cell: cy * 3 + cx, n: ++this.cnt });
  }
  render(g, snap, me) {
    const W = 600, H = 350;
    const ps = this.ctx.players;
    const myIdx = this._idx(me);
    g.fillStyle = '#23356b'; rrect(g, 0, 0, W, H, 18); g.fill();
    // Spieler links (✕) und rechts (○)
    ps.forEach((p, i) => {
      const x = i === 0 ? 75 : W - 75, active = !snap.o && snap.t === i;
      if (active) { g.fillStyle = 'rgba(255,225,77,.25)'; rrect(g, x - 64, 60, 128, 190, 16); g.fill(); }
      disc(g, x, 112, 28, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      text(g, i === 0 ? '✕' : '○', x, 172, { size: 38, color: i === 0 ? '#ff7a95' : '#7ab6ff' });
      text(g, p.name.slice(0, 11), x, 212, { size: 14, color: p.uid === me ? '#ffe14d' : '#fff' });
      if (active) text(g, `⏱ ${snap.tl}`, x, 236, { size: 16, color: snap.tl <= 3 ? '#ff7a95' : '#ffe14d' });
    });
    // Brett
    g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6;
    for (let k = 1; k < 3; k++) {
      g.beginPath(); g.moveTo(BX + k * CELL, BY + 6); g.lineTo(BX + k * CELL, BY + 3 * CELL - 6); g.stroke();
      g.beginPath(); g.moveTo(BX + 6, BY + k * CELL); g.lineTo(BX + 3 * CELL - 6, BY + k * CELL); g.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const v = snap.b[i];
      if (v < 0) continue;
      const cx = BX + (i % 3) * CELL + CELL / 2, cy = BY + Math.floor(i / 3) * CELL + CELL / 2;
      const win = snap.l && snap.l.includes(i);
      g.lineWidth = 11;
      if (v === 0) {
        g.strokeStyle = win ? '#ffe14d' : '#ff7a95';
        g.beginPath(); g.moveTo(cx - 26, cy - 26); g.lineTo(cx + 26, cy + 26); g.moveTo(cx + 26, cy - 26); g.lineTo(cx - 26, cy + 26); g.stroke();
      } else {
        g.strokeStyle = win ? '#ffe14d' : '#7ab6ff';
        g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2); g.stroke();
      }
    }
    // Statuszeile
    let msg = '', col = '#ffe14d';
    if (snap.o) {
      if (snap.w < 0) msg = 'Unentschieden!';
      else msg = myIdx < 0 ? `${ps[snap.w].avatar} ${ps[snap.w].name} gewinnt!` : (snap.w === myIdx ? 'Du hast gewonnen! 🎉' : 'Verloren …');
    } else if (myIdx < 0) { msg = 'Du schaust zu 👀'; col = '#fff'; }
    else msg = snap.t === myIdx ? 'Du bist dran – tippe auf ein Feld!' : 'Der Gegner überlegt …';
    text(g, msg, W / 2, H - 20, { size: 19, color: col, stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
  }
}

export default {
  id: 'tictactoe', name: 'Tic-Tac-Toe', emoji: '❌', category: 'Brett',
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'PICK', pointer: true, ctlWidth: 0, duration: 90,
  view: { w: 600, h: 350 },
  howTo: ['Setze drei Zeichen in eine Reihe – waagerecht, senkrecht oder diagonal.', 'Pro Zug hast du 9 Sekunden. Duell: Es spielen die zwei mit den wenigsten Punkten.'],
  wertung: 'Sieger Platz 1, Verlierer Platz 2, sonst Unentschieden. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new TicTacToe(ctx),
};
