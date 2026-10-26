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
import { movesFor, applyMove } from '../games/dame.js';
import { sow } from '../games/mancala.js';
import { profile } from '../core/profile.js';
import { track, ensureMissions, claimMission, ACHIEVEMENTS, updateHighscore, MISSIONS } from '../core/progress.js';
import { buy, FIGURES, owns, ownsAvatar } from '../core/shop.js';
import groesse, { buildRounds, accuracy, pxOf, vOf, fmtSize, fmtX } from '../games/groesse.js';
import { Friends, normCode, showCode, agoText } from '../core/friends.js';
import { seedOrder, makeBracket, nextMatch, recordGame, placements, roundName, readBracket } from '../core/ko.js';

let n = 0;
const REVEAL_T_TEST = 6;
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

await t('Dame: Startaufstellung, Schlagzwang, Mehrfachsprung und Beförderung', () => {
  const start = Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) start[r * 8 + c] = 3; else if (r > 4) start[r * 8 + c] = 1; }
  assert.equal(start.filter((v) => v === 1).length, 12);
  assert.equal(movesFor(start, 0).length, 7, 'Spieler 0 hat 7 Eröffnungszüge');
  // Schlagzwang: Stein bei (5,2) gegen Gegner bei (4,3) mit freiem Feld (3,4)
  const b = Array(64).fill(0);
  b[5 * 8 + 2] = 1; b[4 * 8 + 3] = 3; b[7 * 8 + 0] = 1;
  const ms = movesFor(b, 0);
  assert.ok(ms.length === 1 && ms[0].cap === 4 * 8 + 3, 'nur der Schlagzug ist erlaubt');
  // Mehrfachsprung: zweiter Gegner bei (2,5) → nach dem ersten Sprung auf (3,4) geht es weiter nach (1,6)
  b[2 * 8 + 5] = 3;
  const r1 = applyMove(b, ms[0]);
  assert.equal(r1.cont, 3 * 8 + 4, 'muss weiterspringen');
  const ms2 = movesFor(r1.b, 0, r1.cont);
  assert.equal(ms2.length, 1);
  const r2 = applyMove(r1.b, ms2[0]);
  assert.equal(r2.b[1 * 8 + 6] === 1 && r2.b[2 * 8 + 5] === 0, true);
  // Beförderung
  const p = Array(64).fill(0); p[1 * 8 + 2] = 1; p[7 * 8 + 6] = 3;
  const pm = movesFor(p, 0).find((m) => m.to === 0 * 8 + 1 || m.to === 0 * 8 + 3);
  assert.equal(applyMove(p, pm).b[pm.to], 2, 'Stein wird Dame');
});

await t('Mancala: Extra-Zug im Kalaha, Fangen gegenüberliegender Steine, Spielende sammelt Reste', () => {
  const start = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
  const r = sow(start, 0, 2); // 4 Steine: Mulden 3,4,5 und Kalaha
  assert.equal(r.extra, true);
  assert.equal(r.b[6], 1);
  // Fangen: Mulde 0 hat 1 Stein → landet in der leeren Mulde 1; gegenüber (Mulde 11) liegen 5 Steine
  const t2 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0];
  const rc = sow(t2, 0, 0);
  assert.equal(rc.b[6], 6, '5 gegnerische + 1 eigener Stein im Kalaha');
  assert.equal(rc.b[11], 0);
  // Spielende
  const end = [0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 2];
  const re = sow(end, 0, 5);
  assert.equal(re.over, true);
  assert.equal(re.b[6] + re.b[13], 6, 'alle Steine landen in den Kalahas');
});

