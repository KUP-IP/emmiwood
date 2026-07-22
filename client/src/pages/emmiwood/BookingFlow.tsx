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
import { EMMIWOOD_CONSENT_VERSION, EMMIWOOD_PHONE_LABEL, money } from './content';
import type { Appointment, Catalog, Slot } from './types';

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

  const service = catalog.services.find((item) => item.id === serviceId);
  const eligibleBarbers = useMemo(() => {
    const ids = new Set(catalog.eligibility.filter((item) => item.service_id === serviceId).map((item) => item.barber_id));
    return catalog.barbers.filter((barber) => ids.has(barber.id));
  }, [catalog, serviceId]);
  const barberName = barberId === 'first' ? 'First available' : catalog.barbers.find((barber) => barber.id === barberId)?.name || 'Selected barber';

  useEffect(() => {
    if (barberId !== 'first' && !eligibleBarbers.some((barber) => barber.id === barberId)) setBarberId('first');
  }, [barberId, eligibleBarbers]);

  useEffect(() => {
    if (stage === 'confirmed') return;
    const frame = requestAnimationFrame(() => {
      // focusVisible:false keeps the a11y focus target without a persistent clay ring after stage changes
      stageHeadingRef.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [stage]);

  function continueFromChoose() {
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
    if (!slot || !service) return;
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
      setBusy(false);
    }
  }

  if (stage === 'confirmed' && confirmation) {
    return (
      <section className="ew-confirmation" aria-labelledby="ew-confirmed-title" role="status">
        <div className="ew-confirmation-mark" aria-hidden="true">✓</div>
        <span className="ew-eyebrow">Appointment confirmed</span>
        <h1 id="ew-confirmed-title">You’re on the books.</h1>
        <div className="ew-confirmation-when" aria-label="Appointment time">
          <span className="ew-eyebrow">When</span>
          <strong>{prettyDateTime(confirmation.start)}</strong>
          <small>{confirmation.barberName} · {confirmation.serviceName}</small>
        </div>
        <dl className="ew-receipt">
          <div><dt>Service</dt><dd>{confirmation.serviceName}</dd></div>
          <div><dt>Barber</dt><dd>{confirmation.barberName}</dd></div>
        </dl>
        <p className="ew-confirmation-lead">{details.smsConsent ? 'Your appointment text is queued. Keep the private link below for changes.' : 'Save the private link below if you need to reschedule or cancel.'}</p>
        <div className="ew-actions ew-confirmation-actions">
          <a className="ew-button" href={`/emmiwood/manage#token=${encodeURIComponent(confirmation.manageToken)}`}>Manage appointment</a>
          <a className="ew-link" href="/emmiwood">Back to the shop</a>
        </div>
      </section>
    );
  }

  return (
    <section className="ew-booking-shell" aria-labelledby="booking-title">
      <header className="ew-booking-header">
        <div><span className="ew-eyebrow">Appointments</span><h1 id="booking-title">Book your appointment.</h1></div>
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
          <div className="ew-stage-heading"><span>01</span><div><h2 ref={stageHeadingRef} tabIndex={-1}>Start with the work.</h2><p>Pick a service—barber is optional.</p></div></div>
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
              <label className={barberId === 'first' ? 'selected' : ''}><input type="radio" name="barber" value="first" checked={barberId === 'first'} onChange={() => { setBarberId('first'); setSlot(undefined); }} /><span><strong>First available</strong><small>Barro or John may be assigned to get you in sooner.</small></span></label>
              {eligibleBarbers.map((barber) => <label key={barber.id} className={barberId === barber.id ? 'selected' : ''}>
                <input type="radio" name="barber" value={barber.id} checked={barberId === barber.id} onChange={() => { setBarberId(barber.id); setSlot(undefined); }} />
                <span className="ew-booking-barber-option">
                  {barber.id === 'barro'
                    ? <img className="ew-booking-barber-photo" src="/emmiwood/barro-profile.webp" width="64" height="64" loading="lazy" decoding="async" alt="" />
                    : <i className="ew-booking-barber-initial" aria-hidden="true">{barber.name.slice(0, 1)}</i>}
                  <span className="ew-booking-barber-copy"><strong>{barber.name}</strong><small>{barber.bio}</small></span>
                </span>
              </label>)}
            </fieldset>
          )}
          {!barberStepOpen && (
            <button className="ew-barber-reveal" type="button" onClick={() => setBarberStepOpen(true)}>
              Choose a barber <span>optional</span>
            </button>
          )}
          <div className="ew-choose-dock">
            <div className="ew-booking-context" aria-label="Current booking selection"><span><small>Service</small><strong>{service?.name}</strong></span><span><small>Barber</small><strong>{barberName}</strong></span><span><small>Total</small><strong>{service ? `${service.duration_minutes} min · ${money(service.price_cents)}` : ''}</strong></span></div>
            <div className="ew-stage-actions"><button className="ew-button" type="button" onClick={continueFromChoose}>Find openings</button></div>
          </div>
        </div>
      )}

      {stage === 'time' && service && (
        <div className="ew-book-stage" data-stage="time">
          <div className="ew-stage-heading"><span>02</span><div><h2 ref={stageHeadingRef} tabIndex={-1}>Choose the time.</h2><p>Compare labeled days, then choose a morning, afternoon, or evening opening.</p></div></div>
          <div className="ew-booking-context ew-booking-context-sticky" aria-label="Current booking selection"><span><small>Service</small><strong>{service.name}</strong></span><span><small>Barber</small><strong>{barberName}</strong></span><span><small>Total</small><strong>{service.duration_minutes} min · {money(service.price_cents)}</strong></span></div>
          <AvailabilityBrowser
            serviceId={serviceId}
            barberId={barberId}
            horizonDays={catalog.shop.horizon_days}
            selectedSlot={slot}
            onSelect={chooseSlot}
            onDateChange={setDate}
            notice={availabilityNotice}
          />
          <div className="ew-time-dock">
            {slot && <div className="ew-selected-slot ew-selected-slot-dock" role="status"><span>Selected</span><strong>{prettyTime(slot.start)}</strong><small>{slot.barberName}</small></div>}
            <div className="ew-stage-actions ew-time-actions"><button className="ew-link-button" type="button" onClick={() => setStage('choose')}>Back</button><button className="ew-button" disabled={!slot} type="button" onClick={() => setStage('details')}>Continue with {slot ? prettyTime(slot.start) : 'a time'}</button></div>
          </div>
        </div>
      )}

      {stage === 'details' && slot && (
        <form className="ew-book-stage" data-stage="details" noValidate onSubmit={continueFromDetails}>
          <div className="ew-stage-heading"><span>03</span><div><h2 ref={stageHeadingRef} tabIndex={-1}>Who should we expect?</h2><p>{prettyDateTime(slot.start)} with {slot.barberName}.</p></div></div>
          <div className="ew-booking-context ew-details-context" aria-label="Selected appointment"><span><small>When</small><strong>{prettyDateTime(slot.start)}</strong></span><span><small>Barber</small><strong>{slot.barberName}</strong></span><span><small>Service</small><strong>{service?.name}</strong></span></div>
          <div className="ew-field-grid">
            <label>Name<input id="ew-guest-name" ref={nameInputRef} autoComplete="name" value={details.name} onChange={(event) => { setDetails({ ...details, name: event.target.value }); if (message) setMessage(''); }} aria-invalid={message === 'Enter your name.' ? true : undefined} aria-describedby={message === 'Enter your name.' ? 'ew-details-message' : undefined} required /></label>
            <label>Mobile<input id="ew-guest-phone" ref={phoneInputRef} type="tel" inputMode="tel" autoComplete="tel" placeholder="(605) 555-0123" aria-describedby={message === 'Enter a valid 10-digit mobile number.' ? 'ew-details-message ew-mobile-help' : 'ew-mobile-help'} aria-invalid={message === 'Enter a valid 10-digit mobile number.' ? true : undefined} value={details.phone} onChange={(event) => { setDetails({ ...details, phone: event.target.value }); if (message) setMessage(''); }} onBlur={() => setDetails((current) => ({ ...current, phone: formatUsPhone(current.phone) }))} required /><small id="ew-mobile-help" className="ew-field-help">Required so the shop can contact you about this appointment. Marketing texts are not sent.</small></label>
            <label className="wide">Notes <small>optional</small><textarea rows={3} value={details.notes} onChange={(event) => setDetails({ ...details, notes: event.target.value })} placeholder="Hair goals, accessibility needs, or anything the barber should know." /></label>
          </div>
          <label className="ew-consent"><input type="checkbox" checked={details.smsConsent} onChange={(event) => setDetails({ ...details, smsConsent: event.target.checked })} /><span><strong>Send me appointment texts.</strong> I agree to receive confirmation and reminder messages from Emmiwood. Message and data rates may apply. Reply STOP to opt out. <a href="/emmiwood/sms-terms" target="_blank">SMS terms</a> · <a href="/emmiwood/privacy" target="_blank">Privacy</a></span></label>
          <p id="ew-details-message" className={`ew-form-message${message ? ' is-error' : ' is-empty'}`} role={message ? 'alert' : undefined} aria-live="polite">{message}</p>
          <div className="ew-stage-actions"><button className="ew-link-button" type="button" onClick={() => setStage('time')}>Back</button><button className="ew-button" type="submit">Review appointment</button></div>
        </form>
      )}

      {stage === 'review' && slot && service && (
        <div className="ew-book-stage" data-stage="review">
          <div className="ew-stage-heading"><span>04</span><div><h2 ref={stageHeadingRef} tabIndex={-1}>Review before we reserve it.</h2><p>The opening is not held until you confirm.</p></div></div>
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
          <div className="ew-policy-note"><strong>Change policy</strong><p>Online cancellation and rescheduling close 12 hours before the appointment. Inside that window, call the shop.</p></div>
          <p className={`ew-form-message${message ? (busy || message.startsWith('Securing') ? '' : ' is-error') : ' is-empty'}`} role={message && !busy ? 'alert' : undefined} aria-live="polite">{message}</p>
          <div className="ew-review-dock">
            <div className="ew-stage-actions"><button className="ew-link-button" type="button" onClick={() => setStage('details')}>Edit details</button><button className="ew-button" type="button" disabled={busy} onClick={() => void confirmBooking()}>{busy ? 'Securing appointment…' : `Confirm · ${money(service.price_cents)}`}</button></div>
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

  async function reschedule() {
    if (!slot || !appointment) return;
    setBusy(true);
    try {
      setAppointment(await emmiwoodApi.reschedule({ date: slotDate(slot.start), start: slot.start, barberId: appointment.barber_id }));
      setSlot(undefined);
      setShowAvailability(false);
      setMessage('Appointment rescheduled.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm('Cancel this appointment?')) return;
    setBusy(true);
    try {
      await emmiwoodApi.cancel();
      setAppointment((current) => current ? { ...current, status: 'cancelled' } : current);
      setMessage('Appointment cancelled.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
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
          <section><span className="ew-eyebrow">Reschedule</span><h3>Find another time.</h3><p className="ew-reschedule-copy">Compare nearby openings without giving up your current time—it stays reserved until a move succeeds.</p>{!showAvailability ? <button className="ew-button secondary" type="button" onClick={() => setShowAvailability(true)}>Find another time</button> : <><AvailabilityBrowser serviceId={appointment.service_id} barberId={appointment.barber_id} horizonDays={horizonDays} selectedSlot={slot} onSelect={(nextSlot) => setSlot(nextSlot)} /><div className="ew-stage-actions"><button className="ew-link-button" type="button" onClick={() => { setShowAvailability(false); setSlot(undefined); }}>Keep current time</button><button className="ew-button" type="button" disabled={!slot || busy} onClick={() => void reschedule()}>{slot ? `Move to ${prettyDateTime(slot.start)}` : 'Choose a new time'}</button></div></>}</section>
          <section className="ew-cancel-zone"><span className="ew-eyebrow">Cancel</span><h3>Release this chair time.</h3><p>Online changes close 12 hours before the start. Inside that window, call the shop.</p><button className="ew-danger-button" type="button" onClick={() => void cancel()}>Cancel appointment</button></section>
        </div>}
        {appointment.status === 'cancelled' && <div className="ew-manage-cancelled" role="status">
          <p>This appointment is cancelled. The chair time is open again.</p>
          <div className="ew-actions"><a className="ew-button" href="/emmiwood/book">Book another appointment</a><a className="ew-link" href="tel:+16059006334">Call {EMMIWOOD_PHONE_LABEL}</a></div>
        </div>}
        <p className={`ew-form-message${!(busy || message) ? ' is-empty' : ''}`} aria-live="polite">{busy ? 'Working…' : message}</p>
      </>}
    </section>
  );
}
