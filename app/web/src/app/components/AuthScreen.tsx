import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Database,
  Eye,
  EyeOff,
  FileChartColumn,
  Sparkles,
} from 'lucide-react';
import type { AuthUser } from '../types';

type AuthMode = 'login' | 'register';

type AuthScreenProps = {
  onAuthenticated: (user: AuthUser) => void;
};

type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'confirmPassword', string>>;

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  const validate = () => {
    const nextErrors: FieldErrors = {};

    if (mode === 'register' && !name.trim()) {
      nextErrors.name = '請輸入顯示名稱';
    }

    if (!email.trim()) {
      nextErrors.email = '請輸入電子郵件';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = '電子郵件格式不正確';
    }

    if (!password) {
      nextErrors.password = '請輸入密碼';
    } else if (password.length < 8) {
      nextErrors.password = '密碼至少需要 8 個字元';
    }

    if (mode === 'register' && password !== confirmPassword) {
      nextErrors.confirmPassword = '兩次輸入的密碼不一致';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    window.setTimeout(() => {
      const fallbackName = email.split('@')[0] || '使用者';
      onAuthenticated({
        displayName: mode === 'register' ? name.trim() : fallbackName,
        email: email.trim(),
      });
      setIsSubmitting(false);
    }, 500);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 lg:grid lg:grid-cols-[minmax(380px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(59,130,246,.55), transparent 35%), radial-gradient(circle at 80% 75%, rgba(16,185,129,.35), transparent 32%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-950">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">YouthLM</p>
            <p className="text-xs text-slate-400">青年政策證據工作台</p>
          </div>
        </div>

        <div className="relative max-w-lg py-12">
          <p className="mb-4 text-sm font-medium text-blue-300">從資料到政策成果</p>
          <h1 className="text-4xl font-medium leading-tight tracking-tight">
            把分散的青年資料，整理成會議中能直接使用的證據。
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
            在同一個筆記本裡整理資料、建立分析流程，並保存每一項成果的來源。
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Database, text: '整理公開資料與自訂資料集' },
              { icon: BookOpen, text: '用筆記本分開管理不同政策議題' },
              { icon: FileChartColumn, text: '把分析結果整理成圖表與簡報' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4" />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">新北市青年政策 AI 黑客松前端原型</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="font-semibold">YouthLM</p>
              <p className="text-xs text-slate-500">青年政策證據工作台</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-tight">
              {mode === 'login' ? '歡迎回來' : '建立帳號'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {mode === 'login' ? '登入後繼續整理你的政策筆記本。' : '完成註冊後即可建立第一本政策筆記本。'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1" aria-label="登入或註冊">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-pressed={mode === 'login'}
            >
              登入
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-pressed={mode === 'register'}
            >
              註冊
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">顯示名稱</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：政策分析小組"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name && <span className="mt-1 block text-xs text-red-600" role="alert">{errors.name}</span>}
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">電子郵件</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="name@example.gov.tw"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <span className="mt-1 block text-xs text-red-600" role="alert">{errors.email}</span>}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">密碼</span>
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-11 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="至少 8 個字元"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  aria-invalid={Boolean(errors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(current => !current)}
                  className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
              {errors.password && <span className="mt-1 block text-xs text-red-600" role="alert">{errors.password}</span>}
            </label>

            {mode === 'register' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">確認密碼</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  placeholder="再輸入一次密碼"
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                {errors.confirmPassword && (
                  <span className="mt-1 block text-xs text-red-600" role="alert">{errors.confirmPassword}</span>
                )}
              </label>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? '處理中…' : mode === 'login' ? '登入' : '建立帳號'}
              {!isSubmitting && <ArrowRight className="size-4" />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-slate-400">
            此版本僅展示前端流程，帳號資料不會傳送或儲存。
          </p>
        </div>
      </section>
    </main>
  );
}
