import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AvailabilityBrowser } from './AvailabilityBrowser';
import { EmmiwoodApiError, emmiwoodApi } from './api';
import { formatUsPhone, normalizeUsPhone, slotDate } from './availability';
import { EmmiwoodMeta } from './meta';
import { EmmiwoodBrand } from './EmmiwoodAppHeader';
import type { AdminResource, AdminRow, Appointment, CustomerSummary, Dashboard } from './types';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

type ShopTab = 'hours' | 'closures' | 'team' | 'services' | 'customers' | 'messages';
type AdminTab = 'today' | 'book' | ShopTab;

const PRIMARY_NAV: Array<{ id: 'today' | 'book' | 'shop'; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'book', label: 'Book' },
  { id: 'shop', label: 'Shop' },
];

const SHOP_NAV: Array<{ id: ShopTab; label: string }> = [
  { id: 'hours', label: 'Hours' },
  { id: 'closures', label: 'Closures' },
  { id: 'team', label: 'Team' },
  { id: 'services', label: 'Services' },
  { id: 'customers', label: 'Customers' },
  { id: 'messages', label: 'Texts' },
];

function isShopTab(tab: AdminTab): tab is ShopTab {
  return SHOP_NAV.some((item) => item.id === tab);
}

const FIELDS: Record<Exclude<AdminResource, 'eligibility'>, string[]> = {
  services: ['name', 'description', 'price_cents', 'duration_minutes', 'buffer_minutes', 'active'],
  barbers: ['name', 'bio', 'phone', 'active'],
  availability: ['barber_id', 'weekday', 'start_minute', 'end_minute', 'active'],
  blocks: ['barber_id', 'date', 'start_minute', 'end_minute', 'kind', 'note'],
};

