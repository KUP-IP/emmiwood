function normalizedSetting(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function bookingWriteState(env = {}) {
  const production = env.ENVIRONMENT === 'production';
  const configured = normalizedSetting(env.EMMIWOOD_BOOKING_WRITES_ENABLED);

  if (!configured) {
    return {
      enabled: !production,
      configured: false,
      valid: !production,
    };
  }

  if (configured === 'true' || configured === 'false') {
    return {
      enabled: configured === 'true',
      configured: true,
      valid: true,
    };
  }

  return {
    enabled: false,
    configured: true,
    valid: false,
  };
}

export function publicOriginState(env = {}) {
  const value = String(env.EMMIWOOD_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  let valid = false;
  try {
    const url = new URL(value);
    valid = url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === '';
  } catch {
    valid = false;
  }
  return { configured: Boolean(value), valid, value };
}

export function runtimeReadiness(env = {}) {
  const production = env.ENVIRONMENT === 'production';
  const bookingWrites = bookingWriteState(env);
  const publicOrigin = publicOriginState(env);
  const releaseValue = String(env.EMMIWOOD_RELEASE_SHA || '').trim().toLowerCase();
  const release = {
    configured: Boolean(releaseValue),
    valid: /^[0-9a-f]{40}$/.test(releaseValue),
    value: releaseValue,
  };
  return {
    ready: production
      ? bookingWrites.configured && bookingWrites.valid && publicOrigin.valid && release.valid
      : true,
    bookingWrites,
    publicOrigin,
    release,
  };
}
