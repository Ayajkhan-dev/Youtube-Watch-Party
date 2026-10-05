// App: routes. / = Home, /room/:roomId = RoomPage (shareable link), /login = account login/sign up, /debug = Phase 1-2 ping demo.
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Footer from './components/Footer';
import NavBar from './components/NavBar';
import Debug from './pages/Debug';
import Home from './pages/Home';
import RoomPage from './pages/RoomPage';
import Login from './pages/Login';

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <p className="gradient-text text-6xl font-extrabold">404</p>
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="max-w-sm text-slate-600">The page you are looking for does not exist or has been moved.</p>
        <Link to="/" className="btn btn-primary btn-lg mt-2">
          Go home
        </Link>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/debug" element={<Debug />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
