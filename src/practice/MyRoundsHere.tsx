// Page golf : « Mes parties sur ce golf » (connecté, au moins une partie ici).
import { useEffect, useState } from 'react';
import type { PlaySession } from '../../shared/practice';
import { Group, Row } from '../components/Controls';
import { useUi } from '../ui';
import { useAccount, useDataVersion } from './account';
import { listSessions } from './api';
import { SessionCell } from './SessionCell';

const SHOWN = 3;

export function MyRoundsHere({ golfId, golfName }: { golfId: number; golfName: string }) {
  const ui = useUi();
  const account = useAccount();
  const version = useDataVersion();
  const signedIn = account.status === 'in';
  const [rounds, setRounds] = useState<PlaySession[] | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setRounds(null);
      return;
    }
    let live = true;
    listSessions('round', { golfId })
      .then((l) => live && setRounds(l))
      .catch(() => live && setRounds(null));
    return () => {
      live = false;
    };
  }, [signedIn, golfId, version]);

  if (!signedIn || !rounds || rounds.length === 0) return null;
  return (
    <Group title="Mes parties sur ce golf">
      {rounds.slice(0, SHOWN).map((s) => (
        <SessionCell key={s.id} s={s} onOpen={() => ui.push({ type: 'session', id: s.id })} />
      ))}
      {rounds.length > SHOWN && (
        <Row
          label="Toutes mes parties ici"
          value={`${rounds.length}`}
          chevron
          onClick={() => ui.push({ type: 'sessions', kind: 'round', golfId, golfName })}
        />
      )}
    </Group>
  );
}
