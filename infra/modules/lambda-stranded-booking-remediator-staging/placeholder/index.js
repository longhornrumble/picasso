'use strict';

/**
 * Placeholder for Stranded_Booking_Remediator.
 *
 * Real handler ships from Lambdas/lambda/Stranded_Booking_Remediator (lambda#194)
 * via the lambda-repo CI matrix (deploy-staging.yml). Terraform's aws_lambda_function
 * uses `ignore_changes = [filename, source_code_hash]` so this placeholder zip is
 * only used on first apply, before CI deploys the real bundle.
 */

exports.handler = async function handler() {
  return { statusCode: 503, body: 'Stranded_Booking_Remediator — placeholder not yet replaced by real code' };
};
