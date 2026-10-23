// "Ploc" when the ball hits the flagstick.
// If public/sounds/ploc.mp3 exists it is used; otherwise a short pop is synthesized.
//
// Browsers (iOS Safari especially) refuse to play any sound before the user has touched
// the page. primeAudio() must therefore be called from a tap; on the very first launch the
// splash plays before any touch, so it stays silent there by design of the browser.

let ctx: AudioContext | null = null;
let sample: AudioBuffer | null = null;
let sampleTried = false;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

async function loadSample(c: AudioContext) {
  if (sampleTried) return;
  sampleTried = true;
  try {
    const res = await fetch('/sounds/ploc.mp3');
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) return;
    sample = await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    sample = null;
  }
}

/** Call inside a user gesture handler to unlock audio for later playback. */
export function primeAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  void loadSample(c);
}

export function playPoc(volume = 0.6) {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;

  if (sample) {
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = volume * 1.4;
    src.buffer = sample;
    src.connect(g).connect(c.destination);
    src.start(t);
    return;
  }

  // Synth "ploc": a round, hollow pop — fast downward pitch sweep through a soft low-pass,
  // plus a tiny resonant "pl" transient. Short, no ringing.
  const out = c.createGain();
  out.gain.value = volume;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.08);
  lp.Q.value = 1.2;
  lp.connect(out).connect(c.destination);

  const body = c.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(820, t);
  body.frequency.exponentialRampToValueAtTime(190, t + 0.06);
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(1, t + 0.003);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  body.connect(bg).connect(lp);
  body.start(t);
  body.stop(t + 0.14);

  // Hollow overtone a fifth above, very short.
  const over = c.createOscillator();
  over.type = 'sine';
  over.frequency.setValueAtTime(1300, t);
  over.frequency.exponentialRampToValueAtTime(420, t + 0.035);
  const og = c.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.35, t + 0.002);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  over.connect(og).connect(lp);
  over.start(t);
  over.stop(t + 0.06);

  // Soft contact transient (band-passed noise).
  const len = Math.floor(c.sampleRate * 0.012);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 4;
  const ng = c.createGain();
  ng.gain.value = 0.5;
  noise.connect(bp).connect(ng).connect(out);
  noise.start(t);
}
