import { useEffect, useId, useRef, useState } from 'react';
import { playPoc, primeAudio } from './poc';

/** First launch: the splash closes on its own after this delay (or earlier on tap). */
const AUTO_CLOSE_MS = 3600;
const FADE_MS = 300;

// --- Timeline (ms from start) ------------------------------------------------
const POLE_START = 120;
const POLE_MS = 420;
const FLAG_START = 420;
const FLAG_MS = 520;
const BALL_START = 1000;

// Ball rest position in the icon (centre of the ball, viewBox units) — the right lip of the hole.
const REST = { x: 338, y: 388 };

interface Sample {
  t: number; // ms from BALL_START
  x: number; // offset from REST
  y: number;
}

/**
 * Ball path, as offsets from its resting spot:
 *  1. comes in fast from the top right at ~45°
 *  2. hits the lip of the hole and kicks up-left into the flag
 *  3. pops off the flag in a high arc and lands right of the hole
 *  4. small hop, then rolls out of the icon
 */
function ballPath(): { samples: Sample[]; flagHitAt: number; total: number } {
  const s: Sample[] = [];
  const seg = (dur: number, fn: (u: number) => [number, number]) => {
    const t0 = s.length ? s[s.length - 1].t : 0;
    const n = Math.max(4, Math.round(dur / 16));
    for (let i = s.length ? 1 : 0; i <= n; i++) {
      const u = i / n;
      const [x, y] = fn(u);
      s.push({ t: t0 + u * dur, x, y });
    }
  };
  const quad = (a: number, c: number, b: number, u: number) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * c + u * u * b;

  // 1. Incoming at 45°, slightly accelerating.
  seg(230, (u) => {
    const k = u ** 1.25;
    return [260 * (1 - k), -260 * (1 - k)];
  });
  // 2. Kick off the lip up into the flag (decelerating as it rises).
  const hit = { x: -46, y: -190 };
  seg(170, (u) => [hit.x * u, hit.y * (1 - (1 - u) ** 2)]);
  const flagHitAt = s[s.length - 1].t;
  // 3. Bell-shaped arc off the flag, landing right of the hole.
  const land = { x: 96, y: 2 };
  seg(470, (u) => [hit.x + (land.x - hit.x) * u, quad(hit.y, -420, land.y, u)]);
  // 4a. Small hop.
  const hop = { x: 150, y: 2 };
  seg(170, (u) => [land.x + (hop.x - land.x) * u, quad(land.y, -46, hop.y, u)]);
  // 4b. Roll out of the icon, easing off.
  seg(620, (u) => [hop.x + 230 * (1 - (1 - u) ** 2), hop.y]);

  return { samples: s, flagHitAt, total: s[s.length - 1].t };
}

const BACK_OUT = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // overshoot ("back")
const CUBIC_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';

/** Delay before a replay starts, so the finger has left the icon. */
const REPLAY_DELAY_MS = 330;

