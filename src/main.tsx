import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';

// StrictMode volontairement absent : la pile d'historique (nav.ts) est impérative.
createRoot(document.getElementById('root')!).render(<App />);
