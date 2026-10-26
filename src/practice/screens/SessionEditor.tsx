// Nouvelle séance / modification : type, golf, date, puis saisie trou par trou ou practice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaySession, SessionKind } from '../../../shared/practice';
import { Segmented } from '../../components/Controls';
import { Screen } from '../../components/Screen';
import { useUi } from '../../ui';
import { newId, nowLocal, saveSession } from '../api';
import { touchData } from '../account';
import { ConfirmSheet } from '../ConfirmSheet';
import { clearDraft, readDraft, writeDraft } from '../drafts';
import { PracticeForm } from '../PracticeForm';
import { RoundEntry } from '../RoundEntry';
import { BeforeGroup, buildEntries, CompetitionGroup, PlaceDate, RoundOptions } from '../SessionInfo';
import { ContextPicker } from '../contextIcons';
import { Sheet } from '../../components/Sheet';
import '../session.css';

function blank(kind: SessionKind, id = newId()): PlaySession {
  return {
    id,
    kind,
    golf_id: null,
    golf_name: null,
    golf_city: null,
    course: '',
    place: null,
    event_id: null,
    event_title: null,
    mood: null,
    body: null,
    weather: null,
    played_at: nowLocal(),
    holes: kind === 'round' ? 18 : null,
    start_hole: 1,
    tee: null,
    duration_min: kind === 'range' ? 60 : null,
    balls: null,
    focus: null,
    feeling: null,
    notes: null,
    hole_entries: [],
    drills: [],
  };
}

/** Ce qui part au serveur : seuls les trous réellement joués comptent (et votent pour le par). */
function toPayload(s: PlaySession): PlaySession {
  if (s.kind === 'round') return { ...s, hole_entries: (s.hole_entries ?? []).filter((e) => e.strokes != null) };
  return { ...s, hole_entries: undefined, feeling: s.mood ?? s.feeling };
}

type Step = 'setup' | 'entry';
type Sync = 'ok' | 'pending' | 'error';

