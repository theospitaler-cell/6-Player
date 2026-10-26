// Bildschirme der Party-Phasen. Jeder Builder bekommt die Party und gibt { el, update, destroy } zurück.
import { h, avatarChip, confetti } from './ui.js';
import { sfx } from './audio.js';
import { byId, GAMES } from '../games/registry.js';
import { gameFits } from './pool.js';
import { toList } from './room.js';
import { standings, awards } from './scoring.js';
import { TEAM_COLORS, CATEGORIES } from './state.js';
import { copyText } from './util.js';
import { toast } from './ui.js';

const MEDAL = ['🥇', '🥈', '🥉'];
const CTRL_HINT = {
  TAP: ['👆', 'Ein großer Button – tippe so schnell du kannst'],
  LR: ['↔️', 'Zwei Buttons: links und rechts'],
  JOY: ['🕹️', 'Joystick: ziehe mit dem Daumen'],
  'JOY+BTN': ['🕹️', 'Joystick links, Aktions-Knopf rechts'],
  AIM: ['🎯', 'Ziehen und loslassen'],
  SWIPE: ['👉', 'Wischen'],
  TILT: ['📱', 'Handy neigen'],
  PICK: ['👈', 'Tippe die richtige Antwort / das Feld an'],
  DRAW: ['✏️', 'Zeichnen'],
};

function ticker(fn, ms = 200) {
  fn();
  const t = setInterval(fn, ms);
  return () => clearInterval(t);
}
const secLeft = (party, until) => Math.max(0, Math.ceil((until - party.tp.serverNow()) / 1000));
const pl = (n) => `${n} Spieler`;

function gameCard(g, extra = {}) {
  return h('div', { class: 'gcard' + (extra.cls ? ' ' + extra.cls : '') },
    h('div', { class: 'gcard-emoji' }, g.emoji),
    h('div', { class: 'gcard-name' }, g.name),
    h('div', { class: 'gcard-meta' }, `${CATEGORIES[g.category] || ''} ${g.category} · ${g.min === g.max ? pl(g.min) : `${g.min}–${g.max} Spieler`}${g.teams === 'only' ? ' · Teams' : ''}${g.duel ? ' · Duell' : ''}`),
    extra.body || null);
}

// ============================================================================
// Abstimmung (Modus b)
// ============================================================================
export function votingScreen(party) {
  const room = party.room;
  const list = h('div', { class: 'vote-list' });
  const timer = h('div', { class: 'phase-timer' });
  const bar = h('div', { class: 'phase-bar' }, h('div', { class: 'phase-bar-fill' }));
  const el = h('div', { class: 'screen-body vote' }, h('h1', { class: 'screen-title' }, '🗳️ Was spielen wir?'), h('p', { class: 'screen-sub' }, 'Tippe ein Spiel an – die meisten Stimmen gewinnen.'), list, bar, timer);
  let optKey = '';
  const cards = {};
  const render = () => {
    const m = room.meta;
    const v = m && m.vote;
    if (!v) return;
    const options = toList(v.options);
    const key = options.join(',');
    if (key !== optKey) {
      optKey = key; list.innerHTML = '';
      for (const id of options) {
        const g = byId[id];
        const cnt = h('div', { class: 'vote-count' });
        const voters = h('div', { class: 'vote-voters' });
        const fill = h('div', { class: 'vote-fill' });
        const card = h('button', { class: 'vote-card', type: 'button', onclick: () => { room.vote(id); } },
          h('div', { class: 'vote-emoji' }, g.emoji),
          h('div', { class: 'vote-info' },
            h('div', { class: 'vote-name' }, g.name),
            h('div', { class: 'vote-meta' }, `${CATEGORIES[g.category] || ''} ${g.category} · ${g.min === g.max ? pl(g.min) : g.min + '–' + g.max}${g.teams === 'only' ? ' · 🧑‍🤝‍🧑 Teams' : ''}${g.duel ? ' · ⚔️ Duell' : ''}`),
            h('div', { class: 'vote-how' }, g.howTo[0]),
            h('div', { class: 'vote-bar' }, fill)),
          h('div', { class: 'vote-side' }, cnt, voters));
        cards[id] = { card, cnt, voters, fill };
        list.appendChild(card);
      }
    }
    const votes = room.d.votes || {};
    const counts = room.voteCounts();
    const total = Math.max(1, room.active().length);
    for (const id of options) {
      const c = cards[id];
      if (!c) continue;
      const n = counts[id] || 0;
      c.cnt.textContent = n ? String(n) : '';
      c.fill.style.width = (n / total * 100) + '%';
      c.card.classList.toggle('mine', votes[room.uid] === id);
      c.voters.innerHTML = '';
      for (const [uid, g] of Object.entries(votes)) {
        const p = room.player(uid);
        if (p && g === id) c.voters.appendChild(avatarChip(p, { size: 22, ring: false }));
      }
    }
  };
  const stop = ticker(() => {
    const m = room.meta; if (!m || !m.vote) return;
    const left = secLeft(party, m.vote.until);
    timer.textContent = `${left} s`;
    bar.firstChild.style.width = Math.max(0, Math.min(100, (m.vote.until - party.tp.serverNow()) / 150)) + '%';
  }, 200);
  render();
  return { el, update: render, destroy: stop };
}

