// GameRunner: führt EIN Spiel auf diesem Gerät aus (Canvas, Steuerung, Netzwerk-Sync).
//  - sync 'host' / 'turns': der Host simuliert, schickt Snapshots (~15 Hz); Clients interpolieren.
//  - sync 'local': jeder simuliert sein eigenes Feld (gleicher Seed), meldet Fortschritt + Ergebnis.
import { createControls } from './input.js';
import { sfx, vibrate } from './audio.js';
import { h, clear } from './ui.js';
import { mulberry32, clamp } from './util.js';
import { text, rrect } from './draw.js';
import { toList } from './room.js';
import { TS } from './transport.js';
import { TEAM_COLORS } from './state.js';
import { profile } from './profile.js';

const SNAP_MS = 66;        // Snapshot-Takt (~15 Hz)
const SEND_MS = 50;        // Eingaben höchstens alle 50 ms (20 Hz)
const REACTIONS = ['😂', '🔥', '👏', '😡'];

/** Sendet Eingaben nur bei Änderung, höchstens 20×/s; der letzte Zustand geht immer raus. */
class InputSender {
  constructor(tp, path, round) { this.tp = tp; this.path = path; this.round = round; this.seq = 0; this.last = 0; this.pending = null; this.timer = null; }
  push(obj) {
    this.pending = obj;
    const wait = SEND_MS - (performance.now() - this.last);
    if (wait <= 0) this._flush();
    else if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this._flush(); }, wait);
  }
  _flush() {
    if (!this.pending) return;
    const o = this.pending; this.pending = null; this.last = performance.now();
    this.tp.set(this.path, { ...o, n: ++this.seq, r: this.round }).catch(() => {});
  }
  stop() { clearTimeout(this.timer); }
}

export class GameRunner {
  /** opts: { tp, room, game, meta, onEnd(result|null), onMenu() } */
  constructor(opts) {
    this.o = opts;
    const { tp, room, game, meta } = opts;
    this.tp = tp; this.room = room; this.game = game; this.meta = meta;
    this.me = tp.uid;
    this.round = meta.roundIndex || 0;
    this.startAt = meta.startAt;
    this.duration = meta.duration;
    this.endAt = this.startAt + this.duration * 1000;
    this.key = `${this.round}:${this.startAt}`;
    const settings = room.settings();
    this.settings = settings;

    const uids = toList(meta.participants);
    this.players = uids.map((uid, idx) => {
      const p = room.player(uid) || { name: '?', avatar: '❔', color: 'red', colorHex: '#888' };
      return {
        uid, idx, name: p.name, avatar: p.avatar, color: p.color, colorHex: p.colorHex,
        isBot: !!p.isBot, botLevel: p.botLevel || settings.botLevel,
        team: meta.teams && meta.teams[uid] != null ? Number(meta.teams[uid]) : null,
      };
    });
    this.byUid = Object.fromEntries(this.players.map((p) => [p.uid, p]));
    this.isPlayer = !!this.byUid[this.me];
    this.isHost = room.isHost;
    // Host-Aufgaben sind nur sinnvoll, wenn dieses Gerät VOR dem Start dabei war – sonst übernimmt der Treiber mit einem Neustart der Runde
    this.hostFromStart = this.isHost && tp.serverNow() < this.startAt;
    this.local = game.sync === 'local';
    this.simHere = this.local ? this.isPlayer : this.isHost;

    this.ctx = {
      game, players: this.players, byUid: this.byUid, me: this.me, isHost: this.isHost,
      seed: meta.seed, rng: mulberry32(meta.seed), settings, duration: this.duration,
      serverNow: () => tp.serverNow(), now: () => performance.now(), sfx, vibrate,
      submit: (payload) => this._submit(payload),
    };
    this.inst = game.create(this.ctx);

    this.started = false; this.ended = false; this.dead = false; this.timedUp = false;
    this.buf = []; this.lat = 40; this.hostSnap = null;
    this.live = {}; this.fin = {}; this.finals = new Set(); this.plans = {};
    this.seen = {}; this.errors = 0; this.lastCount = null; this.out = false;
    this.lastSnapAt = 0; this.lastSnapJson = ''; this.lastProg = null; this.lastProgAt = 0;
    this.botAcc = 0; this.hostLast = 0; this.goShown = 0;
    this.unsubs = [];
  }

