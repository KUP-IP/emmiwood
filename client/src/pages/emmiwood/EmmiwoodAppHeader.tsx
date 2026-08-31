export function EmmiwoodBrand({ label = 'Emmiwood' }: { label?: string }) {
  return <><span aria-hidden="true"><img src="/emmiwood/brand/ewb-app-icon-192.png" width="42" height="42" alt="" /></span><strong>{label}</strong></>;
}

export function EmmiwoodAppHeader() {
  return (
    <header className="ew-app-header">
      <a className="ew-brand" href="/emmiwood" aria-label="Emmiwood home"><EmmiwoodBrand /></a>
      <a className="ew-link ew-back-link" href="/emmiwood">Back to the shop</a>
    </header>
  );
}
