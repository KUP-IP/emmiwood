import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AvailabilityBrowser } from './AvailabilityBrowser';
import { emmiwoodApi } from './api';
import { formatUsPhone, normalizeUsPhone, slotDate } from './availability';
import { EmmiwoodMeta } from './meta';
import type { AdminResource, AdminRow, Appointment, CustomerSummary, Dashboard } from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

type AdminTab = 'today' | 'appointments' | 'customers' | 'team' | 'services' | 'hours' | 'closures' | 'messages';

const NAV: Array<{ id: AdminTab; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'customers', label: 'Customers' },
  { id: 'team', label: 'Team' },
  { id: 'services', label: 'Services' },
  { id: 'hours', label: 'Working hours' },
  { id: 'closures', label: 'Closures & time off' },
  { id: 'messages', label: 'Messages & activity' },
];

const FIELDS: Record<Exclude<AdminResource, 'eligibility'>, string[]> = {
  services: ['name', 'description', 'price_cents', 'duration_minutes', 'buffer_minutes', 'active'],
  barbers: ['name', 'bio', 'active'],
  availability: ['barber_id', 'weekday', 'start_minute', 'end_minute', 'active'],
  blocks: ['barber_id', 'date', 'start_minute', 'end_minute', 'kind', 'note'],
};

const LABELS: Record<string, string> = {
  name: 'Name', description: 'What is included', price_cents: 'Price', duration_minutes: 'Chair time',
  buffer_minutes: 'Reset time after service', active: 'Status', bio: 'Approach and specialty', barber_id: 'Barber',
  weekday: 'Day', start_minute: 'Starts', end_minute: 'Ends', date: 'Date', kind: 'Type', note: 'Note',
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dayKey = (epoch: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(epoch * 1000);
const timeOnly = (epoch: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(epoch * 1000);
const when = (epoch: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(epoch * 1000);
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
const minuteToInput = (value: unknown) => {
  const minute = Number(value);
  if (!Number.isFinite(minute)) return '';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
};
const minuteLabel = (value: unknown) => {
  const input = minuteToInput(value);
  if (!input) return '—';
  const [hour, minute] = input.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
};
const timeToMinute = (value: FormDataEntryValue) => {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
};

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('isaiah@kup.solutions');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) {
      const trimmed = email.trim();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setMessage('Enter a valid shop email address.');
        return;
      }
    } else if (!/^\d{6}$/.test(code.trim())) {
      setMessage('Enter the six-digit code from your inbox.');
      return;
    }
    setMessage('Working…');
    try {
      if (!sent) {
        const result = await emmiwoodApi.requestCode(email.trim());
        setPreview(result.previewCode || '');
        setSent(true);
        setMessage('If that address is authorized, a short-lived code is on the way.');
      } else {
        await emmiwoodApi.verifyCode(email.trim(), code.trim());
        onLogin();
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return <div className="emmiwood ew-app-surface ewa ewa-auth">
    <EmmiwoodMeta title="Staff Sign In | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex />
    <main className="ewa-login"><div className="ewa-login-card">
      <a className="ew-brand" href="/emmiwood"><span>E</span><strong>Emmiwood</strong></a>
      <span className="ew-eyebrow">Private shop workspace</span>
      <h1>{sent ? 'Enter your code.' : 'Open the shop.'}</h1>
      <p className="ewa-login-lead">{sent ? 'Check the authorized inbox for a six-digit code.' : 'Sign in with an approved shop email—no password to remember.'}</p>
      <form className={message && message !== 'Working…' && !message.startsWith('If that address') ? 'has-error' : undefined} onSubmit={submit} noValidate>
        {!sent ? <label>Email address<input autoFocus type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (message) setMessage(''); }} autoComplete="email" aria-invalid={Boolean(message && message !== 'Working…' && !message.startsWith('If that address')) || undefined} required /></label> : <label>Six-digit code<input autoFocus inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => { setCode(event.target.value); if (message) setMessage(''); }} autoComplete="one-time-code" aria-invalid={Boolean(message && message !== 'Working…' && !message.startsWith('If that address')) || undefined} required /></label>}
        {preview && <p className="ewa-preview" role="status">Preview code <strong>{preview}</strong></p>}
        <button className="ew-button" type="submit">{sent ? 'Verify and enter' : 'Send code'}</button>
        {sent && <button className="ew-link-button" type="button" onClick={() => { setSent(false); setCode(''); setPreview(''); setMessage(''); }}>Use another email</button>}
        <p className={`ew-form-message${message ? (message === 'Working…' || message.startsWith('If that address') ? ' is-info' : ' is-error') : ' is-empty'}`} role={message && message !== 'Working…' && !message.startsWith('If that address') ? 'alert' : undefined} aria-live="polite">{message}</p>
      </form>
    </div></main>
  </div>;
}

