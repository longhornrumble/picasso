# CLOUDFRONT-scope WAF for the staging widget edge — staging-account twin of
# the prod-account web ACL `picasso-streaming-waf`
# (813ea956-be57-4bd1-8ccd-f0b155a79b50). Part of Q5 (staging edge migration),
# Phase 1 Apply 2. Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# Rules reproduced VERBATIM from the live prod-account web ACL (read 2026-05-16
# via `aws wafv2 get-web-acl`, not from the P22 doc — faithful-twin discipline,
# feedback_verify_cloud_provider_behavior_empirically). Default action Allow;
# 5 rules at priorities 1-5; CloudWatch metric names match the prod web ACL
# exactly so existing dashboard/alarm queries port unchanged.
#
# A FRESH web ACL is created — the prod-account one is shared with the prod
# widget distribution E3G0LSWB1AQ9LP and must never be deleted/reused (Phase 5
# do-not-touch list).
#
# WAF logging [tl-SR4]: to a CloudWatch Logs log group rather than S3 —
# deliberately, so the logging sink does not require an ACL-enabled bucket
# that would conflict with the account-wide S3 hardening (BPA + no ACLs).
# wafv2 requires the destination log group name to start with `aws-waf-logs-`.
#
# Provider: root default (us-east-1). WAFv2 CLOUDFRONT scope MUST be created
# in us-east-1 — which the root default provider is — no alias needed.

resource "aws_wafv2_web_acl" "streaming" {
  name = "picasso-streaming-waf-staging"
  # WAFv2 description regex forbids parentheses — keep to \w + space + - , . : / = # @ +
  description = "Q5 staging-account twin of prod picasso-streaming-waf"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Phase-1 audit Row 2: the twin's raw d###.cloudfront.net domain is publicly
  # reachable and (because CloudFront injects x-picasso-cf-origin) is a fully
  # working unauthenticated chat/Bedrock endpoint until the Phase-3 cutover.
  # Block anything whose Host header is not exactly the intended alias. Raw-CF
  # validation must therefore use `curl --resolve staging.chat.myrecruiter.ai`
  # (Host = the real name); post-cutover real traffic carries that Host so this
  # also stays as permanent defense against direct cloudfront.net access.
  rule {
    name     = "BlockNonStagingChatHost"
    priority = 0

    action {
      block {}
    }

    statement {
      not_statement {
        statement {
          byte_match_statement {
            search_string         = "staging.chat.myrecruiter.ai"
            positional_constraint = "EXACTLY"
            field_to_match {
              single_header {
                name = "host"
              }
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoBlockNonStagingChatHost"
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 300
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRateLimitPerIP"
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoCommonRuleSet"
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoBadInputsRuleSet"
    }
  }

  # NOTE: the rule's own name ("AWSManagedRulesIPReputationList") differs from
  # the managed group name ("AWSManagedRulesAmazonIpReputationList") in the
  # prod web ACL. Reproduced exactly as live.
  rule {
    name     = "AWSManagedRulesIPReputationList"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoIPReputationList"
    }
  }

  rule {
    name     = "RequestSizeLimit"
    priority = 5

    action {
      block {}
    }

    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size                = 51200

        field_to_match {
          body {
            oversize_handling = "MATCH"
          }
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRequestSizeLimit"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "PicassoStreamingWAF"
  }
}

resource "aws_cloudwatch_log_group" "waf" {
  # wafv2 logging requires the destination name to start with `aws-waf-logs-`.
  name              = "aws-waf-logs-picasso-streaming-staging"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "streaming" {
  resource_arn = aws_wafv2_web_acl.streaming.arn
  # CWL destination ARN must be supplied without the trailing `:*` that
  # aws_cloudwatch_log_group.arn carries.
  log_destination_configs = [trimsuffix(aws_cloudwatch_log_group.waf.arn, ":*")]
}

output "web_acl_arn" {
  description = "ARN of the CLOUDFRONT web ACL, consumed by cloudfront-widget-staging (web_acl_id)."
  value       = aws_wafv2_web_acl.streaming.arn
}
