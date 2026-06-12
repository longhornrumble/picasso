'use strict';

/**
 * Placeholder for Attendance_Disposition_Handler.
 *
 * Real handler ships from Lambdas/lambda/Attendance_Disposition_Handler via the
 * lambda-repo CI matrix (deploy-staging.yml). Terraform's aws_lambda_function
 * uses `ignore_changes = [filename, source_code_hash]` so this placeholder zip
 * is only used on first apply, before CI deploys the real bundle.
 */

exports.handler = async function handler() {
  return { statusCode: 503, body: 'Attendance_Disposition_Handler — placeholder not yet replaced by real code' };
};
