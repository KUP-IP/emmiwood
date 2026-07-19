import { lazy, Suspense } from 'react';

const EmmiwoodPage = lazy(() => import('./pages/emmiwood/EmmiwoodPage'));
const EmmiwoodAdminPage = lazy(() => import('./pages/emmiwood/EmmiwoodAdminPage'));
const EmmiwoodBookingPage = lazy(() => import('./pages/emmiwood/EmmiwoodBookingPage'));
const EmmiwoodManagePage = lazy(() => import('./pages/emmiwood/EmmiwoodManagePage'));
const EmmiwoodInfoPage = lazy(() => import('./pages/emmiwood/EmmiwoodInfoPage'));

function currentPath(): string {
  const path = window.location.pathname.replace(/\/$/, '');
  return path || '/';
}

export default function App() {
  const path = currentPath();
  let surface = <EmmiwoodPage />;

  if (path === '/book' || path === '/emmiwood/book') surface = <EmmiwoodBookingPage />;
  else if (path === '/manage' || path === '/emmiwood/manage') surface = <EmmiwoodManagePage />;
  else if (path === '/admin' || path === '/emmiwood/admin') surface = <EmmiwoodAdminPage />;
  else if (path === '/privacy' || path === '/emmiwood/privacy') surface = <EmmiwoodInfoPage kind="privacy" />;
  else if (path === '/sms-terms' || path === '/emmiwood/sms-terms') surface = <EmmiwoodInfoPage kind="sms-terms" />;
  else if (path === '/chair-rental' || path === '/emmiwood/chair-rental') surface = <EmmiwoodInfoPage kind="chair-rental" />;

  return <Suspense fallback={<div className="emmiwood-loading">Loading…</div>}>{surface}</Suspense>;
}
