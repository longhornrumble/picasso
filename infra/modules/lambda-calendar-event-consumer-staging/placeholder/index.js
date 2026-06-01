'use strict';

/**
 * Placeholder for Calendar_Event_Consumer.
 *
 * Real handler ships from Lambdas/lambda/Calendar_Event_Consumer (lambda#195) via
 * the lambda-repo CI matrix (deploy-staging.yml). Terraform's aws_lambda_function
 * uses `ignore_changes = [filename, source_code_hash]` so this placeholder zip is
 * only used on first apply, before CI deploys the real bundle. Returns all records
 * as batch-item failures so the placeholder never silently drops an event.
 */

exports.handler = async function handler(event) {
  const records = event && Array.isArray(event.Records) ? event.Records : [];
  return { batchItemFailures: records.map((r) => ({ itemIdentifier: r.messageId })) };
};
