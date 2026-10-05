// Footer: brand, short description and quick links. Shown on public pages (Home, Login).
import { Link } from 'react-router-dom';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Watch YouTube together in real time. Built with React, Socket.IO, Node.js and the YouTube IFrame API.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium text-slate-600">
          <a href="/#features" className="hover:text-indigo-600">Features</a>
          <a href="/#how-it-works" className="hover:text-indigo-600">How it works</a>
          <Link to="/login" className="hover:text-indigo-600">Log in</Link>
          <Link to="/login?mode=register" className="hover:text-indigo-600">Sign up</Link>
        </nav>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">© {new Date().getFullYear()} Watch Party. All rights reserved.</div>
    </footer>
  );
}
