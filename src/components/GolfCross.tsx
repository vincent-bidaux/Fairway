import { useEffect, useState } from 'react';
import type { Golf } from '../../shared/types';
import { useHomeGolfId } from '../practice/account';
import { Icon } from './Icon';

/**
 * Golf avatar: round photo of the course inside a green ring (gold for the player's home golf).
 * Falls back to a flag icon when there is no photo or it fails to load.
 * (File name kept for import stability; the component is now an avatar.)
 */
export function GolfCross({ golf, size = 56 }: { golf: Golf; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [golf.photoUrl]);
  const showPhoto = !!golf.photoUrl && !failed;
  const home = useHomeGolfId() === golf.id;
  // Anneau affiné de 3 px (élagage 11/2026).
  const ring = Math.max(2, Math.round(size * 0.11) - 3);
  return (
    <span
      className={`golf-avatar${home ? ' golf-avatar--home' : ''}`}
      style={{ width: size, height: size, padding: ring }}
      role="img"
      aria-label={`Photo : ${golf.name}${home ? ' (mon club)' : ''}`}
      title={home ? 'Mon club' : undefined}
    >
      <span className="golf-avatar-inner">
        {showPhoto ? (
          <img src={golf.photoUrl!} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <Icon name="golf" size={Math.round(size * 0.42)} />
        )}
      </span>
    </span>
  );
}
