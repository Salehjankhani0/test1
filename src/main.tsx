import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthContext.tsx';
import { AuthGate } from './auth/AuthGate.tsx';
import './styles.css';

const el = document.getElementById('root')!;
createRoot(el).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  // registerSW is injected by vite-plugin-pwa at build time
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => undefined);
}
