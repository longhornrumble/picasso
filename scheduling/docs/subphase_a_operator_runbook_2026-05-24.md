# Sub-phase A audit — operator-execute runbook

**Audit source:** `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_subphase_a_phase_completion_audit_2026-05-24.md`

This runbook captures the three audit findings that require operator hands because the changes are **permission grants or branch-protection toggles** that the AI agent's auto-mode classifier (correctly) refused to apply unilaterally. Each section has a single copy-paste-ready command + a verification command + the audit row(s) it closes.

Run order does not matter; they are independent. All three are additive / tightening; none are destructive.

---

## R7 — Add `bedrock:InvokeModel` to BSH staging Lambda role

**Audit:** strong rec R7 (tech-lead). Sub-phase B entry MUST NOT proceed without this.

**Root cause:** the `BedrockInvokeClaudeHaiku` statement on `Bedrock_Streaming_Handler_Staging-role` grants only `bedrock:InvokeModelWithResponseStream` (streaming). V4.1 `classifyTopic` and V4.0 `selectActionsV4` use `InvokeModelCommand` (non-streaming) which requires `bedrock:InvokeModel`. Without it, V4.1 Step 3a degrades 100% in staging and the V4.0 Action Selector silently fails — Row 4 only passed because the test was tuned around this bug.

**Pre-image:**
```bash
AWS_PROFILE=myrecruiter-staging aws iam get-role-policy \
  --role-name Bedrock_Streaming_Handler_Staging-role \
  --policy-name exec-policy \
  --query 'PolicyDocument.Statement[?Sid==`BedrockInvokeClaudeHaiku`]'
```
Expected pre-image: `Action: "bedrock:InvokeModelWithResponseStream"` (single string, not a list).

**Apply (copy-paste):**
```bash
# Use the canonical JSON written to /tmp during the audit-closure session;
# this is identical to the current live policy with `bedrock:InvokeModel` added
# to the `BedrockInvokeClaudeHaiku` statement's Action array.
cat > /tmp/bsh-exec-policy-r7.json <<'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Action": ["logs:PutLogEvents", "logs:CreateLogStream"], "Effect": "Allow",
      "Resource": "arn:aws:logs:us-east-1:525409062831:log-group:/aws/lambda/Bedrock_Streaming_Handler_Staging:*",
      "Sid": "Logs" },
    { "Action": "s3:GetObject", "Effect": "Allow",
      "Resource": "arn:aws:s3:::myrecruiter-picasso-staging/*",
      "Sid": "TenantConfigRead" },
    { "Action": ["dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:GetItem"], "Effect": "Allow",
      "Resource": [
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-session-summaries-staging/index/*",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-session-summaries-staging"
      ], "Sid": "DynamoDBSessionSummaries" },
    { "Action": ["dynamodb:Query", "dynamodb:GetItem"], "Effect": "Allow",
      "Resource": [
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-tenant-registry-staging/index/*",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-tenant-registry-staging"
      ], "Sid": "DynamoDBTenantRegistryRead" },
    { "Action": ["bedrock:InvokeModelWithResponseStream", "bedrock:InvokeModel"],
      "Effect": "Allow",
      "Resource": [
        "arn:aws:bedrock:us-east-1:525409062831:inference-profile/*",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-*"
      ],
      "Sid": "BedrockInvokeClaudeHaiku" },
    { "Action": "bedrock-agent-runtime:Retrieve", "Effect": "Allow",
      "Resource": "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
      "Sid": "BedrockKBRetrieve" },
    { "Action": "sts:AssumeRole", "Effect": "Allow",
      "Resource": "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
      "Sid": "AssumeKBRetrieverRole" },
    { "Action": "secretsmanager:GetSecretValue", "Effect": "Allow",
      "Resource": "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/bsh/cf-origin-secret-*",
      "Sid": "CfOriginSecretRead" },
    { "Action": ["dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:GetItem"], "Effect": "Allow",
      "Resource": [
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-sms-usage-staging",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-sms-consent-staging/index/*",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-sms-consent-staging",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-notification-sends-staging",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-form-submissions-staging/index/*",
        "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-form-submissions-staging"
      ], "Sid": "StagingFormTablesAccess" },
    { "Action": ["dynamodb:PutItem", "dynamodb:GetItem"], "Effect": "Allow",
      "Resource": "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-pii-subject-index-staging",
      "Sid": "DynamoDBPiiSubjectIndex" },
    { "Action": ["sqs:SendMessageBatch", "sqs:SendMessage"], "Effect": "Allow",
      "Resource": "arn:aws:sqs:us-east-1:525409062831:picasso-analytics-events-staging",
      "Sid": "SqsAnalyticsSend" },
    { "Action": "lambda:InvokeFunction", "Effect": "Allow",
      "Resource": "arn:aws:lambda:us-east-1:525409062831:function:SMS_Sender",
      "Sid": "InvokeSmsSender" }
  ]
}
POLICY

AWS_PROFILE=myrecruiter-staging aws iam put-role-policy \
  --role-name Bedrock_Streaming_Handler_Staging-role \
  --policy-name exec-policy \
  --policy-document file:///tmp/bsh-exec-policy-r7.json
```

