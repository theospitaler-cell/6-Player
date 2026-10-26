// Steuerungs-Layouts im Querformat (Daumen links/rechts): TAP, LR, JOY, JOY+BTN.
// (PICK-Spiele bauen ihre Oberfläche selbst – siehe mountUI in den Spielen.)
import { h } from './ui.js';
import { sfx, vibrate } from './audio.js';
import { tiltSupported, needsPermission, requestTilt, tiltGranted, startTilt } from './tilt.js';

const DEAD = 0.14;     // Totzone des Joysticks
const JOY_R = 54;      // Radius in Pixeln

/**
 * createControls(game, {left, right}, { onInput, color, tapSide }) → { setEnabled(bool), destroy() }
 * onInput bekommt Objekte:
 *   TAP: {taps}   LR: {l, r, lc, rc}   JOY: {x, y}   JOY+BTN: {x, y, b}
 */
export function createControls(game, boxes, { onInput, color = '#ff4d6d', tapSide = 'R' }) {
  const kind = game.controls;
  const { left, right } = boxes;
  const all = [left, right];
  let enabled = false;
  const cleanups = [];
  const listen = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); cleanups.push(() => target.removeEventListener(ev, fn, opts)); };
  all.forEach((b) => b.style.setProperty('--pc', color));
  const offClass = () => all.forEach((b) => b.classList.toggle('off', !enabled));

  if (kind === 'TAP') {
    let taps = 0;
    const btn = h('button', { class: 'ctl-tap', type: 'button' }, h('span', { class: 'ctl-tap-label' }, 'TIPPEN'));
    (tapSide === 'L' ? left : right).appendChild(btn);
    const hit = () => {
      if (!enabled) return;
      taps++;
      btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
      vibrate(6);
      onInput({ taps });
    };
    listen(btn, 'pointerdown', (e) => { e.preventDefault(); hit(); });
    listen(window, 'keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); hit(); } });
    return api(() => { btn.classList.toggle('off', !enabled); });
  }

  if (kind === 'LR') {
    const st = { l: 0, r: 0, lc: 0, rc: 0 };
    const mk = (side, label) => {
      const b = h('button', { class: 'ctl-lr', type: 'button' }, label);
      const down = (e) => { e && e.preventDefault(); if (!enabled) return; st[side] = 1; st[side + 'c']++; b.classList.add('down'); onInput({ ...st }); };
      const up = (e) => { e && e.preventDefault(); if (!st[side]) return; st[side] = 0; b.classList.remove('down'); onInput({ ...st }); };
      listen(b, 'pointerdown', down); listen(b, 'pointerup', up); listen(b, 'pointercancel', up); listen(b, 'pointerleave', up);
      return { b, down, up };
    };
    const L = mk('l', '◀'), R = mk('r', '▶');
    left.appendChild(L.b); right.appendChild(R.b);
    listen(window, 'keydown', (e) => { if (e.repeat) return; if (e.code === 'ArrowLeft' || e.code === 'KeyA') L.down(e); if (e.code === 'ArrowRight' || e.code === 'KeyD') R.down(e); });
    listen(window, 'keyup', (e) => { if (e.code === 'ArrowLeft' || e.code === 'KeyA') L.up(e); if (e.code === 'ArrowRight' || e.code === 'KeyD') R.up(e); });
    return api(offClass);
  }

  if (kind === 'JOY' || kind === 'JOY+BTN' || kind === 'TILT') {
    const hasBtn = kind === 'JOY+BTN';
    const isTilt = kind === 'TILT';
    const labels = game.buttons || ['●'];
    const zone = h('div', { class: 'joy-zone' }, h('div', { class: 'joy-hint' }, h('span', null, '✥'), h('small', null, 'Hier ziehen')));
    const base = h('div', { class: 'joy-base' }, h('div', { class: 'joy-knob' }));
    zone.appendChild(base);
    const btnBox = hasBtn ? h('div', { class: 'joy-btns' }) : null;
    let b = 0;
    const cur = { x: 0, y: 0 };
    const send = () => onInput(hasBtn ? { x: cur.x, y: cur.y, b } : { x: cur.x, y: cur.y });
    if (hasBtn) {
      labels.slice(0, 1).forEach((lab) => {
        const bt = h('button', { class: 'joy-btn', type: 'button' }, lab);
        listen(bt, 'pointerdown', (e) => {
          e.preventDefault();
          if (!enabled) return;
          b++; bt.classList.remove('hit'); void bt.offsetWidth; bt.classList.add('hit');
          vibrate(15); send();
        });
        btnBox.appendChild(bt);
      });
    }
    left.appendChild(zone);
    if (btnBox) right.appendChild(btnBox);
    // TILT: Neigungssensor liefert x/y; der Joystick bleibt als Ersatz (und überstimmt den Sensor, solange der Daumen drauf ist)
    let tiltCtl = null, joyHeld = false;
    if (isTilt) {
      zone.classList.add('tilt');
      zone.querySelector('.joy-hint').innerHTML = '<span>📱</span><small>Handy neigen<br>(oder hier ziehen)</small>';
      const begin = () => {
        if (tiltCtl || !tiltGranted()) return;
        tiltCtl = startTilt((v) => {
          if (joyHeld || !enabled) return;
          if (v.x !== cur.x || v.y !== cur.y) { cur.x = v.x; cur.y = v.y; send(); }
        });
        cleanups.push(() => tiltCtl && tiltCtl.stop());
      };
      if (tiltSupported() && !needsPermission()) { requestTilt().then(begin); }
      else if (tiltSupported()) {
        const ask = h('button', { class: 'btn small tilt-ask', type: 'button' }, '📱 Sensor erlauben');
        ask.addEventListener('pointerdown', async (e) => { e.preventDefault(); e.stopPropagation(); if (await requestTilt()) { ask.remove(); begin(); } else ask.textContent = 'Nicht erlaubt – nutze den Joystick'; });
        zone.appendChild(ask);
      }
    }

    // schwebender Joystick: erscheint dort, wo der Daumen aufsetzt
    let pid = null, ox = 0, oy = 0;
    const knob = base.firstChild;
    const setVec = (dx, dy) => {
      const len = Math.hypot(dx, dy);
      const k = len > JOY_R ? JOY_R / len : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      let nx = (dx * k) / JOY_R, ny = (dy * k) / JOY_R;
      const mag = Math.hypot(nx, ny);
      if (mag < DEAD) { nx = 0; ny = 0; } else { const s = (mag - DEAD) / (1 - DEAD) / mag; nx *= s; ny *= s; }
      nx = Math.round(nx * 20) / 20; ny = Math.round(ny * 20) / 20;
      if (nx !== cur.x || ny !== cur.y) { cur.x = nx; cur.y = ny; send(); }
    };
    listen(zone, 'pointerdown', (e) => {
      if (!enabled || pid != null) return;
      if (e.target.closest && e.target.closest('.tilt-ask')) return;
      e.preventDefault();
      joyHeld = true;
      pid = e.pointerId;
      try { zone.setPointerCapture(pid); } catch { /* ok */ }
      const r = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      base.classList.add('on'); zone.classList.add('active');
      knob.style.transform = 'translate(0,0)';
    });
    listen(zone, 'pointermove', (e) => { if (e.pointerId === pid) setVec(e.clientX - ox, e.clientY - oy); });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null; joyHeld = false; base.classList.remove('on'); zone.classList.remove('active');
      if (cur.x !== 0 || cur.y !== 0) { cur.x = 0; cur.y = 0; send(); }
    };
    listen(zone, 'pointerup', end); listen(zone, 'pointercancel', end);

    // Tastatur (zum Testen am PC)
    const keys = new Set();
    const kb = () => {
      if (!enabled) return;
      const x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      const y = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
      const m = Math.hypot(x, y) || 1;
      cur.x = Math.round((x / m) * 20) / 20; cur.y = Math.round((y / m) * 20) / 20; send();
    };
    listen(window, 'keydown', (e) => {
      if (e.code === 'Space' && hasBtn && enabled && !e.repeat) { e.preventDefault(); b++; send(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); keys.add(e.code); kb(); }
    });
    listen(window, 'keyup', (e) => { if (keys.delete(e.code)) kb(); });
    return api(() => {
      offClass();
      if (!enabled && (cur.x || cur.y)) { cur.x = 0; cur.y = 0; }
    });
  }

  return null;

  function api(onToggle) {
    return {
      setEnabled(on) { enabled = !!on; onToggle(); },
      destroy() { cleanups.forEach((f) => f()); },
    };
  }
}