function SplashArt({ size, onFlagHit, replay }: { size: number; onFlagHit: () => void; replay: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pole = useRef<SVGGElement>(null);
  const stick = useRef<SVGGElement>(null);
  const flag = useRef<SVGGElement>(null);
  const ball = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const spin = useRef<SVGGElement>(null);
  const ballAnims = useRef<{ anims: Animation[]; timers: number[] }>({ anims: [], timers: [] });
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /** Ball sequence only (flag stays put): incoming shot, lip, flag hit + shake + sound, arc, roll out. */
  const playBall = (delay: number) => {
    ballAnims.current.anims.forEach((a) => a.cancel());
    ballAnims.current.timers.forEach((t) => window.clearTimeout(t));
    const anims: Animation[] = [];
    const timers: number[] = [];
    const { samples, flagHitAt, total } = ballPath();
    anims.push(
      ball.current!.animate(
        samples.map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)`, offset: p.t / total })),
        { duration: total, delay, easing: 'linear', fill: 'both' },
      ),
    );
    // Ball spins as it travels.
    anims.push(
      spin.current!.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(900deg)' }], {
        duration: total,
        delay,
        easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
        fill: 'both',
      }),
    );
    // Ground shadow follows the ball horizontally and fades with height.
    anims.push(
      shadow.current!.animate(
        samples.map((p) => ({
          transform: `translateX(${p.x}px)`,
          opacity: Math.max(0, 1 - Math.max(0, -p.y) / 70),
          offset: p.t / total,
        })),
        { duration: total, delay, easing: 'linear', fill: 'both' },
      ),
    );
    // Impact on the flag: shake the whole flagstick around the hole, plus a "ploc".
    const hitTime = delay + flagHitAt;
    anims.push(
      stick.current!.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-6deg)', offset: 0.12 },
          { transform: 'rotate(4deg)', offset: 0.3 },
          { transform: 'rotate(-2.5deg)', offset: 0.48 },
          { transform: 'rotate(1.4deg)', offset: 0.66 },
          { transform: 'rotate(-0.6deg)', offset: 0.84 },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 650, delay: hitTime, easing: 'ease-out' },
      ),
    );
    timers.push(window.setTimeout(onFlagHit, hitTime));
    ballAnims.current = { anims, timers };
  };

  // Replay requested (tap on the icon).
  useEffect(() => {
    if (replay > 0 && !reduce && ball.current?.animate) playBall(REPLAY_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    if (reduce || !pole.current?.animate) return;
    const anims: Animation[] = [];
    const timers: number[] = [];

    // Flagstick grows from the hole with a springy overshoot.
    anims.push(
      pole.current.animate(
        [
          { transform: 'scaleY(0)', offset: 0, easing: CUBIC_OUT },
          { transform: 'scaleY(1.12)', offset: 0.62, easing: 'ease-in-out' },
          { transform: 'scaleY(0.96)', offset: 0.82, easing: 'ease-in-out' },
          { transform: 'scaleY(1)', offset: 1 },
        ],
        { duration: POLE_MS, delay: POLE_START, easing: 'linear', fill: 'backwards' },
      ),
    );
    // Red flag snaps open with a little elastic bounce.
    anims.push(
      flag.current!.animate(
        [
          { transform: 'scaleX(0) skewY(10deg)', opacity: 0, offset: 0, easing: BACK_OUT },
          { transform: 'scaleX(1.18) skewY(-6deg)', opacity: 1, offset: 0.5, easing: 'ease-in-out' },
          { transform: 'scaleX(0.93) skewY(3deg)', offset: 0.75, easing: 'ease-in-out' },
          { transform: 'scaleX(1.03) skewY(-1deg)', offset: 0.9, easing: 'ease-in-out' },
          { transform: 'scaleX(1) skewY(0deg)', offset: 1 },
        ],
        { duration: FLAG_MS, delay: FLAG_START, easing: 'linear', fill: 'backwards' },
      ),
    );

    playBall(BALL_START);

    return () => {
      anims.forEach((a) => a.cancel());
      timers.forEach((t) => window.clearTimeout(t));
      ballAnims.current.anims.forEach((a) => a.cancel());
      ballAnims.current.timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const id = (n: string) => `${n}${uid}`;
  return (
    <svg className="artwork splash-art" viewBox="0 0 512 512" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3DBE63" />
          <stop offset="1" stopColor="#0F5E26" />
        </linearGradient>
        <linearGradient id={id('hill')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38B35E" />
          <stop offset="1" stopColor="#1C8C41" />
        </linearGradient>
        <linearGradient id={id('flag')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E02D22" />
          <stop offset="1" stopColor="#FF4A3F" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('ball')} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#D9DEDB" />
        </radialGradient>
        <clipPath id={id('clip')}>
          <rect width="512" height="512" rx="114" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id('clip')})`}>
        <rect width="512" height="512" fill={`url(#${id('bg')})`} />
        <rect width="512" height="230" fill={`url(#${id('sheen')})`} />
        <ellipse cx="256" cy="560" rx="400" ry="190" fill={`url(#${id('hill')})`} />
        <path d="M60 372 Q256 330 452 372" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="3" />
        <ellipse cx="256" cy="400" rx="92" ry="22" fill="#0B3F19" />
        <ellipse cx="256" cy="396" rx="92" ry="20" fill="#0E4A1E" />
        <ellipse ref={shadow} className="sp-origin-view" cx="342" cy="411" rx="19" ry="5" fill="#000" fillOpacity="0.22" />
        {/* Flagstick: rotates around the hole when hit. */}
        <g ref={stick} className="sp-origin-view" style={{ transformOrigin: '256px 400px' }}>
          <g ref={pole} className="sp-origin-view" style={{ transformOrigin: '256px 400px' }}>
            <rect x="250" y="120" width="12" height="280" rx="6" fill="#fff" />
            <rect x="250" y="120" width="5" height="280" rx="2.5" fill="#000" fillOpacity="0.1" />
            <circle cx="256" cy="116" r="9" fill="#fff" />
            <g ref={flag} className="sp-origin-view" style={{ transformOrigin: '262px 174px' }}>
              <path d="M262 126 L376 174 L262 222 Z" fill={`url(#${id('flag')})`} />
              <path d="M262 126 L376 174 L262 174 Z" fill="#fff" fillOpacity="0.14" />
            </g>
          </g>
        </g>
        <g ref={ball} className="sp-origin-view">
          <g ref={spin} className="sp-origin-view" style={{ transformOrigin: `${REST.x}px ${REST.y}px` }}>
            <circle cx={REST.x} cy={REST.y} r="20" fill={`url(#${id('ball')})`} />
            <circle cx="331" cy="382" r="2.4" fill="#000" fillOpacity="0.08" />
            <circle cx="341" cy="379" r="2.4" fill="#000" fillOpacity="0.08" />
            <circle cx="344" cy="391" r="2.4" fill="#000" fillOpacity="0.08" />
            <circle cx="332" cy="393" r="2.4" fill="#000" fillOpacity="0.08" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/**
 * Splash screen.
 * - First launch (runId 0): closes on its own after AUTO_CLOSE_MS, or on tap.
 * - Reopened from « ‹ Fairway »: stays until the user taps it.
 */
export function Splash({ runId, onDone }: { runId: number; onDone: () => void }) {
  const [out, setOut] = useState(false);
  const [hint, setHint] = useState(false);
  const [replay, setReplay] = useState(0);
  const [stay, setStay] = useState(runId > 0);
  const autoClose = useRef<number[]>([]);

  const close = () => {
    if (out) return;
    setOut(true);
    window.setTimeout(onDone, FADE_MS);
  };

  useEffect(() => {
    setOut(false);
    setHint(false);
    setReplay(0);
    setStay(runId > 0);
    const hintTimer = window.setTimeout(() => setHint(true), 2600);
    autoClose.current =
      runId > 0 ? [] : [window.setTimeout(() => setOut(true), AUTO_CLOSE_MS), window.setTimeout(onDone, AUTO_CLOSE_MS + FADE_MS)];
    return () => {
      window.clearTimeout(hintTimer);
      autoClose.current.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return (
    <div
      className={`splash${out ? ' is-out' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Fairway. Trouvez les prochaines compétitions de golf autour de vous. Touchez pour continuer."
      onClick={close}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && close()}
    >
      <div className="splash-inner" key={runId}>
        {/* Tap on the icon replays the ball shot (flag stays); tap anywhere else closes. */}
        <button
          type="button"
          className="splash-art-btn"
          aria-label="Rejouer l'animation"
          onClick={(e) => {
            e.stopPropagation();
            primeAudio();
            // Playing with the icon on first launch: keep the splash open until the user taps elsewhere.
            autoClose.current.forEach((t) => window.clearTimeout(t));
            autoClose.current = [];
            setStay(true);
            setReplay((n) => n + 1);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <SplashArt size={168} replay={replay} onFlagHit={() => playPoc()} />
        </button>
        <h1 className="splash-title">FAIRWAY</h1>
        <p className="splash-tag">Trouvez les prochaines compétitions de golf autour de vous.</p>
        {stay && <p className={`splash-hint${hint ? ' is-on' : ''}`}>Touchez l'écran pour continuer · l'icône pour rejouer</p>}
      </div>
    </div>
  );
}
