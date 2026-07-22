import { useEffect, useMemo, useState } from 'react';
import { emmiwoodApi } from './api';
import {
  BARBER_DETAILS,
  EMMIWOOD_ADDRESS,
  EMMIWOOD_MAPS_URL,
  EMMIWOOD_PHONE_LABEL,
  FALLBACK_CATALOG,
  SERVICE_FIT,
  money,
} from './content';
import { EmmiwoodMeta } from './meta';
import type { Catalog, Slot } from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

const chicagoDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};
const openingLabel = (slot: Slot) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(slot.start * 1000);

function shopClock(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = parts.weekday || 'Sunday';
  const minutes = Number(parts.hour || 0) * 60 + Number(parts.minute || 0);
  const openDay = weekday !== 'Sunday';

  let status = 'Closed now';
  let detail = weekday === 'Sunday' ? 'Opens Monday at 9:00 AM' : 'Opens tomorrow at 9:00 AM';
  if (openDay && minutes < 540) {
    status = 'Opens at 9:00 AM';
    detail = 'Appointments begin this morning';
  } else if (openDay && minutes < 720) {
    status = 'Open now';
    detail = 'Appointments until noon';
  } else if (openDay && minutes < 840) {
    status = 'Open now';
    detail = 'Walk-ins until 2:00 PM';
  } else if (openDay && minutes < 1140) {
    status = 'Open now';
    detail = 'Appointments until 7:00 PM';
  } else if (weekday === 'Saturday') {
    detail = 'Opens Monday at 9:00 AM';
  }

  return {
    status,
    detail,
    today: new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric',
    }).format(date),
  };
}

function NextOpening({ catalog }: { catalog: Catalog }) {
  const [opening, setOpening] = useState<Slot>();
  const [checked, setChecked] = useState(false);
  const service = catalog.services[0];

  useEffect(() => {
    let active = true;
    async function find() {
      if (!service) return;
      const start = chicagoDate();
      for (let offset = 0; offset < 8; offset += 1) {
        try {
          const slots = await emmiwoodApi.slots(service.id, addDays(start, offset), 'first');
          if (slots.length) {
            if (active) setOpening(slots[0]);
            break;
          }
        } catch {
          break;
        }
      }
      if (active) setChecked(true);
    }
    void find();
    return () => { active = false; };
  }, [service]);

  return <div className="ew-next-opening" aria-live="polite">
    <span className="ew-eyebrow">Next online opening</span>
    {!checked && <strong>Checking the book…</strong>}
    {checked && opening && <>
      <strong>{openingLabel(opening)}</strong>
      <small>with {opening.barberName} · {service?.name}</small>
      <a href={`/emmiwood/book?service=${service?.id}&barber=${opening.barberId}`}>Take this opening</a>
    </>}
    {checked && !opening && <>
      <strong>Call for today’s options.</strong>
      <small>Walk-ins run noon–2, Monday through Saturday.</small>
      <a href="tel:+16059006334">{EMMIWOOD_PHONE_LABEL}</a>
    </>}
  </div>;
}

function HoursTimeline() {
  return <div className="ew-hours-visual" role="img" aria-label="Daily shop hours: appointments 9–noon and 2–7, walk-ins noon–2">
    <div className="ew-hours-track">
      <div className="appointment morning"><strong>Appointments</strong><span>9:00 AM–noon</span></div>
      <div className="walkin"><strong>Walk-ins</strong><span>Noon–2:00 PM</span></div>
      <div className="appointment afternoon"><strong>Appointments</strong><span>2:00–7:00 PM</span></div>
    </div>
  </div>;
}

function TodayAtEmmiwood({ catalog }: { catalog: Catalog }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = useMemo(() => shopClock(now), [now]);

  return <aside className="ew-today-card" role="region" aria-label="Today at Emmiwood">
    <header>
      <span className="ew-eyebrow">Today at Emmiwood</span>
      <div><strong>{clock.status}</strong><small>{clock.today} · {clock.detail}</small></div>
    </header>
    <HoursTimeline />
    <NextOpening catalog={catalog} />
    <div className="ew-today-actions">
      <a className="ew-link" target="_blank" rel="noreferrer" href={EMMIWOOD_MAPS_URL}>Get directions</a>
    </div>
  </aside>;
}

