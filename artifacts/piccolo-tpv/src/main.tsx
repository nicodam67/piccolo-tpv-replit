import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Register service worker for offline support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(
    import.meta.env.BASE_URL + 'sw.js',
    { scope: import.meta.env.BASE_URL }
  );
}

createRoot(document.getElementById('root')!).render(<App />);
