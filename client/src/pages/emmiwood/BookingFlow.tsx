import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AvailabilityBrowser } from './AvailabilityBrowser';
import { EmmiwoodApiError, emmiwoodApi } from './api';
import {
  chicagoDate,
  formatUsPhone,
  normalizeUsPhone,
  prettyDateTime,
  prettyTime,
  slotDate,
} from './availability';
import { BARBER_DETAILS, EMMIWOOD_CONSENT_VERSION, EMMIWOOD_PHONE_LABEL, KUP_SMS_PRIVACY_URL, KUP_SMS_TERMS_URL, money } from './content';
import type { Appointment, Catalog, Service, Slot } from './types';

const hasService = (catalog: Catalog, id?: string | null) => Boolean(id && catalog.services.some((service) => service.id === id));
const hasBarber = (catalog: Catalog, id?: string | null) => id === 'first' || Boolean(id && catalog.barbers.some((barber) => barber.id === id));

type Stage = 'choose' | 'time' | 'details' | 'review' | 'confirmed';
type Details = { name: string; phone: string; notes: string; smsConsent: boolean };
const EMPTY_DETAILS: Details = { name: '', phone: '', notes: '', smsConsent: false };

function track(event: string, detail: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent('emmiwood:conversion', { detail: { event, ...detail } }));
}

