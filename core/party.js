// Party: verbindet Raum-Daten, Host-Treiber, Bildschirme und Spiel-Runner.
import { HostDriver } from './host.js';
import { GameRunner } from './runner.js';
import { byId } from '../games/registry.js';
import * as scr from './screens.js';
import { lobbyScreen } from './lobby.js';
import { h, mountScreen, showScreen, screenName, toast, dialog, confirmDialog, floatEmoji } from './ui.js';
import { profile, award, roundReward, partyReward, saveProfile, levelInfo } from './profile.js';
import { app } from './state.js';
import { startMusic, stopMusic, sfx } from './audio.js';
import { toList, Room } from './room.js';
import { standings } from './scoring.js';

export class Party {
  constructor(room, { solo = false, onExit = () => {} } = {}) {
    this.room = room; this.tp = room.tp; this.solo = solo; this.onExit = onExit;
    this.dead = false; this.runner = null; this.reward = null; this.rewarded = null; this.rq = null;
    this.driver = new HostDriver(room, {
      hasHostRunner: (m) => !!(this.runner && this.runner.isHost && this.runner.hostFromStart && this.runner.key === `${m.roundIndex}:${m.startAt}`),
      onError: (e) => toast(e && e.message ? e.message : 'Hoppla, da ist etwas schiefgelaufen.', 3500, 'bad'),
      onNotice: (t) => toast(t, 3500),
    });
    this.banner = h('div', { class: 'net-banner' }, '📡 Verbindung verloren – versuche neu zu verbinden …');
    document.body.appendChild(this.banner);
    this.off = room.on((what, data) => this.onRoom(what, data));
    this.visH = () => { if (document.visibilityState === 'visible') this.requestWake(); };
    document.addEventListener('visibilitychange', this.visH);
  }

  start() {
    this.driver.start();
    this.requestWake();
    startMusic();
    this.schedule();
  }

  // ------------------------------------------------------------------ Ereignisse
  onRoom(what, data) {
    if (this.dead) return;
    if (what === 'kicked') { toast('Du wurdest aus der Party entfernt.', 3500, 'bad'); this.exit(); return; }
    if (what === 'reaction') { const p = this.room.player(data.uid); floatEmoji(data.e, p ? p.colorHex : '#fff'); return; }
    if (what === 'connection') { this.banner.classList.toggle('show', !data && !this.solo); return; }
    this.schedule();
  }
  schedule() {
    if (this.rq) return;
    this.rq = setTimeout(() => { this.rq = null; try { this.render(); } catch (e) { console.error('Render-Fehler', e); } }, 0);
  }

  // ------------------------------------------------------------------ Anzeige
  render() {
    if (this.dead) return;
    const room = this.room, m = room.meta;
    if (!m) { if (screenName() !== 'loading') showScreen('loading', scr.waitingScreen('Lade Party …')); return; }
    this.checkRewards(m);
    switch (m.status) {
      case 'lobby': mountScreen('lobby', () => lobbyScreen(this)); break;
      case 'voting': mountScreen('voting', () => scr.votingScreen(this)); break;
      case 'picking': mountScreen('picking', () => scr.pickingScreen(this)); break;
      case 'rolling': mountScreen('rolling', () => scr.rollingScreen(this)); break;
      case 'intro': mountScreen('intro', () => scr.introScreen(this)); break;
      case 'playing': this.renderGame(m); break;
      case 'result': mountScreen('result', () => scr.resultScreen(this)); break;
      case 'scoreboard': mountScreen('scoreboard', () => scr.scoreboardScreen(this)); break;
      case 'finished': mountScreen('finished', () => scr.finishedScreen(this)); break;
      default: break;
    }
  }

  renderGame(m) {
    const key = `${m.roundIndex}:${m.startAt}:${this.room.isHost ? 1 : 0}`;
    if (screenName() === 'game:' + key) return;
    if (!m.startAt) return; // Startzeit kommt gleich
    this.runner = null;
    const game = byId[m.gameId];
    let runner;
    try {
      runner = new GameRunner({
        tp: this.tp, room: this.room, game, meta: JSON.parse(JSON.stringify(m)),
        onEnd: (res) => this.driver.onGameEnd(res), onMenu: () => this.openMenu(),
      });
    } catch (e) {
      console.error('Spielstart fehlgeschlagen', e);
      toast('Das Spiel konnte nicht gestartet werden.', 3000, 'bad');
      if (this.room.isHost) this.driver.onGameEnd(null);
      return;
    }
    const wrap = h('div', { class: 'game-wrap' });
    showScreen('game:' + key, { el: wrap, update() {}, destroy: () => runner.destroy() });
    runner.mount(wrap);
    this.runner = runner;
  }

