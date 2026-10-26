import assert from 'node:assert/strict';
import { competitionRanks, normalizeResult, teamRanksToPlayerRanks, cupPoints, duelPoints, assignTeams, selectDuelPlayers, tiedTop, standings, awards } from '../core/scoring.js';
import { mulberry32 } from '../core/util.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('Cup-Punkte: 4 Spieler 4/3/2/1', () => {
  assert.deepEqual(cupPoints([{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }, { uid: 'c', rank: 3 }, { uid: 'd', rank: 4 }]), { a: 4, b: 3, c: 2, d: 1 });
});
t('Cup-Punkte: 6 Spieler 6..1 und 2 Spieler 2/1', () => {
  const six = cupPoints(Array.from({ length: 6 }, (_, i) => ({ uid: 'p' + i, rank: i + 1 })));
  assert.deepEqual(Object.values(six), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(cupPoints([{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }]), { a: 2, b: 1 });
});
t('Gleichstand: Ränge 1,1,3,4 → 4,4,2,1', () => {
  assert.deepEqual(cupPoints([{ uid: 'a', rank: 1 }, { uid: 'b', rank: 1 }, { uid: 'c', rank: 3 }, { uid: 'd', rank: 4 }]), { a: 4, b: 4, c: 2, d: 1 });
});
t('competitionRanks vergibt Gleichstand-Ränge', () => {
  const r = competitionRanks([5, 9, 9, 1], (a, b) => b - a).map((x) => [x.item, x.rank]);
  assert.deepEqual(r, [[9, 1], [9, 1], [5, 3], [1, 4]]);
});
t('Team-Spiel 2:2 → Sieger 4 Punkte, Verlierer 2', () => {
  const teamOf = { a: 0, b: 0, c: 1, d: 1 };
  const ranks = teamRanksToPlayerRanks([{ team: 0, rank: 1 }, { team: 1, rank: 2 }], teamOf, ['a', 'b', 'c', 'd']);
  assert.deepEqual(cupPoints(ranks), { a: 4, b: 4, c: 2, d: 2 });
});
t('Team-Spiel 3:3, Unentschieden → alle 6', () => {
  const teamOf = { a: 0, b: 0, c: 0, d: 1, e: 1, f: 1 };
  const ranks = teamRanksToPlayerRanks([{ team: 0, rank: 1 }, { team: 1, rank: 1 }], teamOf, Object.keys(teamOf));
  assert.deepEqual(Object.values(cupPoints(ranks)), [6, 6, 6, 6, 6, 6]);
});
t('Duell: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉', () => {
  const p = duelPoints(5, [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }], ['c', 'd', 'e']);
  assert.deepEqual(p, { a: 5, b: 1, c: 3, d: 3, e: 3 });
});
t('Duell: Unentschieden gibt beiden n−1', () => {
  const p = duelPoints(4, [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 1 }], ['c', 'd']);
  assert.deepEqual(p, { a: 3, b: 3, c: 2, d: 2 });
});
t('Duell nur zu zweit (n=2): Sieger 2, Verlierer 1', () => {
  assert.deepEqual(duelPoints(2, [{ uid: 'a', rank: 2 }, { uid: 'b', rank: 1 }]), { a: 1, b: 2 });
});
t('normalizeResult: fehlende Spieler ans Ende, Doppelte ignoriert', () => {
  const r = normalizeResult({ ranks: [{ uid: 'a', rank: 1 }, { uid: 'a', rank: 2 }, { uid: 'b', rank: 2 }, { uid: 'x', rank: 3 }] }, ['a', 'b', 'c']);
  assert.deepEqual(r.map((x) => [x.uid, x.rank]), [['a', 1], ['b', 2], ['c', 3]]);
});
t('normalizeResult: kaputte Ränge werden zu Wettbewerbs-Rängen', () => {
  const r = normalizeResult({ ranks: [{ uid: 'a', rank: 5 }, { uid: 'b', rank: 9 }, { uid: 'c', rank: 9 }] }, ['a', 'b', 'c']);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 2]);
});
t('normalizeResult: leeres Ergebnis → alle gleich letzter Platz', () => {
  const r = normalizeResult(null, ['a', 'b']);
  assert.deepEqual(r.map((x) => x.rank), [1, 1]);
});
t('Teams: ungerade Zahl → 2:1, ungültige feste Teams werden verworfen', () => {
  const tm = assignTeams(['a', 'b', 'c'], mulberry32(3));
  const c = [0, 0]; Object.values(tm).forEach((v) => c[v]++);
  assert.deepEqual(c.sort(), [1, 2]);
  const bad = assignTeams(['a', 'b'], mulberry32(1), { a: 0, b: 0 });
  assert.notEqual(bad.a, bad.b);
  assert.deepEqual(assignTeams(['a', 'b'], mulberry32(1), { a: 1, b: 0 }), { a: 1, b: 0 });
});
t('Duell-Auswahl: die mit den wenigsten Punkten', () => {
  const sel = selectDuelPlayers([{ uid: 'a', score: 5 }, { uid: 'b', score: 1 }, { uid: 'c', score: 3 }, { uid: 'd', score: 1 }], 2, mulberry32(7));
  assert.deepEqual(sel.sort(), ['b', 'd']);
});
t('Endstand: Punkte, dann Rundensiege, dann Rang-Summe', () => {
  const s = standings([
    { uid: 'a', score: 10, wins: 1, rs: 9 }, { uid: 'b', score: 10, wins: 2, rs: 12 },
    { uid: 'c', score: 10, wins: 2, rs: 8 }, { uid: 'd', score: 3, wins: 0, rs: 20 }]);
  assert.deepEqual(s.map((x) => [x.uid, x.place]), [['c', 1], ['b', 2], ['a', 3], ['d', 4]]);
});
t('Gleichstand an der Spitze wird erkannt und per Stechen aufgelöst', () => {
  const ps = [{ uid: 'a', score: 8, wins: 2, rs: 6 }, { uid: 'b', score: 8, wins: 2, rs: 6 }, { uid: 'c', score: 4, wins: 0, rs: 10 }];
  assert.deepEqual(tiedTop(ps).sort(), ['a', 'b']);
  assert.equal(standings(ps)[0].place, 1);
  assert.equal(standings(ps)[1].place, 1);
  const s = standings(ps, ['b', 'a']);
  assert.deepEqual(s.map((x) => [x.uid, x.place]), [['b', 1], ['a', 2], ['c', 3]]);
});
t('Kein Gleichstand → kein Stechen', () => {
  assert.deepEqual(tiedTop([{ uid: 'a', score: 5, wins: 1, rs: 3 }, { uid: 'b', score: 4, wins: 1, rs: 3 }]), []);
  assert.deepEqual(tiedTop([{ uid: 'a', score: 5 }]), []);
});
t('Auszeichnungen: MVP, Pechvogel, knapper Sieg', () => {
  const hist = [
    { ranks: [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }, { uid: 'c', rank: 3 }] },
    { ranks: [{ uid: 'b', rank: 1 }, { uid: 'a', rank: 2 }, { uid: 'c', rank: 3 }] },
    { ranks: [{ uid: 'a', rank: 1 }, { uid: 'c', rank: 2 }, { uid: 'b', rank: 3 }] },
  ];
  const a = awards(hist, [{ uid: 'a', score: 8, wins: 2 }, { uid: 'b', score: 7, wins: 1 }, { uid: 'c', score: 3, wins: 0 }]);
  assert.equal(a.mvp.uid, 'a');
  assert.equal(a.pech.uid, 'c');
  assert.equal(a.knapp.uid, 'a');
});
console.log(`\n${n} Tests bestanden`);
