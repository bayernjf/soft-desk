import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useSettingsStore, applyTheme, watchSystemTheme } from './stores/settings.store';
import './index.css';

applyTheme(useSettingsStore.getState().theme);
watchSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
