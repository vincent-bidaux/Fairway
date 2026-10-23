// Tiny synthesized "poc" (ball hitting the flagstick), no audio file needed.
// Browsers only allow sound after a user gesture: primeAudio() is called from taps
// (e.g. « ‹ Fairway ») so the next splash can play it. On the very first load the
// sound is skipped silently if the browser has not unlocked audio yet.

let ctx: AudioContext | null = null;

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

/** Call inside a user gesture handler to unlock audio for later playback. */
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

export function playPoc(volume = 0.5) {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;

  // Body: short pitched knock that drops quickly.
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1150, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.07);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.12);

  // Click: a few ms of filtered noise for the hard contact.
  const len = Math.floor(c.sampleRate * 0.02);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = c.createGain();
  ng.gain.value = volume * 0.6;
  noise.connect(hp).connect(ng).connect(c.destination);
  noise.start(t);
}
