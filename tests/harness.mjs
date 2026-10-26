// Test-Harness: spielt ein Spiel ohne Browser komplett durch (Bots + ein „Zufalls-Spieler“),
// rendert mit einem Fake-Canvas, der NaN/ungültige Radien meldet, und prüft das Ergebnis.
import { mulberry32 } from '../core/util.js';
import { normalizeResult } from '../core/scoring.js';

/** Fake-2D-Canvas: nimmt alles an, wirft aber bei NaN/Infinity und negativen Radien (wie echte Canvas-Fehler). */
export function fakeG() {
  const state = { calls: 0 };
  const bad = (p, a) => { throw new Error(`Canvas ${p}(${a.map((x) => (typeof x === 'number' ? x : typeof x)).join(', ')}) enthält ungültigen Wert`); };
  return new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') {
        return (...a) => { if (a.some((x) => typeof x === 'number' && !Number.isFinite(x))) bad(p, a); if (p === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad(p, a); return { addColorStop() {} }; };
      }
      return (...a) => {
        t.calls++;
        for (const x of a) if (typeof x === 'number' && !Number.isFinite(x)) bad(String(p), a);
        if ((p === 'fillText' || p === 'strokeText') && (a[0] === undefined || a[0] === null || String(a[0]).includes('undefined') || String(a[0]).includes('NaN'))) bad(String(p), [String(a[0])]);
        if (p === 'arc' && a[2] < 0) bad('arc(radius<0)', a);
        if (p === 'ellipse' && (a[2] < 0 || a[3] < 0)) bad('ellipse(radius<0)', a);
        return undefined;
      };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

/** Alle Zahlen in einer Struktur endlich? (JSON macht aus NaN still null) */
export function assertFinite(v, path = 'snap') {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${path} ist keine endliche Zahl`);
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertFinite(x, `${path}.${k}`);
}

export function mkPlayers(count, { teams = false, level = 'mittel', humansOnly = false, botAll = false } = {}) {
  const colors = ['#ff4d6d', '#3d8bff', '#2fd67b', '#ffcf33', '#b66bff', '#ff8a3d'];
  return Array.from({ length: count }, (_, i) => ({
    uid: 'p' + i, idx: i, name: 'Spieler' + i, avatar: ['🦊', '🐸', '🐱', '🐼', '🦄', '🐙'][i], color: 'c' + i, colorHex: colors[i], frame: 'weiss', ring: '#fff',
    isBot: botAll || (!humansOnly && i > 0), botLevel: level, team: teams ? i % 2 : null,
  }));
}

/** Zufällige „menschliche“ Eingaben passend zur Steuerung. */
function makeFuzzer(game, rng, extra) {
  const st = {};
  return (inst, uid, t, dt) => {
    const s = st[uid] || (st[uid] = { taps: 0, b: 0, l: 0, r: 0, lc: 0, rc: 0, acc: 0, n: 0, ptr: 0 });
    s.acc += dt;
    const out = [];
    switch (game.controls) {
      case 'TAP': if (rng() < 0.4) { s.taps += 1; out.push({ taps: s.taps }); } break;
      case 'LR': if (rng() < 0.15) { const side = rng() < 0.5 ? 'l' : 'r'; s[side] = s[side] ? 0 : 1; if (s[side]) s[side + 'c']++; out.push({ l: s.l, r: s.r, lc: s.lc, rc: s.rc }); } break;
      case 'JOY': case 'TILT': if (rng() < 0.2) out.push({ x: Math.round((rng() * 2 - 1) * 20) / 20, y: Math.round((rng() * 2 - 1) * 20) / 20 }); break;
      case 'JOY+BTN': if (rng() < 0.2) { if (rng() < 0.2) s.b++; out.push({ x: Math.round((rng() * 2 - 1) * 20) / 20, y: Math.round((rng() * 2 - 1) * 20) / 20, b: s.b }); } break;
      default: break;
    }
    if (game.pointer && inst.onPointer && s.acc > 0.25) {
      s.acc = 0;
      const { w, h } = game.view;
      const x0 = rng() * w, y0 = rng() * h;
      inst.onPointer('down', x0, y0);
      inst.onPointer('move', x0 + (rng() - 0.5) * 80, y0 + (rng() - 0.5) * 80);
      inst.onPointer('up', x0 + (rng() - 0.5) * 120, y0 + (rng() - 0.5) * 120);
    }
    if (extra && extra.fuzz) { const o = extra.fuzz(inst, uid, rng, t, s); if (o) out.push(o); }
    return out;
  };
}

/**
 * Spielt `game` mit `count` Spielern durch. Gibt { result, simTime, renders } zurück.
 * extra.fuzz(inst, uid, rng, t, state) → Eingabe-Objekt für PICK-Spiele (optional).
 */
export function runGame(game, count, { seed = 1, teams = null, extra = {}, level = 'mittel', allFuzz = false, botAll = false } = {}) {
  const useTeams = teams == null ? (game.teams === 'only') : teams;
  const players = mkPlayers(count, { teams: useTeams, level, humansOnly: (!!game.humansOnly || allFuzz) && !botAll, botAll });
  const rng = mulberry32(seed * 7919 + count);
  const chanList = [];
  const instances = [];
  let hostInst = null;
  const submits = {};
  const mkCtx = (me) => ({
    game, players, byUid: Object.fromEntries(players.map((p) => [p.uid, p])), me, isHost: me === 'p0', seed, rng: mulberry32(seed),
    settings: { colorMemorySec: 3, botLevel: level, botTakeover: true }, duration: game.duration, serverNow: () => Date.now(), now: () => performance.now(),
    sfx() {}, vibrate() {},
    submit(payload) { submits[me] = JSON.parse(JSON.stringify(payload)); },
    send(obj) { if (game.sync === 'local') instByUid[me].onInput(me, obj); else hostInst.onInput(me, obj); },
    push(obj) { chanList.push(JSON.parse(JSON.stringify({ ...obj, u: me }))); for (const i of instances) i.onChan && i.onChan(chanList.slice()); },
  });
  const instByUid = {};
  const g = fakeG();
  const fuzz = makeFuzzer(game, rng, extra);
  let renders = 0;
  const view = () => game.view;

  if (game.sync === 'local') {
    // jedes Gerät simuliert selbst; der Host sammelt die Ergebnisse
    for (const p of players) { instByUid[p.uid] = game.create(mkCtx(p.uid)); instances.push(instByUid[p.uid]); }
    hostInst = instByUid.p0;
    const humans = players.filter((p) => !p.isBot);
    const bots = players.filter((p) => p.isBot);
    for (const p of humans) instByUid[p.uid].start();
    const plans = Object.fromEntries(bots.map((p) => [p.uid, hostInst.botPlan(p)]));
    let t = 0;
    const dt = 1 / 60;
    const live = {};
    while (t < game.duration) {
      t += dt;
      for (const p of humans) {
        const inst = instByUid[p.uid];
        inst.update(dt);
        for (const o of fuzz(inst, p.uid, t, dt)) inst.onInput(p.uid, o);
        live[p.uid] = inst.progress ? inst.progress() : 0;
      }
      if (Math.round(t * 60) % 20 === 0) {
        for (const p of bots) live[p.uid] = hostInst.botProgress(plans[p.uid], t);
        for (const p of humans) { g.calls = 0; instByUid[p.uid].render(g, { p: live, f: {} }, p.uid, 1, null); renders++; }
      }
      if (game.fuzzAfter) game.fuzzAfter();
    }
    for (const p of humans) { instByUid[p.uid].timeUp && instByUid[p.uid].timeUp(); }
    for (const p of humans) {
      if (!submits[p.uid]) throw new Error(`Spieler ${p.uid} hat nach timeUp() kein Ergebnis gemeldet`);
      hostInst.onSubmit(p.uid, submits[p.uid]);
    }
    for (const p of bots) {
      const plan = plans[p.uid];
      if (!(plan.doneAt > 0 && plan.doneAt <= game.duration + 0.01)) throw new Error('botPlan.doneAt ungültig: ' + plan.doneAt);
      hostInst.onSubmit(p.uid, JSON.parse(JSON.stringify(hostInst.botFinal(plan))));
    }
    const res = hostInst.result();
    return { result: check(game, players, res), simTime: t, renders };
  }

  // host / turns: eine Simulation
  const ctx = mkCtx('p0');
  hostInst = game.create(ctx);
  instances.push(hostInst);
  instByUid.p0 = hostInst;
  hostInst.start();
  let t = 0, acc = 0, prev = null;
  const dt = 1 / 60;
  const isFinished = () => hostInst.isFinished && hostInst.isFinished();
  while (t < game.duration && !isFinished()) {
    t += dt; acc += dt;
    if (acc >= 0.05) {
      const snap = hostInst.snapshot();
      for (const p of players) {
        if (p.isBot) { const inp = hostInst.botThink(p, snap, acc); if (inp) hostInst.onInput(p.uid, inp); }
        else for (const o of fuzz(hostInst, p.uid, t, acc)) hostInst.onInput(p.uid, o);
      }
      acc = 0;
    }
    hostInst.update(dt);
    if (Math.round(t * 60) % 6 === 0) {
      const snap = JSON.parse(JSON.stringify(hostInst.snapshot()));
      assertFinite(snap);
      for (const p of players) {
        g.calls = 0;
        hostInst.render(g, snap, p.uid, 0.5, prev || snap); renders++;
      }
      // Zuschauer (nicht in der Liste) darf auch zeichnen
      hostInst.render(g, snap, 'zuschauer', 1, null); renders++;
      prev = snap;
    }
  }
  const res = hostInst.result();
  return { result: check(game, players, res), simTime: t, renders, inst: hostInst };
}

function check(game, players, res) {
  if (!res || !Array.isArray(res.ranks)) throw new Error('result() liefert keine ranks');
  const uids = players.map((p) => p.uid);
  const seen = new Set();
  for (const r of res.ranks) {
    if (!uids.includes(r.uid)) throw new Error('Unbekannter Spieler im Ergebnis: ' + r.uid);
    if (seen.has(r.uid)) throw new Error('Spieler doppelt im Ergebnis: ' + r.uid);
    seen.add(r.uid);
    if (!(Number.isInteger(r.rank) && r.rank >= 1 && r.rank <= uids.length)) throw new Error('Ungültiger Rang ' + r.rank);
  }
  if (seen.size !== uids.length) throw new Error(`Ergebnis enthält ${seen.size} von ${uids.length} Spielern`);
  JSON.stringify(res); assertFinite(res, 'result');
  const norm = normalizeResult(res, uids);
  if (game.teams === 'only' || (players[0].team != null)) {
    // Teammitglieder haben denselben Rang
    for (const a of players) for (const b of players) if (a.team === b.team && res.ranks.find((r) => r.uid === a.uid).rank !== res.ranks.find((r) => r.uid === b.uid).rank && game.teams === 'only') {
      throw new Error('Team-Spiel: Teammitglieder haben unterschiedliche Ränge');
    }
  }
  return { ranks: norm.map((r) => [r.uid, r.rank, r.label]), raw: res };
}
