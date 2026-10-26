// Neigungssteuerung (TILT). iOS braucht eine Erlaubnis per Tipp; ohne Sensor gibt es einen Joystick als Ersatz.
const state = { granted: false, asked: false };

export function tiltSupported() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window; }
export function needsPermission() { return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'; }

/** Muss in einem Tipp (Nutzer-Geste) aufgerufen werden. → true/false */
export async function requestTilt() {
  state.asked = true;
  try {
    if (needsPermission()) {
      const r = await DeviceOrientationEvent.requestPermission();
      state.granted = r === 'granted';
    } else state.granted = tiltSupported();
  } catch { state.granted = false; }
  return state.granted;
}
export const tiltGranted = () => state.granted;

/**
 * Startet das Lauschen. onVec({x,y}) mit Werten -1..1 (x = rechts, y = runter), relativ zur Haltung beim Start.
 * Im Querformat sind beta/gamma gegenüber dem Hochformat vertauscht – wir rechnen mit dem Bildschirmwinkel um.
 * Gibt {stop, hasData()} zurück.
 */
export function startTilt(onVec, { range = 28 } = {}) {
  let base = null, got = false;
  const handler = (e) => {
    if (e.beta == null || e.gamma == null) return;
    got = true;
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let a, b; // a = links/rechts-Neigung, b = vor/zurück
    if (ang === 90) { a = e.beta; b = -e.gamma; }
    else if (ang === 270 || ang === -90) { a = -e.beta; b = e.gamma; }
    else if (ang === 180) { a = -e.gamma; b = -e.beta; }
    else { a = e.gamma; b = e.beta; }
    if (!base) base = { a, b };
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    onVec({ x: Math.round(clamp((a - base.a) / range) * 20) / 20, y: Math.round(clamp((b - base.b) / range) * 20) / 20 });
  };
  window.addEventListener('deviceorientation', handler);
  return { stop: () => window.removeEventListener('deviceorientation', handler), hasData: () => got, recalibrate: () => { base = null; } };
}
