import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useSettingsStore, applyTheme, watchSystemTheme } from './stores/settings.store';
import { createLogger } from './lib/logger';
import './lib/i18n';
import './index.css';

const logger = createLogger('renderer');

window.addEventListener('error', (event) => {
  logger.error('uncaught error', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('unhandled rejection', event.reason);
});

applyTheme(useSettingsStore.getState().theme);
watchSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
