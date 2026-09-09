import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
import { Dashboard } from '@/pages/Dashboard';

// 除首屏 Dashboard 外的页面全部按路由懒加载。此前 11 个页面(Favorites 1216 行、
// Settings 944 行、SharePreview 845 行)都静态打进 main chunk,单块超过 1.1 MB。
// 用 React Router 原生的 route.lazy 而非 React.lazy + Suspense:chunk 从本地
// 磁盘加载几乎无延迟,不需要额外的 loading 态,且加载失败会落到 errorElement。
const pages: RouteObject[] = [
  { index: true, element: <Dashboard /> },
  {
    path: 'library',
    lazy: async () => ({ Component: (await import('@/pages/Library')).Library }),
  },
  {
    path: 'favorites',
    lazy: async () => ({ Component: (await import('@/pages/Favorites')).Favorites }),
  },
  {
    path: 'workflows',
    lazy: async () => ({ Component: (await import('@/pages/Workflows')).Workflows }),
  },
  {
    path: 'my-shares',
    lazy: async () => ({ Component: (await import('@/pages/MyShares')).MyShares }),
  },
  {
    path: 'announcements',
    lazy: async () => ({
      Component: (await import('@/pages/AnnouncementsPage')).AnnouncementsPage,
    }),
  },
  {
    path: 'statistics',
    lazy: async () => ({ Component: (await import('@/pages/Statistics')).Statistics }),
  },
  {
    path: 'uninstall',
    lazy: async () => ({ Component: (await import('@/pages/Uninstall')).Uninstall }),
  },
  {
    path: 'settings',
    lazy: async () => ({ Component: (await import('@/pages/Settings')).Settings }),
  },
  {
    path: 'account',
    lazy: async () => ({ Component: (await import('@/pages/Account')).Account }),
  },
];

export const router = createBrowserRouter([
  // /share/:token 走独立布局(免登录、无侧边栏),深链唤起后落地这里
  {
    path: '/share/:token',
    lazy: async () => ({ Component: (await import('@/pages/SharePreview')).SharePreview }),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: <Layout />,
    // Layout 自身(侧边栏、公告、深链订阅)抛错时兜到这里
    errorElement: <RouteErrorBoundary />,
    children: [
      // 每个子路由都挂 errorElement,而不是只挂在 Layout 上:错误页会渲染在 Outlet
      // 位置,侧边栏和窗口拖拽区得以保留,用户还能切到别的页面。只挂在父级的话整个
      // Layout 会被替换掉,退化成一个走不出去的死页面。
      ...pages.map((route) => ({ ...route, errorElement: <RouteErrorBoundary /> })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
