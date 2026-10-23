import { useEffect, useState } from 'react';
import { Artwork } from './Artwork';

const SHOW_MS = 2000;
const FADE_MS = 300;

/** Écran de démarrage : 2 s, puis fondu de sortie de 300 ms. `runId` relance la séquence. */
export function Splash({ runId, onDone }: { runId: number; onDone: () => void }) {
  const [out, setOut] = useState(false);

  useEffect(() => {
    setOut(false);
    const t1 = window.setTimeout(() => setOut(true), SHOW_MS);
    const t2 = window.setTimeout(onDone, SHOW_MS + FADE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return (
    <div className={`splash${out ? ' is-out' : ''}`} role="img" aria-label="Fairway. Trouvez les prochaines compétitions de golf autour de vous.">
      <div className="splash-inner" key={runId}>
        <Artwork size={168} animate className="splash-art" />
        <h1 className="splash-title">FAIRWAY</h1>
        <p className="splash-tag">Trouvez les prochaines compétitions de golf autour de vous.</p>
      </div>
    </div>
  );
}
