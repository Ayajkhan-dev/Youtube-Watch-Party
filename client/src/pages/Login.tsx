// Login/Register page: optional Phase 14 account auth. Guest flow remains available elsewhere when REQUIRE_AUTH=false.
// Successful auth stores the account JWT and redirects back to the requested room or home.
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { saveAccountSession } from '../lib/accountSession';
import Footer from '../components/Footer';
import NavBar from '../components/NavBar';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const redirectTo = query.get('redirect') || '/';
  const [mode, setMode] = useState<'login' | 'register'>(query.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await api.register(email.trim(), password, name.trim())
        : await api.login(email.trim(), password);
      saveAccountSession({ userId: result.userId, token: result.token, username: result.username });
      navigate(redirectTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && !!email.trim() && !!password && (mode !== 'register' || !!name.trim());
  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-slate-50 px-4 py-12">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-200/50 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-fuchsia-200/40 blur-3xl" />

        <div className="relative w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="mt-2 text-sm text-slate-600">{mode === 'login' ? 'Log in to continue.' : 'Create an account for a persistent identity across devices.'}</p>
          </div>

          <section className="card p-6 sm:p-8">
            <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  type="button"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {mode === 'register' && (
                <label className="block text-sm font-medium text-slate-700">
                  Name
                  <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="nickname" placeholder="Your display name" className="input mt-1.5" />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" className="input mt-1.5" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && void submit()}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Your password"
                  className="input mt-1.5"
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}

            <button disabled={!canSubmit} onClick={() => void submit()} className="btn btn-primary btn-lg mt-6 w-full">
              {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>

            <p className="mt-5 text-center text-sm text-slate-600">
              {mode === 'login' ? 'New here? ' : 'Already have an account? '}
              <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="font-semibold text-indigo-600 hover:text-indigo-700">
                {mode === 'login' ? 'Create an account' : 'Log in'}
              </button>
            </p>
          </section>

          <div className="mt-6 text-center">
            <Link to={redirectTo} className="text-sm font-medium text-slate-500 hover:text-slate-800">
              ← Back
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
