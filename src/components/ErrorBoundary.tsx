import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('error-boundary');

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  // React Router 会把 loader 抛出的 Response 交给 errorElement
  if (error && typeof error === 'object' && 'status' in error) {
    const res = error as { status?: unknown; statusText?: unknown };
    return { message: `${res.status} ${res.statusText ?? ''}`.trim() };
  }
  return { message: String(error) };
}

function ErrorFallback({
  error,
  onRetry,
  retryLabel,
}: {
  error: unknown;
  onRetry: () => void;
  retryLabel: string;
}) {
  const { message, stack } = describe(error);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-6">
        <div className="flex items-center gap-2.5 text-rose-300">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h2 className="text-sm font-semibold">这个页面出错了</h2>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          错误已记录到日志。你可以重试，如果反复失败请在「设置 → 反馈」里带上下面这段信息。
        </p>

        <p className="mt-4 rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-rose-200 break-words">
          {message || '未知错误'}
        </p>

        {stack && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-400">
              调用栈
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap">
              {stack}
            </pre>
          </details>
        )}

        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-400"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {retryLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * 路由级兜底。挂在每个子路由的 errorElement 上,渲染在 Layout 的 Outlet 位置,
 * 因此侧边栏与窗口拖拽区依然可用——只有内容区被错误页替换。
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    logger.error('route render failed', error);
  }, [error]);

  // 不能用 location.reload():生产环境渲染层走 file://,而 createBrowserRouter
  // 已把 location 改写成 file:///settings 这类不存在的路径,整页重载会直接白屏。
  // 路由跳转会清掉 React Router 的错误态,是这里唯一安全的恢复方式。
  return (
    <ErrorFallback
      error={error}
      onRetry={() => navigate('/', { replace: true })}
      retryLabel="返回首页"
    />
  );
}

/**
 * 应用外壳兜底。React Router 只接管路由内部的错误,RouterProvider 之外
 * (以及 router 构造本身)抛出的异常仍会白屏,所以最外层再包一层。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logger.error('render failed', error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error != null) {
      return (
        <div className="h-screen bg-[#161618] text-slate-100 font-sans antialiased">
          <ErrorFallback
            error={this.state.error}
            onRetry={() => this.setState({ error: null })}
            retryLabel="重试"
          />
        </div>
      );
    }
    return this.props.children;
  }
}
