import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RadialMenu } from './components/features/RadialMenu';
import './index.css';

createRoot(document.getElementById('radial-root')!).render(
  <StrictMode>
    <RadialMenu />
  </StrictMode>,
);
