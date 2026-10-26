// Logik-Tests ohne Browser: Spiele mit Bots simulieren und einen ganzen Cup über den Host-Treiber spielen.
import assert from 'node:assert/strict';
import { mulberry32 } from '../core/util.js';
import schubser from '../games/schubser.js';
import tauziehen from '../games/tauziehen.js';
import tictactoe from '../games/tictactoe.js';
import tipprennen from '../games/tipprennen.js';
import schnell from '../games/schnellzieher.js';
import mathe, { taskAt } from '../games/matheblitz.js';
import { GAMES } from '../games/registry.js';
import { LocalTransport } from '../core/transport.js';
import { Room } from '../core/room.js';
import { HostDriver } from '../core/host.js';
import { toList } from '../core/room.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

function mkCtx(game, count, { seed = 1, teams = false, level = 'mittel' } = {}) {
  const players = Array.from({ length: count }, (_, i) => ({
    uid: 'p' + i, idx: i, name: 'P' + i, avatar: '🙂', color: 'red', colorHex: '#f00', isBot: true, botLevel: level, team: teams ? i % 2 : null,
  }));
  return {
    game, players, byUid: Object.fromEntries(players.map((p) => [p.uid, p])), me: 'p0', isHost: true, seed, rng: mulberry32(seed),
    settings: {}, duration: game.duration, serverNow: () => Date.now(), now: () => performance.now(), sfx() {}, vibrate() {}, submit() {},
  };
}
/** Spielt ein Host-Spiel nur mit Bots durch. Gibt { t, result } zurück. */
function simulate(game, count, opts) {
  const ctx = mkCtx(game, count, opts);
  const inst = game.create(ctx);
  inst.start();
  let time = 0, acc = 0;
  while (time < game.duration + 1) {
    acc += 1 / 60;
    if (acc >= 0.05) {
      const snap = inst.snapshot();
      for (const p of ctx.players) { const inp = inst.botThink(p, snap, acc); if (inp) inst.onInput(p.uid, inp); }
      acc = 0;
    }
    inst.update(1 / 60);
    time += 1 / 60;
    if (inst.isFinished && inst.isFinished()) break;
  }
  return { t: time, result: inst.result(), inst, ctx };
}

await t('Schubser: Bots überleben eine Weile und das Spiel endet mit klarem Sieger', () => {
  const times = [];
  for (let seed = 1; seed <= 12; seed++) {
    const { t: dur, result } = simulate(schubser, 4, { seed });
    times.push(dur);
    assert.equal(result.ranks.filter((r) => r.rank === 1).length >= 1, true);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`    Ø Spieldauer ${avg.toFixed(1)} s (min ${Math.min(...times).toFixed(1)}, max ${Math.max(...times).toFixed(1)})`);
  assert.ok(avg > 8, 'Runden sind zu kurz: ' + avg);
});

await t('Tauziehen: gleich starke Bots → ausgeglichen, Team mit mehr Tipps gewinnt', () => {
  const r = simulate(tauziehen, 4, { seed: 3, teams: true });
  assert.equal(r.result.ranks.length, 4);
  assert.ok(Math.abs(r.inst.x) < 0.9);
  // Team 0 tippt doppelt so schnell (10 vs. 5 Tipps/s, beide unter dem Limit)
  const ctx = mkCtx(tauziehen, 2, { teams: true });
  const inst = tauziehen.create(ctx); inst.start();
  let a = 0, b = 0;
  for (let i = 0; i < 600; i++) { if (i % 6 === 0) a += 1; if (i % 12 === 0) b += 1; inst.onInput('p0', { taps: a }); inst.onInput('p1', { taps: b }); inst.update(1 / 60); }
  assert.ok(inst.x < -0.1, 'Team 0 (links, x<0) sollte vorne liegen: ' + inst.x);
  assert.equal(inst.result().ranks.find((x) => x.uid === 'p0').rank, 1);
});

await t('Tauziehen: Anti-Cheat begrenzt auf 12 Tipps/s', () => {
  const ctx = mkCtx(tauziehen, 2, { teams: true });
  const inst = tauziehen.create(ctx); inst.start();
  inst.onInput('p0', { taps: 1000 });
  for (let i = 0; i < 60; i++) inst.update(1 / 60); // 1 Sekunde
  assert.ok(Math.abs(inst.x) <= 12 * 0.03 + 0.2, 'zu viele Tipps gezählt: ' + inst.x);
});