// ============================================================================
// Admin wählt (Modus a)
// ============================================================================
export function pickingScreen(party) {
  const room = party.room;
  const grid = h('div', { class: 'pick-gridlist' });
  const title = h('h1', { class: 'screen-title' });
  const sub = h('p', { class: 'screen-sub' });
  const el = h('div', { class: 'screen-body picking' }, title, sub, grid);
  const render = () => {
    const m = room.meta; if (!m) return;
    const s = room.settings();
    const active = room.active();
    const nHum = active.filter((p) => !p.isBot).length;
    const played = toList(m.played);
    title.textContent = room.isHost ? '🎮 Such ein Spiel aus' : '⏳ Der Admin wählt …';
    sub.textContent = room.isHost ? 'Tippe auf ein Spiel, um die Runde zu starten.' : 'Gleich geht’s los!';
    grid.innerHTML = '';
    for (const g of GAMES) {
      const fit = gameFits(g, s, active.length, nHum);
      const was = s.onlyOnce && played.includes(g.id);
      const ok = fit.ok && !was;
      const reason = !fit.ok ? fit.reason : (was ? 'schon gespielt' : '');
      const card = h('button', {
        class: 'pickcard' + (ok ? '' : ' off'), type: 'button', disabled: !ok || !room.isHost,
        onclick: () => party.driver.run(() => party.driver.pickGame(g.id)),
      }, h('div', { class: 'pickcard-emoji' }, g.emoji), h('div', { class: 'pickcard-name' }, g.name),
      h('div', { class: 'pickcard-meta' }, reason || `${g.min === g.max ? pl(g.min) : g.min + '–' + g.max + ' Sp.'}${g.teams === 'only' ? ' · Teams' : ''}${g.duel ? ' · Duell' : ''}`));
      grid.appendChild(card);
    }
  };
  render();
  return { el, update: render };
}

// ============================================================================
// Zufall (Modus c): Slot-Animation
// ============================================================================
export function rollingScreen(party) {
  const room = party.room;
  const emo = h('div', { class: 'slot-emoji' }, '🎲');
  const name = h('div', { class: 'slot-name' }, '');
  const el = h('div', { class: 'screen-body rolling' }, h('h1', { class: 'screen-title' }, '🎰 Zufall!'), h('div', { class: 'slot' }, emo), name);
  let last = -1;
  const stop = ticker(() => {
    const m = room.meta; if (!m || !m.pick) return;
    const reel = toList(m.pick.reel);
    if (!reel.length) return;
    const total = 2800;
    const t = Math.min(1, Math.max(0, 1 - (m.pick.until - party.tp.serverNow()) / total));
    const e = 1 - Math.pow(1 - t, 3);
    const idx = Math.min(reel.length - 1, Math.floor(e * (reel.length - 0.01) * 2.2) % reel.length);
    const fin = t >= 0.97;
    const id = fin ? m.pick.gameId : reel[idx];
    if (idx !== last || fin) { last = idx; emo.textContent = byId[id] ? byId[id].emoji : '🎲'; name.textContent = fin && byId[id] ? byId[id].name : ''; if (!fin) sfx('tick'); }
    el.classList.toggle('done', fin);
  }, 90);
  return { el, update: () => {}, destroy: stop };
}

