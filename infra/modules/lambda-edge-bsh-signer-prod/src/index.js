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

  // Canonical query string: sort by key (CloudFront gives querystring without '?').
  const canonicalQuery = (query || '')
    .split('&')
    .filter(Boolean)
    .map((p) => { const [k, v = ''] = p.split('='); return [k, v]; })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

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
};
