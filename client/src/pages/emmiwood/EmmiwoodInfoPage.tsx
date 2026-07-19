import { EMMIWOOD_ADDRESS, EMMIWOOD_PHONE_LABEL } from './content';
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
    description: 'How Emmiwood Barbers uses booking and contact information.',
    eyebrow: 'Customer privacy',
    body: <>
      <p>Emmiwood collects the information needed to schedule and manage an appointment: your name, mobile number, optional email address, appointment details, and any notes you choose to provide.</p>
      <h2>How the information is used</h2><p>We use booking information to reserve chair time, contact you about the appointment, support cancellation or rescheduling, operate the shop calendar, prevent booking conflicts, and maintain an audit trail.</p>
      <h2>Appointment texts</h2><p>Texts are sent only when you opt in. Consent is not required to book. Reply STOP to opt out of applicable messages. Message and data rates may apply.</p>
      <h2>Access and retention</h2><p>Authorized Emmiwood staff and KUP support may access booking data only to operate or support the system. Data is retained for legitimate shop operations and support, then removed or minimized when it is no longer needed.</p>
      <h2>Contact</h2><p>Questions about your booking information can be directed to the shop at {EMMIWOOD_PHONE_LABEL}.</p>
    </>,
  },
  'sms-terms': {
    title: 'SMS Terms | Emmiwood Barbers',
    description: 'Terms for optional Emmiwood appointment confirmation and reminder texts.',
    eyebrow: 'Optional appointment texts',
    body: <>
      <p>When you select “Send me appointment texts,” you agree to receive transactional messages from Emmiwood Barbers about the appointment you are booking.</p>
      <h2>Message types</h2><p>Messages may include booking confirmation, appointment reminders, cancellation confirmation, or rescheduling confirmation.</p>
      <h2>Consent and cost</h2><p>Consent is optional and is not a condition of booking. Message frequency varies. Message and data rates may apply.</p>
      <h2>Opt out and help</h2><p>Reply STOP to opt out of applicable messages. Call {EMMIWOOD_PHONE_LABEL} for appointment help. Carrier delivery is not guaranteed.</p>
      <h2>Privacy</h2><p>See the Emmiwood privacy notice for how mobile numbers and booking details are used.</p>
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
    <header className="ew-app-header"><a className="ew-brand" href="/emmiwood"><span>E</span><strong>Emmiwood</strong></a><a className="ew-link" href="/emmiwood">Back to the shop</a></header>
    <main className="ew-info-page"><article><span className="ew-eyebrow">{copy.eyebrow}</span><h1>{copy.title.split(' | ')[0]}.</h1>{copy.body}</article></main>
  </div>;
}
