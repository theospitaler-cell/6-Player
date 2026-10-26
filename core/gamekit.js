// Baukasten für Spiele: gemeinsame Basis für „lokale“ Spiele, Rang-Helfer, Bot-Können.
import { competitionRanks } from './scoring.js';
import { clamp } from './util.js';

/** Bot-Können 0..1 je Stufe (mit etwas Streuung pro Bot). */
export function skillOf(level, rng = Math.random) {
  const base = { leicht: 0.36, mittel: 0.6, schwer: 0.84 }[level] ?? 0.6;
  return clamp(base * (0.86 + 0.28 * rng()), 0.12, 0.99);
}

/**
 * Ränge aus einer Wertung. score(p) → Zahl, höher = besser. eps = Toleranz für „gleich“.
 * label(p, score) / value(p, score) optional.
 */
export function rankByScore(players, score, { eps = 0, label, value } = {}) {
  const items = players.map((p) => ({ uid: p.uid, s: score(p) }));
  const ranked = competitionRanks(items, (a, b) => (Math.abs(a.s - b.s) <= eps ? 0 : b.s - a.s));
  return ranked.map(({ item, rank }) => ({
    uid: item.uid, rank, value: value ? value(item.uid, item.s) : item.s, label: label ? label(item.uid, item.s) : String(Math.round(item.s * 10) / 10),
  }));
}

/** Team-Ergebnis: scores = [punkteTeam0, punkteTeam1] (höher gewinnt, gleich = Unentschieden). */
export function teamResult(ctx, scores, label = (win, s) => (win === 'draw' ? 'Unentschieden' : win ? 'Sieg' : 'Niederlage')) {
  const [a, b] = scores;
  const w = a === b ? 'draw' : (a > b ? 0 : 1);
  const teamRanks = w === 'draw' ? [{ team: 0, rank: 1 }, { team: 1, rank: 1 }] : [{ team: w, rank: 1 }, { team: 1 - w, rank: 2 }];
  const rk = (team) => teamRanks.find((t) => t.team === team).rank;
  const ranks = ctx.players.map((p) => ({ uid: p.uid, rank: rk(p.team), value: scores[p.team], label: label(w === 'draw' ? 'draw' : w === p.team, scores[p.team]) + ` (${a}:${b})` }));
  return { ranks, teamRanks };
}

/** Wertung nach „Ausscheiden“: später ausgeschieden = besser. out = {uid: zeit|null (null = noch dabei)}, tie = Toleranz. */
export function rankSurvival(players, out, { alive = (p) => 0, tie = 0.05, label } = {}) {
  const items = players.map((p) => ({ uid: p.uid, alive: out[p.uid] == null, t: out[p.uid] == null ? Infinity : out[p.uid], extra: alive(p) }));
  const cmp = (a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.alive) return Math.abs(a.extra - b.extra) < 1e-9 ? 0 : b.extra - a.extra;
    return Math.abs(a.t - b.t) <= tie ? 0 : b.t - a.t;
  };
  return competitionRanks(items, cmp).map(({ item, rank }) => ({
    uid: item.uid, rank, value: item.alive ? 999 : Math.round(item.t * 10) / 10,
    label: label ? label(item) : (item.alive ? 'Überlebt' : `raus nach ${Math.round(item.t)} s`),
  }));
}

/**
 * Basis für „lokale“ Spiele: jedes Gerät spielt sein eigenes Feld (gleicher Seed) und meldet das Ergebnis.
 * Unterklasse implementiert: payload(), clean(d), empty(), compare(a,b), value(sub), label(sub), botResult(sk),
 * optional: tick(dt), onStart(), score() (Live-Fortschritt), progressOf(sub).
 */
export class LocalGame {
  constructor(ctx) { this.ctx = ctx; this.t = 0; this.running = false; this.sent = false; this.subs = {}; }
  start() { this.running = true; this.onStart && this.onStart(); }
  update(dt) { if (!this.running) return; this.t += dt; this.tick && this.tick(dt); }
  timeUp() { this.running = false; this.finish(); }
  finish() { if (this.sent) return; this.sent = true; this.running = false; this.ctx.submit(this.payload()); }
  progress() { return this.score ? this.score() : 0; }
  get left() { return Math.max(0, this.ctx.duration - this.t); }

  // ---- Host ----
  onSubmit(uid, d) { try { this.subs[uid] = this.clean(d); } catch { this.subs[uid] = this.empty(); } }
  result() {
    const items = this.ctx.players.map((p) => ({ uid: p.uid, sub: this.subs[p.uid] || this.empty() }));
    const ranked = competitionRanks(items, (a, b) => this.compare(a.sub, b.sub));
    return { ranks: ranked.map(({ item, rank }) => ({ uid: item.uid, rank, value: this.value(item.sub), label: this.label(item.sub) })) };
  }

  // ---- Bots ----
  botPlan(bot) {
    const sk = skillOf(bot.botLevel);
    const final = this.botResult(sk, bot);
    return { final, prog: this.progressOf(final), doneAt: this.ctx.duration };
  }
  botProgress(plan, t) { return Math.floor(plan.prog * clamp(t / this.ctx.duration, 0, 1)); }
  botFinal(plan) { return plan.final; }
  progressOf(sub) { return Number(this.value(sub)) || 0; }
}

import { text, rrect } from './draw.js';
/**
 * Kleine Live-Rangliste für lokale Spiele (Fortschritt der anderen kommt aus snap.p).
 * mine = eigener Wert; box = {x, y, w}; fmt(v) formatiert die Zahl.
 */
export function liveBoard(g, ctx, snap, me, mine, { x = 0, y = 0, w = 150, row = 22, fmt = (v) => String(v), title = null } = {}) {
  const list = ctx.players.map((p) => ({ p, v: p.uid === me ? mine : ((snap.p && snap.p[p.uid]) || 0) })).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...list.map((e) => e.v));
  let yy = y;
  if (title) { text(g, title, x + w / 2, yy + 8, { size: 12, color: 'rgba(255,255,255,.75)' }); yy += 18; }
  list.forEach((e) => {
    const isMe = e.p.uid === me;
    g.fillStyle = isMe ? 'rgba(255,225,77,.22)' : 'rgba(0,0,0,.28)'; rrect(g, x, yy, w, row - 3, 8); g.fill();
    g.fillStyle = e.p.colorHex; rrect(g, x + 26, yy + 4, Math.max(4, (w - 70) * e.v / max), row - 11, 4); g.fill();
    text(g, e.p.avatar, x + 13, yy + (row - 3) / 2, { size: Math.min(15, row - 6) });
    text(g, fmt(e.v), x + w - 6, yy + (row - 3) / 2, { size: 12, align: 'right', color: isMe ? '#ffe14d' : '#fff' });
    yy += row;
  });
  return yy;
}
