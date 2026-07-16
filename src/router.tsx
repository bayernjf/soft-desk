import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { Library } from '@/pages/Library';
import { Workflows } from '@/pages/Workflows';
import { Statistics } from '@/pages/Statistics';
import { Uninstall } from '@/pages/Uninstall';
import { Settings } from '@/pages/Settings';
import { Account } from '@/pages/Account';
import { Favorites } from '@/pages/Favorites';
import { MyShares } from '@/pages/MyShares';
import { SharePreview } from '@/pages/SharePreview';
import { AnnouncementsPage } from '@/pages/AnnouncementsPage';

export const router = createBrowserRouter([
  // /share/:token 走独立布局(免登录、无侧边栏),深链唤起后落地这里
  { path: '/share/:token', element: <SharePreview /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'library', element: <Library /> },
      { path: 'favorites', element: <Favorites /> },
      { path: 'workflows', element: <Workflows /> },
      { path: 'my-shares', element: <MyShares /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
      { path: 'statistics', element: <Statistics /> },
      { path: 'uninstall', element: <Uninstall /> },
      { path: 'settings', element: <Settings /> },
      { path: 'account', element: <Account /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
