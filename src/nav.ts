// Pile de "calques" (écrans de détail et sheets) synchronisée avec l'historique
// du navigateur : le bouton retour ferme le calque du dessus.

interface Layer {
  id: number;
  onPop: () => void;
}

const layers: Layer[] = [];
let seq = Date.now();
let ignore = 0;
const queue: Array<() => void> = [];

export function pushLayer(onPop: () => void): number {
  const id = ++seq;
  layers.push({ id, onPop });
  const push = () => history.pushState({ layer: id }, '');
  // Un history.back() programmatique est en cours : on attend son popstate.
  if (ignore > 0) queue.push(push);
  else push();
  return id;
}

/** Retire un calque fermé par l'interface (sans notifier son propriétaire). */
export function dropLayer(id: number): void {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const isTop = i === layers.length - 1;
  layers.splice(i, 1);
  if (isTop) {
    ignore++;
    history.back();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    if (ignore > 0) {
      ignore--;
      if (ignore === 0) queue.splice(0).forEach((f) => f());
      return;
    }
    const target = (e.state && (e.state as { layer?: number }).layer) || 0;
    while (layers.length && layers[layers.length - 1].id > target) {
      layers.pop()!.onPop();
    }
  });
}