**Verify:**
```bash
AWS_PROFILE=myrecruiter-staging aws iam get-role-policy \
  --role-name Bedrock_Streaming_Handler_Staging-role \
  --policy-name exec-policy \
  --query 'PolicyDocument.Statement[?Sid==`BedrockInvokeClaudeHaiku`].Action'
# Expect both actions listed.

# Smoke-test (optional — re-runs the Row 4 path): trigger a chat turn
# in staging that would hit classifyTopic / selectActionsV4 and confirm
# CloudWatch logs show no AccessDenied for bedrock:InvokeModel.
AWS_PROFILE=myrecruiter-staging aws logs tail \
  /aws/lambda/Bedrock_Streaming_Handler_Staging --since 5m | grep -i "bedrock"
```

**Rollback:** put-role-policy with the original action string `"bedrock:InvokeModelWithResponseStream"` (preserved in the IAM versioned audit trail).

---

## B10 — Enable `enforce_admins` on pcb `main` branch protection

**Audit:** Security-Reviewer blocker B10.

**Root cause:** the T-02 mitigation in `pr-checks.yml` (workflow-trigger-guard) and the per-PR required status checks are bypassable by any repo admin merging directly without going through CI. With `enforce_admins=false`, admins are exempt from the protection rules. The CI-2 lint-layer mitigation is admin-bypassable until this is on.

**Pre-image:**
```bash
gh api repos/longhornrumble/picasso-config-builder/branches/main/protection \
  --jq '.enforce_admins.enabled'
# Expect: false
```

**Apply (single line):**
```bash
gh api -X POST repos/longhornrumble/picasso-config-builder/branches/main/protection/enforce_admins
```

**Verify:**
```bash
gh api repos/longhornrumble/picasso-config-builder/branches/main/protection \
  --jq '.enforce_admins.enabled'
# Expect: true
```

**Rollback:**
```bash
gh api -X DELETE repos/longhornrumble/picasso-config-builder/branches/main/protection/enforce_admins
```

**Operational note:** with `enforce_admins=true`, ALL merges to `main` (including yours) must go through the required status checks. There is no admin-override escape hatch. Plan accordingly when shipping a hotfix that needs to bypass a flaky check — the right tool is then to temporarily mark the check as not-required, NOT to disable enforce_admins.

---

## B11 — Add bucket audit trail to `myrecruiter-picasso`

**Audit:** Security-Reviewer blocker B11. Tied to T-09 (independent finding).

**Root cause:** the prod bucket has neither S3 server access logging NOR CloudTrail data events. Any write — like the Row 4 transient PROD write or the NAT001622 deletion — leaves no audit trail in any persistent log. Config tampering would be invisible.

This runbook configures BOTH controls. CloudTrail data events catch API-level writes (including SSO admin writes); S3 server access logging catches HTTP-level access (including unauthenticated GETs from T-09).

### Step 1 — Create the dedicated logging bucket (one-time)

