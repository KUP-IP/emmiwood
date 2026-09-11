import { EmmiwoodAppHeader } from './EmmiwoodAppHeader';
import { EmmiwoodMeta } from './meta';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './emmiwood.css';

export default function EmmiwoodNotFoundPage() {
  return (
    <div className="emmiwood ew-app-surface">
      <EmmiwoodMeta
        title="Page not found | Emmiwood Barbers"
        description="That page is not on the Emmiwood Barbers site."
        path="/emmiwood"
        noindex
      />
      <a className="ew-skip" href="#missing-page">Skip to content</a>
      <EmmiwoodAppHeader />
      <main id="missing-page" tabIndex={-1} className="ew-manage-page">
        <section className="ew-manage-panel" aria-labelledby="missing-page-title">
          <span className="ew-eyebrow">Missing page</span>
          <h1 id="missing-page-title">That page is not on the shop site.</h1>
          <p>The link may be old or mistyped. The shop home and the appointment book are still here.</p>
          <div className="ew-actions">
            <a className="ew-button" href="/emmiwood">Back to the shop</a>
            <a className="ew-button secondary" href="/emmiwood/book">Book an appointment</a>
          </div>
        </section>
      </main>
      <footer className="ew-app-footer">
        <span>1118 S Minnesota Ave · Sioux Falls</span>
        <a href="tel:+16059006334">(605) 900-6334</a>
      </footer>
    </div>
  );
}
