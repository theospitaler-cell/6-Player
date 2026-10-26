// Host-Treiber: der Phasen-Automat einer Party. Läuft nur beim Admin (Host).
// Zustandslos gegenüber der Datenbank: alle Fristen stehen in meta.phaseUntil/startAt,
// dadurch kann ein neuer Host nach einem Wechsel nahtlos übernehmen.
import { TIMING } from './state.js';
import { byId, GAMES, STECHEN_GAME } from '../games/registry.js';
import { selectionPool } from './pool.js';
import { normalizeResult, cupPoints, duelPoints, scaleScores, assignTeams, selectDuelPlayers, tiedTop } from './scoring.js';
import { randInt, shuffle, randId } from './util.js';
import { toList } from './room.js';
import { makeBracket, nextMatch, recordGame, placements, readBracket, setWinner, resolveByes } from './ko.js';

export class HostDriver {
  /** hooks: { hasHostRunner(meta) → bool, onError(err), onNotice(text) } */
  constructor(room, hooks = {}) {
    this.room = room; this.tp = room.tp; this.hooks = hooks;
    this.timer = null; this.chain = Promise.resolve(); this.pending = 0;
    this.takeoverSince = null; this.allVotedAt = null; this.ending = false;
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 250); }
  stop() { clearInterval(this.timer); this.timer = null; }

  get busy() { return this.pending > 0; }
  /** Aktionen laufen nacheinander; Fehler werden gemeldet statt zu crashen. */
  run(fn) {
    this.pending++;
    const p = this.chain.then(fn).catch((e) => { console.error('Host-Aktion fehlgeschlagen', e); this.hooks.onError && this.hooks.onError(e); }).finally(() => { this.pending--; });
    this.chain = p;
    return p;
  }

  now() { return this.tp.serverNow(); }
  upd(obj) { return this.tp.update(this.room.p(), obj); }

  // ------------------------------------------------------------------ Takt
  tick() {
    const room = this.room, m = room.meta;
    if (!m || !room.isHost || this.busy) return;
    const now = this.now();
    switch (m.status) {
      case 'voting': return this.tickVote(m, now);
      case 'rolling': if (m.pick && now >= m.pick.until) this.run(() => this.startRound(m.pick.gameId)); return;
      case 'intro': {
        // alle Menschen haben „Überspringen“ getippt → sofort weiter
        const hum = this.room.humans().filter((p) => p.connected !== false), votes = this.room.d.votes || {};
        const allSkip = hum.length > 0 && hum.every((p) => votes[p.uid] === 'skip');
        if (allSkip || now >= (m.phaseUntil || 0)) this.run(() => this.beginPlay());
        return;
      }
      case 'bracket': if (now >= (m.phaseUntil || 0)) this.run(() => this.afterBracket()); return;
      case 'playing': return this.tickPlaying(m, now);
      case 'result': if (now >= (m.phaseUntil || 0)) this.run(() => this.afterResult()); return;
      case 'scoreboard': if (now >= (m.phaseUntil || 0)) this.run(() => this.afterScoreboard()); return;
      default: this.takeoverSince = null;
    }
  }

  tickVote(m, now) {
    const v = m.vote;
    if (!v) { this.run(() => this.beginSelection()); return; }
    const humans = this.room.humans().filter((p) => p.connected !== false);
    const votes = this.room.d.votes || {};
    const all = humans.length > 0 && humans.every((p) => votes[p.uid]);
    if (now >= v.until) { this.allVotedAt = null; this.run(() => this.resolveVote()); return; }
    if (all) {
      if (!this.allVotedAt) this.allVotedAt = now;
      else if (now - this.allVotedAt > 900) { this.allVotedAt = null; this.run(() => this.resolveVote()); }
    } else this.allVotedAt = null;
  }

  tickPlaying(m, now) {
    const hasRunner = this.hooks.hasHostRunner ? this.hooks.hasHostRunner(m) : true;
    if (!hasRunner) {
      // Wir sind gerade erst Host geworden → Runde mit neuem Countdown neu starten (ohne Punktverlust)
      if (this.takeoverSince == null) this.takeoverSince = now;
      else if (now - this.takeoverSince > 1800) { this.takeoverSince = null; this.run(() => this.restartRound()); }
    } else this.takeoverSince = null;
    // Sicherheitsnetz: die Runde darf nie hängen bleiben
    if (now > (m.startAt || 0) + (m.duration || 30) * 1000 + 12000) this.onGameEnd(null);
  }

  // ------------------------------------------------------------------ Party-Start
  poolInfo(extraPlayed) {
    const room = this.room, s = room.settings();
    const active = room.active();
    return selectionPool(GAMES, s, {
      nActive: active.length, nHumans: active.filter((p) => !p.isBot).length,
      played: extraPlayed || toList(room.meta.played),
    });
  }

  async startParty() {
    const room = this.room, s = room.settings();
    if (s.fillBots) { for (let guard = 0; room.list().length < 4 && guard < 6; guard++) await room.addBot(s.botLevel); }
    const active = room.active();
    if (active.length < 2) throw new Error('Für den Start braucht ihr mindestens 2 Spieler (Bots zählen mit).');
    const { pool } = selectionPool(GAMES, s, { nActive: active.length, nHumans: active.filter((p) => !p.isBot).length, played: [] });
    if (!pool.length) throw new Error('Keine passenden Spiele für diese Spielerzahl – prüfe den Spiele-Pool.');
    const o = {
      'meta/roundIndex': 0, 'meta/totalRounds': s.partyType === 'free' ? 0 : s.rounds, 'meta/played': null, 'meta/stechen': null,
      'meta/stechenOrder': null, 'meta/partyId': randId(8), 'meta/vote': null, 'meta/pick': null, 'meta/gameId': null,
      inputs: null, state: null, votes: null, submits: null, history: null, chan: null,
    };
    for (const p of room.list()) { o[`players/${p.uid}/score`] = 0; o[`players/${p.uid}/wins`] = 0; o[`players/${p.uid}/rs`] = 0; }
    await this.upd(o);
    if (s.partyType === 'ko') { await this.startKo(); return; }
    await this.beginSelection();
  }

  async rematch() { await this.startParty(); }

  async toLobby() {
    const o = {
      'meta/status': 'lobby', 'meta/roundIndex': 0, 'meta/played': null, 'meta/stechen': null, 'meta/stechenOrder': null, 'meta/vote': null,
      'meta/pick': null, 'meta/gameId': null, 'meta/phaseUntil': null, 'meta/startAt': null, 'meta/participants': null, 'meta/teams': null,
      inputs: null, state: null, votes: null, submits: null, history: null,
    };
    for (const p of this.room.list()) {
      o[`players/${p.uid}/score`] = 0; o[`players/${p.uid}/wins`] = 0; o[`players/${p.uid}/rs`] = 0;
      if (!p.isBot) o[`players/${p.uid}/ready`] = false;
    }
    await this.upd(o);
  }

  // ------------------------------------------------------------------ Spielauswahl
  async beginSelection() {
    const room = this.room, s = room.settings(), m = room.meta;
    const { pool, reset } = this.poolInfo();
    const base = { 'meta/vote': null, 'meta/pick': null, 'meta/gameId': null, 'meta/stechen': null, votes: null, state: null, inputs: null, 'meta/phaseUntil': null };
    if (reset) base['meta/played'] = null;
    if (!pool.length) {
      await this.upd({ ...base, 'meta/status': 'picking' }); // Admin sieht „nichts passt“ und kann Pool ändern
      this.hooks.onNotice && this.hooks.onNotice('Gerade passt kein Spiel – ändere den Spiele-Pool.');
      return;
    }
    if (pool.length === 1) { await this.upd(base); await this.startRound(pool[0].id, { played: reset ? [] : undefined }); return; }
    const now = this.now();
    const mode = s.cup && s.cup !== 'frei' ? 'random' : s.mode; // Themen-Cup: Reihenfolge zufällig
    if (mode === 'admin') { await this.upd({ ...base, 'meta/status': 'picking' }); return; }
    if (mode === 'random') {
      const choice = pool[randInt(0, pool.length - 1)].id;
      const reel = shuffle(GAMES.map((g) => g.id)).slice(0, 9).filter((id) => id !== choice).concat(choice);
      await this.upd({ ...base, 'meta/status': 'rolling', 'meta/pick': { gameId: choice, reel, until: now + TIMING.roll } });
      return;
    }
    const options = shuffle(pool).slice(0, 4).map((g) => g.id);
    // Achtung: Firebase erlaubt in einem Update keine überlappenden Pfade ('votes' + 'votes/x') → ein Objekt schreiben
    const botVotes = {};
    for (const b of room.bots()) botVotes[b.uid] = options[randInt(0, options.length - 1)];
    await this.upd({ ...base, votes: Object.keys(botVotes).length ? botVotes : null, 'meta/status': 'voting', 'meta/vote': { options, until: now + TIMING.vote } });
  }

  async resolveVote() {
    const room = this.room, m = room.meta;
    if (m.status !== 'voting' || !m.vote) return;
    const options = toList(m.vote.options);
    const counts = {};
    for (const [uid, g] of Object.entries(room.d.votes || {})) if (room.player(uid) && options.includes(g)) counts[g] = (counts[g] || 0) + 1;
    const max = Math.max(0, ...options.map((g) => counts[g] || 0));
    const top = options.filter((g) => (counts[g] || 0) === max);
    await this.startRound(top[randInt(0, top.length - 1)]);
  }

  async pickGame(id) {
    const m = this.room.meta;
    if (m.status !== 'picking' || !byId[id]) return;
    await this.startRound(id);
  }

  // ------------------------------------------------------------------ Runde
  async startRound(gameId, opts = {}) {
    const room = this.room, s = room.settings(), m = room.meta;
    const game = byId[gameId];
    if (!game) throw new Error('Unbekanntes Spiel: ' + gameId);
    const active = room.active();
    const rng = Math.random;
    let parts;
    if (opts.uids) parts = opts.uids.slice();
    else if (game.humansOnly) parts = active.filter((p) => !p.isBot).map((p) => p.uid).slice(0, game.max); // Bots können hier nicht mitspielen
    else if (game.duel && game.max < active.length) parts = selectDuelPlayers(active.map((p) => ({ uid: p.uid, score: p.score || 0 })), game.max, rng);
    else if (game.max < active.length) parts = shuffle(active.map((p) => p.uid)).slice(0, game.max);
    else parts = active.map((p) => p.uid);
    let teams = null;
    if (game.teams === 'only' || (game.teams === 'optional' && s.teamMode !== 'aus')) {
      const fixed = s.teamMode === 'fest' ? Object.fromEntries(room.list().map((p) => [p.uid, p.team])) : null;
      teams = assignTeams(parts, rng, fixed);
    }
    const roundIndex = opts.roundIndex != null ? opts.roundIndex : (m.roundIndex || 0);
    const played = opts.played !== undefined ? opts.played : toList(m.played);
    const o = {
      'meta/status': 'intro', 'meta/gameId': gameId, 'meta/seed': randInt(1, 2147483646), 'meta/participants': parts, 'meta/teams': teams,
      'meta/duration': Math.max(8, Math.round(game.duration * s.timeFactor)), 'meta/phaseUntil': this.now() + TIMING.intro,
      'meta/startAt': null, 'meta/vote': null, 'meta/pick': null, 'meta/activeN': active.length, 'meta/roundIndex': roundIndex,
      'meta/stechen': opts.stechen ? true : null, 'meta/koCur': opts.koCur || null,
      inputs: null, state: null, votes: null, [`submits/${roundIndex}`]: null, [`chan/${roundIndex}`]: null,
    };
    if (!opts.stechen) o['meta/played'] = [...played, gameId];
    await this.upd(o);
  }

  async beginPlay() {
    if (this.room.meta.status !== 'intro') return;
    await this.room.setMeta({ status: 'playing', startAt: this.now() + TIMING.countdown });
  }

  async restartRound() {
    const m = this.room.meta;
    if (m.status !== 'playing') return;
    await this.upd({ inputs: null, state: null, [`submits/${m.roundIndex}`]: null, [`chan/${m.roundIndex}`]: null, 'meta/startAt': this.now() + TIMING.countdown });
  }

  /** Vom Runner (oder dem Sicherheitsnetz) aufgerufen. res = {ranks:[…], teamRanks?} oder null (ungültig). */
  onGameEnd(res) {
    return this.run(async () => {
      const room = this.room, m = room.meta;
      if (m.status !== 'playing') return;
      await this.finishRound(res);
    });
  }

  async finishRound(res) {
    const room = this.room, m = room.meta, s = room.settings();
    const game = byId[m.gameId];
    const parts = toList(m.participants);
    const n = Math.max(m.activeN || parts.length, parts.length);
    const stechen = !!m.stechen;
    let ranks = null, valid = !!res;
    try { if (res) ranks = normalizeResult(res, parts); } catch (e) { console.error('Ergebnis ungültig', e); valid = false; }
    if (!ranks) valid = false;
    if (m.koCur) { await this.finishKoGame(m, valid, ranks, n); return; }
    let pts = {};
    const isLast = s.partyType === 'cup' && (m.roundIndex || 0) + 1 >= (m.totalRounds || 0) && !stechen;
    if (valid && !stechen) {
      if (game.duel) {
        const spect = room.active().map((p) => p.uid).filter((u) => !parts.includes(u));
        pts = duelPoints(n, ranks, spect);
      } else pts = cupPoints(ranks);
      if (isLast && s.doubleFinal) pts = scaleScores(pts, 2);
    }
    const o = {
      [`history/${m.roundIndex}`]: {
        g: m.gameId, valid, st: stechen ? 1 : 0, fin: isLast ? 1 : 0, n,
        ranks: valid ? ranks.map((r) => ({ uid: r.uid, rank: r.rank, v: r.value ?? null, l: r.label || '' })) : null,
        pts: valid ? pts : null,
      },
      'meta/status': 'result', 'meta/phaseUntil': this.now() + TIMING.result,
    };
    if (valid && !stechen) {
      const rankOf = Object.fromEntries(ranks.map((r) => [r.uid, r.rank]));
      for (const [uid, add] of Object.entries(pts)) {
        const p = room.player(uid);
        if (!p) continue;
        o[`players/${uid}/score`] = (p.score || 0) + add;
        if (rankOf[uid] != null) {
          o[`players/${uid}/wins`] = (p.wins || 0) + (rankOf[uid] === 1 ? 1 : 0);
          o[`players/${uid}/rs`] = (p.rs || 0) + rankOf[uid];
        }
      }
    }
    if (valid && stechen) o['meta/stechenOrder'] = ranks.slice().sort((a, b) => a.rank - b.rank).map((r) => r.uid);
    await this.upd(o);
  }

  async afterResult() {
    const room = this.room, m = room.meta, s = room.settings();
    if (m.status !== 'result') return;
    if (m.stechen) { await this.finishParty(); return; }
    if (m.koCur) { await room.setMeta({ status: 'bracket', phaseUntil: this.now() + TIMING.bracket, roundIndex: (m.roundIndex || 0) + 1 }); return; }
    if (s.partyType === 'free') { await room.setMeta({ roundIndex: (m.roundIndex || 0) + 1 }); await this.beginSelection(); return; }
    await room.setMeta({ status: 'scoreboard', phaseUntil: this.now() + TIMING.scoreboard });
  }

  async afterScoreboard() {
    const room = this.room, m = room.meta;
    if (m.status !== 'scoreboard') return;
    if ((m.roundIndex || 0) + 1 >= (m.totalRounds || 0)) { await this.conclude(); return; }
    await room.setMeta({ roundIndex: (m.roundIndex || 0) + 1 });
    await this.beginSelection();
  }

  /** Alle Runden gespielt: Gleichstand an der Spitze → Stechen im Schnellzieher, sonst fertig. */
  async conclude() {
    const room = this.room, m = room.meta;
    const tied = tiedTop(room.list().map((p) => ({ uid: p.uid, score: p.score, wins: p.wins, rs: p.rs })));
    const ok = tied.length >= 2 && tied.every((u) => { const p = room.player(u); return p && (p.isBot || p.connected !== false); }) && byId[STECHEN_GAME];
    if (ok) { await this.startRound(STECHEN_GAME, { uids: tied, stechen: true, roundIndex: (m.roundIndex || 0) + 1 }); return; }
    await this.finishParty();
  }

  async finishParty() { await this.room.setMeta({ status: 'finished', phaseUntil: null }); }

  // ------------------------------------------------------------------ Admin-Menü
  async abortRound() {
    const room = this.room, m = room.meta;
    if (!['intro', 'playing'].includes(m.status)) return;
    if (m.koCur) { await this.upd({ inputs: null, state: null, [`submits/${m.roundIndex}`]: null, [`chan/${m.roundIndex}`]: null }); await this.beginKoGame(); return; }
    const played = toList(m.played).filter((g) => g !== m.gameId);
    await this.upd({ 'meta/played': played.length ? played : null, inputs: null, state: null, [`submits/${m.roundIndex}`]: null });
    await this.beginSelection();
  }

  async endParty() {
    const m = this.room.meta;
    if (m.status === 'lobby') return;
    if (m.koCur || m.ko) { const br = readBracket(m.ko); if (br) { await this.finishKo(br); return; } }
    if (this.room.d.history.length) await this.finishParty(); else await this.toLobby();
  }

  // ------------------------------------------------------------------ K.-o.-Turnier
  koPool() {
    const s = this.room.settings();
    return GAMES.filter((g) => g.min <= 2 && g.max >= 2 && !g.humansOnly && g.category !== 'Koop' && !(s.off && s.off[g.id]) && !(s.offCats && s.offCats[g.category]));
  }

  async startKo() {
    const room = this.room;
    if (!this.koPool().length) throw new Error('Für das K.-o.-Turnier ist kein Spiel für 2 Spieler freigeschaltet – prüfe den Spiele-Pool.');
    const seeded = room.active().map((p) => ({ uid: p.uid, lvl: p.level || 1, r: Math.random() })).sort((a, b) => b.lvl - a.lvl || a.r - b.r).map((x) => x.uid);
    const br = makeBracket(seeded);
    await this.upd({ 'meta/ko': br, 'meta/koCur': null, 'meta/koPlace': null, 'meta/status': 'bracket', 'meta/phaseUntil': this.now() + TIMING.bracket, 'meta/totalRounds': 0 });
  }

  async afterBracket() {
    if (this.room.meta.status !== 'bracket') return;
    await this.beginKoGame();
  }

  async beginKoGame() {
    const room = this.room, m = room.meta;
    const br = readBracket(m.ko);
    const nm = br && nextMatch(br);
    if (!nm) { await this.finishKo(br); return; }
    const mt = br.rounds[nm.r][nm.m];
    const pa = room.player(mt.a), pb = room.player(mt.b);
    if (!pa || !pb) { // wer gegangen ist, verliert kampflos
      setWinner(br, nm.r, nm.m, pa ? mt.a : (pb ? mt.b : '-'), true);
      resolveByes(br);
      await this.upd({ 'meta/ko': br });
      await this.beginKoGame();
      return;
    }
    const used = mt.gs ? mt.gs.split(',') : [];
    const pool = this.koPool();
    const fresh = pool.filter((g) => !used.includes(g.id));
    const list = fresh.length ? fresh : pool;
    const g = list[randInt(0, list.length - 1)];
    await this.startRound(g.id, { uids: [mt.a, mt.b], koCur: `${nm.r}:${nm.m}` });
  }

  async finishKoGame(m, valid, ranks, n) {
    const [r, mi] = String(m.koCur).split(':').map(Number);
    const br = readBracket(m.ko);
    const mt = br.rounds[r][mi];
    let side = -1;
    if (valid && ranks) { const top = ranks.filter((x) => x.rank === 1); if (top.length === 1) side = top[0].uid === mt.a ? 0 : 1; }
    recordGame(br, r, mi, side, m.gameId);
    const o = {
      [`history/${m.roundIndex}`]: {
        g: m.gameId, valid, st: 0, fin: 0, n,
        ranks: valid ? ranks.map((x) => ({ uid: x.uid, rank: x.rank, v: x.value ?? null, l: x.label || '' })) : null, pts: null,
        ko: { r, m: mi, a: mt.a, b: mt.b, wa: mt.wa, wb: mt.wb, w: mt.w },
      },
      'meta/ko': br, 'meta/status': 'result', 'meta/phaseUntil': this.now() + TIMING.result,
    };
    await this.upd(o);
  }

  async finishKo(br) {
    const pl = br ? placements(br) : {};
    const o = { 'meta/koPlace': pl, 'meta/status': 'finished', 'meta/phaseUntil': null, 'meta/koCur': null };
    if (br) o['meta/ko'] = br;
    await this.upd(o);
  }
}