export function BookingFlow({
  catalog,
  initialServiceId,
  initialBarberId,
}: {
  catalog: Catalog;
  initialServiceId?: string | null;
  initialBarberId?: string | null;
}) {
  const [serviceId, setServiceId] = useState(hasService(catalog, initialServiceId) ? initialServiceId! : catalog.services[0]?.id || '');
  const [barberId, setBarberId] = useState(hasBarber(catalog, initialBarberId) ? initialBarberId! : 'first');
  const [barberStepOpen, setBarberStepOpen] = useState(
    () => hasService(catalog, initialServiceId)
      || (Boolean(initialBarberId) && hasBarber(catalog, initialBarberId))
      || (typeof window !== 'undefined' && window.matchMedia('(min-width: 761px)').matches),
  );
  const [date, setDate] = useState(chicagoDate());
  const [slot, setSlot] = useState<Slot>();
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [stage, setStage] = useState<Stage>('choose');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [confirmation, setConfirmation] = useState<{ manageToken: string; start: number; barberName: string; serviceName: string }>();
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const mutationBusyRef = useRef(false);
  const mutationServiceRef = useRef<Service>();

  const service = catalog.services.find((item) => item.id === serviceId) || (busy ? mutationServiceRef.current : undefined);
  const eligibleBarbers = useMemo(() => {
    const ids = new Set(catalog.eligibility.filter((item) => item.service_id === serviceId).map((item) => item.barber_id));
    return catalog.barbers.filter((barber) => ids.has(barber.id));
  }, [catalog, serviceId]);
  const barberName = barberId === 'first' ? 'First available' : catalog.barbers.find((barber) => barber.id === barberId)?.name || 'Selected barber';

  useEffect(() => {
    if (stage === 'confirmed' || busy || mutationBusyRef.current) return;
    const barberUnavailable = barberId !== 'first' && !eligibleBarbers.some((barber) => barber.id === barberId);
    const slotUnavailable = Boolean(slot && !eligibleBarbers.some((barber) => barber.id === slot.barberId));
    if (!service || barberUnavailable || slotUnavailable || (!eligibleBarbers.length && stage !== 'choose')) {
      if (!service) setServiceId(catalog.services[0]?.id || '');
      if (barberUnavailable) setBarberId('first');
      setSlot(undefined);
      // Keep guest details, but return to a complete, navigable step after live menu changes.
      setStage('choose');
    }
  }, [barberId, busy, catalog.services, eligibleBarbers, service, slot, stage]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // focusVisible:false keeps the a11y focus target without a persistent clay ring after stage changes
      stageHeadingRef.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  function continueFromChoose() {
    if (!service || !eligibleBarbers.length) return;
    track('booking_choose_complete', { serviceId, barberId });
    setSlot(undefined);
    setAvailabilityNotice('');
    setMessage('');
    setStage('time');
  }

  function chooseSlot(nextSlot: Slot, selectedDate: string) {
    setDate(selectedDate);
    setSlot(nextSlot);
    setAvailabilityNotice('');
    track('slot_selected', { serviceId, barberId: nextSlot.barberId, start: nextSlot.start });
  }

  function continueFromDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!details.name.trim()) {
      setMessage('Enter your name.');
      nameInputRef.current?.focus();
      return;
    }
    const normalizedPhone = normalizeUsPhone(details.phone);
    if (!normalizedPhone) {
      setMessage('Enter a valid 10-digit mobile number.');
      phoneInputRef.current?.focus();
      return;
    }
    setDetails((current) => ({ ...current, phone: formatUsPhone(current.phone) }));
    setMessage('');
    setStage('review');
    track('booking_details_complete', { smsConsent: details.smsConsent });
  }

  async function confirmBooking() {
    if (!slot || !service || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    mutationServiceRef.current = service;
    setBusy(true);
    setMessage('Securing your appointment…');
    try {
      const result = await emmiwoodApi.book({
        serviceId,
        barberId,
        date,
        start: slot.start,
        name: details.name.trim(),
        phone: normalizeUsPhone(details.phone),
        notes: details.notes.trim(),
        smsConsent: details.smsConsent,
        smsConsentVersion: details.smsConsent ? EMMIWOOD_CONSENT_VERSION : undefined,
      });
      setConfirmation(result);
      setStage('confirmed');
      setMessage('');
      window.scrollTo(0, 0);
      track('booking_completed', { serviceId, barberId: slot.barberId, start: slot.start, smsConsent: details.smsConsent });
    } catch (error) {
      if (error instanceof EmmiwoodApiError && error.code === 'slot_taken') {
        setStage('time');
        setSlot(undefined);
        setAvailabilityNotice('That opening was just booked. Your details are saved—choose another time.');
        track('booking_conflict', { serviceId, barberId, date });
      } else {
        setMessage((error as Error).message);
      }
    } finally {
      mutationBusyRef.current = false;
      mutationServiceRef.current = undefined;
      setBusy(false);
    }
  }

  if (stage === 'confirmed' && confirmation) {
    return (
      <section className="ew-confirmation" aria-labelledby="ew-confirmed-title">
        <div className="ew-confirmation-mark" aria-hidden="true">✓</div>
        <span className="ew-eyebrow">Appointment confirmed</span>
        <h1 id="ew-confirmed-title" ref={stageHeadingRef} tabIndex={-1}>You’re on the books.</h1>
        <div className="ew-confirmation-when" aria-label="Appointment time">
          <span className="ew-eyebrow">When</span>
          <strong>{prettyDateTime(confirmation.start)}</strong>
          <small>{confirmation.barberName} · {confirmation.serviceName}</small>
        </div>
        <dl className="ew-receipt">
          <div><dt>Service</dt><dd>{confirmation.serviceName}</dd></div>
          <div><dt>Barber</dt><dd>{confirmation.barberName}</dd></div>
        </dl>
        <p className="ew-confirmation-lead">{details.smsConsent ? 'Watch for your confirmation text. Keep the private link below for changes.' : 'Save the private link below if you need to reschedule or cancel.'}</p>
        <div className="ew-actions ew-confirmation-actions">
          <a className="ew-button" href={`/emmiwood/manage#token=${encodeURIComponent(confirmation.manageToken)}`}>Manage appointment</a>
          <a className="ew-link" href="/emmiwood">Back to the shop</a>
        </div>
      </section>
    );
  }

  if (!catalog.services.length && !busy) {
    return <section className="ew-booking-shell" aria-labelledby="booking-title">
      <header className="ew-booking-header"><h1 id="booking-title" tabIndex={-1}>Book your appointment.</h1></header>
      <div className="ew-empty" role="status"><h2>Online booking is unavailable.</h2><p>No services are available to book right now. Refresh the menu or call the shop for help.</p></div>
      <div className="ew-actions"><a className="ew-button" href="/emmiwood/book">Refresh services</a><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a><a className="ew-link" href="/emmiwood">Back to the shop</a></div>
    </section>;
  }

  return (
    <section className="ew-booking-shell" aria-labelledby="booking-title">
      <header className="ew-booking-header">
        <div><span className="ew-eyebrow">Appointments</span><h1 id="booking-title" tabIndex={-1}>Book your appointment.</h1></div>
        <span className="ew-live"><i aria-hidden="true" /> Live openings</span>
      </header>

      <ol className="ew-progress" aria-label="Booking progress">
        {[
          ['choose', '1', 'Choose'], ['time', '2', 'Time'], ['details', '3', 'Details'], ['review', '4', 'Review'],
        ].map(([key, number, label]) => {
          const order = ['choose', 'time', 'details', 'review'];
          const current = order.indexOf(stage === 'confirmed' ? 'review' : stage);
          const index = order.indexOf(key);
          return <li key={key} className={index < current ? 'complete' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}><span>{number}</span>{label}</li>;
        })}
      </ol>

      {stage === 'choose' && (
        <div className="ew-book-stage" data-stage="choose">
          <div className="ew-stage-heading"><h2 ref={stageHeadingRef} tabIndex={-1}><span className="ew-stage-num" aria-hidden="true">01</span> How can we help?</h2><p>Pick a service—barber is optional.</p></div>
          <fieldset className="ew-choice-grid">
            <legend>Choose a service</legend>
            {catalog.services.map((item) => <label key={item.id} className={serviceId === item.id ? 'selected' : ''}>
              <input type="radio" name="service" value={item.id} checked={serviceId === item.id} onChange={() => { setServiceId(item.id); setSlot(undefined); }} />
              <span><strong>{item.name}</strong><small>{item.duration_minutes} min · {money(item.price_cents)}</small><em>{item.description}</em></span>
            </label>)}
          </fieldset>
          {barberStepOpen && (
            <fieldset className="ew-barber-choice">
              <legend>Choose a barber</legend>
              <label className={`ew-barber-choice-first${barberId === 'first' ? ' selected' : ''}`}>
                <input type="radio" name="barber" value="first" checked={barberId === 'first'} onChange={() => { setBarberId('first'); setSlot(undefined); }} />
                <span className="ew-booking-barber-option">
                  <i className="ew-booking-barber-initial ew-booking-barber-any" aria-hidden="true">Any</i>
                  <span className="ew-booking-barber-copy">
                    <strong>First available</strong>
                    <small>Soonest open chair — Barro or John</small>
                  </span>
                </span>
              </label>
              {eligibleBarbers.map((barber) => {
                const detail = BARBER_DETAILS[barber.id];
                return (
                  <label key={barber.id} className={barberId === barber.id ? 'selected' : ''}>
                    <input type="radio" name="barber" value={barber.id} checked={barberId === barber.id} onChange={() => { setBarberId(barber.id); setSlot(undefined); }} />
                    <span className="ew-booking-barber-option">
                      {barber.id === 'barro'
                        ? <img className="ew-booking-barber-photo" src="/emmiwood/barro-profile.webp" width="64" height="64" loading="lazy" decoding="async" alt="" />
                        : <i className="ew-booking-barber-initial" aria-hidden="true">{barber.name.slice(0, 1)}</i>}
                      <span className="ew-booking-barber-copy">
                        <strong>{barber.name}</strong>
                        <small className="ew-barber-meta">{detail?.schedule || 'Available for this service'}</small>
                        <small className="ew-barber-bio">{detail?.specialty || barber.bio}</small>
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {!barberStepOpen && (
            <button className="ew-barber-reveal" type="button" onClick={() => setBarberStepOpen(true)}>
              Choose a barber <span>optional</span>
            </button>
          )}
          <div className="ew-choose-dock">
            {service && !eligibleBarbers.length && <p className="ew-system-note" role="status">No barber is available for this service. Choose another service or call the shop.</p>}
            <div className="ew-booking-context" aria-label="Current booking selection"><span><small>Service</small><strong>{service?.name}</strong></span><span><small>Barber</small><strong>{barberName}</strong></span><span><small>Total</small><strong>{service ? `${service.duration_minutes} min · ${money(service.price_cents)}` : ''}</strong></span></div>
            <div className="ew-stage-actions"><button className="ew-button" type="button" disabled={!service || !eligibleBarbers.length} onClick={continueFromChoose}>Find openings</button></div>
          </div>
        </div>
      )}

      {stage === 'time' && service && (
        <div className="ew-book-stage" data-stage="time">
          <div className="ew-stage-heading"><h2 ref={stageHeadingRef} tabIndex={-1}><span className="ew-stage-num" aria-hidden="true">02</span> Choose the time.</h2><p>Compare labeled days, then choose a morning, afternoon, or evening opening.</p></div>
          <div className="ew-booking-context ew-booking-context-sticky" aria-label="Current booking selection"><span><small>Service</small><strong>{service.name}</strong></span><span><small>Barber</small><strong>{barberName}</strong></span><span><small>Total</small><strong>{service.duration_minutes} min · {money(service.price_cents)}</strong></span></div>
          <AvailabilityBrowser
            serviceId={serviceId}
            barberId={barberId}
            horizonDays={catalog.shop.horizon_days}
            selectedSlot={slot}
            onSelect={chooseSlot}
            onRefresh={() => setSlot(undefined)}
            onDateChange={(nextDate) => {
              setDate(nextDate);
              if (slot && slotDate(slot.start) !== nextDate) setSlot(undefined);
            }}
            notice={availabilityNotice}
          />
          <div className="ew-time-dock">
            {slot && <div className="ew-selected-slot ew-selected-slot-dock" role="status"><span>Selected</span><strong>{prettyTime(slot.start)}</strong><small>{slot.barberName}</small></div>}
            <div className="ew-stage-actions ew-time-actions">
              <button className="ew-link-button" type="button" onClick={() => setStage('choose')}>Back</button>
              <button className="ew-button" disabled={!slot} type="button" onClick={() => setStage('details')}>
                {slot ? `Confirm ${prettyTime(slot.start)}` : 'Confirm a time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'details' && slot && (
        <form className="ew-book-stage" data-stage="details" noValidate onSubmit={continueFromDetails}>
          <div className="ew-stage-heading"><h2 ref={stageHeadingRef} tabIndex={-1}><span className="ew-stage-num" aria-hidden="true">03</span> Who should we expect?</h2><p>{prettyDateTime(slot.start)} with {slot.barberName}.</p></div>
          <div className="ew-booking-context ew-details-context" aria-label="Selected appointment"><span><small>When</small><strong>{prettyDateTime(slot.start)}</strong></span><span><small>Barber</small><strong>{slot.barberName}</strong></span><span><small>Service</small><strong>{service?.name}</strong></span></div>
          <div className="ew-field-grid">
            <label>Name<input id="ew-guest-name" ref={nameInputRef} autoComplete="name" value={details.name} onChange={(event) => { setDetails({ ...details, name: event.target.value }); if (message) setMessage(''); }} aria-invalid={message === 'Enter your name.' ? true : undefined} aria-describedby={message === 'Enter your name.' ? 'ew-details-message' : undefined} required /></label>
            <label>Mobile<input id="ew-guest-phone" ref={phoneInputRef} type="tel" inputMode="tel" autoComplete="tel" placeholder="(605) 555-0123" aria-describedby={message === 'Enter a valid 10-digit mobile number.' ? 'ew-details-message ew-mobile-help' : 'ew-mobile-help'} aria-invalid={message === 'Enter a valid 10-digit mobile number.' ? true : undefined} value={details.phone} onChange={(event) => { setDetails({ ...details, phone: event.target.value }); if (message) setMessage(''); }} onBlur={() => setDetails((current) => ({ ...current, phone: formatUsPhone(current.phone) }))} required /><small id="ew-mobile-help" className="ew-field-help">Required so the shop can contact you about this appointment. Marketing texts are not sent.</small></label>
            <label className="wide">Notes <small>optional</small><textarea rows={3} value={details.notes} onChange={(event) => setDetails({ ...details, notes: event.target.value })} placeholder="Hair goals, accessibility needs, or anything the barber should know." /></label>
          </div>
          <label className="ew-consent"><input type="checkbox" checked={details.smsConsent} onChange={(event) => setDetails({ ...details, smsConsent: event.target.checked })} /><span><strong>Send me appointment texts.</strong> I agree to receive confirmation and reminder messages from KUP Solutions about this appointment. Message and data rates may apply. Reply STOP to opt out or HELP for help. <a href={KUP_SMS_TERMS_URL} target="_blank" rel="noreferrer">SMS terms</a> · <a href={KUP_SMS_PRIVACY_URL} target="_blank" rel="noreferrer">Privacy</a></span></label>
          <p id="ew-details-message" className={`ew-form-message${message ? ' is-error' : ' is-empty'}`} role={message ? 'alert' : undefined} aria-live="polite">{message}</p>
          <div className="ew-stage-actions"><button className="ew-link-button" type="button" onClick={() => setStage('time')}>Back</button><button className="ew-button" type="submit">Review appointment</button></div>
        </form>
      )}

      {stage === 'review' && slot && service && (
        <div className="ew-book-stage" data-stage="review">
          <div className="ew-stage-heading"><h2 ref={stageHeadingRef} tabIndex={-1}><span className="ew-stage-num" aria-hidden="true">04</span> Review before we reserve it.</h2><p>The opening is not held until you confirm.</p></div>
          <div className="ew-review-summary" aria-label="Appointment summary">
            <span className="ew-eyebrow">When</span>
            <strong>{prettyDateTime(slot.start)}</strong>
            <small>{slot.barberName} · {service.name} · {money(service.price_cents)}</small>
          </div>
          <dl className="ew-review-list">
            <div><dt>Service</dt><dd>{service.name}<small>{service.duration_minutes} minutes · {money(service.price_cents)}</small></dd></div>
            <div><dt>Barber</dt><dd>{slot.barberName}</dd></div>
            <div><dt>Guest</dt><dd>{details.name}<small>{details.phone}</small></dd></div>
            <div><dt>Texts</dt><dd>{details.smsConsent ? 'Appointment updates enabled' : 'Not requested'}</dd></div>
          </dl>
          <div className="ew-policy-note"><strong>Change policy</strong><p>Book any open slot on the schedule—including the next one while you wait. Cancel or reschedule online any time before your appointment starts.</p></div>
          <p className={`ew-form-message${message ? (busy || message.startsWith('Securing') ? '' : ' is-error') : ' is-empty'}`} role={message && !busy ? 'alert' : undefined} aria-live="polite">{message}</p>
          <div className="ew-review-dock">
            <div className="ew-stage-actions"><button className="ew-link-button" type="button" disabled={busy} onClick={() => setStage('details')}>Edit details</button><button className="ew-button" type="button" disabled={busy} onClick={() => void confirmBooking()}>{busy ? 'Securing appointment…' : `Confirm · ${money(service.price_cents)}`}</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

export function ManagePanel({ initialAppointment, horizonDays = 30 }: { initialAppointment?: Appointment; horizonDays?: number }) {
  const [appointment, setAppointment] = useState<Appointment | undefined>(initialAppointment);
  const [message, setMessage] = useState(initialAppointment ? '' : 'Loading your appointment…');
  const [slot, setSlot] = useState<Slot>();
  const [busy, setBusy] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [availabilityNotice, setAvailabilityNotice] = useState('');
  const [messageKind, setMessageKind] = useState<'idle' | 'info' | 'success' | 'error'>(initialAppointment ? 'idle' : 'info');
  const mutationBusyRef = useRef(false);

  async function reschedule() {
    if (!slot || !appointment || appointment.status !== 'booked' || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setBusy(true);
    setMessageKind('info');
    setMessage('Moving your appointment…');
    try {
      setAppointment(await emmiwoodApi.reschedule({ date: slotDate(slot.start), start: slot.start, barberId: appointment.barber_id }));
      setSlot(undefined);
      setShowAvailability(false);
      setMessage('Appointment rescheduled.');
      setMessageKind('success');
    } catch (error) {
      if (error instanceof EmmiwoodApiError && error.code === 'slot_taken') {
        setSlot(undefined);
        setAvailabilityVersion((value) => value + 1);
        setAvailabilityNotice('That opening was just booked. Your current appointment is still reserved—choose another time.');
        setMessage('That opening was just booked. Your current appointment is still reserved.');
      } else {
        setMessage((error as Error).message);
      }
      setMessageKind('error');
    } finally {
      mutationBusyRef.current = false;
      setBusy(false);
    }
  }

  async function cancel() {
    if (!appointment || appointment.status !== 'booked' || mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setShowCancelDialog(false);
    setBusy(true);
    setMessageKind('info');
    setMessage('Cancelling your appointment…');
    try {
      await emmiwoodApi.cancel();
      setAppointment((current) => current ? { ...current, status: 'cancelled' } : current);
      setMessage('');
      setMessageKind('idle');
    } catch (error) {
      setMessage((error as Error).message);
      setMessageKind('error');
    } finally {
      mutationBusyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="ew-manage-panel" id="manage" aria-labelledby="manage-title">
      <span className="ew-eyebrow">Private appointment access</span>
      <h1 id="manage-title">Manage appointment.</h1>
      {!appointment && <div className="ew-empty" role="status"><p>{message}</p><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a></div>}
      {appointment && <>
        <div className={`ew-appointment-card${appointment.status === 'cancelled' ? ' is-cancelled' : ''}`}>
          <div><span className={`ew-status-pill ${appointment.status}`}>{appointment.status}</span><h2>{appointment.service_name}</h2><p>{prettyDateTime(appointment.start_at)} · {appointment.barber_name}</p></div>
          {appointment.price_cents != null && <strong>{money(appointment.price_cents)}</strong>}
        </div>
        {appointment.status === 'booked' && <div className="ew-manage-grid">
          <section><span className="ew-eyebrow">Reschedule</span><h3>Find another time.</h3><p className="ew-reschedule-copy">Compare nearby openings without giving up your current time—it stays reserved until a move succeeds.</p>{!showAvailability ? <button className="ew-button secondary" type="button" onClick={() => { setShowAvailability(true); setAvailabilityNotice(''); }}>Find another time</button> : <><AvailabilityBrowser key={availabilityVersion} serviceId={appointment.service_id} barberId={appointment.barber_id} horizonDays={horizonDays} selectedSlot={slot} onSelect={(nextSlot) => { setSlot(nextSlot); setAvailabilityNotice(''); }} onRefresh={() => setSlot(undefined)} onDateChange={() => setSlot(undefined)} notice={availabilityNotice} /><div className="ew-stage-actions"><button className="ew-link-button" type="button" disabled={busy} onClick={() => { setShowAvailability(false); setSlot(undefined); setAvailabilityNotice(''); }}>Keep current time</button><button className="ew-button" type="button" disabled={!slot || busy} onClick={() => void reschedule()}>{busy ? 'Moving appointment…' : slot ? `Move to ${prettyDateTime(slot.start)}` : 'Choose a new time'}</button></div></>}</section>
          <section className="ew-cancel-zone"><span className="ew-eyebrow">Cancel</span><h3>Release this chair time.</h3><p>Cancel anytime before your appointment starts so the chair frees up for the shop.</p><button className="ew-danger-button" type="button" disabled={busy} onClick={() => setShowCancelDialog(true)}>Cancel appointment</button></section>
        </div>}
        {appointment.status === 'cancelled' && <div className="ew-manage-cancelled" role="status">
          <p>This appointment is cancelled. The chair time is open again.</p>
          <div className="ew-actions"><a className="ew-button" href="/emmiwood/book">Book another appointment</a><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a></div>
        </div>}
        <p className={`ew-form-message${!(busy || message) ? ' is-empty' : ''}${messageKind === 'error' ? ' is-error' : ''}`} role={messageKind === 'error' ? 'alert' : 'status'} aria-live={messageKind === 'error' ? 'assertive' : 'polite'}>{message}</p>
        {showCancelDialog && <CancelAppointmentDialog appointment={appointment} busy={busy} onKeep={() => setShowCancelDialog(false)} onConfirm={() => void cancel()} />}
      </>}
    </section>
  );
}

function CancelAppointmentDialog({ appointment, busy, onKeep, onConfirm }: { appointment: Appointment; busy: boolean; onKeep: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    keepRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !returnFocus.matches(':disabled')) returnFocus.focus();
      });
    };
  }, []);

  return <dialog ref={dialogRef} className="ew-cancel-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ew-cancel-title" aria-describedby="ew-cancel-description" onCancel={(event) => { event.preventDefault(); if (!busy) onKeep(); }} onClose={() => { if (!busy) onKeep(); }}>
    <span className="ew-eyebrow">Confirm cancellation</span>
    <h2 id="ew-cancel-title">Release this appointment?</h2>
    <p id="ew-cancel-description">{appointment.service_name} with {appointment.barber_name} on {prettyDateTime(appointment.start_at)}. This action cannot be undone.</p>
    <div className="ew-stage-actions"><button ref={keepRef} className="ew-button secondary" type="button" disabled={busy} onClick={onKeep}>Keep appointment</button><button className="ew-danger-button" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Cancelling…' : 'Cancel appointment'}</button></div>
  </dialog>;
}
