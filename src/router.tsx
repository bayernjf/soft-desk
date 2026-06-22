import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Library } from '@/pages/Library';
import { Workflows } from '@/pages/Workflows';
import { Statistics } from '@/pages/Statistics';
import { Uninstall } from '@/pages/Uninstall';
import { Settings } from '@/pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'library', element: <Library /> },
      { path: 'workflows', element: <Workflows /> },
      { path: 'statistics', element: <Statistics /> },
      { path: 'uninstall', element: <Uninstall /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
