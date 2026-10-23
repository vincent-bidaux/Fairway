// [Agent A] Onglet « Mes parties » : tableau de bord (connecté) ou aperçu grisé + invitation (non connecté).
import { Screen } from '../components/Screen';
import { PARTIES_LABEL } from '../components/TabBar';

export function PracticeScreen({ active: _active }: { active: boolean }) {
  return <Screen title={PARTIES_LABEL} eyebrow>{null}</Screen>;
}
