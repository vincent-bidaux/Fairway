export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ADMIN_TOKEN?: string;
  /** Comptes admin supplémentaires (e-mails séparés par des virgules). */
  ADMIN_EMAILS?: string;
  RESEND_API_KEY?: string;
  BETTER_AUTH_SECRET?: string;
  CRAWL_BATCH_SIZE: string;
  CRAWL_MIN_INTERVAL_HOURS: string;
}
