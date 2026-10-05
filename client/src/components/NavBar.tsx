// NavBar: sticky top navigation used on public pages (Home, Login). Brand on the left, section links in the middle,
// and clearly sized "Log in" / "Sign up" actions on the right (collapses into a menu on mobile).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearAccountSession, loadAccountSession } from '../lib/accountSession';
import Logo from './Logo';

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#start', label: 'Get started' },
];

function logout() {
  clearAccountSession();
  window.location.reload();
}

export default function NavBar() {
  const account = loadAccountSession();
  const [open, setOpen] = useState(false);

  const authActions = account ? (
    <>
      <span className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm font-medium text-slate-700">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold uppercase text-white">
          {account.username.charAt(0)}
        </span>
        <span className="max-w-[10rem] truncate">{account.username}</span>
      </span>
      <button onClick={logout} className="btn btn-secondary">
        Log out
      </button>
    </>
  ) : (
    <>
      <Link to="/login" className="btn btn-ghost">
        Log in
      </Link>
      <Link to="/login?mode=register" className="btn btn-primary">
        Sign up
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <nav aria-label="Main" className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="Watch Party home" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">{authActions}</div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 [&>*]:flex-1">{authActions}</div>
          </div>
        </div>
      )}
    </header>
  );
}
