/**
 * schedulingGateway.js — thin client for the deterministic Scheduling_Page_Api gateway
 * (the branded /schedule/ picker's data path; NOT the conversational chat). The page POSTs
 * { action, t:<tenantHash>, session, ... }; the gateway resolves the §B10 binding (the
 * auth — no token) and invokes the BCH propose/mutate seam.
 *
 * Endpoint: env-configured (the gateway Function URL), or same-origin `/schedule-api`
 * when fronted behind the page's CloudFront. Configured via environment.js once the
 * infra Function URL exists.
 */

import { config as environmentConfig } from '../config/environment.js';

function gatewayUrl() {
  return (
    (environmentConfig && environmentConfig.SCHEDULING_API_ENDPOINT) ||
    (typeof window !== 'undefined' && window.PicassoConfig && window.PicassoConfig.schedulingApiEndpoint) ||
    '/schedule-api'
  );
}

async function post(action, payload) {
  const res = await fetch(gatewayUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    const err = new Error((body && body.error) || `gateway_${res.status}`);
    err.status = res.status;
    err.code = body && body.error;
    throw err;
  }
  return body || {};
}

/**
 * Available times for a day (or the whole horizon if date omitted).
 * @param {{tenantHash:string, session:string, date?:string}} args date = 'YYYY-MM-DD'
 * @returns {Promise<{outcome,slots,context,appointment_label,current_start_at,timezone}>}
 */
export function proposeTimes({ tenantHash, session, date }) {
  return post('propose', { t: tenantHash, session, ...(date ? { date } : {}) });
}

/**
 * Commit the booking change.
 * @param {{tenantHash:string, session:string, mutation:'reschedule'|'cancel', newSlot?:{start,end}}} args
 * @returns {Promise<{outcome}>}
 */
export function mutateBooking({ tenantHash, session, mutation, newSlot }) {
  return post('mutate', { t: tenantHash, session, mutation, ...(newSlot ? { newSlot } : {}) });
}
