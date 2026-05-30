#!/usr/bin/env node
/**
 * Idempotent seeder for the synthetic, READ-ONLY scheduling test tenant.
 *
 * Stands up `TEN-SCHED-FIXTURE` rows in the staging scheduling tables so the
 * sub-phase C/E integration tests have stable data to read against. Re-running
 * is a no-op: every write is a conditional PutItem keyed on the PK, so an
 * already-present row is skipped (ConditionalCheckFailed -> "exists").
 *
 * Schemas are coded against scheduling/docs/FROZEN_CONTRACTS.md SECTION A (LOCKED):
 *   - Booking         PK tenantId / SK booking_id          (GSIs tenantId-start_at-index, tenantId-coordinator_email-index)
 *   - AppointmentType PK tenantId / SK appointment_type_id
 *   - RoutingPolicy   PK tenantId / SK routing_policy_id   (round-robin state: last_assigned_resource_id + last_assigned_at)
 *   - Booking.status vocabulary: booked | canceled | completed | no_show | coordinator_no_show
 *
 * NO npm dependencies. Requires: Node 18+, AWS CLI v2 with an authenticated
 * staging profile (the seed write is a credential mutation -> operator-gated;
 * see scheduling/docs/runbooks/SCHEDULING_TEST_FIXTURE.md).
 *
 * Usage:
 *   AWS_PROFILE=myrecruiter-staging node seed-scheduling-fixture.mjs            # apply
 *   AWS_PROFILE=myrecruiter-staging node seed-scheduling-fixture.mjs --dry-run  # print, do not write
 *
 * Optional overrides (env): AWS_REGION, FIXTURE_TENANT_ID,
 *   BOOKING_TABLE, APPOINTMENT_TYPE_TABLE, ROUTING_POLICY_TABLE.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(HERE, 'seed-scheduling-fixture.json'), 'utf8'));

const REGION = process.env.AWS_REGION || 'us-east-1';
const TENANT = process.env.FIXTURE_TENANT_ID || data.tenantId;
const DRY_RUN = process.argv.includes('--dry-run');

if (!/fixture/i.test(TENANT)) {
  // Guard rail: refuse to seed anything that does not look like the synthetic tenant.
  console.error(`Refusing to seed: tenantId "${TENANT}" does not contain "fixture". This script only seeds the synthetic test tenant.`);
  process.exit(2);
}

const TABLES = {
  appointmentType: process.env.APPOINTMENT_TYPE_TABLE || 'picasso-appointment-type-staging',
  routingPolicy:   process.env.ROUTING_POLICY_TABLE   || 'picasso-routing-policy-staging',
  booking:         process.env.BOOKING_TABLE          || 'picasso-booking-staging',
};

/** Recursively convert a plain JS value into a DynamoDB AttributeValue. */
function marshall(value) {
  if (value === null) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(marshall) };
  if (typeof value === 'object') return { M: marshallMap(value) };
  throw new Error(`Unsupported value type for marshall: ${typeof value}`);
}
function marshallMap(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, marshall(v)]));
}

function putItem(table, item) {
  const itemJson = JSON.stringify(marshallMap(item));
  if (DRY_RUN) return 'dry-run';
  try {
    execFileSync('aws', [
      'dynamodb', 'put-item',
      '--region', REGION,
      '--table-name', table,
      '--item', itemJson,
      '--condition-expression', 'attribute_not_exists(tenantId)',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return 'created';
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    if (stderr.includes('ConditionalCheckFailed')) return 'exists';
    throw new Error(`put-item failed on ${table}: ${stderr || err.message}`);
  }
}

const PLAN = [
  ['appointmentType', TABLES.appointmentType, data.tables.appointmentType],
  ['routingPolicy',   TABLES.routingPolicy,   data.tables.routingPolicy],
  ['booking',         TABLES.booking,         data.tables.booking],
];

console.log(`Seeding synthetic scheduling fixture`);
console.log(`  tenantId : ${TENANT}`);
console.log(`  region   : ${REGION}`);
console.log(`  mode     : ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLY'}\n`);

let created = 0, existed = 0;
for (const [logical, table, spec] of PLAN) {
  for (const row of spec.items) {
    const sk = row[spec.skAttribute];
    const item = { tenantId: TENANT, ...row };
    const result = putItem(table, item);
    if (result === 'created') created++;
    if (result === 'exists') existed++;
    console.log(`  ${result.padEnd(9)} ${logical}/${sk}  (${table})`);
  }
}

console.log(`\nDone: ${created} created, ${existed} already present (idempotent no-op)${DRY_RUN ? ' [dry-run: nothing written]' : ''}.`);