```bash
LOG_BUCKET="myrecruiter-picasso-access-logs"

AWS_PROFILE=myrecruiter-prod aws s3api create-bucket \
  --bucket "$LOG_BUCKET" \
  --region us-east-1

# Block public access on the logging bucket
AWS_PROFILE=myrecruiter-prod aws s3api put-public-access-block \
  --bucket "$LOG_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Enable versioning on the logging bucket (audit trail can't be silently overwritten)
AWS_PROFILE=myrecruiter-prod aws s3api put-bucket-versioning \
  --bucket "$LOG_BUCKET" \
  --versioning-configuration Status=Enabled

# Allow log delivery service to write to it
cat > /tmp/log-bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ServerAccessLogsPolicy",
      "Effect": "Allow",
      "Principal": { "Service": "logging.s3.amazonaws.com" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::${LOG_BUCKET}/myrecruiter-picasso/*",
      "Condition": {
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::myrecruiter-picasso" },
        "StringEquals": { "aws:SourceAccount": "614056832592" }
      }
    }
  ]
}
EOF
AWS_PROFILE=myrecruiter-prod aws s3api put-bucket-policy \
  --bucket "$LOG_BUCKET" \
  --policy file:///tmp/log-bucket-policy.json
```

### Step 2 — Enable S3 server access logging on `myrecruiter-picasso`

```bash
cat > /tmp/picasso-logging-config.json <<'EOF'
{
  "LoggingEnabled": {
    "TargetBucket": "myrecruiter-picasso-access-logs",
    "TargetPrefix": "myrecruiter-picasso/"
  }
}
EOF
AWS_PROFILE=myrecruiter-prod aws s3api put-bucket-logging \
  --bucket myrecruiter-picasso \
  --bucket-logging-status file:///tmp/picasso-logging-config.json
```

**Verify:**
```bash
AWS_PROFILE=myrecruiter-prod aws s3api get-bucket-logging \
  --bucket myrecruiter-picasso
# Expect: LoggingEnabled.TargetBucket = myrecruiter-picasso-access-logs
```

### Step 3 — Add CloudTrail data events for `myrecruiter-picasso`

The existing `myrecruiter-management-events` trail is management-only (per `aws cloudtrail get-event-selectors` 2026-05-24). Add an advanced event selector for S3 data events on this one bucket.

> **Note:** CloudTrail data events are billed per event (~$0.10 per 100,000 events). For a config bucket with low write volume this is negligible (cents/month).

```bash
cat > /tmp/picasso-data-events.json <<'EOF'
[
  {
    "Name": "Management events selector",
    "FieldSelectors": [
      { "Field": "eventCategory", "Equals": ["Management"] }
    ]
  },
  {
    "Name": "myrecruiter-picasso data events",
    "FieldSelectors": [
      { "Field": "eventCategory", "Equals": ["Data"] },
      { "Field": "resources.type", "Equals": ["AWS::S3::Object"] },
      { "Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::myrecruiter-picasso/"] }
    ]
  }
]
EOF
AWS_PROFILE=myrecruiter-prod aws cloudtrail put-event-selectors \
  --trail-name myrecruiter-management-events \
  --advanced-event-selectors file:///tmp/picasso-data-events.json
```

**Verify:**
```bash
AWS_PROFILE=myrecruiter-prod aws cloudtrail get-event-selectors \
  --trail-name myrecruiter-management-events \
  --query 'AdvancedEventSelectors[?Name==`myrecruiter-picasso data events`]'
# Expect: 1 selector with the data-event FieldSelectors above
```

### Step 4 — Smoke test that writes are now audited

```bash
# Make a benign GetObject call against the bucket
AWS_PROFILE=myrecruiter-prod aws s3api head-object \
  --bucket myrecruiter-picasso \
  --key tenants/MYR384719/MYR384719-config.json

# Wait ~5 min for CloudTrail eventual consistency, then look up the event
AWS_PROFILE=myrecruiter-prod aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=myrecruiter-picasso \
  --max-items 5 \
  --query 'Events[].{Time:EventTime,Event:EventName,User:Username}'
```

**Rollback:** delete the data-event selector by re-applying just the Management selector; delete the bucket-logging config with `put-bucket-logging --bucket-logging-status '{}'`; the logging bucket can stay (idle = $0).

---

## Closure

After running all three sections:

1. Update the audit memory `project_scheduling_subphase_a_phase_completion_audit_2026-05-24.md` per-row verdicts:
   - R7 → **fix-now CLOSED** (date applied, role + verification command run)
   - B10 → **fix-now CLOSED** (date applied)
   - B11 → **fix-now CLOSED** (date applied; access-log bucket name; CloudTrail trail name)

2. Re-run the phase-completion-audit (Step 9 of the skill) and confirm no new blockers from the changes themselves.

3. Sub-phase A formal completion requires also closing B5 (CI-5 prod-deploy approval gate — separate work) and B4 (Security re-gate of R-1 evolution — process item).