await t('K.-o.-Turnier: Setzliste, Freilose, Best-of-3, Platzierung (2 bis 6 Spieler)', () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  for (let n = 2; n <= 6; n++) {
    const uids = Array.from({ length: n }, (_, i) => 'p' + (i + 1));
    const br = makeBracket(uids);
    let guard = 0, nm;
    while ((nm = nextMatch(br)) && guard++ < 50) {
      const mt = br.rounds[nm.r][nm.m];
      // der niedriger gesetzte (kleinere Zahl) gewinnt immer 2:0
      const aWins = Number(mt.a.slice(1)) < Number(mt.b.slice(1));
      assert.equal(recordGame(br, nm.r, nm.m, aWins ? 0 : 1, 'x'), false);
      assert.equal(recordGame(br, nm.r, nm.m, aWins ? 0 : 1, 'y'), true);
    }
    const pl = placements(br);
    assert.equal(Object.keys(pl).length, n, `alle ${n} Spieler platziert`);
    assert.equal(pl.p1, 1, 'Topgesetzter gewinnt');
    assert.equal(pl.p2, 2);
  }
  // 6 Spieler → Größe 8, die zwei Topgesetzten haben ein Freilos
  const b6 = makeBracket(['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(b6.size, 8);
  assert.equal(b6.rounds[0].filter((m) => m.bye).length, 2);
  assert.equal(roundName(8, 0), 'Viertelfinale'); assert.equal(roundName(8, 1), 'Halbfinale'); assert.equal(roundName(8, 2), 'Finale'); assert.equal(roundName(2, 0), 'Finale');
  // Unentschieden zählt nicht; nach 5 Spielen entscheidet das Los
  const b2 = makeBracket(['x', 'y']);
  for (let i = 0; i < 4; i++) assert.equal(recordGame(b2, 0, 0, -1, 'g' + i), false);
  assert.equal(recordGame(b2, 0, 0, -1, 'g4', () => 0.1), true);
  assert.ok(b2.rounds[0][0].w);
  // Round-Trip durch die Datenbank-Form (Arrays als Objekte)
  const asObj = JSON.parse(JSON.stringify({ size: b6.size, rounds: Object.fromEntries(b6.rounds.map((r, i) => [i, Object.fromEntries(r.map((m, j) => [j, m]))])) }));
  assert.equal(readBracket(asObj).rounds[0].length, 4);
});

await t('Fortschritt: Erfolge, Tagesmissionen (3 pro Tag, abholbar), Highscores, Shop-Kauf', () => {
  profile.coins = 0; profile.counters = {}; profile.achieved = {}; profile.highscores = {}; profile.missions = null; profile.unlocked = {};
  const ms = ensureMissions('2026-01-01');
  assert.equal(ms.list.length, 3);
  assert.equal(ensureMissions('2026-01-01').list[0].id, ms.list[0].id, 'am selben Tag bleiben es dieselben');
  assert.notEqual(JSON.stringify(ensureMissions('2026-01-02').list.map((m) => m.id)), 'x');
  // 5 Runden, zuletzt 3 Siege hintereinander
  let got = [];
  for (const rank of [2, 1, 1, 1, 3]) got = got.concat(track('round', { rank, n: 4, gameId: 'g' + rank + Math.random(), category: 'Arena', solo: false }).achievements.map((a) => a.id));
  assert.ok(got.includes('r1') && got.includes('w1') && got.includes('streak3'), 'Erfolge: ' + got.join(','));
  assert.ok(profile.coins >= 25 + 20 + 60, 'Münzen für Erfolge gutgeschrieben: ' + profile.coins);
  // Mission erledigen und abholen: alle Missionen künstlich auf „fertig“ bringen
  const day = ensureMissions();
  day.list.forEach((m) => { m.progress = MISSIONS[m.id].target; m.done = true; });
  const before = profile.coins;
  assert.ok(claimMission(day.list[0].id) > 0);
  assert.equal(claimMission(day.list[0].id), 0, 'nur einmal abholbar');
  assert.ok(profile.coins > before);
  // Highscores
  assert.equal(updateHighscore('quiz', 50, '5 richtig'), true);
  assert.equal(updateHighscore('quiz', 40, 'schlechter'), false);
  assert.equal(updateHighscore('schnellzieher', 900, 'Ø 300 ms'), true);
  assert.equal(updateHighscore('schnellzieher', 1200, 'langsamer'), false, 'niedriger ist besser');
  assert.equal(updateHighscore('tictactoe', 1, 'x'), false, 'Spiel ohne Highscore');
  // Shop
  profile.coins = 50;
  const fig = FIGURES[0];
  assert.equal(buy(fig).ok, false, 'zu wenig Münzen');
  profile.coins = 500;
  assert.equal(buy(fig).ok, true);
  assert.equal(buy(fig).ok, false, 'schon gekauft');
  assert.equal(profile.coins, 500 - fig.price);
  assert.ok(owns(fig.id) && ownsAvatar(fig.emoji));
  assert.ok(ACHIEVEMENTS.length >= 20);
});

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

await t('Host-Treiber: K.-o.-Turnier mit 1 Mensch + 4 Bots läuft bis zur Siegerehrung (Platzierungen vollständig)', async () => {
  const tp = new LocalTransport({ shared: false }); await tp.init();
  const room = await Room.create(tp, { name: 'Test', avatar: '🙂', color: 'red', level: 9 });
  await room.setSettings({ partyType: 'ko' });
  for (let i = 0; i < 4; i++) await room.addBot('mittel');
  const driver = new HostDriver(room, { hasHostRunner: () => true });
  const origNow = driver.now.bind(driver);
  let skew = 0;
  driver.now = () => origNow() + skew;
  driver.start();
  let handled = '';
  const matches = [];
  const fake = setInterval(() => {
    const m = room.meta;
    if (!m) return;
    if (m.status !== 'playing') { skew += 500; return; }
    const key = m.roundIndex + ':' + m.startAt;
    if (handled === key) return;
    handled = key;
    const parts = toList(m.participants);
    assert.equal(parts.length, 2, 'im K.-o. spielen genau zwei');
    matches.push(m.koCur);
    // der Mensch gewinnt immer, sonst der Erste in der Liste
    const win = parts.includes(room.uid) ? room.uid : parts[0];
    driver.onGameEnd({ ranks: parts.map((u) => ({ uid: u, rank: u === win ? 1 : 2 })) });
  }, 30);
  await driver.run(() => driver.startParty());
  assert.equal(room.meta.status, 'bracket');
  await waitFor(() => room.meta.status === 'finished', 40000);
  clearInterval(fake); driver.stop();
  const pl = room.meta.koPlace;
  assert.equal(Object.keys(pl).length, 5, 'alle fünf platziert');
  assert.equal(pl[room.uid], 1, 'der Mensch hat durchgehend gewonnen');
  assert.ok(matches.length >= 8, 'Best-of-3: mindestens 2 Spiele pro Match, ' + matches.length);
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

await t('Freunde: Code, Anfrage, Annehmen, Anwesenheit, Einladung, Entfernen', async () => {
  const tpA = new LocalTransport({ shared: false }); await tpA.init();
  const mk = (uid) => { const tp = Object.create(tpA); tp.uid = uid; return tp; }; // gleiche Datenbank, andere Nutzer
  const tpB = mk('uB'), tpC = mk('uC');
  tpA.uid = 'uA';
  const prof = (name, avatar) => ({ name, avatar, color: 'red', xp: 0, equipped: { frame: 'weiss' }, friendCode: null });
  const pa = prof('Anna', '🦊'), pb = prof('Ben', '🐸'), pc = prof('Cleo', '🐱');
  const fa = new Friends(pa), fb = new Friends(pb), fc = new Friends(pc);
  const ev = { a: [], b: [] };
  fa.on((w, d) => ev.a.push([w, d])); fb.on((w, d) => ev.b.push([w, d]));
  await fa.start(tpA); await fb.start(tpB); await fc.start(tpC);
  assert.match(pa.friendCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(pa.friendCode, pb.friendCode);
  assert.equal(await tpA.get('friendCodes/' + pa.friendCode), 'uA');
  assert.equal(normCode(' k7m-4px '), 'K7M4PX'); assert.equal(showCode('K7M4PX'), 'K7M-4PX');
  // Fehlerfälle
  assert.equal((await fa.addByCode('abc')).ok, false);
  assert.match((await fa.addByCode(pa.friendCode)).reason, /eigener/);
  assert.match((await fa.addByCode('ZZZZZZ')).reason, /gibt es nicht/);
  // Anfrage Anna → Ben
  assert.equal((await fa.addByCode(showCode(pb.friendCode))).ok, true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fb.requestList().length, 1);
  assert.equal(fb.requestList()[0].name, 'Anna');
  assert.equal(fb.badge(), 1);
  assert.ok(ev.b.some(([w, d]) => w === 'request' && d.uid === 'uA'), 'Ben bekommt ein request-Ereignis');
  assert.equal(fa.list().length, 0, 'noch nicht befreundet');
  await fb.accept('uA');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fb.requestList().length, 0);
  assert.deepEqual(fa.list().map((f) => f.name), ['Ben']);
  assert.deepEqual(fb.list().map((f) => f.name), ['Anna']);
  assert.equal(fa.list()[0].level, 1);
  assert.match((await fa.addByCode(pb.friendCode)).reason, /schon befreundet/);
  assert.ok(ev.a.some(([w, d]) => w === 'count' && d === 1), 'count-Ereignis für Erfolge');
  // Anwesenheit
  await fb._online();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fa.list()[0].online, true);
  assert.equal(fa.list()[0].room, null);
  fb.ready = true; fb.setRoom('4711');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fa.list()[0].room, '4711');
  tpB._runDisconnect.call(tpA); // alle onDisconnect-Aufträge der geteilten Datenbank ausführen
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fa.list()[0].online, false);
  assert.equal(fa.list()[0].room, null);
  // Einladung
  await fa.invite('uB', '1234');
  await new Promise((r) => setTimeout(r, 30));
  const inv = ev.b.find(([w]) => w === 'invite');
  assert.ok(inv && inv[1].code === '1234' && inv[1].name === 'Anna');
  assert.equal(fb.inviteList().length, 1);
  await fb.dismissInvite('uA');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fb.inviteList().length, 0);
  // gegenseitige Anfragen werden automatisch angenommen
  await fc.addByCode(pa.friendCode);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fa.requestList().length, 1);
  const r2 = await fa.addByCode(pc.friendCode);
  assert.equal(r2.accepted, true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fa.list().length, 2);
  // Entfernen wirkt auf beiden Seiten
  await fa.removeFriend('uB');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(fa.list().map((f) => f.name), ['Cleo']);
  assert.equal(fb.list().length, 0);
  // alte Einladungen (> 3 Min) werden verworfen
  await tpA.set('social/uC/invites/uA', { code: '9999', name: 'Anna', avatar: '🦊', t: Date.now() - 4 * 60000 });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(fc.inviteList().length, 0);
  assert.equal(await tpA.get('social/uC/invites/uA'), null);
  assert.equal(agoText(Date.now() - 5 * 60000), 'vor 5 Min');
  [fa, fb, fc].forEach((f) => f.stop());
});

