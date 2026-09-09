import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
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

// 每个子路由都挂 errorElement,而不是只挂在 Layout 上:错误页会渲染在 Outlet
// 位置,侧边栏和窗口拖拽区得以保留,用户还能切到别的页面。只挂在父级的话整个
// Layout 会被替换掉,退化成一个走不出去的死页面。
const pages: RouteObject[] = [
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
];

export const router = createBrowserRouter([
  // /share/:token 走独立布局(免登录、无侧边栏),深链唤起后落地这里
  { path: '/share/:token', element: <SharePreview />, errorElement: <RouteErrorBoundary /> },
  {
    path: '/',
    element: <Layout />,
    // Layout 自身(侧边栏、公告、深链订阅)抛错时兜到这里
    errorElement: <RouteErrorBoundary />,
    children: [
      ...pages.map((route) => ({ ...route, errorElement: <RouteErrorBoundary /> })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
