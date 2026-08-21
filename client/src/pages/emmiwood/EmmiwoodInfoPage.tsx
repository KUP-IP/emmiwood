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
    description: 'How Emmiwood Barbers uses booking information. Appointment texts are sent by KUP Solutions.',
    eyebrow: 'Customer privacy',
    body: <>
      <p>Emmiwood Barbers (“Emmiwood,” “we,” “us”) operates the shop booking website at {EMMIWOOD_ADDRESS}. This notice explains booking information collected on this website.</p>
      <h2>Information we collect</h2>
      <p>When you book or manage an appointment we may collect: your name, mobile phone number, appointment details (service, barber, date and time), optional notes you provide, SMS opt-in status if you choose appointment texts, and technical records needed to run the booking system (for example request logs and audit events).</p>
      <h2>How we use information</h2>
      <p>We use this information to schedule and manage appointments, prevent double-booking, support cancellation or rescheduling, operate shop administration, and provide technical support for the booking system.</p>
      <h2>Appointment texts</h2>
      <p>Optional appointment confirmation and reminder texts are sent by <strong>KUP Solutions</strong>, not by Emmiwood Barbers as a separate messaging brand. Program details: <a href="https://kup.solutions/sms/privacy" target="_blank" rel="noreferrer">SMS privacy</a> · <a href="https://kup.solutions/sms/terms" target="_blank" rel="noreferrer">SMS terms</a>.</p>
      <p>We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes. Consent is optional and is not required to complete a booking.</p>
      <h2>Access</h2>
      <p>Authorized Emmiwood staff may access booking data to run the shop. KUP Solutions hosts the booking technology and sends opted-in appointment texts.</p>
      <h2>Contact</h2>
      <p>Questions about a booking: call the shop at {EMMIWOOD_PHONE_LABEL}. Questions about appointment texts: <a href="mailto:isaiah@kup.solutions">isaiah@kup.solutions</a>.</p>
    </>,
  },
  'sms-terms': {
    title: 'SMS Terms | Emmiwood Barbers',
    description: 'Appointment texts for this booking site are sent by KUP Solutions.',
    eyebrow: 'Optional appointment texts',
    body: <>
      <p>This booking website does not operate a separate Emmiwood Barbers text program. Optional appointment texts are sent by <strong>KUP Solutions</strong>.</p>
      <p>When you select “Send me appointment texts” on this site, you agree to receive transactional SMS messages from KUP Solutions about the appointment you are booking or managing.</p>
      <p><strong>We do not share, sell, or provide mobile phone numbers or messaging consent data to third parties or affiliates for marketing or promotional purposes</strong> under the KUP Solutions appointment-text program.</p>
      <p><a href="https://kup.solutions/sms" target="_blank" rel="noreferrer">Program</a> · <a href="https://kup.solutions/sms/terms" target="_blank" rel="noreferrer">SMS terms</a> · <a href="https://kup.solutions/sms/privacy" target="_blank" rel="noreferrer">SMS privacy</a></p>
      <p>Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for help.</p>
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