  // ------------------------------------------------------------------ XP & Münzen
  checkRewards(m) {
    const room = this.room;
    if (m.status === 'result' && !m.stechen) {
      const k = `${m.partyId}:${m.roundIndex}`;
      const rec = room.roundRecord(m.roundIndex);
      if (this.rewarded !== k && rec) {
        this.rewarded = k;
        if (rec.valid) {
          const r = toList(rec.ranks).find((x) => x.uid === room.uid);
          if (r) {
            const rw = roundReward(r.rank, toList(rec.ranks).length);
            const res = award(rw.xp, rw.coins);
            profile.stats.rounds++; if (r.rank === 1) profile.stats.roundWins++;
            saveProfile();
            this.reward = { key: k, round: m.roundIndex, xp: rw.xp, coins: rw.coins };
            sfx(r.rank === 1 ? 'win' : 'coin');
            if (res.leveledUp) setTimeout(() => toast(`⭐ Level ${res.level}! Glückwunsch!`, 3500), 600);
          }
        }
      }
    }
    if (m.status === 'finished' && m.partyId && profile.lastParty !== m.partyId && !this.solo) {
      profile.lastParty = m.partyId;
      const table = standings(room.list().map((p) => ({ uid: p.uid, score: p.score, wins: p.wins, rs: p.rs })), toList(m.stechenOrder));
      const mine = table.find((p) => p.uid === room.uid);
      if (mine) {
        const rw = partyReward(mine.place, table.length);
        const res = award(rw.xp, rw.coins);
        profile.stats.parties++; if (mine.place === 1) profile.stats.wins++;
        saveProfile();
        this.reward = { key: 'p' + m.partyId, party: true, xp: rw.xp, coins: rw.coins };
        if (res.leveledUp) setTimeout(() => toast(`⭐ Level ${res.level}!`, 3500), 900);
      }
    }
  }

  // ------------------------------------------------------------------ Menü
  async openMenu() {
    const host = this.room.isHost;
    const st = this.room.meta && this.room.meta.status;
    const buttons = [{ label: '▶ Weiterspielen', value: 'back', kind: 'primary' }];
    if (host && ['playing', 'intro'].includes(st)) buttons.push({ label: '⏭ Runde abbrechen', value: 'skip' });
    if (host) buttons.push({ label: this.solo ? '🏁 Training beenden' : '🏁 Party beenden', value: this.solo ? 'leave' : 'end' });
    if (!this.solo || !host) buttons.push({ label: '🚪 Party verlassen', value: 'leave' });
    const v = await dialog({ title: 'Menü', text: host ? 'Als Admin kannst du die Runde oder die ganze Party beenden.' : 'Die Party läuft ohne dich weiter.', buttons });
    if (v === 'skip') this.driver.run(() => this.driver.abortRound());
    else if (v === 'end') { if (await confirmDialog('Party beenden?', 'Alle sehen dann den Endstand.', 'Beenden')) this.driver.run(() => this.driver.endParty()); }
    else if (v === 'leave') this.confirmLeave();
  }

  async confirmLeave() {
    const txt = this.room.isHost && this.room.humans().filter((p) => p.uid !== this.room.uid && p.connected !== false).length
      ? 'Der Admin-Posten geht an einen Mitspieler über.' : '';
    if (this.solo || await confirmDialog('Party verlassen?', txt, 'Verlassen')) this.leave();
  }

  async leave() {
    if (this.dead) return;
    this.cleanup();
    await this.room.leave();
    this.onExit();
  }
  exit() { if (this.dead) return; this.cleanup(); try { this.room.stop(); } catch { /* egal */ } Room.forget(); this.onExit(); }

  cleanup() {
    this.dead = true;
    clearTimeout(this.rq);
    this.driver.stop();
    if (this.off) this.off();
    document.removeEventListener('visibilitychange', this.visH);
    this.banner.remove();
    this.releaseWake();
    stopMusic();
    app.party = null;
  }

  // ------------------------------------------------------------------ Bildschirm anlassen
  async requestWake() {
    try { if (navigator.wakeLock && !this.wake) { this.wake = await navigator.wakeLock.request('screen'); this.wake.addEventListener('release', () => { this.wake = null; }); } } catch { /* egal */ }
  }
  releaseWake() { try { this.wake && this.wake.release(); } catch { /* egal */ } this.wake = null; }
}