await t('Tic-Tac-Toe: starke Bots spielen öfter remis als schwache, Ränge sind gültig', () => {
  const draws = (level) => {
    let d = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate(tictactoe, 2, { seed, level });
      const ranks = r.result.ranks.map((x) => x.rank);
      if (ranks[0] === ranks[1]) { d++; assert.deepEqual(ranks, [1, 1]); } else assert.deepEqual(ranks.slice().sort(), [1, 2]);
    }
    return d;
  };
  const hard = draws('schwer'), easy = draws('leicht');
  console.log(`    Remis: schwer ${hard}/40, leicht ${easy}/40`);
  assert.ok(hard > easy + 4, 'schwere Bots sollten deutlich öfter remis spielen');
});

await t('Tic-Tac-Toe: nur der Spieler am Zug darf setzen, belegte Felder werden abgelehnt', () => {
  const ctx = mkCtx(tictactoe, 2, { seed: 5 });
  const inst = tictactoe.create(ctx); inst.start();
  const first = inst.turn, other = 1 - first;
  inst.onInput('p' + other, { cell: 0 });
  assert.equal(inst.b[0], -1);
  inst.onInput('p' + first, { cell: 0 });
  assert.equal(inst.b[0], first);
  inst.onInput('p' + other, { cell: 0 });
  assert.equal(inst.b[0], first);
});

await t('Mathe-Blitz: gleiche Aufgaben für alle, genau eine richtige Antwort, vier verschiedene Optionen', () => {
  for (let i = 0; i < 40; i++) {
    const a = taskAt(777, i), b = taskAt(777, i);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.opts).size, 4);
    assert.equal(a.opts[a.correct], a.ans);
    assert.ok(a.opts.every((o) => o >= 0));
  }
});

await t('Tipp-Rennen & Schnellzieher & Mathe: Host weist unmögliche Ergebnisse ab', () => {
  const c1 = mkCtx(tipprennen, 2); const g1 = tipprennen.create(c1);
  g1.onSubmit('p0', { t: 1.0, n: 70 }); g1.onSubmit('p1', { t: 12.0, n: 70 });
  assert.equal(g1.result().ranks.find((r) => r.uid === 'p1').rank, 1, '1 s für 70 Tipps ist unmöglich');
  const c2 = mkCtx(schnell, 2); const g2 = schnell.create(c2);
  g2.onSubmit('p0', { r: [20, 30, 40] }); g2.onSubmit('p1', { r: [300, 320, 280] });
  assert.equal(g2.result().ranks.find((r) => r.uid === 'p1').rank, 1, 'Reaktion < 80 ms ist unmöglich');
  const c3 = mkCtx(mathe, 2); const g3 = mathe.create(c3);
  g3.onSubmit('p0', { c: 9999, w: 0 }); g3.onSubmit('p1', { c: 12, w: 1 });
  assert.ok(g3.subs.p0.c <= Math.floor(30 / 0.35) + 2, 'Antwortrate wird gedeckelt');
});

await t('Bots in lokalen Spielen liefern Plan, Fortschritt und Endergebnis', () => {
  for (const game of [tipprennen, schnell, mathe]) {
    const ctx = mkCtx(game, 3); const inst = game.create(ctx);
    const plan = inst.botPlan(ctx.players[0]);
    assert.ok(plan.doneAt > 0 && plan.doneAt <= game.duration + 0.01, game.id + ' doneAt ' + plan.doneAt);
    assert.ok(inst.botProgress(plan, 1) >= 0);
    inst.onSubmit('p0', inst.botFinal(plan));
    assert.ok(inst.result().ranks.length === 3);
  }
});

await t('Registry: alle Spiele haben die Pflichtfelder', () => {
  for (const g of GAMES) {
    for (const k of ['id', 'name', 'emoji', 'category', 'min', 'max', 'teams', 'duel', 'sync', 'controls', 'duration', 'howTo', 'view', 'create']) assert.ok(g[k] !== undefined, `${g.id}.${k}`);
    assert.ok(['host', 'local', 'turns'].includes(g.sync));
  }
});

// ----------------------------------------------------------------------------
// Ganzer Cup über den Host-Treiber (ohne Browser, mit LocalTransport und Bots)
// ----------------------------------------------------------------------------
async function waitFor(fn, ms = 20000, step = 25) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, step)); }
  throw new Error('waitFor timeout');
}

