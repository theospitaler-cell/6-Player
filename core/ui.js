// UI-Bausteine: DOM-Helfer, Screens, Toasts, Dialoge, Bottom-Sheets, Konfetti.
import { sfx, vibrate } from './audio.js';

/** Mini-Hyperscript: h('div', {class:'x', onclick: fn}, 'Text', child, ...) */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
export function setKids(el, ...kids) { clear(el); appendKids(el, kids); }

let appEl = null;
let currentName = null;
let currentApi = null;

export function root() {
  if (!appEl) appEl = document.getElementById('app');
  return appEl;
}

/** Zeigt einen Screen. api = { el, update?, destroy? } */
export function showScreen(name, api) {
  if (currentApi && currentApi.destroy) { try { currentApi.destroy(); } catch (e) { console.error(e); } }
  const r = root();
  clear(r);
  r.appendChild(api.el);
  api.el.classList.add('screen-in');
  currentName = name;
  currentApi = api;
  return api;
}
export const screenName = () => currentName;
export const screenApi = () => currentApi;

/** Falls schon der gleiche Screen aktiv ist → update, sonst neu bauen. */
export function mountScreen(name, build, data) {
  if (currentName === name && currentApi) {
    if (currentApi.update) currentApi.update(data);
    return currentApi;
  }
  return showScreen(name, build());
}

// ---------- Toasts ----------
let toastBox = null;
export function toast(msg, ms = 2400, kind = '') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.appendChild(toastBox);
  }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Overlays: Dialog & Sheet ----------
function overlay(content, { dismissable = true, cls = '' } = {}) {
  const back = h('div', { class: 'overlay-back' });
  const box = h('div', { class: 'overlay-box ' + cls }, content);
  back.appendChild(box);
  const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); };
  if (dismissable) back.addEventListener('pointerdown', (e) => { if (e.target === back) { close(); back.dispatchEvent(new Event('dismiss')); } });
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('in'));
  return { back, box, close };
}

/** dialog({title, text, buttons:[{label, value, kind}]}) → Promise<value|null> */
export function dialog({ title, text, body, buttons = [{ label: 'OK', value: true, kind: 'primary' }], dismissable = true }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; o.close(); resolve(v); };
    const content = h('div', { class: 'dlg' },
      title ? h('h2', null, title) : null,
      text ? h('p', { class: 'dlg-text' }, text) : null,
      body || null,
      h('div', { class: 'dlg-btns' }, buttons.map((b) =>
        h('button', { class: 'btn ' + (b.kind || ''), onclick: () => finish(b.value) }, b.label))));
    const o = overlay(content, { dismissable });
    o.back.addEventListener('dismiss', () => finish(null));
  });
}

export const confirmDialog = (title, text, okLabel = 'Ja', cancelLabel = 'Abbrechen') =>
  dialog({ title, text, buttons: [{ label: cancelLabel, value: false }, { label: okLabel, value: true, kind: 'primary' }] }).then((v) => !!v);

/** Bottom-Sheet mit beliebigem Inhalt. Gibt {close, box} zurück. */
export function sheet(title, content, { onClose } = {}) {
  const wrap = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'icon-btn', onclick: () => o.close(), 'aria-label': 'Schließen' }, '✕')),
    h('div', { class: 'sheet-body' }, content));
  const o = overlay(wrap, { cls: 'sheet-box' });
  o.back.addEventListener('dismiss', () => onClose && onClose());
  const origClose = o.close;
  o.close = () => { origClose(); onClose && onClose(); };
  return o;
}

// ---------- Button-Feedback (Press-Animation, Vibration, Sound) ----------
export function installButtonFx() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn, .card-btn, .chip, .icon-btn, .num-key');
    if (!b || b.disabled || b.classList.contains('no-fx')) return;
    b.classList.add('pressed');
    const rel = () => { b.classList.remove('pressed'); window.removeEventListener('pointerup', rel); window.removeEventListener('pointercancel', rel); };
    window.addEventListener('pointerup', rel);
    window.addEventListener('pointercancel', rel);
    vibrate(8);
    sfx('pop');
  }, { passive: true });
}

// ---------- Konfetti ----------
let confettiRaf = 0;
export function confetti(ms = 3500) {
  const cv = h('canvas', { class: 'confetti' });
  document.body.appendChild(cv);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (cv.width = innerWidth * dpr), hh = (cv.height = innerHeight * dpr);
  const g = cv.getContext('2d');
  const colors = ['#ff4d6d', '#3d8bff', '#2fd67b', '#ffcf33', '#b66bff', '#ff8a3d', '#fff'];
  const parts = Array.from({ length: 140 }, () => ({
    x: Math.random() * w, y: -Math.random() * hh * 0.5,
    vx: (Math.random() - 0.5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
    s: (5 + Math.random() * 8) * dpr, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  cancelAnimationFrame(confettiRaf);
  const step = (t) => {
    const age = t - t0;
    g.clearRect(0, 0, w, hh);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.03 * dpr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
      g.globalAlpha = age > ms - 600 ? Math.max(0, (ms - age) / 600) : 1;
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    if (age < ms) confettiRaf = requestAnimationFrame(step); else cv.remove();
  };
  confettiRaf = requestAnimationFrame(step);
}

/** Schwebendes Emoji (Reaktionen). */
export function floatEmoji(emoji, color) {
  const x = 12 + Math.random() * 76;
  const el = h('div', { class: 'float-emoji', style: { left: x + '%', '--c': color || '#fff' } }, emoji);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---------- Kleine Bausteine ----------
export function avatarChip(p, { size = 44, ring = true } = {}) {
  return h('div', {
    class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: size * 0.58 + 'px', background: p.colorHex, borderColor: ring ? '#fff' : 'transparent' },
  }, p.avatar);
}

export function switchEl(checked, onChange, label) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!checked;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'switch' }, label ? h('span', { class: 'switch-label' }, label) : null, inp, h('span', { class: 'switch-track' }, h('span', { class: 'switch-knob' })));
}

/** Segment-Auswahl: options [{value,label}] */
export function segmented(options, value, onChange, { disabled = false } = {}) {
  const wrap = h('div', { class: 'seg' + (disabled ? ' disabled' : '') });
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', class: 'seg-btn' + (o.value === value ? ' on' : ''), onclick: () => { if (!disabled) onChange(o.value); } }, o.label);
    wrap.appendChild(b);
    return b;
  });
  wrap.set = (v) => btns.forEach((b, i) => b.classList.toggle('on', options[i].value === v));
  return wrap;
}

export function backBar(title, onBack, right) {
  return h('div', { class: 'topbar' },
    h('button', { class: 'icon-btn', onclick: () => { sfx('back'); onBack(); }, 'aria-label': 'Zurück' }, '←'),
    h('h1', null, title),
    right || h('span', { class: 'spacer' }));
}
