import { useEffect, useState } from 'react';
import { BookingFlow } from './BookingFlow';
import { emmiwoodApi } from './api';
import { FALLBACK_CATALOG } from './content';
import { EmmiwoodMeta } from './meta';
import type { Catalog } from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

export default function EmmiwoodBookingPage() {
  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(window.location.search);

  useEffect(() => {
    let active = true;
    emmiwoodApi.catalog().then((value) => { if (active) setCatalog(value); }).catch(() => { if (active) setNotice('Live shop details could not refresh; availability will verify before reservation.'); });
    return () => { active = false; };
  }, []);

  return <div className="emmiwood ew-app-surface">
    <EmmiwoodMeta title="Book an Appointment | Emmiwood Barbers" description="Choose a service, barber, and live opening at Emmiwood Barbers in Sioux Falls." path="/emmiwood/book" noindex />
    <a className="ew-skip" href="#booking-title">Skip to booking</a>
    <header className="ew-app-header"><a className="ew-brand" href="/emmiwood"><span>E</span><strong>Emmiwood</strong></a><a className="ew-link ew-back-link" href="/emmiwood">Back to the shop</a></header>
    <main className="ew-book-page"><BookingFlow catalog={catalog} initialServiceId={params.get('service')} initialBarberId={params.get('barber')} />{notice && <p className="ew-system-note">{notice}</p>}</main>
    <footer className="ew-app-footer"><span>1118 S Minnesota Ave · Sioux Falls</span><a href="tel:+16059006334">(605) 900-6334</a></footer>
  </div>;
}
