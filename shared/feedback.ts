// Programme testeurs : retours des joueurs et réponses de l'admin (worker/routes/feedback.ts ↔ src/feedback/*, src/admin/*).

export type FeedbackKind = 'question' | 'like' | 'use' | 'dislike' | 'unused' | 'bug' | 'idea';

/** Catégories proposées au testeur, dans l'ordre d'affichage. `color` = variable CSS système. */
export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; short: string; color: string }[] = [
  { id: 'like', label: 'J’aime', short: 'J’aime', color: 'var(--tint)' },
  { id: 'use', label: 'J’utilise', short: 'J’utilise', color: 'var(--blue)' },
  { id: 'dislike', label: 'J’aime moins', short: 'Aime moins', color: 'var(--orange)' },
  { id: 'unused', label: 'Je n’utilise pas', short: 'N’utilise pas', color: 'var(--gray)' },
  { id: 'question', label: 'Question', short: 'Question', color: 'var(--indigo)' },
  { id: 'idea', label: 'Idée', short: 'Idée', color: 'var(--teal)' },
  { id: 'bug', label: 'Bug', short: 'Bug', color: 'var(--red)' },
];
export const FEEDBACK_KIND_IDS = FEEDBACK_KINDS.map((k) => k.id);
export const FEEDBACK_MAX = 4000;

export interface FeedbackMessage {
  id: number;
  author: 'user' | 'admin';
  kind: FeedbackKind | null; // null pour une réponse de l'admin
  body: string;
  createdAt: string; // ISO UTC
  readAt: string | null; // lu par l'autre partie
  context?: { app?: string; screen?: string; device?: string; ua?: string } | null; // visible côté admin seulement
}

// ---------------------------------------------------------------- côté testeur (/api/me/feedback)

/** GET /api/me/feedback */
export interface MyFeedback {
  messages: FeedbackMessage[]; // du plus ancien au plus récent
  unread: number; // réponses de l'admin non lues
}
/** POST /api/me/feedback → FeedbackMessage */
export interface NewFeedback {
  kind: FeedbackKind;
  body: string;
  screen?: string;
}
// POST /api/me/feedback/read → { ok: true } (marque les réponses de l'admin comme lues)

// ---------------------------------------------------------------- côté admin (/api/admin/…)

export interface FeedbackThread {
  userId: string;
  name: string; // pseudo, sinon prénom nom, sinon e-mail
  email: string;
  hasPhoto: boolean;
  total: number;
  fromUser: number;
  unread: number; // retours du testeur pas encore lus par l'admin
  awaitingReply: boolean; // le dernier message vient du testeur
  lastAt: string;
  lastBody: string;
  lastAuthor: 'user' | 'admin';
  lastKind: FeedbackKind | null;
}

export interface TesterScore {
  userId: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  pseudo: string | null;
  licence: string | null;
  city: string | null;
  homeGolf: string | null;
  hasPhoto: boolean;
  profileFields: number; // champs d'identité remplis, sur profileFieldsTotal
  joinedAt: string;
  lastSeen: string | null;
  activeDays: number;
  timeMs: number;
  sessions: number; // parties + practices (hors corbeille)
  feedbacks: number; // retours envoyés
}

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
}

/** GET /api/admin/tests?days=7|30|90|365 */
export interface TestsDashboard {
  days: number;
  profileFieldsTotal: number;
  testers: {
    total: number; // comptes testeurs (hors démo et admin)
    newInPeriod: number;
    active7: number;
    active30: number;
    profileComplete: number; // tous les champs d'identité remplis
    withSessions: number;
    withFeedback: number;
  };
  /** Appareils → démo → compte → profil complet → séance → retour. */
  funnel: FunnelStep[];
  /** Touchers sur les boutons du message testeur de l'écran d'accueil, sur la période. */
  splash: { views: number; signup: number; login: number; later: number };
  feedback: {
    total: number;
    inPeriod: number;
    unread: number;
    awaitingReply: number; // fils dont le dernier message vient du testeur
    byKind: Record<FeedbackKind, number>;
    avgReplyHours: number | null; // délai moyen entre un retour et la réponse suivante
  };
  threads: FeedbackThread[]; // fils en attente d'abord, puis du plus récent au plus ancien
  testers_list: TesterScore[]; // classés par engagement (jours actifs, retours, séances)
}

// GET  /api/admin/people/:id/feedback        → FeedbackMessage[] (du plus ancien au plus récent)
// POST /api/admin/people/:id/feedback        { body } → FeedbackMessage (le testeur reçoit un e-mail)
// POST /api/admin/people/:id/feedback/read   → { ok: true } (marque ses retours comme lus)
