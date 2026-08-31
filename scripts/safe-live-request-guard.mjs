export const SAFE_LIVE_HTTP_METHODS = Object.freeze(['GET', 'HEAD', 'OPTIONS']);

export function validateSafeLiveOrigin(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error('safe-live lane requires a valid HTTPS origin'); }
  if (target.protocol !== 'https:' || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash) {
    throw new Error('safe-live lane requires an HTTPS origin without credentials, path, query, or fragment');
  }
  return target.origin;
}

export function assertSafeLiveMethod(method) {
  const normalized = method === undefined ? 'GET' : String(method).toUpperCase();
  if (!SAFE_LIVE_HTTP_METHODS.includes(normalized)) {
    throw new Error(`safe-live lane blocked mutating HTTP method ${normalized}`);
  }
  return normalized;
}

export function assertSafeLiveRequest(input, options = {}, baseURL) {
  const requestMethod = typeof input?.method === 'function' ? input.method() : undefined;
  assertSafeLiveMethod(options.method === undefined ? requestMethod : options.method);
  const rawURL = typeof input?.url === 'function' ? input.url() : input;
  let target;
  try { target = new URL(rawURL, baseURL); } catch { throw new Error('safe-live lane blocked an invalid request URL'); }
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('safe-live lane blocked a request without credential-free HTTPS');
  }
  return target.href;
}

export function assertSafeLiveResponse(status) {
  if (status >= 300 && status < 400 && status !== 304) {
    throw new Error('safe-live lane blocked automatic redirect; use the final HTTPS URL explicitly');
  }
}

export function guardApiRequestContext(request, baseURL) {
  if (baseURL !== undefined) baseURL = validateSafeLiveOrigin(baseURL);
  return new Proxy(request, {
    get(target, property, receiver) {
      if (typeof property === 'string' && ['delete', 'patch', 'post', 'put'].includes(property)) {
        return async () => {
          assertSafeLiveMethod(property);
        };
      }
      const value = Reflect.get(target, property, receiver);
      if (['fetch', 'get', 'head'].includes(property)) {
        return async (url, options = {}) => {
          // Validate explicit overrides too, even if Playwright would ignore them.
          assertSafeLiveRequest(url, options, baseURL);
          // Do not permit an automatic redirect to escape HTTPS validation.
          return value.call(target, url, { ...options, maxRedirects: 0 });
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

// A Page stores the same request object as its BrowserContext. Guard that
// object's methods in place so page.request and context.request cannot bypass
// the injected request fixture. Return a restoration function for teardown.
export function guardSharedApiRequestContext(request, baseURL) {
  const methods = ['delete', 'patch', 'post', 'put', 'get', 'head', 'fetch'];
  const proxy = guardApiRequestContext(request, baseURL);
  const originals = new Map(methods.map((method) => [method, Object.getOwnPropertyDescriptor(request, method)]));
  const wrappers = new Map(methods.map((method) => [method, proxy[method]]));
  for (const [method, wrapper] of wrappers) {
    Object.defineProperty(request, method, { value: wrapper, configurable: true, writable: false });
  }
  return () => {
    for (const [method, descriptor] of originals) {
      if (descriptor) Object.defineProperty(request, method, descriptor);
      else delete request[method];
    }
  };
}
