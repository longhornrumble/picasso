# CloudFront Origin Access Control for the staging widget edge — staging-account
# twin of the prod-account OAC `E2LVW6GLLO7FWX`. Part of Q5 (staging edge
# migration), Phase 1 Apply 2. Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# A single OAC serves BOTH S3 origins (the widget bucket and the replicated
# tenant-config bucket), faithfully reproducing the prod-account topology where
# `picassostaging` and `myrecruiter-picasso` share OAC `E2LVW6GLLO7FWX`.
#
# A fresh OAC is created here — the prod-account OAC is never reused (account
# isolation; and Phase 5 must leave `E2LVW6GLLO7FWX` untouched as it is shared
# with the prod widget distribution E3G0LSWB1AQ9LP).
#
# Provider: root default (us-east-1) — no alias.

resource "aws_cloudfront_origin_access_control" "widget_edge" {
  name                              = "picasso-widget-staging-oac"
  description                       = "OAC for the staging widget edge (Q5 twin of E2LVW6GLLO7FWX)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

output "oac_id" {
  description = "Origin Access Control ID consumed by cloudfront-widget-staging for both S3 origins."
  value       = aws_cloudfront_origin_access_control.widget_edge.id
}
