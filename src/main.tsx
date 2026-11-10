import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSettingsStore, applyTheme, watchSystemTheme } from './stores/settings.store';
import { createLogger } from './lib/logger';
import './lib/i18n';

// dev-only：把 vite 构建错误打到控制台（原 inline script 移入模块以兼容生产 CSP script-src 'self'）
if (import.meta.hot?.on) {
  import.meta.hot.on('vite:error', (error: { err?: { message?: string; frame?: string } }) => {
    if (error.err) {
      console.error([error.err.message, error.err.frame].filter(Boolean).join('\n'));
    }
  });
}
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
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
