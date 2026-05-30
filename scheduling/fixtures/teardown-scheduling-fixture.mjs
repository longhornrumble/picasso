#!/usr/bin/env node
/**
 * Teardown for the synthetic scheduling test tenant.
 *
 * Deletes every row whose PK is the fixture tenant (`TEN-SCHED-FIXTURE`) from
 * the three staging scheduling tables. Because tenantId is the partition key on
 * all three tables, a Query on the PK returns exactly the fixture's rows; each
 * is then deleted by its (tenantId, <sk>) key. Safe to re-run (deleting an
 * absent row is a no-op).
 *
 * NO npm dependencies. Requires: Node 18+, AWS CLI v2 with an authenticated
 * staging profile (delete writes are a credential mutation -> operator-gated;
 * see scheduling/docs/runbooks/SCHEDULING_TEST_FIXTURE.md).
 *
 * Usage:
 *   AWS_PROFILE=myrecruiter-staging node teardown-scheduling-fixture.mjs            # delete
 *   AWS_PROFILE=myrecruiter-staging node teardown-scheduling-fixture.mjs --dry-run  # list, do not delete
 *
 * Optional overrides (env): AWS_REGION, FIXTURE_TENANT_ID,
 *   BOOKING_TABLE, APPOINTMENT_TYPE_TABLE, ROUTING_POLICY_TABLE.
 */
import { execFileSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TENANT = process.env.FIXTURE_TENANT_ID || 'TEN-SCHED-FIXTURE';
const DRY_RUN = process.argv.includes('--dry-run');

if (!/fixture/i.test(TENANT)) {
  // Guard rail: refuse to delete anything that does not look like the synthetic tenant.
  console.error(`Refusing to tear down: tenantId "${TENANT}" does not contain "fixture". This script only deletes the synthetic test tenant.`);
  process.exit(2);
}

const PLAN = [
  ['appointmentType', process.env.APPOINTMENT_TYPE_TABLE || 'picasso-appointment-type-staging', 'appointment_type_id'],
  ['routingPolicy',   process.env.ROUTING_POLICY_TABLE   || 'picasso-routing-policy-staging',   'routing_policy_id'],
  ['booking',         process.env.BOOKING_TABLE          || 'picasso-booking-staging',          'booking_id'],
];

/** Query all SK values for the fixture tenant on one table (paginates defensively). */
function querySortKeys(table, skAttribute) {
  const keys = [];
  let startKey = null;
  do {
    const args = [
      'dynamodb', 'query',
      '--region', REGION,
      '--table-name', table,
      '--key-condition-expression', 'tenantId = :t',
      '--expression-attribute-values', JSON.stringify({ ':t': { S: TENANT } }),
      '--projection-expression', skAttribute,
      '--output', 'json',
    ];
    if (startKey) args.push('--exclusive-start-key', JSON.stringify(startKey));
    const out = execFileSync('aws', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const page = JSON.parse(out || '{}');
    for (const item of page.Items || []) keys.push(item[skAttribute].S);
    startKey = page.LastEvaluatedKey || null;
  } while (startKey);
  return keys;
}

function deleteItem(table, skAttribute, skValue) {
  execFileSync('aws', [
    'dynamodb', 'delete-item',
    '--region', REGION,
    '--table-name', table,
    '--key', JSON.stringify({ tenantId: { S: TENANT }, [skAttribute]: { S: skValue } }),
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

console.log(`Tearing down synthetic scheduling fixture`);
console.log(`  tenantId : ${TENANT}`);
console.log(`  region   : ${REGION}`);
console.log(`  mode     : ${DRY_RUN ? 'DRY-RUN (no deletes)' : 'DELETE'}\n`);

let deleted = 0;
for (const [logical, table, skAttribute] of PLAN) {
  const skValues = querySortKeys(table, skAttribute);
  for (const skValue of skValues) {
    if (!DRY_RUN) deleteItem(table, skAttribute, skValue);
    deleted++;
    console.log(`  ${DRY_RUN ? 'would-delete' : 'deleted'.padEnd(12)} ${logical}/${skValue}  (${table})`);
  }
  if (skValues.length === 0) console.log(`  (none)        ${logical}  (${table})`);
}

console.log(`\nDone: ${deleted} row(s) ${DRY_RUN ? 'would be deleted [dry-run]' : 'deleted'}.`);
