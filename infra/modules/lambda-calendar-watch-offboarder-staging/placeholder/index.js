'use strict';

/**
 * Placeholder for Calendar_Watch_Offboarder.
 *
 * Real handler ships from Lambdas/lambda/Calendar_Watch_Offboarder via the
 * lambda-repo CI matrix. Terraform's aws_lambda_function uses
 * `ignore_changes = [filename, source_code_hash]` so this placeholder zip
 * is only used on first apply.
 */

exports.handler = async function handler() {
  return { statusCode: 503, body: 'Calendar_Watch_Offboarder — placeholder not yet replaced by real code' };
};
