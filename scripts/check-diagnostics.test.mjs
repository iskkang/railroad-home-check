import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const requests = app.slice(app.indexOf('async function withRequestTimeout('), app.indexOf('function setLoading('));
function runtime(fetcher) {
  const timers = new Set();
  const c = { AbortController, fetch: fetcher, Date, window: {}, console: { error() {} },
    setTimeout(fn, ms) { const t = setTimeout(fn, ms); timers.add(t); return t; },
    clearTimeout(t) { timers.delete(t); clearTimeout(t); } };
  vm.createContext(c);
  vm.runInContext(requests, c);
  return { c, timers };
}

test('JSON requests work without AbortSignal.timeout/any and clean up their timer', async () => {
  const { c, timers } = runtime(async () => Response.json({ ok: true }));
  assert.equal(c.AbortSignal, undefined);
  assert.equal((await c.fetchJSON('/api/geocode')).ok, true);
  assert.equal(timers.size, 0);
});
test('deadline covers a stalled response body even when fetch ignores abort', async () => {
  const { c, timers } = runtime(async () => ({ ok: true, json: () => new Promise(() => {}) }));
  await assert.rejects(c.fetchJSON('/api/geocode', {}, 5), e => e.checkCode === 'REQUEST_TIMEOUT');
  assert.equal(timers.size, 0);
});
test('caller cancellation works without static AbortSignal methods and removes its listener', async () => {
  let calls = 0, removed = 0, listener;
  const external = { aborted: false, addEventListener(_, f) { listener = f; }, removeEventListener(_, f) { assert.equal(f, listener); removed++; } };
  const { c, timers } = runtime(() => { calls++; return new Promise(() => {}); });
  const pending = c.fetchJSON('/api/nearby', { signal: external });
  await Promise.resolve();
  listener();
  await assert.rejects(pending, e => e.checkCode === 'REQUEST_ABORTED');
  assert.equal(calls, 1); assert.equal(removed, 1); assert.equal(timers.size, 0);
});
test('an already cancelled request never reaches the provider', async () => {
  const { c } = runtime(() => { throw Error('must not run'); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(c.fetchJSON('/api/nearby', { signal: controller.signal }), e => e.checkCode === 'REQUEST_ABORTED');
});
test('HTTP, invalid JSON and network errors have bounded diagnostic codes', async () => {
  for (const [fetcher, expected] of [
    [async () => Response.json({ error: 'Private address 123 Secret St' }, { status: 429 }), 'HTTP_429'],
    [async () => new Response('invalid JSON'), 'INVALID_JSON'],
    [async () => { throw new TypeError('fetch https://provider/?address=123 Secret St'); }, 'NETWORK_ERROR']
  ]) {
    const { c, timers } = runtime(fetcher);
    await assert.rejects(c.fetchJSON('/api/geocode'), e => c.checkFailureDiagnostics(e, 'geocode', 12).error_code === expected);
    assert.equal(timers.size, 0);
  }
});
test('failure analytics allow only code, stage and duration, never raw error or address', () => {
  const events = [], guide = [];
  const { c } = runtime(); c.window.gtag = (...args) => events.push(args);
  c.GuideJourney = { track: (...args) => guide.push(args) };
  c.trackEvent('property_check_failed', { error_code: '123 Secret St', failure_stage: '/api/geocode?address=secret', duration_ms: -8, address: 'secret', message: 'secret', lat: 33 });
  const params = events[0][2];
  assert.deepEqual(JSON.parse(JSON.stringify(params)), { error_code: 'UNEXPECTED_ERROR', failure_stage: 'unknown', duration_ms: 0 });
  assert.equal(JSON.stringify([events, guide]).includes('secret'), false);
  c.window.gtag = () => { throw Error('analytics unavailable'); };
  c.GuideJourney.track = () => { throw Error('attribution unavailable'); };
  assert.doesNotThrow(() => c.trackEvent('property_check_completed'));
});
test('actual submit handler records the stage where the check failed', async () => {
  for (const stage of ['geocode', 'crossings', 'render']) {
    const events = []; let submit;
    const { c } = runtime(async url => {
      if ((stage === 'geocode' && url === '/api/geocode') || (stage === 'crossings' && url.startsWith('/api/crossings'))) return Response.json({error: 'Secret street address'}, {status: 503});
      return Response.json({lat: 33, lon: -117, matchedAddress: '123 Secret St'});
    });
    Object.assign(c, { form: { addEventListener(_, f) { submit = f; } }, button: { disabled: false },
      addressInput: { value: '123 Secret St' }, chosenLocation: null, currentReport: null,
      results: { classList: { add() {}, remove() {} }, scrollIntoView() {} },
      cancelSuggestions() {}, validSelectedPoint() { return false; }, streetKey(v) { return v; },
      setStatus() {}, setError() {}, setLoading(v) { c.button.disabled = v; },
      renderReport() { if (stage === 'render') throw new Error('Secret street address'); },
      statusBox: { classList: { add() {} } }, $() { return { click() {} }; } });
    c.window.gtag = (...args) => events.push(args);
    vm.runInContext(app.slice(app.indexOf("form.addEventListener('submit'"), app.indexOf('function streetKey(')), c);
    await submit({ preventDefault() {} });
    const failed = events.find(e => e[1] === 'property_check_failed');
    assert.equal(failed[2].failure_stage, stage);
    assert.equal(failed[2].error_code, stage === 'render' ? 'RENDER_ERROR' : 'HTTP_503');
    assert.equal(events.some(e => e[1] === 'property_check_completed'), false);
    assert.equal(JSON.stringify(events).includes('Secret'), false);
    assert.equal(c.button.disabled, false);
    c.button.disabled = true; const count = events.length;
    await submit({ preventDefault() {} }); assert.equal(events.length, count);
  }
});
test('all home browser request paths avoid unsupported static timeout helpers', () => {
  assert.doesNotMatch(app, /AbortSignal\.(timeout|any)\(/);
  const glance = readFileSync(new URL('../report-glance.js', import.meta.url), 'utf8');
  assert.doesNotMatch(glance, /AbortSignal\.(timeout|any)\(/);
});