// ============================================================================
// Intro (4 s): Regel, Steuerung, Teams
// ============================================================================
export function introScreen(party) {
  const room = party.room;
  const el = h('div', { class: 'screen-body intro' });
  const bar = h('div', { class: 'phase-bar' }, h('div', { class: 'phase-bar-fill' }));
  let built = '';
  const render = () => {
    const m = room.meta; if (!m || !m.gameId) return;
    const key = `${m.roundIndex}:${m.gameId}:${m.seed}`;
    if (built === key) return;
    built = key;
    const g = byId[m.gameId];
    const parts = toList(m.participants);
    const me = room.uid;
    const s = room.settings();
    const isLast = s.partyType === 'cup' && (m.roundIndex || 0) + 1 >= (m.totalRounds || 0) && !m.stechen;
    const [ci, ct] = CTRL_HINT[g.controls] || ['👆', ''];
    el.innerHTML = '';
    const left = h('div', { class: 'intro-left' });
    const right = h('div', { class: 'intro-right' });
    left.appendChild(h('div', { class: 'intro-round' }, m.stechen ? '⚔️ STECHEN – Entscheidung!' : (s.partyType === 'free' ? 'Freies Spiel' : `Runde ${(m.roundIndex || 0) + 1} von ${m.totalRounds}`)));
    if (isLast && s.doubleFinal) left.appendChild(h('div', { class: 'finale-badge' }, '🔥 FINALE – doppelte Punkte!'));
    left.appendChild(h('div', { class: 'intro-emoji' }, g.emoji));
    left.appendChild(h('h1', { class: 'intro-name' }, g.name));
    right.appendChild(h('ul', { class: 'intro-how' }, g.howTo.map((t) => h('li', null, t))));
    right.appendChild(h('div', { class: 'intro-ctl' }, h('span', { class: 'intro-ctl-i' }, ci), h('span', null, ct)));
    // Teilnehmer / Teams
    const teamsOn = !!m.teams;
    const wrap = h('div', { class: 'intro-players' + (teamsOn ? ' teams' : '') });
    if (teamsOn) {
      [0, 1].forEach((t) => {
        const col = h('div', { class: 'intro-team', style: { '--tc': TEAM_COLORS[t].hex } }, h('div', { class: 'intro-team-name' }, TEAM_COLORS[t].name));
        const row = h('div', { class: 'intro-team-row' });
        parts.filter((u) => Number(m.teams[u]) === t).forEach((u) => { const p = room.player(u); if (p) row.appendChild(h('div', { class: 'intro-p' + (u === me ? ' me' : '') }, avatarChip(p, { size: 38 }), h('span', null, p.name))); });
        col.appendChild(row); wrap.appendChild(col);
      });
    } else {
      parts.forEach((u) => { const p = room.player(u); if (p) wrap.appendChild(h('div', { class: 'intro-p' + (u === me ? ' me' : '') }, avatarChip(p, { size: 42 }), h('span', null, p.name))); });
    }
    right.appendChild(wrap);
    if (!parts.includes(me)) right.appendChild(h('div', { class: 'intro-spec' }, '👀 Du schaust in dieser Runde zu – im Duell spielen die Spieler mit den wenigsten Punkten.'));
    el.appendChild(h('div', { class: 'intro-cols' }, left, right));
    el.appendChild(bar);
  };
  const stop = ticker(() => {
    const m = room.meta; if (!m) return;
    bar.firstChild.style.width = Math.max(0, Math.min(100, ((m.phaseUntil || 0) - party.tp.serverNow()) / 40)) + '%';
  }, 100);
  render();
  return { el, update: render, destroy: stop };
}

