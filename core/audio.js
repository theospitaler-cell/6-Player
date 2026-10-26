// Sound & Musik per WebAudio (alles synthetisch, keine Dateien), Vibration.
import { profile } from './profile.js';

let ctx = null;
let master = null;
let musicGain = null;
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;
let wantMusic = false;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
  } catch { ctx = null; }
  return ctx;
}

/** Muss durch eine Nutzer-Geste ausgelöst werden (iOS/Android). */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => {});
  if (wantMusic && profile.settings.music) startMusic();
}

export function installAudioUnlock() {
  const h = () => unlockAudio();
  for (const ev of ['pointerdown', 'touchend', 'keydown']) {
    document.addEventListener(ev, h, { passive: true });
  }
}

function tone(freq, dur, type = 'square', vol = 0.18, slideTo = null, when = 0, dest = null) {
  const c = ctx;
  if (!c) return;
  const t0 = Math.max(c.currentTime, when || 0) + 0.001;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(dest || master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

export function sfx(name) {
  if (!profile.settings.sound) return;
  if (!ensure() || ctx.state !== 'running') return;
  try {
    switch (name) {
      case 'tap': tone(520, 0.05, 'square', 0.1, 700); break;
      case 'pop': tone(700, 0.08, 'triangle', 0.18, 1100); break;
      case 'select': tone(440, 0.07, 'triangle', 0.16, 660); break;
      case 'back': tone(500, 0.08, 'triangle', 0.14, 300); break;
      case 'join': tone(523, 0.08, 'triangle', 0.16); tone(784, 0.12, 'triangle', 0.16, null, ctx.currentTime + 0.08); break;
      case 'ready': tone(660, 0.07, 'triangle', 0.16); tone(880, 0.1, 'triangle', 0.16, null, ctx.currentTime + 0.07); break;
      case 'count': tone(440, 0.14, 'square', 0.2); break;
      case 'go': tone(880, 0.35, 'square', 0.22, 1320); break;
      case 'coin': tone(988, 0.07, 'square', 0.14); tone(1319, 0.2, 'square', 0.14, null, ctx.currentTime + 0.07); break;
      case 'error': tone(180, 0.2, 'sawtooth', 0.18, 90); break;
      case 'hit': tone(150, 0.1, 'square', 0.2, 60); break;
      case 'whoosh': tone(300, 0.2, 'sawtooth', 0.1, 900); break;
      case 'fall': tone(500, 0.5, 'triangle', 0.18, 80); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, null, ctx.currentTime + i * 0.14)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.16, null, ctx.currentTime + i * 0.09)); break;
      case 'fanfare':
        [[523, 0], [523, 0.14], [523, 0.28], [698, 0.42], [659, 0.7], [784, 0.84], [1047, 1.1]].forEach(([f, d]) =>
          tone(f, 0.28, 'square', 0.17, null, ctx.currentTime + d));
        break;
      case 'tick': tone(1200, 0.03, 'square', 0.06); break;
      default: break;
    }
  } catch { /* Audio darf nie das Spiel stoppen */ }
}

export function vibrate(ms = 20) {
  if (!profile.settings.vibration) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* iOS kennt vibrate nicht */ }
}

// ---- Musik: kleiner Chiptune-Loop (Bass + Arpeggio), per Look-Ahead-Scheduler ----
const BASS = [36, 36, 43, 43, 41, 41, 39, 43];
const ARP = [[60, 63, 67, 72], [60, 63, 67, 72], [62, 67, 71, 74], [62, 67, 71, 74], [60, 65, 68, 72], [60, 65, 68, 72], [58, 63, 67, 70], [62, 67, 71, 74]];
const STEP = 60 / 132 / 2; // Achtel bei 132 bpm

function scheduleMusic() {
  if (!ctx || !wantMusic) return;
  while (nextNoteTime < ctx.currentTime + 0.25) {
    const bar = Math.floor(musicStep / 8) % 8;
    const s = musicStep % 8;
    if (s % 4 === 0) tone(N(BASS[bar]), STEP * 3.4, 'triangle', 0.5, null, nextNoteTime, musicGain);
    const arp = ARP[bar];
    tone(N(arp[s % 4] + (s >= 4 ? 0 : 12)), STEP * 0.8, 'square', 0.16, null, nextNoteTime, musicGain);
    if (s === 2 || s === 6) tone(200, 0.04, 'square', 0.1, 80, nextNoteTime, musicGain);
    nextNoteTime += STEP;
    musicStep++;
  }
}

export function startMusic() {
  wantMusic = true;
  if (!profile.settings.music) return;
  if (!ensure() || ctx.state !== 'running') return; // unlockAudio ruft uns erneut auf
  if (musicTimer) return;
  nextNoteTime = ctx.currentTime + 0.05;
  musicTimer = setInterval(scheduleMusic, 90);
}

export function stopMusic() {
  wantMusic = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function applyAudioSettings() {
  if (profile.settings.music) { if (wantMusic) startMusic(); } else if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
