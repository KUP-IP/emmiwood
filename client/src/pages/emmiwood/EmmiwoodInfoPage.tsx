import { EMMIWOOD_ADDRESS, EMMIWOOD_PHONE_LABEL } from './content';
import { EmmiwoodAppHeader } from './EmmiwoodAppHeader';
import { EmmiwoodMeta } from './meta';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

type InfoKind = 'privacy' | 'sms-terms' | 'chair-rental';

const COPY: Record<InfoKind, { title: string; description: string; eyebrow: string; body: JSX.Element }> = {
  privacy: {
    title: 'Privacy | Emmiwood Barbers',
    description: 'How Emmiwood Barbers uses booking, mobile numbers, and optional appointment texts.',
    eyebrow: 'Customer privacy',
    body: <>
      <p>Emmiwood Barbers (“Emmiwood,” “we,” “us”) operates a booking website and optional appointment text program for the shop at {EMMIWOOD_ADDRESS}. This privacy notice explains what information we collect and how it is used for booking and messaging.</p>
      <h2>Information we collect</h2>
      <p>When you book or manage an appointment we may collect: your name, mobile phone number, appointment details (service, barber, date and time), optional notes you provide, SMS opt-in status if you choose appointment texts, and technical records needed to run the booking system (for example request logs and audit events).</p>
      <h2>How we use information</h2>
      <p>We use this information to schedule and manage appointments, prevent double-booking, send optional appointment texts you opt into, support cancellation or rescheduling, operate shop administration, and provide technical support for the booking system.</p>
      <h2>Mobile numbers and messaging consent</h2>
      <p><strong>We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.</strong> Mobile numbers and opt-in status are used only to operate Emmiwood appointment and staff-security messaging you request, and to support the booking system.</p>
      <p>Optional appointment texts are transactional only (for example confirmation, reminder, cancellation, or reschedule notices). Message frequency varies based on your appointments and updates (typically a small number of messages per booked appointment). <strong>Message and data rates may apply.</strong> Consent to texts is optional and is not required to complete a booking. You may reply <strong>STOP</strong> to opt out of applicable messages or <strong>HELP</strong> for help. Carrier delivery is not guaranteed.</p>
      <h2>Access and service providers</h2>
      <p>Authorized Emmiwood staff may access booking data to run the shop. KUP Solutions operates the booking technology as a service provider on Emmiwood’s behalf and may access data only to host, secure, and support the system. Infrastructure vendors (for example hosting and SMS delivery) process data only as needed to provide those services under this program—not for their own marketing.</p>
      <h2>Retention</h2>
      <p>Booking and messaging records are retained for legitimate shop operations, customer support, security, and legal requirements, then removed or minimized when no longer needed.</p>
      <h2>SMS terms</h2>
      <p>Program details for optional appointment texts are also described in our <a href="/emmiwood/sms-terms">SMS terms</a>.</p>
      <h2>Contact</h2>
      <p>Questions about privacy or your booking information: call the shop at {EMMIWOOD_PHONE_LABEL} or visit us at {EMMIWOOD_ADDRESS}.</p>
    </>,
  },
  'sms-terms': {
    title: 'SMS Terms | Emmiwood Barbers',
    description: 'Terms for optional Emmiwood appointment confirmation, reminder, and update texts.',
    eyebrow: 'Optional appointment texts',
    body: <>
      <p><strong>Program name:</strong> Emmiwood Barbers Appointment Texts. Operated for Emmiwood Barbers ({EMMIWOOD_ADDRESS}).</p>
      <p>When you select “Send me appointment texts” (or equivalent opt-in) on the booking website, you agree to receive transactional SMS messages from Emmiwood Barbers about the appointment you are booking or managing.</p>
      <h2>Message types and frequency</h2>
      <p>Messages may include booking confirmation, appointment reminders, cancellation confirmation, rescheduling confirmation, and related appointment updates. <strong>Message frequency varies</strong> (typically a small number of messages per appointment, plus updates if you change or cancel). Staff admin sign-in codes may be sent only to allowlisted shop administrators for portal security—not for marketing.</p>
      <h2>Consent and cost</h2>
      <p>Consent is optional and is <strong>not a condition of booking</strong>. <strong>Message and data rates may apply.</strong> Carrier delivery is not guaranteed.</p>
      <h2>Opt out and help</h2>
      <p>Reply <strong>STOP</strong> to opt out of applicable messages. Reply <strong>HELP</strong> for help, or call {EMMIWOOD_PHONE_LABEL} for appointment support.</p>
      <h2>Privacy</h2>
      <p>Mobile numbers and messaging consent are handled as described in our <a href="/emmiwood/privacy">privacy notice</a>. We do not share, sell, or provide mobile phone numbers or messaging consent data to third parties or affiliates for marketing or promotional purposes.</p>
    </>,
  },
  'chair-rental': {
    title: 'Chair Rental | Emmiwood Barbers',
    description: 'Ask about current chair-rental availability at Emmiwood Barbers in Sioux Falls.',
    eyebrow: 'For working barbers',
    body: <>
      <p>Emmiwood occasionally has room for a barber whose work, pace, and client care fit the shop.</p>
      <h2>Start with a conversation</h2><p>Current availability, terms, schedule, and fit are discussed directly. Bring examples of your work and a clear picture of the clientele you serve.</p>
      <h2>Contact</h2><p>Call {EMMIWOOD_PHONE_LABEL} and ask about chair-rental availability at {EMMIWOOD_ADDRESS}.</p>
      <p><a className="ew-button" href="tel:+16059006334">Call about chair rental</a></p>
    </>,
  },
};

export default function EmmiwoodInfoPage({ kind }: { kind: InfoKind }) {
  const copy = COPY[kind];
  return <div className="emmiwood ew-app-surface">
    <EmmiwoodMeta title={copy.title} description={copy.description} path={`/emmiwood/${kind}`} noindex={kind === 'chair-rental'} />
    <EmmiwoodAppHeader />
    <main className="ew-info-page"><article><span className="ew-eyebrow">{copy.eyebrow}</span><h1>{copy.title.split(' | ')[0]}.</h1>{copy.body}</article></main>
    <footer className="ew-app-footer"><span>1118 S Minnesota Ave · Sioux Falls</span><a href="tel:+16059006334">{EMMIWOOD_PHONE_LABEL}</a></footer>
  </div>;
}