// ============================================================================
// Ergebnis der Runde (5 s)
// ============================================================================
export function resultScreen(party) {
  const room = party.room;
  const el = h('div', { class: 'screen-body result' });
  let built = '';
  const render = () => {
    const m = room.meta; if (!m) return;
    const rec = room.roundRecord(m.roundIndex);
    const key = `${m.roundIndex}:${rec ? 1 : 0}:${party.reward ? party.reward.key : ''}`;
    if (key === built) return;
    built = key;
    el.innerHTML = '';
    const g = byId[(rec && rec.g) || m.gameId];
    el.appendChild(h('h1', { class: 'screen-title' }, `${g ? g.emoji : ''} Ergebnis`));
    if (!rec) { el.appendChild(h('p', { class: 'screen-sub' }, 'Auswertung …')); return; }
    if (!rec.valid) { el.appendChild(h('p', { class: 'screen-sub' }, 'Diese Runde war leider ungültig und zählt nicht. 🙈')); return; }
    const ranks = toList(rec.ranks).slice().sort((a, b) => a.rank - b.rank);
    const pts = rec.pts || {};
    const list = h('div', { class: 'res-list' });
    ranks.forEach((r, i) => {
      const p = room.player(r.uid);
      if (!p) return;
      const team = m.teams && m.teams[r.uid] != null ? TEAM_COLORS[Number(m.teams[r.uid])] : null;
      list.appendChild(h('div', { class: 'res-row' + (r.uid === room.uid ? ' me' : '') + (r.rank === 1 ? ' first' : ''), style: { animationDelay: i * 90 + 'ms' } },
        h('div', { class: 'res-rank' }, r.rank <= 3 ? MEDAL[r.rank - 1] : String(r.rank)),
        avatarChip(p, { size: 40 }),
        h('div', { class: 'res-name' }, p.name, team ? h('span', { class: 'team-dot', style: { background: team.hex } }) : null, h('small', null, r.l || '')),
        pts[r.uid] != null ? h('div', { class: 'pts-chip', style: { animationDelay: 400 + i * 90 + 'ms' } }, '+' + pts[r.uid]) : null));
    });
    const inRanks = new Set(ranks.map((r) => r.uid));
    Object.keys(pts).filter((u) => !inRanks.has(u)).forEach((u, i) => {
      const p = room.player(u);
      if (p) list.appendChild(h('div', { class: 'res-row spec' + (u === room.uid ? ' me' : '') },
        h('div', { class: 'res-rank' }, '👀'), avatarChip(p, { size: 34 }), h('div', { class: 'res-name' }, p.name, h('small', null, 'Zuschauer')), h('div', { class: 'pts-chip' }, '+' + pts[u])));
    });
    el.appendChild(list);
    if (rec.fin) el.appendChild(h('div', { class: 'finale-badge' }, '🔥 Finale: doppelte Punkte!'));
    if (party.reward && party.reward.round === m.roundIndex) {
      el.appendChild(h('div', { class: 'reward' }, `+${party.reward.xp} XP · +${party.reward.coins} 🪙`));
    }
  };
  render();
  return { el, update: render };
}

// ============================================================================
// Zwischenstand (4 s)
// ============================================================================
export function scoreboardScreen(party) {
  const room = party.room;
  const el = h('div', { class: 'screen-body scoreboard' });
  let built = '';
  const render = () => {
    const m = room.meta; if (!m) return;
    const key = `${m.roundIndex}`;
    if (built === key) return;
    built = key;
    const rec = room.roundRecord(m.roundIndex);
    const pts = (rec && rec.pts) || {};
    const last = (m.roundIndex || 0) + 1 >= (m.totalRounds || 0);
    el.innerHTML = '';
    el.appendChild(h('h1', { class: 'screen-title' }, last ? '🏁 Endstand' : '📊 Zwischenstand'));
    el.appendChild(h('p', { class: 'screen-sub' }, last ? 'Gleich kommt die Siegerehrung …' : `Nach Runde ${(m.roundIndex || 0) + 1} von ${m.totalRounds}${(m.roundIndex || 0) + 2 === m.totalRounds && room.settings().doubleFinal ? ' · Nächste Runde: FINALE (×2)!' : ''}`));
    const players = room.list().filter((p) => (p.score || 0) > 0 || pts[p.uid] != null || !p.isBot || true);
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || (b.wins || 0) - (a.wins || 0));
    const max = Math.max(4, ...sorted.map((p) => p.score || 0));
    const list = h('div', { class: 'sb-list' });
    const fills = [];
    sorted.forEach((p, i) => {
      const add = pts[p.uid] || 0;
      const before = Math.max(0, (p.score || 0) - add);
      const fill = h('div', { class: 'sb-fill', style: { background: p.colorHex, width: (before / max * 100) + '%' } });
      const num = h('div', { class: 'sb-num' }, String(before));
      fills.push({ fill, num, from: before, to: p.score || 0, max });
      list.appendChild(h('div', { class: 'sb-row' + (p.uid === room.uid ? ' me' : ''), style: { animationDelay: i * 70 + 'ms' } },
        h('div', { class: 'sb-pos' }, String(i + 1)), avatarChip(p, { size: 36 }),
        h('div', { class: 'sb-mid' }, h('div', { class: 'sb-name' }, p.name, add ? h('span', { class: 'sb-add' }, ' +' + add) : null), h('div', { class: 'sb-track' }, fill)),
        num));
    });
    el.appendChild(list);
    setTimeout(() => {
      for (const f of fills) {
        f.fill.style.width = Math.max(2, f.to / f.max * 100) + '%';
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / 900);
          f.num.textContent = String(Math.round(f.from + (f.to - f.from) * k));
          if (k < 1 && el.isConnected) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, 450);
  };
  render();
  return { el, update: render };
}