await t('Größen-Check: 10 verschiedene Duelle je Partie, Genauigkeit in Prozent, Regler-Umrechnung, Bots', async () => {
  const a = buildRounds(111), b = buildRounds(111), c = buildRounds(222);
  assert.equal(a.length, 10);
  assert.deepEqual(a.map((r) => r.a + '>' + r.b), b.map((r) => r.a + '>' + r.b), 'gleicher Seed → gleiche Runden bei allen Geräten');
  assert.notDeepEqual(a.map((r) => r.a + '>' + r.b), c.map((r) => r.a + '>' + r.b), 'anderer Seed → andere Partie');
  assert.equal(new Set(a.map((r) => [r.a, r.b].sort().join('-'))).size, 10, 'kein Paar doppelt');
  const dirs = new Set();
  for (let seed = 1; seed <= 60; seed++) for (const R of buildRounds(seed)) {
    assert.ok(R.lo < R.truePx / 1.8 && R.hi > R.truePx * 1.5, `Lösung liegt im Regler-Bereich (${R.a}>${R.b})`);
    assert.ok(R.hi <= 236 && R.truePx > 5 && R.refPx > 5 && R.refPx <= 236, `Darstellung passt ins Bild (${R.a}>${R.b}: ${R.refPx}/${R.truePx})`);
    assert.ok(Math.abs(Math.log(pxOf(R, R.v0) / R.truePx)) >= 0.27, 'Startwert ist nie die Lösung');
    assert.ok(Math.abs(vOf(R, pxOf(R, 640)) - 640) < 1e-6, 'Umrechnung Regler ↔ Pixel ist umkehrbar');
    dirs.add(R.ratio > 1 ? 'groesser' : 'kleiner');
  }
  assert.equal(dirs.size, 2, 'mal größer, mal kleiner machen');
  // Pisa → Eiffelturm: echtes Verhältnis 330/56
  const pe = buildRounds(1).concat(...Array.from({ length: 40 }, (_, i) => buildRounds(i + 2))).find((r) => r.a === 'pisa' && r.b === 'eiffel');
  assert.ok(pe && Math.abs(pe.ratio - 330 / 56) < 1e-9 && Math.abs(pe.truePx / pe.refPx - 330 / 56) < 1e-9);
  assert.equal(accuracy(100, 100), 100);
  assert.equal(accuracy(110, 100), 91); assert.equal(accuracy(100 / 1.1, 100), 91, 'zu groß und zu klein gleich streng');
  assert.equal(accuracy(300, 100), 0); assert.equal(accuracy(20, 100), 0); assert.equal(accuracy(0, 100), 0);
  assert.equal(fmtSize(330), '330 m'); assert.equal(fmtSize(1.75), '1,75 m'); assert.equal(fmtSize(0.067), '6,7 cm'); assert.equal(fmtSize(0.24), '24 cm');
  assert.equal(fmtX(5.89), '5,9×'); assert.equal(fmtX(0.2812), '0,28×');
  // Spielablauf: Mensch gibt in jeder Runde die Lösung ab, Bot(s) raten
  const players = [0, 1, 2].map((i) => ({ uid: 'p' + i, idx: i, name: 'S' + i, avatar: '🙂', colorHex: '#fff', isBot: i > 0, botLevel: i === 1 ? 'schwer' : 'leicht' }));
  const ctx = { players, me: 'p0', seed: 5, sfx() {}, send() {}, rng: () => 0.5 };
  const g = groesse.create(ctx); g.start();
  const accSum = { p0: 0, p1: 0, p2: 0 };
  for (let rd = 0; rd < 10; rd++) {
    const R = g.R();
    assert.equal(g.ph, 'pick');
    g.onInput('p0', { a: 'abc' }); assert.equal(g.vals.p0, R.v0, 'ungültige Eingabe wird ignoriert');
    g.onInput('p0', { a: vOf(R, R.truePx), ok: 1 });
    g.onInput('p0', { a: 0, ok: 1 }); // nach dem Abschicken zählt nichts mehr
    for (const b of players.slice(1)) { for (let k = 0; k < 400 && g.ph === 'pick'; k++) { const inp = g.botThink(b, {}, 0.05); if (inp) { g.onInput(b.uid, inp); break; } } }
    assert.equal(g.ph, 'reveal', 'alle abgegeben → sofort Auflösung');
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    assert.ok(snap.res.acc[0] >= 99, 'exakte Lösung ≈ 100 %');
    snap.res.acc.forEach((x, i) => { accSum['p' + i] += x; assert.ok(x >= 0 && x <= 100); });
    g.update(REVEAL_T_TEST);
  }
  assert.equal(g.ph, 'over'); assert.ok(g.isFinished());
  const res = g.result();
  assert.equal(res.ranks.find((r) => r.uid === 'p0').rank, 1, 'Mensch mit exakten Lösungen gewinnt');
  assert.ok(accSum.p1 > accSum.p2 * 0.9, 'schwerer Bot im Schnitt nicht schlechter als leichter: ' + accSum.p1 + ' vs ' + accSum.p2);
  assert.match(res.ranks[0].label, /% Ø/);
});

console.log(`\n${n} Tests bestanden`);
process.exit(0);