const LABELS: Record<string, string> = {
  name: 'Name', description: 'What is included', price_cents: 'Price', duration_minutes: 'Chair time',
  buffer_minutes: 'Reset time after service', active: 'Status', bio: 'Approach and specialty', barber_id: 'Barber',
  weekday: 'Day', start_minute: 'Starts', end_minute: 'Ends', date: 'Date', kind: 'Type', note: 'Note',
  phone: 'Staff SMS number',
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
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour % 24 >= 12 ? 'PM' : 'AM'}`;
};
const timeToMinute = (value: FormDataEntryValue) => {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
};

type Feedback = { text: string; kind: 'info' | 'success' | 'error' };
function FeedbackMessage({ message }: { message: Feedback | null }) {
  return <p className={`ew-form-message${message ? ` is-${message.kind}` : ' is-empty'}`} role={message?.kind === 'error' ? 'alert' : 'status'} aria-live={message?.kind === 'error' ? 'assertive' : 'polite'}>{message?.text || ''}</p>;
}

function useEditorFocus(editing: unknown) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editing != null) formRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, [editing]);
  return formRef;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const infoPrefix = 'If that number';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!sent) {
      const trimmed = phone.trim();
      if (!trimmed || !normalizeUsPhone(trimmed)) {
        setMessage('Enter a valid 10-digit mobile number.');
        return;
      }
    } else if (!/^\d{6}$/.test(code.trim())) {
      setMessage('Enter the six-digit code from your text message.');
      return;
    }
    setMessage('Working…');
    busyRef.current = true;
    setBusy(true);
    try {
      if (!sent) {
        const result = await emmiwoodApi.requestCode(phone.trim());
        setPreview(result.previewCode || '');
        setSent(true);
        setMessage('If that number is authorized, a short-lived code is on the way.');
      } else {
        await emmiwoodApi.verifyCode(phone.trim(), code.trim());
        await onLogin();
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const showError = Boolean(message && message !== 'Working…' && !message.startsWith(infoPrefix));

  return <div className="emmiwood ew-app-surface ewa ewa-auth">
    <EmmiwoodMeta title="Staff Sign In | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex />
    <main className="ewa-login"><div className="ewa-login-card">
      <a className="ew-brand" href="/emmiwood" aria-label="Emmiwood home"><EmmiwoodBrand /></a>
      <span className="ew-eyebrow">Private shop workspace</span>
      <h1>{sent ? 'Enter your code.' : 'Open the shop.'}</h1>
      <p className="ewa-login-lead">{sent ? 'Check your phone for a six-digit text.' : 'Sign in with an approved shop mobile number—no password to remember.'}</p>
      <form className={showError ? 'has-error' : undefined} onSubmit={submit} noValidate aria-busy={busy}>
        {!sent ? <label key="phone">Mobile number<input autoFocus disabled={busy} type="tel" inputMode="tel" value={phone} onChange={(event) => { setPhone(formatUsPhone(event.target.value)); if (message) setMessage(''); }} autoComplete="tel" aria-invalid={showError || undefined} required placeholder="(605) 555-0199" /></label> : <label key="code">Six-digit code<input autoFocus disabled={busy} inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(event) => { setCode(event.target.value); if (message) setMessage(''); }} autoComplete="one-time-code" aria-invalid={showError || undefined} required /></label>}
        {preview && <p className="ewa-preview" role="status">Preview code <strong>{preview}</strong></p>}
        <button className="ew-button" type="submit" disabled={busy}>{busy ? 'Working…' : sent ? 'Verify and enter' : 'Text me a code'}</button>
        {sent && <button className="ew-link-button" type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setPreview(''); setMessage(''); }}>Use another number</button>}
        <p className={`ew-form-message${message ? (message === 'Working…' || message.startsWith(infoPrefix) ? ' is-info' : ' is-error') : ' is-empty'}`} role={showError ? 'alert' : undefined} aria-live="polite">{message}</p>
      </form>
    </div></main>
  </div>;
}

function ResourceField({ resource, field, value, data, disabled }: { resource: AdminResource; field: string; value: unknown; data: Dashboard; disabled?: boolean }) {
  if (field === 'barber_id') return <select disabled={disabled} name={field} defaultValue={String(value ?? (resource === 'availability' ? data.barbers[0]?.id || '' : ''))} required={resource === 'availability'}>{resource !== 'availability' && <option value="">Entire shop</option>}{data.barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select>;
  if (field === 'weekday') return <select disabled={disabled} name={field} defaultValue={String(value ?? 1)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>;
  if (field === 'kind') return <select disabled={disabled} name={field} defaultValue={String(value ?? 'blocked')}><option value="blocked">Barber time off</option><option value="closed">Shop closed</option><option value="available">Extra availability</option></select>;
  if (field === 'active') return <select disabled={disabled} name={field} defaultValue={String(value ?? 1)}><option value="1">Active</option><option value="0">Inactive</option></select>;
  if (field === 'price_cents') return <div className="ewa-money-input"><span>$</span><input disabled={disabled} name="price_dollars" type="number" min="0" step="0.01" defaultValue={Number(value || 0) / 100} required /></div>;
  if (field === 'start_minute' || field === 'end_minute') return <input disabled={disabled} name={field} type="time" step="300" defaultValue={Number(value) === 1440 ? '' : value == null ? (resource === 'availability' ? (field === 'start_minute' ? '09:00' : '17:00') : '') : minuteToInput(value)} required={resource === 'availability' && field === 'start_minute'} />;
  if (field === 'duration_minutes' || field === 'buffer_minutes') return <div className="ewa-unit-input"><input disabled={disabled} name={field} type="number" min={field === 'duration_minutes' ? 5 : 0} step="5" defaultValue={String(value ?? (field === 'duration_minutes' ? 30 : 0))} required={field === 'duration_minutes'} /><span>min</span></div>;
  if (field === 'description' || field === 'bio' || field === 'note') return <textarea disabled={disabled} name={field} rows={3} defaultValue={String(value ?? '')} />;
  if (field === 'phone') return <input disabled={disabled} name={field} type="tel" inputMode="tel" autoComplete="tel" placeholder="(605) 555-0123" defaultValue={String(value ?? '')} />;
  return <input disabled={disabled} name={field} type={field === 'date' ? 'date' : 'text'} defaultValue={String(value ?? '')} required={field === 'name' || field === 'date'} />;
}

function normalizeResourceForm(form: HTMLFormElement) {
  const raw = Object.fromEntries(new FormData(form));
  const normalized: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'price_dollars') normalized.price_cents = Math.round(Number(value) * 100);
    else if (key === 'start_minute' || key === 'end_minute') normalized[key] = value ? timeToMinute(value) : (key === 'end_minute' ? 1440 : 0);
    else if (key === 'barber_id') normalized[key] = value ? String(value) : null;
    else if (['duration_minutes', 'buffer_minutes', 'weekday', 'active'].includes(key)) normalized[key] = Number(value);
    else if (key === 'phone') {
      const digits = String(value || '').trim();
      normalized[key] = digits ? (normalizeUsPhone(digits) || digits) : null;
    }
    else normalized[key] = String(value);
  }
  return normalized as AdminRow;
}

function resourceSummary(resource: Exclude<AdminResource, 'eligibility'>, row: AdminRow, data: Dashboard) {
  if (resource === 'services') return `${money(Number(row.price_cents || 0))} · ${row.duration_minutes} min · ${Number(row.active) ? 'Active' : 'Inactive'}`;
  if (resource === 'barbers') {
    const sms = String(row.phone || '').trim();
    return `${Number(row.active) ? 'Active' : 'Inactive'} · ${sms ? 'Staff SMS on' : 'No staff SMS'} · ${String(row.bio || 'No profile note')}`;
  }
  if (resource === 'availability') {
    const barber = data.barbers.find((item) => item.id === row.barber_id)?.name || 'Entire shop';
    return `${barber} · ${WEEKDAYS[Number(row.weekday)]} ${minuteLabel(row.start_minute)}–${minuteLabel(row.end_minute)}`;
  }
  const barber = data.barbers.find((item) => item.id === row.barber_id)?.name || 'Entire shop';
  return `${row.date} · ${barber} · ${Number(row.start_minute) === 0 && Number(row.end_minute) === 1440 ? 'All day' : `${minuteLabel(row.start_minute)}–${minuteLabel(row.end_minute)}`}`;
}

function hoursTitle(row: AdminRow) {
  return `${WEEKDAYS[Number(row.weekday)]} · ${minuteLabel(row.start_minute)}–${minuteLabel(row.end_minute)}`;
}

function HoursEditor({ rows, data, refresh }: { rows: AdminRow[]; data: Dashboard; refresh: () => void }) {
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [message, setMessage] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const formRef = useEditorFocus(editing);
  const groups = useMemo(() => {
    const byBarber = new Map<string, { id: string; name: string; rows: AdminRow[] }>();
    for (const barber of data.barbers) byBarber.set(barber.id, { id: barber.id, name: barber.name, rows: [] });
    byBarber.set('', { id: '', name: 'Entire shop', rows: [] });
    for (const row of rows) {
      const id = String(row.barber_id || '');
      if (!byBarber.has(id)) byBarber.set(id, { id, name: id || 'Entire shop', rows: [] });
      byBarber.get(id)!.rows.push(row);
    }
    for (const group of byBarber.values()) {
      group.rows.sort((left, right) => Number(left.weekday) - Number(right.weekday) || Number(left.start_minute) - Number(right.start_minute));
    }
    return [...byBarber.values()].filter((group) => group.rows.length);
  }, [rows, data.barbers]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const input = normalizeResourceForm(event.currentTarget);
    if (Number(input.end_minute) <= Number(input.start_minute)) { setMessage({ text: 'Hours must end after they start.', kind: 'error' }); return; }
    busyRef.current = true;
    setBusy(true);
    setMessage({ text: 'Saving hours…', kind: 'info' });
    try {
      if (editing?.id) await emmiwoodApi.updateResource('availability', editing.id, input);
      else await emmiwoodApi.createResource('availability', input);
      setEditing(null);
      setMessage({ text: 'Hours saved.', kind: 'success' });
      await refresh();
    } catch (error) { setMessage({ text: `Could not save hours: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function remove(row: AdminRow) {
    if (busyRef.current) return;
    if (!confirm('Delete this schedule item?')) return;
    busyRef.current = true;
    setBusy(true);
    setMessage({ text: 'Deleting hours…', kind: 'info' });
    try {
      await emmiwoodApi.deleteResource('availability', row.id);
      if (editing?.id === row.id) setEditing(null);
      setMessage({ text: 'Hours deleted.', kind: 'success' });
      await refresh();
    } catch (error) { setMessage({ text: `Could not delete hours: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="ewa-panel" aria-busy={busy}>
    <div className="ewa-panel-head"><div><span className="ew-eyebrow">Recurring schedule</span><h1>Hours</h1></div><button className="ew-button small" disabled={busy || !data.barbers.length} onClick={() => setEditing({ id: '' })}>Add new</button></div>
    {editing && <p>Times use the shop&apos;s Central time zone. Leave Ends blank for midnight at the end of the day.</p>}
    {editing && <form key={editing.id} ref={formRef} className="ewa-edit" onSubmit={save}>{FIELDS.availability.map((field) => <label key={field}>{LABELS[field]}<ResourceField resource="availability" field={field} value={editing[field]} data={data} disabled={busy} /></label>)}<div className="ewa-form-actions"><button className="ew-button small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="ew-link-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Close</button></div></form>}
    {!rows.length && <div className="ewa-empty-state"><strong>No recurring hours yet.</strong><p>Add a barber schedule before accepting online appointments.</p></div>}
    <div className="ewa-hours-groups">{groups.map((group) => <section className="ewa-hours-group" key={group.id || 'shop'}>
      <h2>{group.name}</h2>
      <div className="ewa-resource-list">{group.rows.map((row) => <article key={row.id}><div><strong>{hoursTitle(row)}</strong></div><div><button disabled={busy} onClick={() => setEditing(row)}>Edit</button><button disabled={busy} className="danger" onClick={() => void remove(row)}>Delete</button></div></article>)}</div>
    </section>)}</div>
    <FeedbackMessage message={message} />
  </section>;
}

function ResourceEditor({ resource, title, eyebrow, rows, data, refresh }: { resource: Exclude<AdminResource, 'eligibility'>; title: string; eyebrow: string; rows: AdminRow[]; data: Dashboard; refresh: () => void }) {
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [message, setMessage] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const formRef = useEditorFocus(editing);
  const canMutate = resource !== 'barbers' || data.admin.role === 'owner';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canMutate || busyRef.current) return;
    const input = normalizeResourceForm(event.currentTarget);
    if (resource === 'blocks' && (Number(input.start_minute) || Number(input.end_minute)) && Number(input.end_minute) <= Number(input.start_minute)) { setMessage({ text: 'A timed exception must end after it starts. Leave both times blank for all day.', kind: 'error' }); return; }
    busyRef.current = true;
    setBusy(true);
    setMessage({ text: `Saving ${title.toLowerCase()}…`, kind: 'info' });
    try {
      if (editing?.id) await emmiwoodApi.updateResource(resource, editing.id, input);
      else await emmiwoodApi.createResource(resource, input);
      setEditing(null);
      setMessage({ text: `${title} saved.`, kind: 'success' });
      await refresh();
    } catch (error) { setMessage({ text: `Could not save ${title.toLowerCase()}: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function remove(row: AdminRow) {
    if (!canMutate || busyRef.current) return;
    const deactivate = resource === 'services' || resource === 'barbers';
    if (!confirm(deactivate ? 'Make this inactive?' : 'Delete this schedule item?')) return;
    busyRef.current = true;
    setBusy(true);
    setMessage({ text: deactivate ? 'Making inactive…' : 'Deleting exception…', kind: 'info' });
    try {
      if (deactivate) await emmiwoodApi.updateResource(resource, row.id, { id: row.id, active: 0 } as AdminRow);
      else await emmiwoodApi.deleteResource(resource, row.id);
      if (editing?.id === row.id) setEditing(null);
      setMessage({ text: deactivate ? 'Marked inactive.' : 'Exception deleted.', kind: 'success' });
      await refresh();
    } catch (error) { setMessage({ text: `Could not ${deactivate ? 'deactivate record' : 'delete exception'}: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <section className="ewa-panel" aria-busy={busy}>
    <div className="ewa-panel-head"><div><span className="ew-eyebrow">{eyebrow}</span><h1>{title}</h1></div>{canMutate && <button className="ew-button small" disabled={busy} onClick={() => setEditing({ id: '' })}>Add new</button>}</div>
    {editing && resource === 'blocks' && <p>Times use the shop&apos;s Central time zone. Leave both blank for all day, or leave Ends blank for midnight.</p>}
    {editing && canMutate && <form key={`${resource}-${editing.id}`} ref={formRef} className="ewa-edit" onSubmit={save}>{FIELDS[resource].map((field) => <label key={field}>{LABELS[field]}<ResourceField resource={resource} field={field} value={editing[field]} data={data} disabled={busy} /></label>)}<div className="ewa-form-actions"><button className="ew-button small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="ew-link-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Close</button></div></form>}
    {!rows.length && <div className="ewa-empty-state"><strong>No {title.toLowerCase()} yet.</strong><p>{resource === 'blocks' ? 'Add a closure or time-off exception when the regular schedule changes.' : `Add the first ${title.toLowerCase().replace(/s$/, '')} to continue setup.`}</p></div>}
    <div className="ewa-resource-list">{rows.map((row) => <article key={row.id}><div><strong>{String(row.name || row.date || WEEKDAYS[Number(row.weekday)] || 'Schedule item')}</strong><span>{resourceSummary(resource, row, data)}</span></div>{canMutate && <div><button disabled={busy} onClick={() => setEditing(row)}>Edit</button><button disabled={busy || ((resource === 'services' || resource === 'barbers') && !Number(row.active))} className="danger" onClick={() => void remove(row)}>{resource === 'services' || resource === 'barbers' ? (Number(row.active) ? 'Make inactive' : 'Inactive') : 'Delete'}</button></div>}</article>)}</div>
    <FeedbackMessage message={message} />
  </section>;
}

function EligibilityPanel({ data, refresh }: { data: Dashboard; refresh: () => void }) {
  const [message, setMessage] = useState<Feedback | null>(null);
  const [busyId, setBusyId] = useState('');
  const busyRef = useRef(false);
  const eligible = useMemo(() => new Set(data.eligibility.map((item) => item.id)), [data.eligibility]);
  const canMutate = data.admin.role === 'owner';

  async function toggle(barberId: string, serviceId: string, enabled: boolean) {
    const id = `${barberId}--${serviceId}`;
    if (!canMutate || busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setMessage({ text: 'Saving service fit…', kind: 'info' });
    try {
      if (enabled) await emmiwoodApi.createResource('eligibility', { id, barber_id: barberId, service_id: serviceId } as AdminRow);
      else await emmiwoodApi.deleteResource('eligibility', id);
      setMessage({ text: 'Service fit saved.', kind: 'success' });
      await refresh();
    } catch (error) { setMessage({ text: `Could not save service fit: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusyId(''); }
  }

  return <section className="ewa-panel ewa-eligibility" aria-busy={Boolean(busyId)}><div className="ewa-panel-head"><div><span className="ew-eyebrow">Service fit</span><h2>Who can perform each service?</h2></div></div>{(!data.barbers.length || !data.services.length) && <div className="ewa-empty-state"><strong>Service fit needs both a barber and a service.</strong><p>Add the missing shop setup records, then return here.</p></div>}<div className="ewa-eligibility-grid">{data.barbers.map((barber) => <article key={barber.id}><h3>{barber.name}</h3>{data.services.map((service) => { const id = `${barber.id}--${service.id}`; return <label key={service.id}><input type="checkbox" checked={eligible.has(id)} disabled={!canMutate || Boolean(busyId)} onChange={(event) => void toggle(barber.id, service.id, event.target.checked)} /><span>{service.name}</span></label>; })}</article>)}</div><FeedbackMessage message={message} /></section>;
}

function AppointmentEditor({ data, appointment, close, refresh, onBusyChange }: { data: Dashboard; appointment?: Appointment; close: () => void; refresh: () => void; onBusyChange: (busy: boolean) => void }) {
  const [message, setMessage] = useState<Feedback | null>(null);
  const [serviceId, setServiceId] = useState(appointment?.service_id || data.services.find((item) => item.active)?.id || '');
  const [barberId, setBarberId] = useState(appointment?.barber_id || 'first');
  const [slot, setSlot] = useState<{ start: number; barberId: string; barberName: string }>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!slot) { setMessage({ text: 'Choose an opening before saving.', kind: 'error' }); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!appointment) {
      const normalizedPhone = normalizeUsPhone(String(values.phone || ''));
      if (!normalizedPhone) { setMessage({ text: 'Enter a valid 10-digit mobile number.', kind: 'error' }); return; }
      values.phone = normalizedPhone;
    }
    try {
      busyRef.current = true;
      setBusy(true);
      onBusyChange(true);
      setMessage({ text: appointment ? 'Rescheduling…' : 'Creating appointment…', kind: 'info' });
      const input = { ...values, serviceId, barberId, date: slotDate(slot.start), start: slot.start };
      if (appointment) await emmiwoodApi.updateAppointment(appointment.id, input);
      else await emmiwoodApi.createAppointment(input);
      await refresh(); close();
    } catch (error) { setMessage({ text: `Could not ${appointment ? 'reschedule' : 'create'} appointment: ${(error as Error).message}`, kind: 'error' }); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  return <form className="ewa-edit ewa-appointment-edit" onSubmit={save} aria-busy={busy}>
    <label>Service<select autoFocus value={serviceId} disabled={busy} onChange={(event) => { setServiceId(event.target.value); setSlot(undefined); }}>{data.services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
    <label>Barber<select value={barberId} disabled={busy} onChange={(event) => { setBarberId(event.target.value); setSlot(undefined); }}><option value="first">First available</option>{data.barbers.filter((barber) => barber.active).map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}</select></label>
    {!appointment && <><label>Customer name<input disabled={busy} name="name" autoComplete="name" required /></label><label>Mobile<input disabled={busy} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(605) 555-0123" onBlur={(event) => { event.currentTarget.value = formatUsPhone(event.currentTarget.value); }} required /></label><label className="wide">Notes<textarea disabled={busy} name="notes" rows={2} /></label></>}
    {!data.services.some((service) => service.active) || !data.barbers.some((barber) => barber.active) ? <div className="ewa-empty-state"><strong>Booking setup is incomplete.</strong><p>Add an active service and barber in Shop before creating an appointment.</p></div> : <fieldset disabled={busy} style={{ display: 'contents' }}><AvailabilityBrowser serviceId={serviceId} barberId={barberId} horizonDays={data.shop.horizon_days} selectedSlot={slot} onRefresh={() => setSlot(undefined)} onDateChange={() => setSlot(undefined)} onSelect={(nextSlot) => setSlot(nextSlot)} /></fieldset>}
    <div className="ewa-form-actions"><button className="ew-button small" disabled={!slot || busy}>{busy ? 'Saving…' : appointment ? 'Reschedule' : 'Create appointment'}</button><button className="ew-link-button" type="button" disabled={busy} onClick={close}>Close</button></div>
    <FeedbackMessage message={message} />
  </form>;
}

function AppointmentCards({ rows, onEdit, onCancel, busy }: { rows: Appointment[]; onEdit: (appointment: Appointment) => void; onCancel: (id: string) => void; busy: boolean }) {
  return rows.length ? <div className="ewa-appointment-list">{rows.map((appointment) => <article key={appointment.id}><time>{when(appointment.start_at)}</time><div><strong>{appointment.customer_name}</strong><span>{appointment.service_name} · {appointment.barber_name}</span><small>{appointment.phone}</small></div><span className={`ewa-state ${appointment.status}`}>{appointment.status}</span>{appointment.status === 'booked' && <div className="ewa-card-actions"><button disabled={busy} onClick={() => onEdit(appointment)}>Reschedule</button><button disabled={busy} className="danger" onClick={() => onCancel(appointment.id)}>Cancel</button></div>}</article>)}</div> : <div className="ewa-empty-state"><strong>No appointments yet.</strong><p>Create an appointment or wait for the first online booking.</p></div>;
}

function TodayView({ data, create, edit, openTexts }: { data: Dashboard; create: () => void; edit: (appointment: Appointment) => void; openTexts: () => void }) {
  const todays = data.appointments.filter((appointment) => appointment.status === 'booked' && dayKey(appointment.start_at) === today);
  const failed = data.outbox.filter((row) => row.status === 'failed').length;
  const next = todays.find((appointment) => appointment.start_at * 1000 >= Date.now());
  return <>
    <div className="ewa-heading"><div><span className="ew-eyebrow">{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span><h1>Today</h1></div><button className="ew-button small" onClick={create}>New appointment</button></div>
    <div className="ewa-attention-grid"><article><span>Next chair</span><strong>{next ? timeOnly(next.start_at) : 'Clear'}</strong><p>{next ? `${next.customer_name} · ${next.service_name}` : 'No upcoming appointment today.'}</p></article><article><span>Today</span><strong>{todays.length}</strong><p>{todays.length === 1 ? 'booked appointment' : 'booked appointments'}</p></article><article className={failed ? 'warning ewa-attention-action' : ''} {...(failed ? { role: 'button', tabIndex: 0, onClick: openTexts, onKeyDown: (event: { key: string }) => { if (event.key === 'Enter' || event.key === ' ') openTexts(); } } : {})}><span>Needs attention</span><strong>{failed}</strong><p>{failed ? 'failed customer texts' : 'No failed texts.'}</p></article></div>
    <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Agenda</span><h2>{todays.length ? 'Chair by chair' : 'No booked appointments today.'}</h2></div></div>{todays.length ? <div className="ewa-agenda">{todays.map((appointment) => <button key={appointment.id} onClick={() => edit(appointment)}><time>{timeOnly(appointment.start_at)}</time><span><strong>{appointment.customer_name}</strong><small>{appointment.service_name} · {appointment.barber_name}</small></span><em>Open →</em></button>)}</div> : <div className="ewa-empty-state"><button className="ew-link-button" onClick={create}>Create an appointment</button></div>}</section>
  </>;
}

function CustomersView({ customers }: { customers: CustomerSummary[] }) {
  return <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Customer history</span><h1>Customers</h1></div><span className="ewa-count">{customers.length} records</span></div>{!customers.length && <div className="ewa-empty-state"><strong>No customer history yet.</strong><p>Customer records appear after an appointment is booked.</p></div>}<div className="ewa-customer-list">{customers.map((customer) => <article key={customer.id}><div><strong>{customer.name}</strong><span>{customer.phone}</span></div><dl><div><dt>Appointments</dt><dd>{customer.appointment_count}</dd></div><div><dt>Last visit</dt><dd>{customer.last_appointment_at ? when(customer.last_appointment_at) : 'Not completed'}</dd></div><div><dt>Texts</dt><dd>{customer.sms_consent ? 'Opted in' : 'Not opted in'}</dd></div></dl></article>)}</div></section>;
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
  const created = Number(row.created_at);
  const whenCreated = Number.isFinite(created) && created > 1e9 ? when(created > 1e12 ? created / 1000 : created) : '';
  return { title: labels[event] || event.replace(/_/g, ' '), detail: detailText || whenCreated };
}

function MessagesView({ outbox, events }: { outbox: AdminRow[]; events: AdminRow[] }) {
  return <div className="ewa-message-columns"><section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Delivery</span><h1>Texts</h1></div></div>{!outbox.length && <div className="ewa-empty-state"><strong>No appointment texts yet.</strong><p>Queued, sent, and failed delivery records will appear here.</p></div>}<div className="ewa-message-list">{outbox.map((row) => <article key={row.id} className={String(row.status)}><div><strong>{String(row.template || 'Appointment message').replace(/_/g, ' ')}</strong><span>{String(row.channel || '').toUpperCase()} · {String(row.recipient || '')}</span></div><dl><div><dt>Status</dt><dd>{String(row.status)}</dd></div><div><dt>Provider</dt><dd>{String(row.provider || '—')}</dd></div><div><dt>Attempts</dt><dd>{String(row.attempt_count || 0)}</dd></div><div><dt>Provider ID</dt><dd>{String(row.provider_message_id || '—')}</dd></div></dl>{row.error && <p>{String(row.error)}</p>}</article>)}</div></section><section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">Audit trail</span><h2>Recent activity</h2></div></div>{!events.length && <div className="ewa-empty-state"><strong>No recent activity.</strong><p>Shop changes and appointment events will be recorded here.</p></div>}<div className="ewa-activity-list">{events.map((row) => { const item = eventNarrative(row); return <article key={row.id}><strong>{item.title}</strong><span>{item.detail || String(row.created_at || '')}</span></article>; })}</div></section></div>;
}

export default function EmmiwoodAdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(undefined);
  const [data, setData] = useState<Dashboard>();
  const [tab, setTab] = useState<AdminTab>('today');
  const [message, setMessage] = useState('');
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null | undefined>();
  const [actionBusy, setActionBusy] = useState(false);
  const actionBusyRef = useRef(false);
  const refreshVersion = useRef(0);

  function refresh() {
    const version = ++refreshVersion.current;
    setMessage('');
    return emmiwoodApi.dashboard().then((next) => { if (version !== refreshVersion.current) return; setData(next); setAuthenticated(true); setMessage(''); }).catch((error: Error) => {
      if (version !== refreshVersion.current) return;
      setMessage(error.message);
      if (error instanceof EmmiwoodApiError && error.status === 401) { setData(undefined); setAuthenticated(false); }
    });
  }
  useEffect(() => { void refresh(); }, []);
  async function logout() {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    ++refreshVersion.current;
    setActionBusy(true);
    try { await emmiwoodApi.logout(); setData(undefined); setAuthenticated(false); }
    catch (error) { setMessage(`Sign out could not be confirmed. You are still in the workspace; try Sign out again. ${(error as Error).message}`); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  }
  async function cancelAppointment(id: string) {
    if (actionBusyRef.current) return;
    if (!confirm('Cancel this appointment?')) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    try { await emmiwoodApi.cancelAppointment(id); await refresh(); }
    catch (error) { setMessage(`Could not cancel appointment: ${(error as Error).message}`); }
    finally { actionBusyRef.current = false; setActionBusy(false); }
  }
  function openAppointment(appointment: Appointment | null) { if (!actionBusyRef.current) setEditingAppointment(appointment); }
  function setAppointmentBusy(busy: boolean) { actionBusyRef.current = busy; setActionBusy(busy); }

  if (authenticated === false) return <Login onLogin={() => {
    // Verification consumed the OTP. Subsequent recovery must retry the
    // authenticated dashboard, not return to the already-used code form.
    setAuthenticated(undefined);
    setData(undefined);
    return refresh();
  }} />;
  if (!data) return <div className="emmiwood ew-app-surface ewa"><EmmiwoodMeta title="Shop Workspace | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex />{message ? <main className="ewa-login"><section className="ewa-login-card" aria-labelledby="ewa-load-error"><span className="ew-eyebrow">Shop workspace</span><h1 id="ewa-load-error">Couldn&apos;t open the shop.</h1><p className="ew-form-message is-error" role="alert">{message}</p><div className="ew-actions"><button className="ew-button" type="button" onClick={refresh}>Try again</button><button className="ew-link-button" type="button" onClick={() => { setAuthenticated(false); setMessage(''); }}>Return to sign in</button><a className="ew-link" href="/emmiwood">Shop home</a></div></section></main> : <p className="ewa-loading" role="status">Opening the shop workspace…</p>}</div>;

  const shopOpen = isShopTab(tab);

  return <div className="emmiwood ew-app-surface ewa ewa-workspace">
    <EmmiwoodMeta title="Shop Workspace | Emmiwood Barbers" description="Private Emmiwood shop workspace." path="/emmiwood/admin" noindex />
    <header className="ewa-top"><a className="ew-brand" href="/emmiwood" aria-label="Emmiwood home"><EmmiwoodBrand label="Shop workspace" /></a><div><span>{data.admin.email} · {data.admin.role}</span><button disabled={actionBusy} onClick={() => void logout()}>{actionBusy ? 'Working…' : 'Sign out'}</button></div></header>
    <div className="ewa-shell"><nav className="ewa-nav" aria-label="Shop workspace">{PRIMARY_NAV.map((item) => {
      const active = item.id === 'shop' ? shopOpen : tab === item.id || (item.id === 'book' && tab === 'book');
      return <button disabled={actionBusy} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} aria-pressed={active} onClick={() => { setTab(item.id === 'shop' ? 'hours' : item.id); if (item.id !== 'today' && item.id !== 'book') setEditingAppointment(undefined); }} key={item.id}>{item.label}</button>;
    })}</nav>
      <main className="ewa-main">
        {shopOpen && <nav className="ewa-shop-nav" aria-label="Shop setup">{SHOP_NAV.map((item) => <button className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} aria-pressed={tab === item.id} onClick={() => setTab(item.id)} key={item.id}>{item.label}</button>)}</nav>}
        {tab === 'today' && <>
          <TodayView data={data} create={() => openAppointment(null)} edit={(appointment) => openAppointment(appointment)} openTexts={() => setTab('messages')} />
          {editingAppointment !== undefined && <AppointmentEditor key={editingAppointment?.id || 'new'} data={data} appointment={editingAppointment || undefined} close={() => setEditingAppointment(undefined)} refresh={refresh} onBusyChange={setAppointmentBusy} />}
        </>}
        {tab === 'book' && <section className="ewa-panel"><div className="ewa-panel-head"><div><span className="ew-eyebrow">All appointments</span><h1>Book</h1></div><button className="ew-button small" disabled={actionBusy} onClick={() => openAppointment(null)}>New appointment</button></div>{editingAppointment !== undefined && <AppointmentEditor key={editingAppointment?.id || 'new'} data={data} appointment={editingAppointment || undefined} close={() => setEditingAppointment(undefined)} refresh={refresh} onBusyChange={setAppointmentBusy} />}<AppointmentCards rows={data.appointments} busy={actionBusy} onEdit={openAppointment} onCancel={(id) => void cancelAppointment(id)} /></section>}
        {tab === 'customers' && <CustomersView customers={data.customers} />}
        {tab === 'team' && <><ResourceEditor key="barbers" resource="barbers" title="Team" eyebrow="Barbers" rows={data.barbers as unknown as AdminRow[]} data={data} refresh={refresh} /><EligibilityPanel data={data} refresh={refresh} /></>}
        {tab === 'services' && <ResourceEditor key="services" resource="services" title="Services" eyebrow="Menu and chair time" rows={data.services as unknown as AdminRow[]} data={data} refresh={refresh} />}
        {tab === 'hours' && <HoursEditor rows={data.availability} data={data} refresh={refresh} />}
        {tab === 'closures' && <ResourceEditor key="blocks" resource="blocks" title="Closures" eyebrow="Exceptions" rows={data.blocks} data={data} refresh={refresh} />}
        {tab === 'messages' && <MessagesView outbox={data.outbox} events={data.events} />}
        <FeedbackMessage message={message ? { text: message, kind: 'error' } : null} />
      </main>
    </div>
  </div>;
}