  // ---------------------------------------------------------------- DOM
  mount(root) {
    const g = this.game;
    this.el = h('div', { class: 'game' + (this.isPlayer ? '' : ' spectator') });
    const myTeam = this.byUid[this.me] && this.byUid[this.me].team;
    this.timerEl = h('div', { class: 'hud-timer' }, String(Math.round(this.duration)));
    const left = this.isHost
      ? h('button', { class: 'icon-btn hud-pause', type: 'button', onclick: () => this.o.onMenu && this.o.onMenu(), 'aria-label': 'Menü' }, '⏸')
      : h('div', { class: 'hud-round' }, this.settings.partyType === 'free' ? 'Freies Spiel' : `Runde ${this.round + 1}/${this.meta.totalRounds}`);
    this.el.appendChild(h('div', { class: 'hud' }, left, h('div', { class: 'hud-title' }, `${g.emoji} ${g.name}`), this.timerEl));

    this.canvas = h('canvas', { class: 'game-canvas' });
    this.overlay = h('div', { class: 'count-overlay' });
    this.stage = h('div', { class: 'stage' }, this.canvas, this.overlay);
    if (myTeam != null) this.stage.appendChild(h('div', { class: 'team-badge', style: { background: TEAM_COLORS[myTeam].hex } }, `Dein Team: ${TEAM_COLORS[myTeam].emoji} ${TEAM_COLORS[myTeam].short}`));
    if (!this.isPlayer) this.stage.appendChild(h('div', { class: 'spec-badge' }, '👀 Du schaust zu'));

    // Querformat: links Steuerung | Spielfeld | rechts Steuerung (Breite je nach Spiel)
    const lay = this._layout();
    const kind = 'kind-' + String(g.controls).replace('+', '-');
    this.ctlL = h('div', { class: 'ctl-col left ' + kind });
    this.ctlR = h('div', { class: 'ctl-col right ' + kind });
    this.ctlL.style.flex = lay.l ? `0 0 ${lay.l * 100}%` : '0 0 0';
    this.ctlR.style.flex = lay.r ? `0 0 ${lay.r * 100}%` : '0 0 0';
    if (!lay.l) this.ctlL.style.display = 'none';
    if (!lay.r) this.ctlR.style.display = 'none';
    this.el.appendChild(h('div', { class: 'game-main' }, this.ctlL, this.stage, this.ctlR));
    this.reactBar = h('div', { class: 'reactbar' }, h('span', { class: 'react-hint' }, 'Reagiere:'),
      REACTIONS.map((e) => h('button', { class: 'react-btn', type: 'button', onclick: () => this.room.react(e) }, e)));
    this.el.appendChild(this.reactBar);
    root.appendChild(this.el);

    this.g2d = this.canvas.getContext('2d');
    this._fit();
    this.ro = new ResizeObserver(() => this._fit());
    this.ro.observe(this.stage);

    // Steuerung
    if (this.isPlayer) {
      if (g.controls === 'PICK') {
        if (this.inst.mountUI) this.inst.mountUI(this.ctlR, { send: (o) => this._onInput(o) });
      } else {
        this.controls = createControls(g, { left: this.ctlL, right: this.ctlR }, {
          onInput: (o) => this._onInput(o), color: this.byUid[this.me].colorHex, tapSide: profile.settings.tapSide === 'L' ? 'L' : 'R',
        });
      }
      if (g.stageInput && this.inst.onStagePointer) {
        this.canvas.addEventListener('pointerdown', (e) => {
          const r = this.canvas.getBoundingClientRect();
          const inp = this.inst.onStagePointer((e.clientX - r.left) / r.width * g.view.w, (e.clientY - r.top) / r.height * g.view.h);
          if (inp) this._onInput(inp);
        });
      }
    }
    this._updateOut();
    this._subscribe();

    this.last = performance.now();
    const frame = (ts) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this._frame(dt);
    };
    this.raf = requestAnimationFrame(frame);
    if (this.simHere && !this.local) this.hostTimer = setInterval(() => this._hostTick(), 20);
    if (this.isHost) this.bgTimer = setInterval(() => this._hostSlow(), 250);
    this.writeSnap(true);
    return this;
  }

  /** Breite der Steuer-Spalten (Anteil der Bildschirmbreite). */
  _layout() {
    const g = this.game;
    if (g.layout) return g.layout;
    const left = profile.settings.tapSide === 'L';
    switch (g.controls) {
      case 'TAP': return left ? { l: 0.32, r: 0 } : { l: 0, r: 0.32 };
      case 'LR': return { l: 0.27, r: 0.27 };
      case 'JOY': return { l: 0.42, r: 0 };
      case 'JOY+BTN': return { l: 0.4, r: 0.24 };
      case 'PICK': return { l: 0, r: g.ctlWidth != null ? g.ctlWidth : 0.42 };
      default: return { l: 0, r: 0 };
    }
  }

  _fit() {
    if (this.dead || !this.stage) return;
    const r = this.stage.getBoundingClientRect();
    const { w, h: hh } = this.game.view;
    if (r.width < 20 || r.height < 20) return;
    const s = Math.min(r.width / w, r.height / hh);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.style.width = Math.floor(w * s) + 'px';
    this.canvas.style.height = Math.floor(hh * s) + 'px';
    this.canvas.width = Math.round(w * s * dpr);
    this.canvas.height = Math.round(hh * s * dpr);
    this.k = (this.canvas.width / w);
  }

  // ---------------------------------------------------------------- Netzwerk
  _subscribe() {
    const { tp, room } = this;
    if (this.local) {
      this.unsubs.push(tp.on(room.p(`submits/${this.round}`), (v) => this._onSubmits(v || {})));
    } else {
      if (!this.isHost) {
        this.unsubs.push(tp.on(room.p('state'), (v) => {
          if (!v || v.r !== this.round || !v.s) return;
          try {
            const d = JSON.parse(v.s);
            const arrive = tp.serverNow();
            this.lat = this.lat * 0.9 + clamp(arrive - v.t, 0, 600) * 0.1;
            if (!this.buf.length || v.t > this.buf[this.buf.length - 1].t) {
              this.buf.push({ t: v.t, d });
              if (this.buf.length > 10) this.buf.shift();
            }
          } catch (e) { console.warn('Snapshot kaputt', e); }
        }));
      } else {
        this.sender = null;
        this.unsubs.push(tp.on(room.p('inputs'), (all) => this._onInputs(all || {})));
      }
      if (!this.isHost && this.isPlayer) this.sender = new InputSender(tp, room.p('inputs/' + this.me), this.round);
    }
  }

  _onInputs(all) {
    for (const [uid, v] of Object.entries(all)) {
      if (!v || v.r !== this.round || this.seen[uid] === v.n) continue;
      this.seen[uid] = v.n;
      if (uid === this.me || !this.byUid[uid] || !this.started || this.ended) continue;
      const { n, r, ...inp } = v;
      try { this.inst.onInput(uid, inp); } catch (e) { this._err(e); }
    }
  }

  _onSubmits(v) {
    for (const [uid, e] of Object.entries(v)) {
      if (!e) continue;
      this.live[uid] = e.p || 0;
      if (e.f) this.fin[uid] = true;
      if (this.isHost && e.f && !this.finals.has(uid) && this.byUid[uid]) {
        this.finals.add(uid);
        try { this.inst.onSubmit(uid, e.d); } catch (err) { this._err(err); }
      }
    }
  }

  _onInput(obj) {
    if (!this.started || this.ended || this.timedUp) return;
    if (this.local || this.isHost) { try { this.inst.onInput(this.me, obj); } catch (e) { this._err(e); } }
    else if (this.sender) this.sender.push(obj);
  }

  _submit(payload) {
    if (this.dead) return;
    const p = this.inst.progress ? this.inst.progress() : 0;
    this.fin[this.me] = true;
    this.tp.set(this.room.p(`submits/${this.round}/${this.me}`), { p, f: 1, d: payload, t: TS }).catch((e) => console.warn('Ergebnis senden', e));
  }

  writeSnap(force = false) {
    if (this.local || !this.isHost) return;
    const now = performance.now();
    if (!force && now - this.lastSnapAt < SNAP_MS) return;
    let s;
    try { s = JSON.stringify(this.inst.snapshot()); } catch (e) { this._err(e); return; }
    if (!force && s === this.lastSnapJson && now - this.lastSnapAt < 1000) return; // nur bei Änderung (+ Herzschlag)
    this.lastSnapJson = s; this.lastSnapAt = now;
    this.tp.set(this.room.p('state'), { t: this.tp.serverNow(), r: this.round, s }).catch(() => {});
  }

  // ---------------------------------------------------------------- Host
  _botControlled(p) {
    if (p.isBot) return true;
    const cur = this.room.player(p.uid);
    return !!(this.settings.botTakeover && cur && cur.connected === false);
  }

  _hostTick() {
    if (this.dead || this.ended) return;
    const now = performance.now();
    if (!this.started) { if (now - this.lastSnapAt > 1000) this.writeSnap(true); this.hostLast = now; return; }
    let dt = (now - this.hostLast) / 1000;
    this.hostLast = now;
    dt = Math.min(dt, 0.25);
    try {
      this.botAcc += dt;
      if (this.botAcc >= 0.05) {
        const snap = this.inst.snapshot();
        for (const p of this.players) {
          if (!this._botControlled(p)) continue;
          const inp = this.inst.botThink && this.inst.botThink({ ...p, botLevel: p.isBot ? p.botLevel : this.settings.botLevel }, snap, this.botAcc);
          if (inp) this.inst.onInput(p.uid, inp);
        }
        this.botAcc = 0;
      }
      let rem = dt;
      while (rem > 1e-6) { const st = Math.min(rem, 1 / 60); this.inst.update(st); rem -= st; }
      this.hostSnap = this.inst.snapshot();
    } catch (e) { this._err(e); }
    this.writeSnap();
    if ((this.inst.isFinished && this.inst.isFinished()) || this.tp.serverNow() >= this.endAt) this._end();
  }

  /** 4×/s: Bots für lokale Spiele, Ende-Prüfung. */
  _hostSlow() {
    if (this.dead || this.ended || !this.started || !this.local) return;
    const t = Math.max(0, (this.tp.serverNow() - this.startAt) / 1000);
    for (const p of this.players) {
      if (this.finals.has(p.uid) || !this._botControlled(p)) continue;
      try {
        const plan = this.plans[p.uid] || (this.plans[p.uid] = this.inst.botPlan({ ...p, botLevel: p.isBot ? p.botLevel : this.settings.botLevel }));
        const prog = this.inst.botProgress(plan, t);
        const path = this.room.p(`submits/${this.round}/${p.uid}`);
        if (t >= plan.doneAt) this.tp.set(path, { p: prog, f: 1, d: this.inst.botFinal(plan), t: TS }).catch(() => {});
        else if (this.live[p.uid] !== prog) this.tp.update(path, { p: prog }).catch(() => {});
      } catch (e) { this._err(e); }
    }
    const now = this.tp.serverNow();
    const all = this.players.every((p) => this.finals.has(p.uid));
    if ((all && !this.allAt) ) this.allAt = performance.now();
    if ((this.allAt && performance.now() - this.allAt > 700) || now >= this.endAt + 3500) this._end();
  }

  _end() {
    if (this.ended || this.dead) return;
    this.ended = true;
    this.controls && this.controls.setEnabled(false);
    this.writeSnap(true);
    setTimeout(() => {
      if (this.dead) return;
      let res = null;
      try { res = this.inst.result(); } catch (e) { console.error('Ergebnis fehlgeschlagen', e); }
      this.o.onEnd && this.o.onEnd(res);
    }, this.local ? 100 : 900);
  }

  _err(e) {
    console.error('Spiel-Fehler', this.game.id, e);
    if (++this.errors > 25 && this.isHost && !this.ended) { this.ended = true; this.o.onEnd && this.o.onEnd(null); }
  }

  // ---------------------------------------------------------------- Frame
  _frame(dt) {
    const now = this.tp.serverNow();
    if (!this.started && now >= this.startAt) {
      this.started = true; this.goShown = performance.now();
      if (this.simHere) { try { this.inst.start(); } catch (e) { this._err(e); } }
      if (!this.local && this.isHost) this.hostLast = performance.now();
      this.controls && this.controls.setEnabled(this.isPlayer);
      sfx('go'); vibrate(40);
    }
    if (this.started && this.local && this.isPlayer && !this.timedUp) {
      if (now >= this.endAt) {
        this.timedUp = true; this.controls && this.controls.setEnabled(false);
        try { this.inst.timeUp && this.inst.timeUp(); } catch (e) { this._err(e); }
      } else {
        try { this.inst.update(dt); } catch (e) { this._err(e); }
        if (performance.now() - this.lastProgAt > 300 && this.inst.progress && !this.fin[this.me]) {
          const p = this.inst.progress();
          this.lastProgAt = performance.now();
          if (p !== this.lastProg) { this.lastProg = p; this.tp.update(this.room.p(`submits/${this.round}/${this.me}`), { p }).catch(() => {}); }
        }
      }
    }
    this._hud(now);
    this._updateOut();
    if (this.inst.updateUI) { try { this.inst.updateUI(this._viewSnap().snap || {}, this.me); } catch { /* UI-Update darf nie stören */ } }
    this._draw();
  }

  _hud(now) {
    if (!this.started) {
      const ms = this.startAt - now;
      const n = Math.ceil(ms / 1000);
      if (ms > 3000) { this._overlay(`<div class="count-ready">${this.game.emoji}<small>Mach dich bereit!</small></div>`, 'ready'); }
      else if (n !== this.lastCount) {
        this.lastCount = n; sfx('count'); vibrate(10);
        this._overlay(`<div class="count-n">${n}</div>`, 'n' + n);
      }
      this.timerEl.textContent = String(Math.round(this.duration));
      return;
    }
    if (this.overlay.firstChild && performance.now() - this.goShown > 700) { clear(this.overlay); this.ovKey = null; }
    else if (this.ovKey !== 'go' && performance.now() - this.goShown <= 700) this._overlay('<div class="count-n go">LOS!</div>', 'go');
    const rem = Math.max(0, Math.ceil((this.endAt - now) / 1000));
    if (this.timerEl.textContent !== String(rem)) { this.timerEl.textContent = String(rem); this.timerEl.classList.toggle('low', rem <= 5 && !this.ended); }
  }
  _overlay(html, key) {
    if (this.ovKey === key) return;
    this.ovKey = key; this.overlay.innerHTML = html;
  }

  _updateOut() {
    const out = !this.isPlayer || (this.started && this.inst.isOut && this.inst.isOut(this.me)) || this.ended || this.timedUp;
    const spec = !this.isPlayer || (this.inst.isOut && this.inst.isOut(this.me));
    if (spec !== this.specMode) {
      this.specMode = spec;
      this.el.classList.toggle('spectator', !!spec);
      if (spec && this.isPlayer) this.controls && this.controls.setEnabled(false);
    }
    this.out = out;
  }

  _viewSnap() {
    if (this.local) {
      const live = { ...this.live };
      if (this.isPlayer && this.inst.progress) live[this.me] = this.inst.progress();
      return { snap: { p: live, f: this.fin }, prev: null, alpha: 1 };
    }
    if (this.isHost) {
      if (!this.hostSnap) { try { this.hostSnap = this.inst.snapshot(); } catch { return {}; } }
      return { snap: this.hostSnap, prev: null, alpha: 1 };
    }
    const b = this.buf;
    if (!b.length) return {};
    const delay = clamp(this.lat + 75, 100, 420);
    const rt = this.tp.serverNow() - delay;
    const last = b[b.length - 1];
    if (b.length === 1 || rt >= last.t) return { snap: last.d, prev: b.length > 1 ? b[b.length - 2].d : null, alpha: 1 };
    if (rt <= b[0].t) return { snap: b[0].d, prev: null, alpha: 1 };
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= rt) return { snap: b[i].d, prev: b[i - 1].d, alpha: clamp((rt - b[i - 1].t) / (b[i].t - b[i - 1].t), 0, 1) };
    }
    return { snap: last.d, prev: null, alpha: 1 };
  }

  _draw() {
    const g = this.g2d;
    if (!g || !this.k) return;
    const { w, h: hh } = this.game.view;
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.clearRect(0, 0, w, hh);
    const v = this._viewSnap();
    if (!v.snap) { text(g, 'Verbinde…', w / 2, hh / 2, { size: 20, color: 'rgba(255,255,255,.8)' }); return; }
    try { this.inst.render(g, v.snap, this.me, v.alpha, v.prev); } catch (e) { this._err(e); }
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.hostTimer); clearInterval(this.bgTimer);
    for (const u of this.unsubs) { try { u(); } catch { /* egal */ } }
    this.unsubs = [];
    if (this.sender) this.sender.stop();
    if (this.controls) this.controls.destroy();
    if (this.ro) this.ro.disconnect();
    if (this.el) this.el.remove();
  }
}