function MapIllustration() {
  return <div className="ew-map-illustration" aria-hidden="true">
    <span className="road road-one" />
    <span className="road road-two" />
    <span className="road road-three" />
    <span className="map-pin"><i />Emmiwood</span>
    <small>South Minnesota Avenue</small>
  </div>;
}

export default function EmmiwoodPage() {
  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);
  useEffect(() => {
    let active = true;
    emmiwoodApi.catalog().then((value) => { if (active) setCatalog(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const eligibility = useMemo(() => new Map(catalog.services.map((service) => [
    service.id,
    catalog.eligibility.filter((item) => item.service_id === service.id).map((item) => catalog.barbers.find((barber) => barber.id === item.barber_id)?.name).filter(Boolean).join(' & '),
  ])), [catalog]);

  return <div className="emmiwood ew-public">
    <EmmiwoodMeta
      title="Emmiwood Barbers | Haircuts & Beard Work in Sioux Falls"
      description="Tailored haircuts, beard work, transparent pricing, online booking, and noon–2 walk-ins at Emmiwood Barbers in Sioux Falls."
      path="/emmiwood"
      structured
    />
    <a className="ew-skip" href="#main">Skip to content</a>
    <header className="ew-site-header">
      <a className="ew-brand" href="#top" aria-label="Emmiwood home"><span>E</span><strong>Emmiwood</strong></a>
      <nav aria-label="Primary navigation"><a href="#services">Services</a><a href="#barbers">Barbers</a><a href="#visit">Visit</a></nav>
      <a className="ew-button small ew-header-book" href="/emmiwood/book">Book an appointment</a>
    </header>
    <nav className="ew-mobile-jump" aria-label="Page sections">
      <a href="#services">Services</a>
      <a href="#barbers">Barbers</a>
      <a href="#visit">Visit</a>
    </nav>

    <main id="main">
      <section className="ew-public-hero" id="top">
        <div className="ew-hero-atmosphere" aria-hidden="true" />
        <div className="ew-hero-main">
          <span className="ew-eyebrow">Emmiwood · Sioux Falls</span>
          <h1>Look Sharp. <em>Stay Classy.</em></h1>
          <p>Haircuts, fades, and beard work shaped around how you wear your hair—clear prices, an unrushed consult, a finish that grows out clean.</p>
          <div className="ew-actions"><a className="ew-button" href="/emmiwood/book">Book an appointment</a><a className="ew-link" href="#services">Choose a service</a></div>
        </div>
        <div className="ew-hero-booking"><TodayAtEmmiwood catalog={catalog} /></div>
      </section>


      <section className="ew-public-section" id="services">
        <header className="ew-section-intro"><span className="ew-eyebrow">Services</span><h2>Choose the work you need.</h2><p className="ew-section-lead">Price and chair time stay clear before you book.</p></header>
        <div className="ew-service-grid">
          {catalog.services.map((service, index) => <article key={service.id} className="ew-service-card" data-reveal>
            <header>
              <div className="ew-service-title"><span className="ew-card-index">0{index + 1}</span><h3>{service.name}</h3></div>
              <strong className="ew-service-price">{money(service.price_cents)}</strong>
            </header>
            <p className="ew-service-desc">{service.description}</p>
            <p className="ew-fit">{SERVICE_FIT[service.id]}</p>
            <p className="ew-service-meta"><span>{service.duration_minutes} min</span><span>{eligibility.get(service.id)}</span></p>
            <a className="ew-service-link" href={`/emmiwood/book?service=${service.id}`}>Book <span aria-hidden="true">→</span></a>
          </article>)}
        </div>
      </section>

      <section className="ew-public-section ew-barber-section" id="barbers">
        <header className="ew-section-intro light"><span className="ew-eyebrow">The barbers</span><h2>Meet the barbers.</h2><p className="ew-section-lead">Different chairs, same finish standard.</p></header>
        <div className="ew-barber-grid">
          {catalog.barbers.map((barber, index) => {
            const detail = BARBER_DETAILS[barber.id];
            return <article key={barber.id} className={`ew-barber-card barber-${barber.id}`} data-reveal>
              <div className="ew-barber-portrait" aria-hidden={barber.id === 'barro' ? undefined : true}>
                {barber.id === 'barro'
                  ? <img className="ew-barber-photo" src="/emmiwood/barro-profile.webp" width="320" height="320" loading="lazy" decoding="async" alt="Barro working at the chair inside Emmiwood Barbers." />
                  : <span>{barber.name.slice(0, 1)}</span>}
                <small aria-hidden="true">0{index + 1}</small>
              </div>
              <div className="ew-barber-copy"><span className="ew-eyebrow">At the chair</span><h3>{barber.name}</h3><p className="ew-barber-bio">{barber.bio}</p><dl><div><dt>Known for</dt><dd>{detail?.specialty}</dd></div><div><dt>In the shop</dt><dd>{detail?.schedule}</dd></div></dl><p className="ew-fit">{detail?.fit}</p><a className="ew-barber-book" href={`/emmiwood/book?barber=${barber.id}`}>Book with {barber.name} <span aria-hidden="true">→</span></a></div>
            </article>;
          })}
        </div>
        <a className="ew-first-available" href="/emmiwood/book"><span>Not particular about the barber?</span><strong>Find the first available chair →</strong></a>
      </section>

      <section className="ew-shop-section" id="story">
        <div className="ew-shop-statement">
          <span className="ew-eyebrow">The shop</span>
          <h2>Good barbering starts with paying attention.</h2>
          <p>We talk through what you want before the clippers start—then keep the day moving so the finish stays sharp.</p>
        </div>
        <div className="ew-weekly-card">
          <span className="ew-eyebrow">Weekly hours</span>
          <h3>Open six days a week.</h3>
          <ul className="ew-hours-compact">
            <li><strong>Mon–Sat</strong><span>9:00 AM–7:00 PM<small>Walk-ins noon–2</small></span></li>
            <li className="closed"><strong>Sunday</strong><span>Closed</span></li>
          </ul>
        </div>
      </section>

      <section className="ew-visit-section" id="visit">
        <header><span className="ew-eyebrow">Visit Emmiwood</span><h2>Easy to find.</h2></header>
        <div className="ew-visit-feature">
          <MapIllustration />
          <div className="ew-visit-copy">
            <h3>Emmiwood Barbers</h3>
            <address>{EMMIWOOD_ADDRESS}</address>
            <div className="ew-visit-actions"><a className="ew-button" target="_blank" rel="noreferrer" href={EMMIWOOD_MAPS_URL}>Get directions</a><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a></div>
          </div>
        </div>
      </section>

      <section className="ew-final-cta"><span className="ew-eyebrow">Emmiwood · Book</span><h2>Find a chair time that works.</h2><a className="ew-button inverse" href="/emmiwood/book">Book an appointment</a></section>
    </main>

    <footer className="ew-site-footer">
      <a className="ew-brand" href="#top"><span>E</span><strong>Emmiwood</strong></a>
      <div><a href="/emmiwood/privacy">Privacy</a><a href="/emmiwood/sms-terms">SMS terms</a><a href="/emmiwood/chair-rental">Chair rental</a><a href="/emmiwood/admin">Staff sign in</a></div>
      <p>© {new Date().getFullYear()} Emmiwood Barbers · Sioux Falls, South Dakota</p>
    </footer>
    <nav className="ew-mobile-book" aria-label="Mobile booking"><a href="/emmiwood/book"><span>Appointments</span><strong>Book now →</strong></a></nav>
  </div>;
}
