import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { AtRule, Plugin as PostcssPlugin, Rule } from 'postcss';

/**
 * Thème forcé (Réglages → Apparence) : chaque bloc `@media (prefers-color-scheme: dark)` ne s'applique plus
 * si l'utilisateur a choisi « Clair », et il est dupliqué hors media pour `:root[data-theme='dark']`.
 * `:root` seul devient `:root:not(…)` / `:root[data-theme='dark']`, sinon le sélecteur est préfixé.
 */
const SYS = ":root:not([data-theme='light'])";
const DARK = ":root[data-theme='dark']";
const scope = (sel: string, root: string) =>
  sel
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s === ':root' || s === 'html' ? root : s.startsWith(':root') ? root + s.slice(5) : `${root} ${s}`))
    .join(', ');
const forcedTheme = (): PostcssPlugin => ({
  postcssPlugin: 'fairway-forced-theme',
  Once(root) {
    root.walkAtRules('media', (at: AtRule) => {
      if (!/prefers-color-scheme:\s*dark/.test(at.params) || at.params.includes('and')) return;
      const forced: Rule[] = [];
      at.walkRules((r: Rule) => {
        if (r.parent?.type === 'atrule' && (r.parent as AtRule).name.endsWith('keyframes')) return;
        forced.push(r.clone({ selector: scope(r.selector, DARK) }));
        r.selector = scope(r.selector, SYS);
      });
      at.after(forced);
    });
  },
});

// `npm run dev` serves the SPA; API calls go to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [forcedTheme()] } },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
