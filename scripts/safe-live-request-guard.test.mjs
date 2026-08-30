import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeLiveMethod, assertSafeLiveRequest, assertSafeLiveResponse, guardApiRequestContext, guardSharedApiRequestContext, validateSafeLiveOrigin } from './safe-live-request-guard.mjs';

test('safe-live direct request guard permits reads and rejects every mutation without network access', async () => {
  const calls = [];
  const request = guardApiRequestContext({
    async get(url) { calls.push(['GET', url]); return 'get'; },
    async head(url) { calls.push(['HEAD', url]); return 'head'; },
    async fetch(url, options = {}) { calls.push([String(options.method || 'GET').toUpperCase(), url]); return 'fetch'; },
  });

  assert.equal(await request.get('https://example.invalid/get'), 'get');
  assert.equal(await request.head('https://example.invalid/head'), 'head');
  assert.equal(await request.fetch('https://example.invalid/fetch'), 'fetch');
  assert.equal(await request.fetch('https://example.invalid/options', { method: 'OPTIONS' }), 'fetch');

  for (const method of ['delete', 'patch', 'post', 'put']) {
    await assert.rejects(request[method]('https://example.invalid/blocked'), new RegExp(`blocked mutating HTTP method ${method.toUpperCase()}`));
  }
  await assert.rejects(
    request.fetch('https://example.invalid/blocked', { method: 'POST' }),
    /blocked mutating HTTP method POST/,
  );
  assert.deepEqual(calls, [
    ['GET', 'https://example.invalid/get'],
    ['HEAD', 'https://example.invalid/head'],
    ['GET', 'https://example.invalid/fetch'],
    ['OPTIONS', 'https://example.invalid/options'],
  ]);
});

test('origin validation fails closed before network access', () => {
  for (const value of [undefined, '', '/relative', 'http://example.com', 'file:///tmp/a', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?q=1', 'https://example.com/#x']) {
    assert.throws(() => validateSafeLiveOrigin(value), /HTTPS origin/);
  }
  assert.equal(validateSafeLiveOrigin('https://www.emmiwood.com/'), 'https://www.emmiwood.com');
});

test('browser redirect responses cannot escape HTTPS validation through an automatic redirect chain', () => {
  for (const status of [300, 301, 302, 303, 305, 306, 307, 308, 399]) assert.throws(() => assertSafeLiveResponse(status), /blocked automatic redirect/);
  for (const status of [200, 204, 304, 404, 503]) assert.doesNotThrow(() => assertSafeLiveResponse(status));
});

test('browser method and URL guard rejects every non-read method and insecure request', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'CONNECT', 'TRACE', 'CUSTOM', '', null, ' GET ']) {
    assert.throws(() => assertSafeLiveMethod(method), /blocked mutating HTTP method/);
    assert.throws(() => assertSafeLiveRequest({ method: () => method, url: () => 'https://example.invalid/' }), /blocked mutating HTTP method/);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) assert.doesNotThrow(() => assertSafeLiveMethod(method));
  for (const url of ['http://example.invalid', 'https://user@example.invalid', 'data:text/plain,hello', '/missing-origin']) {
    assert.throws(() => assertSafeLiveRequest(url), /safe-live lane blocked/);
  }
  assert.equal(assertSafeLiveRequest('/api/catalog', {}, 'https://example.invalid'), 'https://example.invalid/api/catalog');
});

test('direct requests reject Request-object mutations and read-method overrides without calling transport', async () => {
  const calls = [];
  const request = guardApiRequestContext(Object.fromEntries(['get', 'head', 'fetch'].map((method) => [method, async (...args) => calls.push([method, ...args])])), 'https://example.invalid');
  for (const method of ['get', 'head', 'fetch']) {
    await assert.rejects(request[method]('/blocked', { method: 'POST' }), /blocked mutating/);
    await assert.rejects(request[method]('http://example.invalid'), /credential-free HTTPS/);
  }
  await assert.rejects(request.fetch({ url: () => 'https://example.invalid', method: () => 'DELETE' }), /blocked mutating/);
  assert.deepEqual(calls, []);
  await request.get('/read', { maxRedirects: 10 });
  await request.fetch({ url: () => 'https://example.invalid/read', method: () => 'HEAD' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].maxRedirects, 0);
  assert.equal(calls[1][2].maxRedirects, 0);
});

test('shared context/page request guards close direct escapes and restore original methods', async () => {
  const calls = [];
  class RequestContext {
    async fetch(url, options = {}) { calls.push([url, options]); }
    async get(url, options = {}) { return this.fetch(url, { ...options, method: 'GET' }); }
    async post(url, options = {}) { return this.fetch(url, { ...options, method: 'POST' }); }
  }
  const context = { request: new RequestContext() };
  const page = { request: context.request };
  const originalFetch = context.request.fetch;
  const restore = guardSharedApiRequestContext(context.request, 'https://example.invalid');
  for (const request of [context.request, page.request]) {
    await assert.rejects(request.post('/blocked'), /blocked mutating/);
    await assert.rejects(request.fetch('/blocked', { method: 'DELETE' }), /blocked mutating/);
    await assert.rejects(request.get('http://example.invalid'), /credential-free HTTPS/);
  }
  assert.equal(calls.length, 0);
  await page.request.get('/read');
  assert.deepEqual(calls, [['/read', { method: 'GET', maxRedirects: 0 }]]);
  restore();
  assert.equal(context.request.fetch, originalFetch);
  assert.equal(Object.hasOwn(context.request, 'fetch'), false);
  assert.equal(Object.hasOwn(context.request, 'delete'), false);
});