await t('Host-Treiber: kompletter Cup (3 Runden) mit 1 Mensch + 3 Bots, Punkte stimmen, Siegerehrung', async () => {
  const tp = new LocalTransport({ shared: false }); await tp.init();
  const room = await Room.create(tp, { name: 'Test', avatar: '🙂', color: 'red', level: 1 });
  await room.setSettings({ rounds: 3, mode: 'random', onlyOnce: true, timeFactor: 0.75 });
  for (let i = 0; i < 3; i++) await room.addBot('mittel');
  const driver = new HostDriver(room, { hasHostRunner: () => true });
  // Die Tick-Fristen verkürzen (Test): Intro/Ergebnis sofort
  const origNow = driver.now.bind(driver);
  let skew = 0;
  driver.now = () => origNow() + skew;
  driver.start();
  // „Runner“: sobald 'playing', nach kurzer Zeit ein Ergebnis aus den echten Spielen berechnen (Bots)
  const played = [];
  let handledKey = '';
  const fake = setInterval(() => {
    const m = room.meta;
    if (!m) return;
    if (m.status !== 'playing') { skew += 400; return; }
    const key = m.roundIndex + ':' + m.startAt;
    if (handledKey === key) return;
    handledKey = key;
    const game = GAMES.find((g) => g.id === m.gameId);
    played.push(game.id);
    const parts = toList(m.participants);
    const ranks = parts.map((u, i) => ({ uid: u, rank: i + 1, value: i, label: 'x' }));
    driver.onGameEnd({ ranks });
  }, 30);
  await driver.run(() => driver.startParty());
  await waitFor(() => room.meta.status === 'finished', 25000);
  clearInterval(fake); driver.stop();
  const hist = room.d.history;
  assert.equal(hist.filter((h) => !h.st).length >= 3, true);
  const players = room.list();
  const total = players.reduce((a, p) => a + p.score, 0);
  const expect = hist.reduce((a, h) => a + Object.values(h.pts || {}).reduce((x, y) => x + y, 0), 0);
  assert.equal(total, expect, 'Summe der Punkte = Summe der Rundenpunkte');
  const fin = hist.find((h) => h.fin);
  assert.ok(fin, 'Die letzte Runde ist als Finale (×2) markiert');
  assert.equal(new Set(played.filter((g, i) => i < 3)).size, 3, 'Jedes Spiel nur einmal: ' + played.join(','));
  room.stop();
});

await t('Host-Treiber: Abstimmungs-Modus – Bots stimmen, Gewinner startet die Runde (keine überlappenden Update-Pfade)', async () => {
  const tp = new LocalTransport({ shared: false }); await tp.init();
  const room = await Room.create(tp, { name: 'Test', avatar: '🙂', color: 'red', level: 1 });
  await room.setSettings({ rounds: 3, mode: 'vote' });
  for (let i = 0; i < 3; i++) await room.addBot('mittel');
  const driver = new HostDriver(room, { hasHostRunner: () => true });
  await driver.run(() => driver.startParty());
  assert.equal(room.meta.status, 'voting');
  const options = toList(room.meta.vote.options);
  assert.equal(options.length, 4);
  assert.equal(Object.keys(room.d.votes).length, 3, 'drei Bots haben abgestimmt');
  await room.vote(options[2]);
  await driver.run(() => driver.resolveVote());
  assert.equal(room.meta.status, 'intro');
  assert.ok(options.includes(room.meta.gameId));
  room.stop();
});

await t('Host-Treiber: Gleichstand an der Spitze löst das Stechen im Schnellzieher aus', async () => {
  const tp = new LocalTransport({ shared: false }); await tp.init();
  const room = await Room.create(tp, { name: 'Test', avatar: '🙂', color: 'red', level: 1 });
  await room.setSettings({ rounds: 3, mode: 'random', onlyOnce: false, doubleFinal: false });
  await room.addBot('mittel');
  const driver = new HostDriver(room, { hasHostRunner: () => true });
  const origNow = driver.now.bind(driver);
  let skew = 0;
  driver.now = () => origNow() + skew;
  driver.start();
  let handled = '';
  const stechenSeen = [];
  const fake = setInterval(() => {
    const m = room.meta;
    if (!m) return;
    if (m.status !== 'playing') { skew += 400; return; }
    const key = m.roundIndex + ':' + m.startAt;
    if (handled === key) return;
    handled = key;
    const parts = toList(m.participants);
    if (m.stechen) { stechenSeen.push(m.gameId); driver.onGameEnd({ ranks: [{ uid: parts[1], rank: 1 }, { uid: parts[0], rank: 2 }] }); return; }
    // alle Runden: Gleichstand (beide Rang 1) → gleiche Punkte, gleiche Siege
    driver.onGameEnd({ ranks: parts.map((u) => ({ uid: u, rank: 1 })) });
  }, 30);
  await driver.run(() => driver.startParty());
  await waitFor(() => room.meta.status === 'finished', 25000);
  clearInterval(fake); driver.stop();
  assert.deepEqual(stechenSeen, ['schnellzieher']);
  assert.equal(toList(room.meta.stechenOrder).length, 2);
  room.stop();
});

console.log(`\n${n} Tests bestanden`);
process.exit(0);
