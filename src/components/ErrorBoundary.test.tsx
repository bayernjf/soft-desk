// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ErrorBoundary, RouteErrorBoundary } from './ErrorBoundary';

function Boom({ thrown }: { thrown: unknown }): null {
  throw thrown;
}

// React 和 logger 都会往 console.error 写,测试里静音以免污染输出
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 把一个抛错的组件挂在带侧边栏的父路由下,复现真实的 Outlet 结构 */
function renderRoute(thrown: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <div>
            <nav>SIDEBAR</nav>
            <Outlet />
          </div>
        ),
        children: [
          { index: true, element: <p>HOME</p> },
          { path: 'boom', element: <Boom thrown={thrown} />, errorElement: <RouteErrorBoundary /> },
        ],
      },
    ],
    { initialEntries: ['/boom'] }
  );
  return render(<RouterProvider router={router} />);
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>healthy</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('healthy')).toBeTruthy();
    expect(screen.queryByText('这个页面出错了')).toBeNull();
  });

  it('shows the fallback with the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('kaboom')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('这个页面出错了')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();
  });

  it('recovers by resetting its own state, not by reloading the window', async () => {
    let shouldThrow = true;
    function Toggle() {
      if (shouldThrow) throw new Error('kaboom');
      return <p>RECOVERED</p>;
    }
    render(
      <ErrorBoundary>
        <Toggle />
      </ErrorBoundary>
    );
    expect(screen.getByText('kaboom')).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('RECOVERED')).toBeTruthy();
  });

  it('exposes the stack behind a details toggle', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('kaboom')} />
      </ErrorBoundary>
    );
    expect(screen.getByText('调用栈')).toBeTruthy();
  });

  it('omits the details toggle when the thrown value carries no stack', () => {
    render(
      <ErrorBoundary>
        <Boom thrown="plain string failure" />
      </ErrorBoundary>
    );
    expect(screen.getByText('plain string failure')).toBeTruthy();
    expect(screen.queryByText('调用栈')).toBeNull();
  });

  it('logs the failure so it survives past the visible fallback', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('kaboom')} />
      </ErrorBoundary>
    );
    const logged = vi
      .mocked(console.error)
      .mock.calls.some((args) => args.some((a) => typeof a === 'string' && a.includes('render failed')));
    expect(logged).toBe(true);
  });
});

describe('RouteErrorBoundary', () => {
  it('keeps the surrounding layout mounted so the user can navigate away', () => {
    renderRoute(new Error('page blew up'));
    // 这是挂在子路由而非父路由上的全部意义:侧边栏必须还在
    expect(screen.getByText('SIDEBAR')).toBeTruthy();
    expect(screen.getByText('这个页面出错了')).toBeTruthy();
    expect(screen.getByText('page blew up')).toBeTruthy();
  });

  it('renders a thrown string', () => {
    renderRoute('string failure');
    expect(screen.getByText('string failure')).toBeTruthy();
  });

  it('renders a thrown Response-like value as status plus text', () => {
    renderRoute({ status: 418, statusText: 'Teapot' });
    expect(screen.getByText('418 Teapot')).toBeTruthy();
  });

  it('falls back to a placeholder when the message is empty', () => {
    renderRoute(new Error(''));
    expect(screen.getByText('未知错误')).toBeTruthy();
  });

  // 生产渲染层走 file://,整页重载会落到 file:///settings 这种不存在的路径上白屏,
  // 所以恢复动作必须是路由跳转
  it('recovers by navigating home rather than reloading', async () => {
    renderRoute(new Error('page blew up'));
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
  });
});
