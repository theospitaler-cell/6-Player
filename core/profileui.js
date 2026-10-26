// Profil-Oberfläche: Übersicht, Erfolge, Tagesmissionen. Plus announce() für Erfolgs-Hinweise.
import { h, backBar, toast, clear } from './ui.js';
import { profile, levelInfo } from './profile.js';
import { ACHIEVEMENTS, MISSIONS, ensureMissions, claimMission } from './progress.js';
import { COLORS } from './state.js';
import { sfx } from './audio.js';

/** Zeigt Erfolge/Missionen, die track() gemeldet hat. */
export function announce(res) {
  if (!res) return;
  let delay = 0;
  for (const a of res.achievements || []) { setTimeout(() => { sfx('fanfare'); toast(`🏅 Erfolg: ${a.name}  (+${a.reward} 🪙)`, 3800); }, delay); delay += 700; }
  for (const m of res.missions || []) { setTimeout(() => { sfx('coin'); toast(`✅ Mission geschafft: ${m} – im Profil abholen!`, 3800); }, delay); delay += 700; }
}

export function profileScreen({ onBack, onAvatar }) {
  let tab = 'stats';
  const body = h('div', { class: 'prof-body' });
  const tabs = h('div', { class: 'seg tabs' });
  const colorHex = (COLORS.find((c) => c.id === profile.color) || COLORS[0]).hex;

  const stats = () => {
    const li = levelInfo(), st = profile.stats;
    const stat = (n, l) => h('div', { class: 'stat' }, h('b', null, String(n)), h('span', null, l));
    return h('div', null,
      h('div', { class: 'prof-card' },
        h('button', { class: 'av-pick big', type: 'button', style: { background: colorHex }, onclick: () => onAvatar && onAvatar() }, profile.avatar),
        h('div', { class: 'prof-name' }, profile.name || 'Spieler'), h('div', { class: 'prof-lv' }, `Level ${li.level}`),
        h('div', { class: 'lv-bar wide' }, h('div', { class: 'lv-fill', style: { width: li.frac * 100 + '%' } })), h('small', null, `${li.into} / ${li.need} XP bis Level ${li.level + 1}`)),
      h('div', { class: 'stats' }, stat('🪙 ' + profile.coins, 'Münzen'), stat(st.parties, 'Partys'), stat(st.wins, 'Party-Siege'), stat(st.rounds, 'Runden'), stat(st.roundWins, 'Rundensiege')));
  };

  const achievements = () => {
    const got = Object.keys(profile.achieved).length;
    return h('div', null, h('p', { class: 'screen-sub' }, `${got} von ${ACHIEVEMENTS.length} Erfolgen`),
      h('div', { class: 'ach-grid' }, ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (profile.achieved[a.id] ? ' got' : '') },
        h('div', { class: 'ach-emoji' }, profile.achieved[a.id] ? a.emoji : '🔒'), h('div', { class: 'ach-body' }, h('b', null, a.name), h('small', null, a.desc)), h('div', { class: 'ach-rw' }, '+' + a.reward + ' 🪙')))));
  };

  const missions = () => {
    const ms = ensureMissions();
    return h('div', null, h('p', { class: 'screen-sub' }, 'Neue Missionen gibt es jeden Tag.'),
      h('div', { class: 'mis-list' }, ms.list.map((m) => {
        const def = MISSIONS[m.id];
        const pct = Math.min(100, Math.round(m.progress / def.target * 100));
        return h('div', { class: 'mis' + (m.done ? ' done' : '') },
          h('div', { class: 'mis-top' }, h('b', null, def.text), h('span', { class: 'mis-rw' }, '+' + def.reward + ' 🪙')),
          h('div', { class: 'mis-bar' }, h('div', { class: 'mis-fill', style: { width: pct + '%' } })),
          h('div', { class: 'mis-foot' }, h('small', null, `${Math.min(m.progress, def.target)} / ${def.target}`),
            m.claimed ? h('span', { class: 'mis-claimed' }, '✔ abgeholt') : h('button', { class: 'btn small ' + (m.done ? 'primary' : 'disabled'), type: 'button', onclick: () => { const r = claimMission(m.id); if (r) { sfx('coin'); toast(`+${r} 🪙 Münzen!`); draw(); } } }, 'Abholen')));
      })));
  };

  const draw = () => {
    clear(body);
    body.appendChild(tab === 'stats' ? stats() : tab === 'ach' ? achievements() : missions());
    tabBtns.forEach((b, i) => b.classList.toggle('on', ['stats', 'ach', 'mis'][i] === tab));
  };
  const tabBtns = [['stats', '👤 Profil'], ['ach', '🏅 Erfolge'], ['mis', '📅 Missionen']].map(([id, label]) => {
    const b = h('button', { class: 'seg-btn', type: 'button', onclick: () => { tab = id; draw(); } }, label);
    tabs.appendChild(b); return b;
  });
  draw();
  return { el: h('div', { class: 'screen-body scroll' }, backBar('Profil', onBack), tabs, body), update: () => {} };
}