export function SessionEditor({ kind: kindProp, session }: { kind?: SessionKind; session?: PlaySession }) {
  const ui = useUi();
  const isNew = !session;
  const [s, setS] = useState<PlaySession>(() => {
    if (!session) return blank(kindProp ?? 'round');
    const base: PlaySession = { ...session };
    if (base.mood == null && base.kind === 'range' && base.feeling) base.mood = base.feeling;
    if (base.kind === 'round') {
      const holes = base.holes && base.holes >= 1 && base.holes <= 18 ? base.holes : 18;
      base.holes = holes;
      base.hole_entries = buildEntries(holes, base.start_hole || 1, base.hole_entries ?? []);
    }
    base.drills = base.drills ?? [];
    return base;
  });
  const [step, setStep] = useState<Step>(isNew ? 'setup' : 'entry');
  const [golfN, setGolfN] = useState<number | null>(null);
  const [penTouched, setPenTouchedState] = useState<number[]>(() => (session ? (readDraft(session.id)?.penTouched ?? []) : []));
  const [sync, setSync] = useState<Sync>('ok');
  const [busy, setBusy] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [rev, setRev] = useState(0);

  const latest = useRef(s);
  latest.current = s;
  const penRef = useRef(penTouched);
  penRef.current = penTouched;
  const ver = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);
  const synced = useRef(false);
  const finished = useRef(false);

  const update = useCallback((fn: (s: PlaySession) => PlaySession) => {
    ver.current++;
    setS(fn);
    setRev(ver.current);
  }, []);
  const setPenTouched = useCallback((fn: (p: number[]) => number[]) => {
    setPenTouchedState((p) => fn(p));
    ver.current++;
    setRev(ver.current);
  }, []);

  // --- Brouillon local + synchronisation différée (parties seulement) --------
  const hasScore = (x: PlaySession) => (x.hole_entries ?? []).some((e) => e.strokes != null);
  const flush = useCallback((): Promise<boolean> => {
    if (inflight.current) return inflight.current.then(() => flush());
    const v = ver.current;
    const snap = latest.current;
    const p = saveSession(toPayload(snap))
      .then(() => {
        synced.current = true;
        if (ver.current === v) {
          setSync('ok');
          writeDraft(snap.id, { session: snap, dirty: false, at: Date.now(), penTouched: penRef.current });
        }
        return true;
      })
      .catch(() => {
        setSync('error');
        return false;
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (rev === 0 || step !== 'entry' || finished.current) return;
    writeDraft(s.id, { session: s, dirty: true, at: Date.now(), penTouched: penRef.current });
    if (s.kind !== 'round' || (isNew && !hasScore(s))) return;
    setSync('pending');
    const t = window.setTimeout(() => void flush(), 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  // Reprise après une coupure réseau.
  useEffect(() => {
    if (sync !== 'error') return;
    const retry = () => void flush();
    window.addEventListener('online', retry);
    const t = window.setInterval(retry, 20000);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(t);
    };
  }, [sync, flush]);

  // En quittant, les listes se rafraîchissent si quelque chose a été synchronisé.
  useEffect(
    () => () => {
      if (synced.current) touchData();
    },
    [],
  );

  // --- Étape 1 -----------------------------------------------------------------
  const kind = s.kind;
  const setKind = (k: SessionKind) => {
    if (k === kind) return;
    setS((x) => {
      const fresh = blank(k, x.id);
      return { ...fresh, golf_id: x.golf_id, golf_name: x.golf_name, golf_city: x.golf_city, played_at: x.played_at, place: k === 'range' ? x.place : null, holes: k === 'round' ? (golfN === 9 ? 9 : 18) : null };
    });
  };
  const canStart = kind === 'round' ? s.golf_id != null : s.golf_id != null || (s.place != null && s.place.trim() !== '');

  const start = async () => {
    if (!canStart) return;
    if (kind === 'round') {
      const holes = s.holes && s.holes >= 1 && s.holes <= 18 ? s.holes : 18;
      // une boucle secondaire part toujours de son trou 1 ; sur le parcours principal, 9 trous peuvent partir du 10
      const start = s.course === '' && holes === 9 ? s.start_hole : 1;
      setS((x) => ({ ...x, holes, start_hole: start, hole_entries: buildEntries(holes, start) }));
    } else if (s.golf_id == null) {
      setS((x) => ({ ...x, place: x.place?.trim() || null }));
    }
    setStep('entry');
  };

  const leave = () => {
    if (isNew && step === 'entry' && !finished.current) {
      if (kind === 'round' && hasScore(latest.current)) {
        ui.toast('Partie conservée sur l’appareil');
      } else clearDraft(s.id);
    }
    ui.back();
  };

  // --- Fin -----------------------------------------------------------------------
  const doFinish = async () => {
    if (busy) return;
    const snap = latest.current;
    if (snap.kind === 'range' && snap.golf_id == null && !(snap.place ?? '').trim()) {
      ui.toast('Indiquez le lieu de la séance');
      return;
    }
    setBusy(true);
    try {
      if (inflight.current) await inflight.current;
      await saveSession(toPayload(snap));
      finished.current = true;
      synced.current = false;
      clearDraft(snap.id);
      touchData();
      ui.toast(snap.kind === 'round' ? 'Partie enregistrée' : 'Séance enregistrée');
      ui.back();
      if (isNew) window.setTimeout(() => ui.push({ type: 'session', id: snap.id }), 160);
    } catch (e) {
      setSync('error');
      writeDraft(snap.id, { session: snap, dirty: true, at: Date.now(), penTouched: penRef.current });
      ui.toast(`Enregistrement impossible. Gardé sur l’appareil. ${(e as Error).message ?? ''}`.trim());
      setBusy(false);
    }
  };
  const finish = () => {
    if (latest.current.kind === 'round' && !hasScore(latest.current)) setConfirmEmpty(true);
    else if (latest.current.kind === 'round') setMoodOpen(true);
    else void doFinish();
  };

  if (step === 'setup') {
    return (
      <Screen
        title="Nouvelle séance"
        left={
          <button type="button" className="text-btn" onClick={ui.back}>
            Annuler
          </button>
        }
      >
        <div className="setup-seg">
          <Segmented<SessionKind>
            label="Type de séance"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'round', label: 'Partie' },
              { value: 'range', label: 'Practice' },
            ]}
          />
        </div>
        <PlaceDate
          s={s}
          onChange={(p, g) => {
            if (g !== undefined) setGolfN(g?.holes ?? null);
            setS((x) => {
              const next = { ...x, ...p };
              if (g && x.kind === 'round') {
                next.holes = g.holes === 9 ? 9 : 18;
                next.start_hole = 1;
              }
              return next;
            });
          }}
        />
        {kind === 'round' && <CompetitionGroup s={s} onChange={(p) => setS((x) => ({ ...x, ...p }))} />}
        {kind === 'round' && <RoundOptions s={s} golfHoles={golfN} onChange={(p) => setS((x) => ({ ...x, ...p }))} />}
        {kind === 'round' && <BeforeGroup s={s} onChange={(p) => setS((x) => ({ ...x, ...p }))} />}
        <div className="setup-cta">
          <button type="button" className="btn btn--block" disabled={!canStart} onClick={start}>
            {kind === 'round' ? 'Commencer' : 'Continuer'}
          </button>
          {!canStart && (
            <p className="setup-hint">{kind === 'round' ? 'Choisissez le golf pour commencer.' : 'Choisissez un golf ou « Autre lieu ».'}</p>
          )}
        </div>
      </Screen>
    );
  }

  return (
    <>
      {kind === 'round' ? (
        <RoundEntry
          s={s}
          update={update}
          penTouched={penTouched}
          setPenTouched={setPenTouched}
          golfN={golfN}
          setGolfN={setGolfN}
          sync={sync}
          busy={busy}
          onFinish={finish}
          onBack={leave}
          isNew={isNew}
        />
      ) : (
        <PracticeForm s={s} update={update} setGolfN={setGolfN} busy={busy} onSave={finish} onBack={leave} isNew={isNew} />
      )}
      <Sheet
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        title="Fin de partie"
        right={
          <button type="button" className="text-btn" onClick={() => setMoodOpen(false)}>
            Retour
          </button>
        }
      >
        <div className="sheet-pad">
          <h3 className="mood-q">Comment s’est passée la partie ?</h3>
          <div className="mood-card">
            <ContextPicker kind="mood" value={s.mood} onChange={(v) => update((x) => ({ ...x, mood: v }))} />
          </div>
          <div className="mood-card">
            <textarea
              className="notes-input"
              rows={3}
              maxLength={2000}
              placeholder="Une note ? (facultatif)"
              aria-label="Note de la partie"
              value={s.notes ?? ''}
              onChange={(e) => update((x) => ({ ...x, notes: e.target.value || null }))}
            />
          </div>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn--block"
              disabled={busy}
              onClick={() => {
                setMoodOpen(false);
                void doFinish();
              }}
            >
              {busy ? 'Enregistrement…' : 'Enregistrer la partie'}
            </button>
            <button
              type="button"
              className="btn btn--block btn--secondary"
              disabled={busy}
              onClick={() => {
                setMoodOpen(false);
                void doFinish();
              }}
            >
              Passer
            </button>
          </div>
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmEmpty}
        title="Aucun score saisi"
        message="Aucun trou n’a de score. Enregistrer quand même cette partie vide ?"
        confirmLabel="Enregistrer quand même"
        onConfirm={() => void doFinish()}
        onClose={() => setConfirmEmpty(false)}
      />
    </>
  );
}
