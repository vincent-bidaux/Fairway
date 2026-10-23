export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ADMIN_TOKEN?: string;
  CRAWL_BATCH_SIZE: string;
  CRAWL_MIN_INTERVAL_HOURS: string;
}