function ResourceField({ resource, field, value, data }: { resource: AdminResource; field: string; value: unknown; data: Dashboard }) {
  if (field === 'barber_id') return <select name={field} defaultValue={String(value ?? '')}><option value="">Entire shop</option>{data.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select>;
  if (field === 'weekday') return <select name={field} defaultValue={String(value ?? 1)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>;
  if (field === 'kind') return <select name={field} defaultValue={String(value ?? 'blocked')}><option value="blocked">Barber time off</option><option value="closed">Shop closed</option><option value="available">Extra availability</option></select>;
  if (field === 'active') return <select name={field} defaultValue={String(value ?? 1)}><option value="1">Active</option><option value="0">Inactive</option></select>;
  if (field === 'price_cents') return <div className="ewa-money-input"><span>$</span><input name="price_dollars" type="number" min="0" step="1" defaultValue={Number(value || 0) / 100} required /></div>;
  if (field === 'start_minute' || field === 'end_minute') return <input name={field} type="time" step="300" defaultValue={minuteToInput(value)} required={resource === 'availability'} />;
  if (field === 'duration_minutes' || field === 'buffer_minutes') return <div className="ewa-unit-input"><input name={field} type="number" min="0" step="5" defaultValue={String(value ?? 0)} required={field === 'duration_minutes'} /><span>min</span></div>;
  if (field === 'description' || field === 'bio' || field === 'note') return <textarea name={field} rows={3} defaultValue={String(value ?? '')} />;
  return <input name={field} type={field === 'date' ? 'date' : 'text'} defaultValue={String(value ?? '')} required={field === 'name' || field === 'date'} />;
}

function normalizeResourceForm(form: HTMLFormElement) {
  const raw = Object.fromEntries(new FormData(form));
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'price_dollars') normalized.price_cents = Math.round(Number(value) * 100);
    else if (key === 'start_minute' || key === 'end_minute') normalized[key] = value ? timeToMinute(value) : 0;
    else if (['duration_minutes', 'buffer_minutes', 'weekday', 'active'].includes(key)) normalized[key] = Number(value);
    else normalized[key] = String(value);
  }
  return normalized as AdminRow;
}

function resourceSummary(resource: Exclude<AdminResource, 'eligibility'>, row: AdminRow, data: Dashboard) {
  if (resource === 'services') return `${money(Number(row.price_cents || 0))} · ${row.duration_minutes} min · ${Number(row.active) ? 'Active' : 'Inactive'}`;
  if (resource === 'barbers') return `${Number(row.active) ? 'Active' : 'Inactive'} · ${String(row.bio || 'No profile note')}`;
  if (resource === 'availability') return `${WEEKDAYS[Number(row.weekday)]} · ${minuteLabel(row.start_minute)}–${minuteLabel(row.end_minute)}`;
  const barber = data.barbers.find((item) => item.id === row.barber_id)?.name || 'Entire shop';
  return `${row.date} · ${barber} · ${row.start_minute != null ? `${minuteLabel(row.start_minute)}–${minuteLabel(row.end_minute)}` : 'All day'}`;
}

