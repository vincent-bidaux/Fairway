import type { Highlight } from '../../shared/practice';
import { ApiError } from '../api';

export async function getHighlights(limit = 50): Promise<Highlight[]> {
  let res: Response;
  try {
    res = await fetch(`/api/me/highlights?limit=${limit}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  if (!res.ok) throw new ApiError(res.status, `Erreur ${res.status}`);
  return (await res.json()) as Highlight[];
}