// ============================================================================
// Siegerehrung
// ============================================================================
export function finishedScreen(party) {
  const room = party.room;
  const el = h('div', { class: 'screen-body finished' });
  let built = '';
  const render = () => {
    const m = room.meta; if (!m) return;
    const key = `${m.partyId}:${room.isHost}:${toList(m.stechenOrder).join(',')}:${room.list().map((p) => p.score).join(',')}`;
    if (built === key) return;
    const first = built === '';
    built = key;
    const s = room.settings();
    const players = room.list().map((p) => ({ ...p }));
    const table = standings(players, toList(m.stechenOrder));
    const hist = room.d.history.filter((x) => x && x.valid && !x.st).map((x) => ({ ranks: toList(x.ranks) }));
    const aw = awards(hist, players);
    el.innerHTML = '';
    el.appendChild(h('h1', { class: 'screen-title' }, '🏆 Siegerehrung'));
    if (m.stechenOrder) el.appendChild(h('p', { class: 'screen-sub' }, '⚔️ Gleichstand – das Stechen im Schnellzieher hat entschieden!'));
    const finLeft = h('div', { class: 'fin-left' });
    const finRight = h('div', { class: 'fin-right' });
    const top = table.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean);
    const pod = h('div', { class: 'podium' });
    for (const p of order) {
      const place = p === top[0] ? 1 : (p === top[1] ? 2 : 3);
      pod.appendChild(h('div', { class: 'pod pod' + place },
        h('div', { class: 'pod-medal' }, MEDAL[place - 1]),
        avatarChip(p, { size: place === 1 ? 64 : 52 }),
        h('div', { class: 'pod-name' }, p.name),
        h('div', { class: 'pod-block' }, h('b', null, String(p.score || 0)), h('small', null, 'Punkte'))));
    }
    finLeft.appendChild(pod);
    const rest = table.slice(3);
    if (rest.length) {
      finRight.appendChild(h('div', { class: 'res-list rest' }, rest.map((p) => h('div', { class: 'res-row' + (p.uid === room.uid ? ' me' : '') },
        h('div', { class: 'res-rank' }, String(p.place)), avatarChip(p, { size: 34 }), h('div', { class: 'res-name' }, p.name), h('div', { class: 'pts-chip plain' }, String(p.score || 0))))));
    }
    const chips = [];
    const nameOf = (u) => { const p = room.player(u); return p ? `${p.avatar} ${p.name}` : '?'; };
    if (aw.mvp) chips.push(`⭐ MVP: ${nameOf(aw.mvp.uid)} (${aw.mvp.n} Siege)`);
    if (aw.pech) chips.push(`🐦 Pechvogel: ${nameOf(aw.pech.uid)} (${aw.pech.n}× Letzter)`);
    if (aw.knapp) chips.push(`😅 Knappster Sieg: ${nameOf(aw.knapp.uid)} (+${aw.knapp.n})`);
    if (chips.length) finRight.appendChild(h('div', { class: 'awards' }, chips.map((c) => h('div', { class: 'award' }, c))));
    if (party.reward && party.reward.party) finRight.appendChild(h('div', { class: 'reward' }, `Party-Bonus: +${party.reward.xp} XP · +${party.reward.coins} 🪙`));
    const share = () => {
      const txt = `🎉 PartyPlay 6 – Endstand\n` + table.map((p) => `${p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : p.place + '.'} ${p.name} – ${p.score || 0} Pkt.`).join('\n');
      if (navigator.share) navigator.share({ text: txt }).catch(() => {});
      else copyText(txt).then((ok) => toast(ok ? 'Ergebnis kopiert 📋' : 'Kopieren nicht möglich'));
    };
    const btns = h('div', { class: 'fin-btns' },
      room.isHost ? h('button', { class: 'btn primary big', onclick: () => party.driver.run(() => party.driver.rematch()) }, '🔁 Nochmal') : h('div', { class: 'wait-note' }, 'Der Admin kann eine neue Runde starten …'),
      room.isHost ? h('button', { class: 'btn', onclick: () => party.driver.run(() => party.driver.toLobby()) }, '🏠 Zurück zur Lobby') : null,
      h('button', { class: 'btn', onclick: share }, '📤 Teilen'),
      h('button', { class: 'btn ghost', onclick: () => party.leave() }, 'Party verlassen'));
    finRight.appendChild(btns);
    el.appendChild(h('div', { class: 'fin-cols' }, finLeft, finRight));
    if (first) { setTimeout(() => { confetti(4200); sfx('fanfare'); }, 350); }
  };
  render();
  return { el, update: render };
}

export function waitingScreen(text = 'Lade …') {
  return { el: h('div', { class: 'screen-body center' }, h('div', { class: 'spinner' }), h('p', { class: 'screen-sub' }, text)), update: () => {} };
}