function ResourceEditor({ resource, title, eyebrow, rows, data, refresh }: { resource: Exclude<AdminResource, 'eligibility'>; title: string; eyebrow: string; rows: AdminRow[]; data: Dashboard; refresh: () => void }) {
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const input = normalizeResourceForm(event.currentTarget);
      if (editing?.id) await emmiwoodApi.updateResource(resource, editing.id, input);
      else await emmiwoodApi.createResource(resource, input);
      setEditing(null);
      setMessage('Saved.');
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function remove(row: AdminRow) {
    const deactivate = resource === 'services' || resource === 'barbers';
    if (!confirm(deactivate ? 'Make this inactive?' : 'Delete this schedule item?')) return;
    try {
      if (deactivate) await emmiwoodApi.updateResource(resource, row.id, { id: row.id, active: 0 } as AdminRow);
      else await emmiwoodApi.deleteResource(resource, row.id);
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  }

  return <section className="ewa-panel">
    <div className="ewa-panel-head"><div><span className="ew-eyebrow">{eyebrow}</span><h1>{title}</h1></div><button className="ew-button small" onClick={() => setEditing({ id: '' })}>Add new</button></div>
    {editing && <form className="ewa-edit" onSubmit={save}>{FIELDS[resource].map((field) => <label key={field}>{LABELS[field]}<ResourceField resource={resource} field={field} value={editing[field]} data={data} /></label>)}<div className="ewa-form-actions"><button className="ew-button small">Save</button><button className="ew-link-button" type="button" onClick={() => setEditing(null)}>Close</button></div></form>}
    <div className="ewa-resource-list">{rows.map((row) => <article key={row.id}><div><strong>{String(row.name || row.date || WEEKDAYS[Number(row.weekday)] || 'Schedule item')}</strong><span>{resourceSummary(resource, row, data)}</span></div><div><button onClick={() => setEditing(row)}>Edit</button><button className="danger" onClick={() => void remove(row)}>{resource === 'services' || resource === 'barbers' ? 'Make inactive' : 'Delete'}</button></div></article>)}</div>
    <p className="ew-form-message" aria-live="polite">{message}</p>
  </section>;
}

function EligibilityPanel({ data, refresh }: { data: Dashboard; refresh: () => void }) {
  const [message, setMessage] = useState('');
  const eligible = useMemo(() => new Set(data.eligibility.map((item) => item.id)), [data.eligibility]);

  async function toggle(barberId: string, serviceId: string, enabled: boolean) {
    const id = `${barberId}--${serviceId}`;
    try {
      if (enabled) await emmiwoodApi.createResource('eligibility', { id, barber_id: barberId, service_id: serviceId } as AdminRow);
      else await emmiwoodApi.deleteResource('eligibility', id);
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  }

  return <section className="ewa-panel ewa-eligibility"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Service fit</span><h2>Who can perform each service?</h2></div></div><div className="ewa-eligibility-grid">{data.barbers.map((barber) => <article key={barber.id}><h3>{barber.name}</h3>{data.services.map((service) => { const id = `${barber.id}--${service.id}`; return <label key={service.id}><input type="checkbox" checked={eligible.has(id)} onChange={(event) => void toggle(barber.id, service.id, event.target.checked)} /><span>{service.name}</span></label>; })}</article>)}</div><p className="ew-form-message" aria-live="polite">{message}</p></section>;
}

function AppointmentEditor({ data, appointment, close, refresh }: { data: Dashboard; appointment?: Appointment; close: () => void; refresh: () => void }) {
  const [message, setMessage] = useState('');
  const [serviceId, setServiceId] = useState(appointment?.service_id || data.services.find((item) => item.active)?.id || '');
  const [barberId, setBarberId] = useState(appointment?.barber_id || 'first');
  const [slot, setSlot] = useState<{ start: number; barberId: string; barberName: string }>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) { setMessage('Choose an opening before saving.'); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!appointment) {
      const normalizedPhone = normalizeUsPhone(String(values.phone || ''));
      if (!normalizedPhone) { setMessage('Enter a valid 10-digit mobile number.'); return; }
      values.phone = normalizedPhone;
    }
    try {
      const input = { ...values, serviceId, barberId, date: slotDate(slot.start), start: slot.start };
      if (appointment) await emmiwoodApi.updateAppointment(appointment.id, input);
      else await emmiwoodApi.createAppointment(input);
      refresh(); close();
    } catch (error) { setMessage((error as Error).message); }
  }

  return <form className="ewa-edit ewa-appointment-edit" onSubmit={save}>
    <label>Service<select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setSlot(undefined); }}>{data.services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
    <label>Barber<select value={barberId} onChange={(event) => { setBarberId(event.target.value); setSlot(undefined); }}><option value="first">First available</option>{data.barbers.filter((barber) => barber.active).map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select></label>
    {!appointment && <><label>Customer name<input name="name" autoComplete="name" required /></label><label>Mobile<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(605) 555-0123" onBlur={(event) => { event.currentTarget.value = formatUsPhone(event.currentTarget.value); }} required /></label><label className="wide">Notes<textarea name="notes" rows={2} /></label></>}
    <AvailabilityBrowser serviceId={serviceId} barberId={barberId} horizonDays={data.shop.horizon_days} selectedSlot={slot} onSelect={(nextSlot) => setSlot(nextSlot)} />
    <div className="ewa-form-actions"><button className="ew-button small" disabled={!slot}>{appointment ? 'Reschedule' : 'Create appointment'}</button><button className="ew-link-button" type="button" onClick={close}>Close</button></div>
    <p className="ew-form-message" aria-live="polite">{message}</p>
  </form>;
}

function AppointmentCards({ rows, onEdit, onCancel }: { rows: Appointment[]; onEdit: (appointment: Appointment) => void; onCancel: (id: string) => void }) {
  return <div className="ewa-appointment-list">{rows.map((appointment) => <article key={appointment.id}><time>{when(appointment.start_at)}</time><div><strong>{appointment.customer_name}</strong><span>{appointment.service_name} · {appointment.barber_name}</span><small>{appointment.phone}</small></div><span className={`ewa-state ${appointment.status}`}>{appointment.status}</span><div className="ewa-card-actions"><button onClick={() => onEdit(appointment)}>Reschedule</button>{appointment.status === 'booked' && <button className="danger" onClick={() => onCancel(appointment.id)}>Cancel</button>}</div></article>)}</div>;
}

function TodayView({ data, create, edit }: { data: Dashboard; create: () => void; edit: (appointment: Appointment) => void }) {
  const todays = data.appointments.filter((appointment) => appointment.status === 'booked' && dayKey(appointment.start_at) === today);
  const failed = data.outbox.filter((row) => row.status === 'failed').length;
  const next = todays.find((appointment) => appointment.start_at * 1000 >= Date.now());
  return <>
    <div className="ewa-heading"><div><span className="ew-eyebrow">Today · {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span><h1>Run the shop.</h1></div><button className="ew-button small" onClick={create}>New appointment</button></div>
    <div className="ewa-attention-grid"><article><span>Next chair</span><strong>{next ? timeOnly(next.start_at) : 'Clear'}</strong><p>{next ? `${next.customer_name} · ${next.service_name}` : 'No upcoming appointment today.'}</p></article><article><span>Today</span><strong>{todays.length}</strong><p>{todays.length === 1 ? 'booked appointment' : 'booked appointments'}</p></article><article className={failed ? 'warning' : ''}><span>Needs attention</span><strong>{failed}</strong><p>{failed ? 'failed customer messages' : 'No failed messages.'}</p></article></div>
    <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Today’s agenda</span><h2>{todays.length ? 'Chair by chair.' : 'The schedule is open.'}</h2></div></div>{todays.length ? <div className="ewa-agenda">{todays.map((appointment) => <button key={appointment.id} onClick={() => edit(appointment)}><time>{timeOnly(appointment.start_at)}</time><span><strong>{appointment.customer_name}</strong><small>{appointment.service_name} · {appointment.barber_name}</small></span><em>Open →</em></button>)}</div> : <div className="ewa-empty-state"><p>No booked appointments today.</p><button className="ew-link-button" onClick={create}>Create an appointment</button></div>}</section>
  </>;
}

function CustomersView({ customers }: { customers: CustomerSummary[] }) {
  return <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Customer history</span><h1>Customers</h1></div><span className="ewa-count">{customers.length} records</span></div><div className="ewa-customer-list">{customers.map((customer) => <article key={customer.id}><div><strong>{customer.name}</strong><span>{customer.phone}</span></div><dl><div><dt>Appointments</dt><dd>{customer.appointment_count}</dd></div><div><dt>Last visit</dt><dd>{customer.last_appointment_at ? when(customer.last_appointment_at) : 'Not completed'}</dd></div><div><dt>Texts</dt><dd>{customer.sms_consent ? 'Opted in' : 'Not opted in'}</dd></div></dl></article>)}</div></section>;
}

function parseJson(value: unknown) {
  try { return JSON.parse(String(value || '{}')) as Record<string, unknown>; } catch { return {}; }
}
function eventNarrative(row: AdminRow) {
  const detail = parseJson(row.detail_json);
  const event = String(row.event_type || 'activity');
  const labels: Record<string, string> = {
    booked: 'Appointment booked', cancelled: 'Appointment cancelled', rescheduled: 'Appointment rescheduled',
    admin_signed_in: 'Staff signed in', admin_signed_out: 'Staff signed out', admin_code_requested: 'Sign-in code requested',
    admin_code_delivered: 'Sign-in code delivered', admin_code_delivery_failed: 'Sign-in code delivery failed',
    services_updated: 'Service updated', barbers_updated: 'Barber updated', availability_created: 'Working hours added',
  };
  const detailText = detail.to ? `Moved to ${when(Number(detail.to))}` : detail.start ? when(Number(detail.start)) : '';
  return { title: labels[event] || event.replace(/_/g, ' '), detail: detailText };
}

function MessagesView({ outbox, events }: { outbox: AdminRow[]; events: AdminRow[] }) {
  return <div className="ewa-message-columns"><section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Delivery</span><h1>Customer messages</h1></div></div><div className="ewa-message-list">{outbox.map((row) => <article key={row.id} className={String(row.status)}><div><strong>{String(row.template || 'Appointment message').replace(/_/g, ' ')}</strong><span>{String(row.channel || '').toUpperCase()} · {String(row.recipient || '')}</span></div><dl><div><dt>Status</dt><dd>{String(row.status)}</dd></div><div><dt>Provider</dt><dd>{String(row.provider || '—')}</dd></div><div><dt>Attempts</dt><dd>{String(row.attempt_count || 0)}</dd></div><div><dt>Provider ID</dt><dd>{String(row.provider_message_id || '—')}</dd></div></dl>{row.error && <p>{String(row.error)}</p>}</article>)}</div></section><section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Audit trail</span><h2>Recent activity</h2></div></div><div className="ewa-activity-list">{events.map((row) => { const item = eventNarrative(row); return <article key={row.id}><strong>{item.title}</strong><span>{item.detail || String(row.created_at || '')}</span></article>; })}</div></section></div>;
}

export default function EmmiwoodAdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(undefined);
  const [data, setData] = useState<Dashboard>();
  const [tab, setTab] = useState<AdminTab>('today');
  const [message, setMessage] = useState('');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null | undefined>();

  function refresh() {
    emmiwoodApi.dashboard().then((next) => { setData(next); setAuthenticated(true); setMessage(''); }).catch((error: Error) => {
      setMessage(error.message);
      if (/sign in|unauthorized/i.test(error.message)) { setData(undefined); setAuthenticated(false); }
    });
  }
  useEffect(refresh, []);
  async function logout() { await emmiwoodApi.logout().catch(() => undefined); setData(undefined); setAuthenticated(false); }
  async function cancelAppointment(id: string) {
    if (!confirm('Cancel this appointment?')) return;
    try { await emmiwoodApi.cancelAppointment(id); refresh(); }
    catch (error) { setMessage((error as Error).message); }
  }
  function openAppointment(appointment: Appointment | null) { setTab('appointments'); setEditingAppointment(appointment); }

  if (authenticated === false) return <Login onLogin={refresh} />;
  if (!data) return <div className="emmiwood ew-app-surface ewa"><EmmiwoodMeta title="Shop Workspace | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex /><p className="ewa-loading" role="status">{message || 'Opening the shop workspace…'}</p></div>;

  return <div className="emmiwood ew-app-surface ewa ewa-workspace">
    <EmmiwoodMeta title="Shop Workspace | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex />
    <header className="ewa-top"><a className="ew-brand" href="/emmiwood"><span>E</span><strong>Shop workspace</strong></a><div><span>{data.admin.email} · {data.admin.role}</span><button onClick={() => void logout()}>Sign out</button></div></header>
    <div className="ewa-shell"><nav className="ewa-nav" aria-label="Shop workspace">{NAV.map((item) => <button className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} key={item.id}>{item.label}</button>)}</nav>
      <main className="ewa-main">
        {tab === 'today' && <TodayView data={data} create={() => openAppointment(null)} edit={(appointment) => openAppointment(appointment)} />}
        {tab === 'appointments' && <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Calendar</span><h1>Appointments</h1></div><button className="ew-button small" onClick={() => setEditingAppointment(null)}>New appointment</button></div>{editingAppointment !== undefined && <AppointmentEditor data={data} appointment={editingAppointment || undefined} close={() => setEditingAppointment(undefined)} refresh={refresh} />}<AppointmentCards rows={data.appointments} onEdit={setEditingAppointment} onCancel={(id) => void cancelAppointment(id)} /></section>}
        {tab === 'customers' && <CustomersView customers={data.customers} />}
        {tab === 'team' && <><ResourceEditor resource="barbers" title="Team" eyebrow="Barbers" rows={data.barbers as unknown as AdminRow[]} data={data} refresh={refresh} /><EligibilityPanel data={data} refresh={refresh} /></>}
        {tab === 'services' && <ResourceEditor resource="services" title="Services" eyebrow="Menu and chair time" rows={data.services as unknown as AdminRow[]} data={data} refresh={refresh} />}
        {tab === 'hours' && <ResourceEditor resource="availability" title="Working hours" eyebrow="Recurring schedule" rows={data.availability} data={data} refresh={refresh} />}
        {tab === 'closures' && <ResourceEditor resource="blocks" title="Closures & time off" eyebrow="Exceptions" rows={data.blocks} data={data} refresh={refresh} />}
        {tab === 'messages' && <MessagesView outbox={data.outbox} events={data.events} />}
        <p className="ew-form-message" aria-live="polite">{message}</p>
      </main>
    </div>
  </div>;
}
