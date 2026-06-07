'use strict';
// Remedy A (#435) — origin-request Lambda@Edge SigV4 signer for the BSH
// streaming Function URL. Signs each request (service=lambda) including the POST
// body hash, using the execution role's creds (from the runtime env), so the
// Function URL can enforce authorization_type=AWS_IAM. Self-contained (node:crypto,
// no SDK bundling). Closes the #435 public bypass at the IAM layer.
const crypto = require('crypto');

const REGION = 'us-east-1';
const SERVICE = 'lambda';

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str).digest();

function signingKey(secret, dateStamp) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

// RFC3986 percent-encoding per SigV4 (encodeURIComponent leaves !*'() unencoded).
const rfc3986 = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// decodeURIComponent throws on a malformed percent-sequence (e.g. '%ZZ'). Fall
// back to the raw string so a bad query param can't turn a request into a 502;
// rfc3986 then encodes the literal '%' as '%25', matching AWS's own normalization.
const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch (_) { return s; }
};

// Build the SigV4 canonical query string. CloudFront gives request.querystring
// without the leading '?'. Split each pair on the FIRST '=' only (a value may
// itself contain '=', e.g. base64 padding), decode, RFC3986-encode key+value,
// then sort by encoded key.
function canonicalizeQuery(query) {
  return (query || '')
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      const rawK = i === -1 ? p : p.slice(0, i);
      const rawV = i === -1 ? '' : p.slice(i + 1);
      return [rfc3986(safeDecode(rawK)), rfc3986(safeDecode(rawV))];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

// Returns the headers to set on the request so the AWS_IAM Function URL accepts it.
// host: the Function URL host. method/path/query as on the request. body: Buffer.
function signedHeaders({ method, host, path, query, body, accessKeyId, secretAccessKey, sessionToken, now }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body || Buffer.alloc(0));

  // Minimal signed-header set. Extra headers CloudFront adds later (e.g. the
  // x-picasso-cf-origin custom origin header) ride along UNSIGNED — SigV4 only
  // validates the SignedHeaders, so that's fine and keeps the secret out of the signer.
  const signed = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (sessionToken) signed['x-amz-security-token'] = sessionToken;

  const sortedKeys = Object.keys(signed).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${signed[k]}\n`).join('');
  const signedHeaderList = sortedKeys.join(';');

  const canonicalQuery = canonicalizeQuery(query);

  const canonicalRequest = [
    method, path, canonicalQuery, canonicalHeaders, signedHeaderList, payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', amzDate, scope, sha256hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const sig = crypto.createHmac('sha256', signingKey(secretAccessKey, dateStamp)).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${sig}`;

  const out = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    authorization,
  };
  if (sessionToken) out['x-amz-security-token'] = sessionToken;
  return out;
}

// Lambda@Edge origin-request handler.
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  try {
    // Guard: CloudFront truncates an origin-request body over the ~1MB limit and
    // sets request.body.inputTruncated, while still forwarding the FULL body to
    // the origin. We would sign only the truncated copy → x-amz-content-sha256
    // mismatch → an opaque 403. Fail cleanly with 413 instead.
    // (The truncation flag is inputTruncated; request.body.action is 'read-only'
    // by default on EVERY request, so action is NOT a truncation signal.)
    if (request.body && request.body.inputTruncated) {
      return {
        status: '413',
        statusDescription: 'Payload Too Large',
        headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] },
        body: 'Request body exceeds the streaming signer limit.',
      };
    }

    const host = request.origin.custom.domainName; // the Function URL host
    const body = request.body && request.body.data
      ? Buffer.from(request.body.data, request.body.encoding === 'base64' ? 'base64' : 'utf8')
      : Buffer.alloc(0);

    const hdrs = signedHeaders({
      method: request.method,
      host,
      path: request.uri,
      query: request.querystring,
      body,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      now: new Date(),
    });

    // CloudFront requires the headers[] structure: { key, value } arrays.
    for (const [k, v] of Object.entries(hdrs)) {
      request.headers[k.toLowerCase()] = [{ key: k, value: v }];
    }
    // Host must match what we signed.
    request.headers['host'] = [{ key: 'host', value: host }];
    return request;
  } catch (err) {
    // Surface enough to debug in the edge-region log group; never log creds.
    console.error('BSH edge signer failed:', err && err.message);
    return {
      status: '502',
      statusDescription: 'Bad Gateway',
      headers: { 'content-type': [{ key: 'Content-Type', value: 'text/plain' }] },
      body: 'Streaming signer error.',
    };
  }
};

// Exported for unit tests (Lambda@Edge only invokes `handler`).
exports.signedHeaders = signedHeaders;
exports.canonicalizeQuery = canonicalizeQuery;
