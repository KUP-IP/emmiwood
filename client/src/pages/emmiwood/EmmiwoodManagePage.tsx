import { useEffect, useState } from 'react';
import { ManagePanel } from './BookingFlow';
import { emmiwoodApi } from './api';
import { EMMIWOOD_PHONE_LABEL } from './content';
import { EmmiwoodMeta } from './meta';
import type { Appointment } from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

export default function EmmiwoodManagePage() {
  const [appointment, setAppointment] = useState<Appointment>();
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [horizonDays, setHorizonDays] = useState(30);

  useEffect(() => {
    let active = true;
    emmiwoodApi.catalog().then((catalog) => { if (active) setHorizonDays(catalog.shop.horizon_days); }).catch(() => undefined);
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = params.get('token');
    const exchange = token ? emmiwoodApi.exchangeManage(token) : emmiwoodApi.manage();
    exchange.then((value) => {
      if (!active) return;
      setAppointment(value);
      setReady(true);
      if (token) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    }).catch((reason: Error) => {
      if (!active) return;
      setError(reason.message);
      setReady(true);
      if (token) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
    });
    return () => { active = false; };
  }, []);

  return <div className="emmiwood ew-app-surface">
    <EmmiwoodMeta title="Manage Appointment | Emmiwood Barbers" description="Private appointment management for Emmiwood Barbers guests." path="/emmiwood/manage" noindex />
    <header className="ew-app-header"><a className="ew-brand" href="/emmiwood"><span>E</span><strong>Emmiwood</strong></a><a className="ew-link" href="/emmiwood/book">Book another appointment</a></header>
    <main className="ew-manage-page">{!ready ? <div className="ew-loading" role="status"><span className="ew-spinner" />Opening your appointment…</div> : error ? <section className="ew-manage-panel"><span className="ew-eyebrow">Private appointment access</span><h1>We couldn’t find an appointment from this link.</h1><p>{error}</p><p>Open the private link from your confirmation message. If it still does not work, the shop can help by phone.</p><div className="ew-actions"><a className="ew-button" href="/emmiwood/book">Book another appointment</a><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a></div></section> : <ManagePanel initialAppointment={appointment} horizonDays={horizonDays} />}</main>
  </div>;
}
