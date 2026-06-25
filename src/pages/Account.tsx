import { useEffect, useState } from 'react';
import {
  UserRound,
  Mail,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Sparkles,
  Loader2,
  CloudOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

type Mode = 'login' | 'register';

export function Account() {
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const profile = useAuthStore((s) => s.profile);
  const ready = useAuthStore((s) => s.ready);
  const lastEmail = useAuthStore((s) => s.lastEmail);
  const rememberMe = useAuthStore((s) => s.rememberMe);
  const setRememberMe = useAuthStore((s) => s.setRememberMe);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (lastEmail) setEmail(lastEmail);
  }, [lastEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const res =
      mode === 'login'
        ? await login(email, password)
        : await register(email, password, nickname);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? '操作失败');
      return;
    }
    setPassword('');
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-400 dark:text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        正在加载账号状态...
      </div>
    );
  }

  if (loggedIn && profile) {
    const initial = (profile.nickname || profile.email).slice(0, 1).toUpperCase();
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">账号</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">管理你的登录账号与会员状态</p>
        </div>

        <div className="max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0d0d14]/80 p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-violet-500/20">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{profile.nickname}</h2>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[11px] font-medium',
                    profile.plan === 'pro'
                      ? 'bg-amber-100 text-amber-600 border border-amber-300 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30'
                      : 'bg-slate-200 text-slate-600 border border-slate-300 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600/40'
                  )}
                >
                  {profile.plan === 'pro' ? 'Pro 会员' : '免费版'}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{profile.email}</p>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800/30 p-3">
              <div className="text-xs text-slate-400 dark:text-slate-500">邮箱验证</div>
              <div className="mt-1 flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                <ShieldCheck
                  className={cn('w-4 h-4', profile.emailVerified ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500')}
                />
                {profile.emailVerified ? '已验证' : '未验证'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800/30 p-3">
              <div className="text-xs text-slate-400 dark:text-slate-500">上次登录</div>
              <div className="mt-1 text-slate-700 dark:text-slate-200">
                {profile.lastLoginAt
                  ? new Date(profile.lastLoginAt).toLocaleString()
                  : '—'}
              </div>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>

        <div className="max-w-2xl flex items-start gap-2 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5 text-slate-400 dark:text-slate-600" />
          <p>
            登录仅用于账号身份与会员状态。软件清单、使用记录、AI 配置等数据全部保存在本机，
            不会上传云端；登录凭证经系统加密存储于本地。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">账号</h1>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
          {mode === 'login' ? '登录以解锁会员功能' : '注册一个新账号'}
        </p>
      </div>

      <div className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0d0d14]/80 p-6 shadow-sm dark:shadow-none">
        <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/40 mb-6">
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                mode === m ? 'bg-violet-500/20 text-violet-600 dark:text-violet-200' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <Field
              icon={UserRound}
              type="text"
              placeholder="昵称（可选）"
              value={nickname}
              onChange={setNickname}
            />
          )}
          <Field
            icon={Mail}
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={setEmail}
            autoComplete="username"
          />
          <Field
            icon={LockKeyhole}
            type="password"
            placeholder={mode === 'register' ? '密码（至少 6 位）' : '密码'}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

          <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 accent-violet-500"
            />
            记住邮箱
          </label>

          {error && (
            <div className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 transition-all disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>

      <div className="max-w-md flex items-start gap-2 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
        <CloudOff className="w-4 h-4 shrink-0 mt-0.5 text-slate-400 dark:text-slate-600" />
        <p>
          数据完全不同步：登录仅用于账号身份认证，所有软件与使用数据保存在本机，绝不上传云端。
        </p>
      </div>
    </div>
  );
}

interface FieldProps {
  icon: typeof Mail;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}
function Field({ icon: Icon, type, placeholder, value, onChange, autoComplete }: FieldProps) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-slate-300 dark:border-slate-700/60 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
      />
    </div>
  );
}
