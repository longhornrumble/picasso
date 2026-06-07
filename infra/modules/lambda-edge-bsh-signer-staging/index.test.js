'use strict';
// Unit tests for the BSH Lambda@Edge SigV4 signer (Remedy A #435 hardening).
// Run: node --test infra/modules/lambda-edge-bsh-signer-staging/index.test.js
// The test file lives at the MODULE ROOT (not src/) so Terraform's archive_file
// (source_dir = src/) does NOT bundle it into the deployed Lambda zip.
const test = require('node:test');
const assert = require('node:assert');
const { handler, signedHeaders, canonicalizeQuery } = require('./src/index.js');

function setCreds() {
  process.env.AWS_ACCESS_KEY_ID = 'AKIDEXAMPLE';
  process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  delete process.env.AWS_SESSION_TOKEN;
}

function makeEvent(requestOverrides = {}) {
  return {
    Records: [{ cf: { request: {
      method: 'POST',
      uri: '/stream',
      querystring: '',
      headers: {},
      origin: { custom: { domainName: 'abc.lambda-url.us-east-1.on.aws' } },
      body: { action: 'read-only', data: Buffer.from('{"x":1}').toString('base64'), encoding: 'base64', inputTruncated: false },
      ...requestOverrides,
    } } }],
  };
}

// --- handler behavior ---

test('happy path: signs and sets authorization + host headers', async () => {
  setCreds();
  const out = await handler(makeEvent());
  assert.strictEqual(out.status, undefined, 'returns the request, not a short-circuit response');
  assert.ok(out.headers.authorization, 'authorization header set');
  assert.match(out.headers.authorization[0].value, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.ok(out.headers['x-amz-date'], 'x-amz-date set');
  assert.ok(out.headers['x-amz-content-sha256'], 'x-amz-content-sha256 set');
  assert.strictEqual(out.headers.host[0].value, 'abc.lambda-url.us-east-1.on.aws');
});

test('action=read-only alone is NOT treated as truncation (would otherwise 413 ALL traffic)', async () => {
  setCreds();
  const out = await handler(makeEvent({ body: { action: 'read-only', data: 'e30=', encoding: 'base64', inputTruncated: false } }));
  assert.strictEqual(out.status, undefined);
  assert.ok(out.headers.authorization, 'normal read-only request is signed, not rejected');
});

test('inputTruncated body → 413 (clean) instead of a mis-signed 403', async () => {
  setCreds();
  const out = await handler(makeEvent({ body: { action: 'read-only', data: 'big', encoding: 'text', inputTruncated: true } }));
  assert.strictEqual(out.status, '413');
  assert.strictEqual(out.statusDescription, 'Payload Too Large');
});

test('handler error → 502, and the secret key is never logged', async () => {
  setCreds();
  const ev = makeEvent();
  delete ev.Records[0].cf.request.origin; // accessing .origin.custom now throws → caught
  const logs = [];
  const orig = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const out = await handler(ev);
    assert.strictEqual(out.status, '502');
    assert.ok(logs.length > 0, 'the failure is logged for edge-region debugging');
    assert.ok(!logs.join(' ').includes(process.env.AWS_SECRET_ACCESS_KEY), 'secret key must not appear in logs');
  } finally {
    console.error = orig;
  }
});

test('GET with no body still signs (empty payload hash)', async () => {
  setCreds();
  const out = await handler(makeEvent({ method: 'GET', body: undefined }));
  assert.strictEqual(out.status, undefined);
  assert.ok(out.headers.authorization);
});

// --- canonicalizeQuery: the fixed parse ---

test('query value containing "=" is kept whole (split on first "=" only)', () => {
  // base64 padding '=' in the value must NOT truncate at the '='
  assert.strictEqual(canonicalizeQuery('token=YWJjPT0='), 'token=YWJjPT0%3D');
});

test('keys/values are RFC3986 percent-encoded and sorted by encoded key', () => {
  assert.strictEqual(canonicalizeQuery('b=2&a=hello world'), 'a=hello%20world&b=2');
});

test('RFC3986 encodes the chars encodeURIComponent leaves raw (!*\'())', () => {
  assert.strictEqual(canonicalizeQuery("x=a!b'c(d)e*f"), 'x=a%21b%27c%28d%29e%2Af');
});

test('flag without value canonicalizes to key=', () => {
  assert.strictEqual(canonicalizeQuery('flag'), 'flag=');
});

test('empty / undefined query → empty canonical string', () => {
  assert.strictEqual(canonicalizeQuery(''), '');
  assert.strictEqual(canonicalizeQuery(undefined), '');
});

// --- signedHeaders determinism (golden) ---

test('signedHeaders is deterministic for fixed time/creds/body', () => {
  const now = new Date('2026-06-06T12:00:00.000Z');
  const args = { method: 'POST', host: 'h', path: '/stream', query: '', body: Buffer.from('{}'), accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', now };
  const h1 = signedHeaders(args);
  const h2 = signedHeaders(args);
  assert.strictEqual(h1.authorization, h2.authorization);
  assert.strictEqual(h1['x-amz-date'], '20260606T120000Z');
});

test('a different body produces a different signature (body IS signed)', () => {
  const now = new Date('2026-06-06T12:00:00.000Z');
  const base = { method: 'POST', host: 'h', path: '/stream', query: '', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret', now };
  const a = signedHeaders({ ...base, body: Buffer.from('{"a":1}') });
  const b = signedHeaders({ ...base, body: Buffer.from('{"a":2}') });
  assert.notStrictEqual(a.authorization, b.authorization);
  assert.notStrictEqual(a['x-amz-content-sha256'], b['x-amz-content-sha256']);
});
