# Bubble Integration Playbook: Form Submission Analytics

## Overview

This playbook guides you through integrating form submission analytics into your Bubble admin dashboard using both:
- **Real-time webhooks** for instant form submission visibility
- **Historical analytics API** for charts and reporting

---

## Architecture Summary

```
Form Submission Flow:
  User submits form in Picasso widget
    ↓
  Master_Function processes and stores in DynamoDB
    ↓
  Webhook pushes to Bubble (REAL-TIME) ← You'll configure this
    ↓
  Bubble creates Form_Submission record
    ↓
  Bubble sends email notifications to staff
    ↓
  Bubble routes to N8N via Integration_Rules ← Middleware for all client integrations
    ↓
  N8N handles client-specific destinations:
    ├→ Google Sheets (primary)
    ├→ Salesforce
    ├→ Mailchimp
    ├→ Slack
    └→ Any other system (400+ connectors)

Historical Reporting Flow:
  Aggregator_Function runs daily (aggregates form metrics)
    ↓
  Bubble dashboard queries Analytics_Function API
    ↓
  Gets aggregated metrics for charts/reports
```

**Key Architecture Decision:** N8N serves as the **integration middleware** for all client-specific destinations. This allows:
- ✅ Non-technical staff to manage client integrations
- ✅ No Bubble workflow changes when adding new clients
- ✅ Each client can have different destination systems
- ✅ Visual workflow builder for complex multi-step integrations

---

## Phase 1: Bubble Data Structure Setup

### Step 1.1: Create Form_Submission Data Type

**Go to:** Data → Data types → New type

**Create Data Type:** `Form_Submission`

**Add Fields:**

| Field Name | Field Type | Notes |
|------------|-----------|-------|
| `submission_id` | text | Unique identifier from Lambda |
| `tenant_id` | text | Your tenant ID (e.g., FOS402334) |
| `form_type` | text | Type of form (volunteer_apply, contact_us, etc.) |
| `submitted_at` | date | When form was submitted |
| `session_id` | text | Chat session ID |
| `conversation_id` | text | Conversation ID |
| `applicant_email` | text | Extracted from responses |
| `applicant_name` | text | Extracted from responses |
| `applicant_phone` | text | Extracted from responses (optional) |
| `program_interest` | text | Extracted from responses (if applicable) |
| `comments` | text | Open-ended response field (if applicable) |
| `responses_json` | text | Full JSON of all form responses (optional - for custom fields) |
| `created_date` | date | Auto-filled: Current date/time |
| `modified_date` | date | Auto-filled: Current date/time |

**Important Settings:**
- ✅ Enable "This type is publicly visible"
- ✅ Enable search fields for: `form_type`, `submitted_at`, `applicant_email`

---

## Phase 2: Real-Time Webhook Setup

### Step 2.1: Enable Workflow API

**Go to:** Settings → API

**Enable:**
- ✅ Enable Workflow API
- ✅ Enable Data API (optional, for manual queries)

**Note:** You'll get an API token - save this for later

---

### Step 2.2: Create Backend Workflow

**Go to:** Backend workflows → New workflow

**Name:** `form_submission`

**Trigger:** When endpoint is called

**Parameters to expect:**
| Parameter Name | Type | Optional |
|----------------|------|----------|
| `submission_id` | text | No |
| `tenant_id` | text | No |
| `form_type` | text | No |
| `timestamp` | text | No |
| `session_id` | text | Yes |
| `conversation_id` | text | Yes |
| `applicant_email` | text | Yes |
| `applicant_first_name` | text | Yes |
| `applicant_last_name` | text | Yes |
| `applicant_name` | text | Yes |
| `applicant_phone` | text | Yes |
| `program_interest` | text | Yes |
| `comments` | text | Yes |
| `responses_json` | text | Yes |

**Make public:** ✅ Yes (so Lambda can call it)

---

### Step 2.3: Configure Workflow Actions

**Action 1: Create Form_Submission Record**

Add action → Data (Things) → Create a new thing

**Thing to create:** Form_Submission

**Set fields:**
```
submission_id = Request data's submission_id
tenant_id = Request data's tenant_id
form_type = Request data's form_type
submitted_at = :formatted as (convert Request data's timestamp to date)
session_id = Request data's session_id
conversation_id = Request data's conversation_id

# Pre-extracted fields (no parsing needed!)
applicant_email = Request data's applicant_email
applicant_name = Request data's applicant_name
applicant_phone = Request data's applicant_phone
program_interest = Request data's program_interest
comments = Request data's comments

# Full JSON for reference
responses_json = Request data's responses_json
```

**Note:** The Lambda function automatically extracts common fields (email, name, phone, program_interest, comments) from the form responses and sends them as individual parameters. You can directly map them in Bubble without any JSON parsing!

---

**Action 2: Send Email Notification (Optional)**

Add action → Email → Send email

**To:** Admin email
**Subject:** `New Form Submission: [form_type]`
**Body:**
```
New form submission received:

Type: <This Form_Submission's form_type>
Name: <This Form_Submission's applicant_name>
Email: <This Form_Submission's applicant_email>
Program: <This Form_Submission's program_interest>

View details: [link to admin dashboard]
```

---

### Step 2.4: Get Webhook URL

**After creating the workflow:**

**Go to:** Backend workflows → form_submission → Copy endpoint

**Format:** `https://your-app.bubbleapps.io/version-test/api/1.1/wf/form_submission`

**Production URL:** `https://your-app.bubbleapps.io/api/1.1/wf/form_submission`

**Save this URL** - you'll add it to tenant config in Step 4

---

## Phase 2B: N8N Integration Middleware Setup

This phase sets up **N8N as your integration middleware**. All client-specific integrations (Google Sheets, Salesforce, Mailchimp, etc.) are handled through N8N, keeping your Bubble workflows simple and maintainable.

**Why N8N:**
- Single webhook call from Bubble (no vendor-specific logic)
- Visual workflow builder for non-technical staff
- 400+ pre-built connectors
- Cost-effective ($7/month self-hosted on AWS)
- Easy to add/modify client integrations without touching Bubble

---

### Step 2B.1: Create Integration_Config Data Type

**Go to:** Data → Data types → New type

**Create Data Type:** `Integration_Config`

**Add Fields:**

| Field Name | Field Type | Notes |
|------------|-----------|-------|
| `integration_name` | text | Display name (e.g., "Salesforce", "HubSpot") |
| `integration_type` | text | Type identifier (e.g., "salesforce", "hubspot", "webhook") |
| `tenant_id` | Tenant | Multi-tenant isolation |
| `endpoint_url` | text | API endpoint URL |
| `auth_token` | text | API key/bearer token (mark as private) |
| `enabled` | yes/no | Active/inactive toggle |
| `field_mappings` | text | JSON mapping of form fields to API fields (optional) |
| `created_date` | date | Auto-filled: Current date/time |
| `modified_date` | date | Auto-filled: Current date/time |

**Important Settings:**
- ✅ Make `auth_token` field private (Settings → Privacy)
- ✅ Enable search fields for: `integration_type`, `enabled`, `tenant_id`

---

### Step 2B.2: Create Integration_Rule Data Type

**Go to:** Data → Data types → New type

**Create Data Type:** `Integration_Rule`

**Add Fields:**

| Field Name | Field Type | Notes |
|------------|-----------|-------|
| `tenant_id` | Tenant | Multi-tenant isolation |
| `form_type` | text | Form type to match (e.g., "volunteer_signup", "donation") |
| `integration_config` | Integration_Config | Foreign key to integration |
| `enabled` | yes/no | Active/inactive toggle |
| `priority` | number | Execution order (optional, default 0) |
| `created_date` | date | Auto-filled: Current date/time |
| `modified_date` | date | Auto-filled: Current date/time |

**Important Settings:**
- ✅ Enable search fields for: `form_type`, `enabled`, `tenant_id`

**Example Data:**

| tenant_id | form_type | integration_config | enabled |
|-----------|-----------|-------------------|---------|
| ATL642715 | volunteer_signup | Salesforce (volunteer_sync) | yes |
| ATL642715 | volunteer_signup | Mailchimp (newsletter_sync) | yes |
| ATL642715 | donation | Stripe (payment_processor) | yes |
| ATL642715 | contact | Slack (high_priority_alerts) | yes |

---

### Step 2B.3: Create Backend Workflow: send_to_integration

**Go to:** Backend workflows → New workflow

**Name:** `send_to_integration`

**Trigger:** API workflow

**Parameters to expect:**

| Parameter Name | Type | Optional |
|----------------|------|----------|
| `form_submission_id` | text | No |
| `integration_config_id` | text | No |

**Make private:** ✅ Yes (called internally only)

---

### Step 2B.4: Configure send_to_integration Workflow Actions

**Simplified N8N Approach:** Since all integrations route through N8N, you only need **ONE action** that sends to N8N's webhook, regardless of the final destination (Google Sheets, Salesforce, etc.).

---

**Action 1: Send to N8N Webhook**

Add action → Plugins → API Connector → N8N_Webhook_Call

**Configuration:**
```
Method: POST

URL (inline search):
  Search for Integration_Configs
    unique id = integration_config_id
    :first item's endpoint_url

Headers:
  Content-Type: application/json

Body (JSON):
{
  "submission_id": "<Search for Form_Submissions (submission_id = form_submission_id):first item's submission_id>",
  "tenant_id": "<Search for Form_Submissions (submission_id = form_submission_id):first item's tenant_id>",
  "form_type": "<Search for Form_Submissions (submission_id = form_submission_id):first item's form_type>",
  "program_interest": "<Search for Form_Submissions (submission_id = form_submission_id):first item's program_interest>",
  "submitted_at": "<Search for Form_Submissions (submission_id = form_submission_id):first item's submitted_at>",
  "applicant_name": "<Search for Form_Submissions (submission_id = form_submission_id):first item's applicant_name>",
  "applicant_email": "<Search for Form_Submissions (submission_id = form_submission_id):first item's applicant_email>",
  "applicant_phone": "<Search for Form_Submissions (submission_id = form_submission_id):first item's applicant_phone>",
  "comments": "<Search for Form_Submissions (submission_id = form_submission_id):first item's comments>",
  "responses_json": <Search for Form_Submissions (submission_id = form_submission_id):first item's responses_json>
}
```

**That's it!** No conditional logic, no vendor-specific API calls. N8N handles all the routing and transformation.

---

**How to configure:**
1. For the URL field: Insert dynamic data → Search for Integration_Configs → constraint: `unique id = integration_config_id` → `:first item's endpoint_url`
2. For each body field: Insert dynamic data → Search for Form_Submissions → constraint: `submission_id = form_submission_id` → `:first item's [field_name]`

---

### Step 2B.5: Update Main form_submission Workflow

**Go to:** Backend workflows → form_submission

**Add Action 3 (after email notifications):**

Add action → Workflow → Schedule API Workflow on a list

**API Workflow:** send_to_integration

**List to run on:**
```
Search for Integration_Rules

Constraints:
  tenant_id = Result of step 1 (Create Form_Submission)'s tenant_id
  form_type = Result of step 1 (Create Form_Submission)'s form_type
  enabled = yes

Sort by: priority (ascending)
```

**Parameters to pass:**
```
form_submission_id = Result of step 1's submission_id
integration_config_id = This Integration_Rule's integration_config's unique id
```

**Delay:** 0 seconds (run immediately)

---

### Step 2B.6: Configure N8N Webhook API Connector

**Simple One-Time Setup:** Create a generic API connector that can call any N8N webhook.

**Go to:** Plugins → API Connector → Add another API

---

**API Name:** `N8N Integration API`

**Add Call: Send to N8N Webhook**

**Configuration:**
```
Name: N8N_Webhook_Call
Use as: Action

Method: POST
URL: <dynamic> (leave as parameter)

Headers:
  Content-Type: application/json

Body type: JSON
Body: <dynamic> (leave as parameter)

Data type: JSON
```

**Initialize with test values:**
- `URL`: `http://44.200.215.180.nip.io:5678/webhook-test/test`
- `Body`: `{"test": "data"}`
- Click "Initialize call"

---

**That's the only API connector you need!** Every integration uses this same call with different webhook URLs configured in Integration_Config.

---

### Step 2B.7: Example Integration Configurations

**Example 1: Google Sheets via N8N (Primary Integration)**

**Integration_Config:**
```
integration_name: "N8N - Google Sheets Pipeline"
integration_type: "n8n_webhook"
endpoint_url: "http://44.200.215.180.nip.io:5678/webhook/bubble-form-submission"
auth_token: "" (optional - can add webhook secret later)
enabled: yes
tenant_id: ATL642715
```

**Integration_Rule:**
```
program_interest: "Love Box"
integration_config: → N8N - Google Sheets Pipeline
enabled: yes
tenant_id: ATL642715
```

**What happens:** Love Box volunteer forms → N8N → Google Sheets

---

**Example 2: Multiple Programs with Different Workflows**

Each program can have its own N8N workflow with different destinations:

**Integration_Config #1:**
```
integration_name: "N8N - Love Box Pipeline"
endpoint_url: "http://44.200.215.180.nip.io:5678/webhook/lovebox-submissions"
```

**Integration_Config #2:**
```
integration_name: "N8N - Dare to Dream Pipeline"
endpoint_url: "http://44.200.215.180.nip.io:5678/webhook/d2d-submissions"
```

**Integration_Rules:**
| program_interest | integration_config | enabled |
|-----------------|-------------------|---------|
| Love Box | N8N - Love Box Pipeline | yes |
| Dare to Dream | N8N - Dare to Dream Pipeline | yes |

**Result:** Each program routes to its own N8N workflow, which can:
- Love Box → Google Sheet #1 + Mailchimp List A
- Dare to Dream → Google Sheet #2 + Salesforce + Slack notification

---

**Example 3: Multi-Client Setup**

Different clients can use completely different N8N workflows:

| tenant_id | program_interest | endpoint_url |
|-----------|-----------------|--------------|
| ATL642715 | Love Box | http://...n8n.../webhook/atl-lovebox |
| FOS402334 | Volunteer | http://...n8n.../webhook/fos-volunteer |

Each webhook points to a different N8N workflow with client-specific destinations (their Google Sheets, their Salesforce, etc.)

---

### Step 2B.8: Benefits of This Approach

✅ **Zero Workflow Changes**: Add new integrations without touching workflows
✅ **Multi-Tenant Flexible**: Each tenant can have different integrations
✅ **Multiple Destinations**: Send one form to multiple systems
✅ **Admin Configurable**: Non-developers can add/remove integrations
✅ **Easy Enable/Disable**: Toggle integrations on/off without deleting
✅ **Audit Trail**: Track which integrations ran for each submission
✅ **Priority Control**: Control execution order with priority field

---

### Step 2B.9: Testing Integration Routing

**Test Checklist:**

- [ ] Create test Integration_Config record
- [ ] Create test Integration_Rule record
- [ ] Submit test form via Picasso widget
- [ ] Verify form_submission workflow triggers send_to_integration
- [ ] Check external system received data
- [ ] Verify multiple integrations run when configured
- [ ] Test with enabled=no (should skip integration)
- [ ] Verify tenant isolation (tenant A's forms don't trigger tenant B's integrations)

**Debug:**
```bash
# Monitor Bubble server logs for API calls
# Check: Settings → Logs → Server logs
# Look for: "Schedule API Workflow" and "API Connector" entries
```

---

### Step 2B.10: Deploy N8N on AWS

N8N is now your **primary integration middleware**. Here's how to deploy it on AWS for ~$7/month.

---

#### Architecture with N8N

```
Picasso Widget
  ↓
Master_Function (Lambda)
  ↓
Bubble (form_submission workflow)
  ↓ Single API call
N8N (self-hosted or cloud)
  ↓ Routes to...
  ├→ Salesforce
  ├→ HubSpot
  ├→ Mailchimp
  ├→ Slack
  ├→ Google Sheets
  └→ Any system (400+ pre-built connectors)
```

---

#### Step 1: Deploy N8N on AWS EC2 (Recommended - $7/month)

**Prerequisites:**
- AWS Account
- AWS CLI configured with appropriate profile

**Launch EC2 Instance:**

```bash
# Using AWS CLI (replace 'your-profile' with your AWS profile name)

# 1. Create key pair for SSH
aws ec2 create-key-pair \
  --profile your-profile \
  --key-name n8n-server-key \
  --query 'KeyMaterial' \
  --output text > ~/n8n-server-key.pem
chmod 400 ~/n8n-server-key.pem

# 2. Get default VPC and subnet
VPC_ID=$(aws ec2 describe-vpcs --profile your-profile --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --profile your-profile --filters "Name=vpc-id,Values=$VPC_ID" --query 'Subnets[0].SubnetId' --output text)

# 3. Create security group
SG_ID=$(aws ec2 create-security-group \
  --profile your-profile \
  --group-name n8n-security-group \
  --description "Security group for N8N server" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

# 4. Add firewall rules
aws ec2 authorize-security-group-ingress \
  --profile your-profile \
  --group-id $SG_ID \
  --ip-permissions \
    IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0}]' \
    IpProtocol=tcp,FromPort=5678,ToPort=5678,IpRanges='[{CidrIp=0.0.0.0/0}]'

# 5. Find latest Ubuntu 22.04 ARM64 AMI
AMI_ID=$(aws ec2 describe-images \
  --profile your-profile \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

# 6. Launch t4g.micro instance (ARM, 1GB RAM, ~$7/month)
INSTANCE_ID=$(aws ec2 run-instances \
  --profile your-profile \
  --image-id $AMI_ID \
  --instance-type t4g.micro \
  --key-name n8n-server-key \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":8,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=n8n-server}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

# 7. Wait for instance and get public IP
aws ec2 wait instance-running --profile your-profile --instance-ids $INSTANCE_ID
PUBLIC_IP=$(aws ec2 describe-instances \
  --profile your-profile \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "✅ N8N server launched!"
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo "SSH command: ssh -i ~/n8n-server-key.pem ubuntu@$PUBLIC_IP"
```

**Install Docker and Deploy N8N:**

```bash
# SSH into server
ssh -i ~/n8n-server-key.pem ubuntu@$PUBLIC_IP

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Log out and back in for group changes
exit
ssh -i ~/n8n-server-key.pem ubuntu@$PUBLIC_IP

# Deploy N8N with nip.io domain (for Google OAuth compatibility)
docker run -d --restart unless-stopped \
  --name n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=your-email@domain.com \
  -e N8N_BASIC_AUTH_PASSWORD='YourSecurePassword123!' \
  -e N8N_HOST=${PUBLIC_IP}.nip.io \
  -e WEBHOOK_URL=http://${PUBLIC_IP}.nip.io:5678/ \
  -e GENERIC_TIMEZONE=America/New_York \
  -e N8N_SECURE_COOKIE=false \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

echo "✅ N8N deployed!"
echo "Access at: http://${PUBLIC_IP}.nip.io:5678"
```

**Cost Breakdown:**
- t4g.micro EC2: $6/month
- 8GB EBS storage: $0.64/month
- Data transfer: ~$0.50/month
- **Total: ~$7/month**

---

#### Step 2: Simplified Bubble Configuration

**Integration_Config:**

| Field | Example |
|-------|---------|
| integration_name | "N8N - Volunteer Pipeline" |
| integration_type | "n8n_webhook" |
| endpoint_url | https://your-n8n.app/webhook/volunteer-signup |
| auth_token | your-n8n-webhook-secret (optional) |
| enabled | yes |

**Integration_Rule:**

| program_interest | integration_config | enabled |
|-----------------|-------------------|---------|
| Love Box | N8N - Love Box Pipeline | yes |
| Dare to Dream | N8N - D2D Pipeline | yes |

---

#### Step 3: Simplified send_to_integration Workflow

**Action 1: Get Form Submission** (same as before)

**Action 2: Get Integration Config** (same as before)

**Action 3: Call N8N Webhook (ONE ACTION FOR ALL VENDORS)**

Add action → Plugins → API Connector → N8N Webhook

**Only when:** `Result of step 2's integration_type = "n8n_webhook"`

**Configuration:**
```
Method: POST
URL: Result of step 2's endpoint_url

Headers:
  Content-Type: application/json
  X-N8N-Secret: Result of step 2's auth_token

Body:
{
  "submission_id": "<Result of step 1's submission_id>",
  "tenant_id": "<Result of step 1's tenant_id>",
  "form_type": "<Result of step 1's form_type>",
  "program_interest": "<Result of step 1's program_interest>",
  "applicant_email": "<Result of step 1's applicant_email>",
  "applicant_name": "<Result of step 1's applicant_name>",
  "applicant_phone": "<Result of step 1's applicant_phone>",
  "comments": "<Result of step 1's comments>",
  "responses": <Result of step 1's responses_json>
}
```

**That's it!** No conditional logic for each vendor. N8N handles all routing.

---

#### Step 4: Create N8N Workflows (Visual, No Code)

**Example: Love Box Volunteer → Salesforce + Mailchimp + Slack**

In N8N interface:

**1. Webhook Trigger**
- Create new workflow: "Love Box Pipeline"
- Add "Webhook" node
- Method: POST
- Path: `/webhook/volunteer-signup`
- Copy webhook URL → Save to Bubble Integration_Config

**2. Salesforce Node**
- Add "Salesforce" node
- Action: Create → Lead
- Credentials: Add your Salesforce OAuth
- Field mapping:
  ```
  FirstName: {{$json.applicant_name.split(' ')[0]}}
  LastName: {{$json.applicant_name.split(' ')[1]}}
  Email: {{$json.applicant_email}}
  Phone: {{$json.applicant_phone}}
  LeadSource: "Website - Love Box"
  Description: {{$json.comments}}
  ```

**3. Mailchimp Node**
- Add "Mailchimp" node
- Action: Add/Update Member
- List: "Love Box Volunteers"
- Email: `{{$json.applicant_email}}`
- Merge Fields:
  ```
  FNAME: {{$json.applicant_name.split(' ')[0]}}
  LNAME: {{$json.applicant_name.split(' ')[1]}}
  PHONE: {{$json.applicant_phone}}
  ```

**4. Slack Node**
- Add "Slack" node
- Action: Send Message
- Channel: `#love-box-team`
- Message:
  ```
  🎉 New Love Box volunteer!

  Name: {{$json.applicant_name}}
  Email: {{$json.applicant_email}}
  Phone: {{$json.applicant_phone}}

  Comments: {{$json.comments}}
  ```

**5. Activate Workflow** → Click "Active" toggle

---

#### Step 5: Multi-Tenant Setup

**Option A: Separate Webhook per Tenant/Program**

Create multiple N8N workflows:
- `/webhook/atl-lovebox` → Atlanta Love Box workflow
- `/webhook/atl-d2d` → Atlanta Dare to Dream workflow
- `/webhook/fos-volunteer` → Foster Village workflow

Each has its own Integration_Config record in Bubble.

**Option B: Single Webhook with Routing**

One N8N workflow with "Switch" node:
```
1. Webhook receives data
   ↓
2. Switch based on tenant_id or program_interest
   ├→ Case "Love Box" → Salesforce + Mailchimp workflow
   ├→ Case "Dare to Dream" → Salesforce + Slack workflow
   └→ Default → Log to Google Sheets
```

---

#### Benefits of N8N Approach

✅ **Single API call from Bubble** - No vendor-specific Bubble logic
✅ **Visual workflow builder** - Non-developers manage integrations
✅ **400+ connectors** - Pre-built for popular services
✅ **Multi-step workflows** - Chain multiple actions together
✅ **Conditional logic** - "If donation > $1000, notify CEO"
✅ **Error handling** - Built-in retries and error notifications
✅ **Cost effective** - $20/month cloud or $10/month self-hosted vs $30+ Zapier
✅ **Testing built-in** - Execute workflows manually to test
✅ **Version control** - Export/import workflows as JSON
✅ **Unlimited executions** - No per-task pricing

---

#### Cost Comparison

| Solution | Monthly Cost | Limits |
|----------|-------------|--------|
| Direct Integration (Bubble) | $0 (included) | Hard-coded vendors |
| N8N Cloud | $20 | Unlimited executions |
| N8N Self-Hosted | ~$10-15 | Unlimited everything |
| Zapier | $30-75+ | 750-2000 tasks |
| Make.com | $10-30+ | 10K-40K operations |

---

#### When You've Outgrown Direct Integration

**Signs you need N8N:**
- Supporting > 5 vendors
- Adding new vendors requires developer time
- Need multi-step workflows ("Create in Salesforce, wait 5 minutes, then email")
- Want conditional routing ("If high priority, send to Slack immediately")
- Non-technical staff want to modify integrations
- Need better error handling and retry logic

**Migration is easy:**
1. Set up N8N
2. Create workflow in N8N that replicates your Bubble logic
3. Update Integration_Config to point to N8N webhook
4. Remove conditional vendor actions from Bubble workflow
5. Test end-to-end

---

### Step 2B.11: Configure Google Service Account for N8N

N8N needs a Google Cloud service account to authenticate with Google Sheets API.

---

#### Create Google Cloud Service Account

**Go to:** [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts

**Option 1: Use Existing Service Account** (if you already have one for Sheets integration)

If you already have a service account for another project (e.g., Austin Angels Lex Sheets integration), you can reuse it. Note that service accounts are project-specific, so the email will reflect the original project name.

**Option 2: Create New Service Account** (recommended for isolation)

1. **Create service account:**
   ```
   Name: n8n-sheets-integration
   Description: Service account for N8N Google Sheets integration
   ```

2. **Click "Create and Continue"**

3. **Grant access:**
   - Role: None needed (we'll grant access per-sheet)
   - Click "Continue" → "Done"

4. **Create JSON key:**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Type: JSON
   - Click "Create"
   - Save the downloaded JSON file (e.g., `n8n-sheets-service-account.json`)

**Service account email format:**
```
n8n-sheets-integration@your-project-id.iam.gserviceaccount.com
```

---

#### Enable Required APIs

**Go to:** [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Library

**Enable these APIs:**

1. **Google Sheets API**
   - Search for "Google Sheets API"
   - Click "Enable"

2. **Google Drive API**
   - Search for "Google Drive API"
   - Click "Enable"
   - ⚠️ **Required** even though you're using Sheets - N8N needs it to list and access spreadsheets

---

#### Configure N8N Google Sheets Credentials

**Go to:** Your N8N instance (e.g., http://44.200.215.180.nip.io:5678)

1. **Click on your profile icon** (top right) → "Credentials"

2. **Click "Add Credential"**

3. **Select "Google Sheets API" from the list**

4. **Choose authentication method:** "Service Account"

5. **Paste service account JSON:**
   - Open the downloaded JSON file
   - Copy the entire contents
   - Paste into the "Service Account Email JSON" field

6. **Click "Save"**

7. **Test connection:**
   - N8N will validate the credentials
   - You should see "Credentials tested successfully"

---

#### Share Google Sheets with Service Account

For each Google Sheet you want N8N to write to:

1. **Open the Google Sheet** in your browser

2. **Click "Share" button** (top right)

3. **Add the service account email:**
   ```
   n8n-sheets-integration@your-project-id.iam.gserviceaccount.com
   ```

4. **Grant "Editor" permission**

5. **Uncheck "Notify people"** (service accounts don't receive emails)

6. **Click "Share"**

**Important:** You must share EACH sheet individually with the service account. The service account can only access sheets it's explicitly been granted access to.

---

### Step 2B.12: Configure N8N Workflow for Google Sheets

Now configure your N8N workflow to receive form submissions from Bubble and write them to Google Sheets.

---

#### Step 1: Create Webhook Node

**In N8N interface:**

1. **Create new workflow:** "Bubble Form Submissions → Google Sheets"

2. **Add "Webhook" node**
   - Method: POST
   - Path: `/webhook/bubble-form-submission`
   - Authentication: None (optional - add later)
   - Response Mode: "On Received"
   - Response Data: "First Entry JSON"

3. **Click "Listen for Test Event"**

4. **Copy webhook URL:**
   ```
   http://44.200.215.180.nip.io:5678/webhook/bubble-form-submission
   ```
   (Save this URL - you'll add it to Bubble Integration_Config)

5. **Leave it listening** (we'll test it later)

---

#### Step 2: Add Google Sheets Node

1. **Add "Google Sheets" node** (drag from left panel)

2. **Connect** webhook node to Google Sheets node

3. **Configure node:**

   **Resource:** Spreadsheet

   **Operation:** Append

   **Credentials:** Select the Google Sheets credentials you created earlier

   **Document:**
   - Click "Select from list"
   - Choose your target spreadsheet
   - (If it doesn't appear, ensure you've shared the sheet with the service account email)

   **Sheet:**
   - Select the specific sheet/tab name
   - Usually "Sheet1" or your custom sheet name

4. **Configure Column Mappings:**

   **IMPORTANT:** Your Google Sheet must already have column headers in Row 1.

   **Manual Column Setup (before N8N):**

   Open your Google Sheet and add these headers in Row 1:
   ```
   | Date | Name | Email | Phone | Program | Comments | Form Type | Tenant | Submission ID |
   ```

   **In N8N Google Sheets node:**

   Click "Add Option" → "Columns"

   Map each column to incoming webhook data:

   ```
   Column A (Date):
     {{$json.submitted_at}}

   Column B (Name):
     {{$json.applicant_name}}

   Column C (Email):
     {{$json.applicant_email}}

   Column D (Phone):
     {{$json.applicant_phone}}

   Column E (Program):
     {{$json.program_interest}}

   Column F (Comments):
     {{$json.comments}}

   Column G (Form Type):
     {{$json.form_type}}

   Column H (Tenant):
     {{$json.tenant_id}}

   Column I (Submission ID):
     {{$json.submission_id}}
   ```

   **Alternative - Using "Field Name" Mapping:**

   Instead of Column A/B/C, you can use field names if they match your headers:
   ```
   Date = {{$json.submitted_at}}
   Name = {{$json.applicant_name}}
   Email = {{$json.applicant_email}}
   Phone = {{$json.applicant_phone}}
   Program = {{$json.program_interest}}
   Comments = {{$json.comments}}
   Form Type = {{$json.form_type}}
   Tenant = {{$json.tenant_id}}
   Submission ID = {{$json.submission_id}}
   ```

---

#### Step 3: Test the Workflow

1. **Send test payload from Bubble:**

   Use the webhook URL you copied earlier to test from Bubble's API Workflow Scheduler debugger, or manually via curl:

   ```bash
   curl -X POST http://44.200.215.180.nip.io:5678/webhook/bubble-form-submission \
     -H "Content-Type: application/json" \
     -d '{
       "submission_id": "test_123",
       "tenant_id": "ATL642715",
       "form_type": "volunteer_apply",
       "program_interest": "Love Box",
       "submitted_at": "2025-10-11T15:30:00Z",
       "applicant_name": "Test User",
       "applicant_email": "test@example.com",
       "applicant_phone": "+1-555-0100",
       "comments": "This is a test submission"
     }'
   ```

2. **Check N8N execution:**
   - N8N should show a successful execution
   - Green checkmarks on both nodes

3. **Verify Google Sheet:**
   - Open your Google Sheet
   - You should see a new row with the test data

---

#### Step 4: Activate Workflow

1. **Click "Active" toggle** (top right) to turn workflow ON

2. **Workflow is now live** and will process all incoming webhooks

3. **Get production webhook URL:**
   ```
   http://44.200.215.180.nip.io:5678/webhook/bubble-form-submission
   ```

---

#### Step 5: Add Webhook URL to Bubble

**Go to:** Bubble Data tab → Integration_Configs → Create new entry

**Add new Integration_Config:**
```
integration_name: "N8N - Google Sheets Pipeline"
integration_type: "n8n_webhook"
endpoint_url: "http://44.200.215.180.nip.io:5678/webhook/bubble-form-submission"
auth_token: (leave blank for now)
enabled: yes
tenant_id: [Your tenant ID, e.g., ATL642715]
```

**Add corresponding Integration_Rule:**
```
program_interest: "Love Box" (or the program you want to route)
integration_config: → Select "N8N - Google Sheets Pipeline"
enabled: yes
tenant_id: [Your tenant ID]
```

---

#### Step 6: End-to-End Test

1. **Submit a form** via Picasso widget

2. **Check flow:**
   - ✅ Lambda processes form
   - ✅ Bubble receives webhook
   - ✅ Form_Submission record created in Bubble
   - ✅ Integration_Rule matches and triggers send_to_integration
   - ✅ Bubble sends to N8N webhook
   - ✅ N8N workflow executes
   - ✅ New row appears in Google Sheet

3. **Verify data integrity:**
   - Check that all fields populated correctly
   - Verify date format is readable
   - Confirm no data truncation

---

#### Troubleshooting N8N → Google Sheets

**Error: "Could not find the spreadsheet"**
- ✅ Ensure Google Sheets API is enabled
- ✅ Ensure Google Drive API is enabled
- ✅ Verify service account has Editor access to the sheet
- ✅ Check that you're selecting the correct spreadsheet from the dropdown

**Error: "Invalid credentials"**
- ✅ Verify JSON service account file is complete
- ✅ Check that service account is from the same project where APIs are enabled
- ✅ Ensure service account key hasn't been deleted

**Error: "Unable to append row"**
- ✅ Verify sheet has column headers in Row 1
- ✅ Check column count matches (9 columns in example)
- ✅ Ensure column mappings reference valid JSON fields ({{$json.field_name}})

**Data not appearing in sheet:**
- ✅ Check N8N execution log for errors (click on workflow execution in left panel)
- ✅ Verify webhook is receiving data (check webhook node output)
- ✅ Confirm Google Sheets node executed successfully (green checkmark)
- ✅ Check you're looking at the correct sheet/tab

---

## Phase 3: Historical Analytics API Integration

### Step 3.1: Create API Connector Setup (if not exists)

**Go to:** Plugins → Add plugins → API Connector

**Install** API Connector plugin

---

### Step 3.2: Configure Analytics_Function API Call

**Go to:** Plugins → API Connector → Add another API

**Name:** `Picasso Analytics API`

**Add Call: Get Form Analytics**

**Configuration:**
```
Name: Get_Form_Analytics
Use as: Action

Method: POST
URL: https://[your-analytics-function-url].lambda-url.us-east-1.on.aws/

Headers:
  Content-Type: application/json
  Authorization: Bearer [your-jwt-token] (if required)

Body type: JSON
Body:
{
  "tenant_hash": "<tenant_hash>",
  "start_date": "<start_date>",
  "end_date": "<end_date>",
  "include_forms": true
}

Data type: JSON
```

**Initialize Call:**
- Use test values:
  ```
  tenant_hash: "your_tenant_hash"
  start_date: "2025-01-01"
  end_date: "2025-01-31"
  include_forms: true
  ```
- Click "Initialize call"
- Bubble will parse the response structure

---

### Step 3.3: Save Response Structure

**Expected Response Structure:**
```json
{
  "conversation_count": 150,
  "total_messages": 450,
  "form_submissions": {
    "total_submissions": 25,
    "form_counts": {
      "volunteer_apply": 15,
      "contact_us": 7,
      "support_request": 3
    },
    "submissions_by_date": {
      "2025-01-15": {
        "count": 5,
        "forms": {
          "volunteer_apply": 3,
          "contact_us": 2
        }
      }
    },
    "recent_submissions": [
      {
        "submission_id": "form_123",
        "timestamp": "2025-01-15T10:30:00Z",
        "form_type": "volunteer_apply",
        "responses": {...}
      }
    ]
  }
}
```

**Bubble will create return types automatically:**
- `form_submissions`
- `form_counts` (list of key-value)
- `submissions_by_date` (list of objects)
- `recent_submissions` (list of objects)

---

## Phase 4: Configure Lambda Environment and Tenant Config

### Step 4.1: Set Lambda Environment Variables

**Go to:** AWS Lambda Console → Master_Function_Staging → Configuration → Environment variables

**Add environment variables:**
```
BUBBLE_WEBHOOK_URL = https://your-app.bubbleapps.io/api/1.1/wf/form_submission
BUBBLE_API_KEY = your-bubble-api-token
```

**Or via AWS CLI:**
```bash
aws lambda update-function-configuration \
  --function-name Master_Function_Staging \
  --environment "Variables={BUBBLE_WEBHOOK_URL=https://your-app.bubbleapps.io/api/1.1/wf/form_submission,BUBBLE_API_KEY=your-bubble c-api-token}"
```

**Note:** These are universal across all tenants. Only override in tenant config for special cases (e.g., enterprise clients with their own Bubble instance).

---

### Step 4.2: Enable Forms in Tenant Configuration

**File:** `s3://picasso-tenant-configs/tenants/[TENANT_ID]/[TENANT_ID]-config.json`

**Add to config:**
```json
{
  "tenant_id": "FOS402334",

  "conversational_forms": {
    "enabled": true,
    "volunteer_apply": {
      "fields": [...],
      "notifications": {...}
    }
  }
}
```

**Optional - Override webhook for special cases:**
```json
{
  "tenant_id": "ENTERPRISE001",

  "bubble_integration": {
    "webhook_url": "https://enterprise-custom.bubbleapps.io/api/1.1/wf/form_submission",
    "api_key": "enterprise-specific-key"
  },

  "conversational_forms": {
    "enabled": true,
    "volunteer_apply": { ... }
  }
}
```

**Upload to S3:**
```bash
aws s3 cp FOS402334-config.json s3://picasso-tenant-configs/tenants/FOS402334/FOS402334-config.json
```

---

### Step 4.3: Webhook Implementation (Already Done!)

**Location:** `Lambdas/lambda/Master_Function_Staging/form_handler.py`

**Good news:** The `_send_bubble_webhook()` function is already implemented! It automatically:
- Checks if `conversational_forms.enabled = true` in tenant config
- Uses `BUBBLE_WEBHOOK_URL` and `BUBBLE_API_KEY` from environment variables
- Falls back to tenant config if override is specified
- Extracts common fields from form responses (email, first_name, last_name, phone, program_interest, comments)
- Sends them as individual parameters to Bubble
- Includes full JSON as `responses_json` for reference

**Webhook payload sent to Bubble:**
```json
{
  "submission_id": "uuid-123",
  "tenant_id": "FOS402334",
  "form_type": "volunteer_apply",
  "timestamp": "2025-10-03T10:30:00Z",
  "session_id": "session_456",
  "conversation_id": "conv_789",

  "applicant_email": "sarah@example.com",
  "applicant_first_name": "Sarah",
  "applicant_last_name": "Martinez",
  "applicant_name": "Sarah Martinez",
  "applicant_phone": "+1-555-0100",
  "program_interest": "Foster Care Mentor",
  "comments": "I have experience working with children and would love to help foster families in my community.",

  "responses_json": "{\"email\":\"sarah@example.com\",\"first_name\":\"Sarah\",...}"
}
```

**No JSON parsing needed in Bubble!** Just map the fields directly.

---

### Step 4.4: Deploy Lambda

After setting Lambda environment variables and enabling forms in tenant config, deploy the updated Lambda:

```bash
cd Lambdas/lambda/Master_Function_Staging
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*"
aws lambda update-function-code --function-name Master_Function_Staging --zip-file fileb://deployment.zip
```

**Verify deployment:**
```bash
aws lambda get-function --function-name Master_Function_Staging --query 'Configuration.LastModified'
```

---

## Phase 5: Build Bubble Dashboard UI

### Step 5.1: Create Form Submissions Page

**Create new page:** `admin_forms`

**Privacy:** Only logged-in admins

---

### Step 5.2: Add Filter Controls

**Add Input Elements:**

**Date Range Picker:**
- Type: Date/Time Picker
- Name: `date_start`
- Initial: Current date - 30 days

**Date Range Picker:**
- Type: Date/Time Picker
- Name: `date_end`
- Initial: Current date

**Dropdown: Form Type Filter**
- Type: Dropdown
- Choices style: Static
- Choices: All forms, volunteer_apply, contact_us, support_request
- Name: `form_type_filter`

**Button: Refresh Data**
- Text: "Refresh Analytics"
- Workflow: Call Analytics_Function API

---

### Step 5.3: Display Real-Time Submissions Table

**Add Repeating Group:**

**Name:** `RG_Recent_Submissions`

**Data source:**
```
Search for Form_Submissions

Constraints:
  tenant_id = Current User's tenant_id
  submitted_at >= date_start's value
  submitted_at <= date_end's value
  form_type = form_type_filter's value (if not "All forms")

Sort by: submitted_at (descending)
```

**Columns to display:**
1. **Applicant Name** - `Current cell's Form_Submission's applicant_name`
2. **Email** - `Current cell's Form_Submission's applicant_email`
3. **Form Type** - `Current cell's Form_Submission's form_type`
4. **Program** - `Current cell's Form_Submission's program_interest`
5. **Submitted** - `Current cell's Form_Submission's submitted_at:formatted as MMM DD, YYYY`
6. **Actions** - Button "View Details" → Opens popup

**Optional Column:**
- **Comments Preview** - `Current cell's Form_Submission's comments:truncated to 50` (if you want a preview in the table)

---

### Step 5.4: Add Summary Charts

**Chart 1: Total Submissions Over Time**

**Add Chart Element** (use Chart.js plugin or similar)

**Data source:** Workflow result from `Get_Form_Analytics`

**Type:** Line chart

**X-axis:** Dates from `Get_Form_Analytics's form_submissions's submissions_by_date:each item's key`

**Y-axis:** Counts from `Get_Form_Analytics's form_submissions's submissions_by_date:each item's count`

---

**Chart 2: Submissions by Form Type**

**Add Chart Element**

**Type:** Pie chart

**Labels:** `Get_Form_Analytics's form_submissions's form_counts:each item's key`

**Data:** `Get_Form_Analytics's form_submissions's form_counts:each item's value`

**Colors:** Custom (assign color per form type)

---

**Metric Cards:**

**Card 1: Total Submissions**
- Text: `Get_Form_Analytics's form_submissions's total_submissions`
- Label: "Total Form Submissions"

**Card 2: This Month**
- Text: `Search for Form_Submissions:count` (filtered by this month)
- Label: "Forms This Month"

**Card 3: Conversion Rate**
- Text: `(Get_Form_Analytics's form_submissions's total_submissions / Get_Form_Analytics's conversation_count) * 100`
- Label: "Conversion Rate (%)"

---

### Step 5.5: Create Submission Detail Popup

**Add Popup:** `popup_submission_details`

**Content:**

**Display Fields:**
- Submission ID
- Form Type
- Submitted At
- Applicant Name
- Applicant Email
- Applicant Phone
- Program Interest
- Comments (full text)
- Full Responses (JSON formatted)

**Actions:**
- Button: "Send Email" → Open email client with pre-filled template
- Button: "Close" → Close popup

---

### Step 5.6: Add Workflow to Load Analytics

**Create Workflow:**

**Event:** When page is loaded

**Action 1:** API Connector - Get_Form_Analytics
- `tenant_id` = Current User's tenant_id
- `start_date` = date_start's value:formatted as YYYY-MM-DD
- `end_date` = date_end's value:formatted as YYYY-MM-DD
- `include_forms` = yes

**Action 2:** Display charts (populate Chart elements with results)

---

**Create Workflow:**

**Event:** When "Refresh Analytics" button is clicked

**Action 1:** Same as page load workflow

---

## Phase 6: Testing Checklist

### Test Real-Time Webhook

- [ ] Submit a test form in Picasso widget
- [ ] Check Bubble Logs → Server logs for webhook POST
- [ ] Verify Form_Submission record created in Data tab
- [ ] Confirm all fields populated correctly
- [ ] Check timestamp is correct (UTC conversion)

### Test Historical Analytics

- [ ] Click "Refresh Analytics" button
- [ ] Verify API call succeeds (check network tab)
- [ ] Confirm charts display data
- [ ] Check metric cards show correct counts
- [ ] Verify date range filtering works
- [ ] Test form type filter

### Test UI Workflows

- [ ] Click on submission row → Details popup opens
- [ ] Verify all submission details display correctly
- [ ] Email button → Opens with pre-filled content

### Test Edge Cases

- [ ] Zero submissions (empty state displays)
- [ ] Very old date range (loads from S3 archive)
- [ ] Multiple form types in same day
- [ ] Duplicate webhook calls (idempotency)
- [ ] Invalid JSON in responses field

---

## Phase 7: Production Deployment

### Step 7.1: Deploy to Bubble Production

**Go to:** Deployment → Deploy to live

**Checklist:**
- [ ] Workflow API endpoint URL updated (use production URL)
- [ ] API Connector uses production Analytics_Function URL
- [ ] All privacy rules configured
- [ ] Page permissions set (admin only)

---

### Step 7.2: Update Tenant Config with Production URL

**Update S3 config:**
```json
{
  "bubble_integration": {
    "enabled": true,
    "webhook_url": "https://your-app.bubbleapps.io/api/1.1/wf/form_submission",
    "api_key": "production-api-key"
  }
}
```

---

### Step 7.3: Monitor Initial Traffic

**Check CloudWatch Logs:**
```bash
aws logs tail /aws/lambda/Master_Function_Staging --follow --filter-pattern "Bubble"
```

**Look for:**
- ✅ "Sent form submission to Bubble"
- ❌ "Bubble webhook error"

**Check Bubble Server Logs:**
- Workflow execution logs
- API call logs
- Database creation logs

---

## Phase 8: Enhancements (Optional)

### Enhancement 1: Email Alerts for New Submissions

**Create workflow:**
- Trigger: When Form_Submission is created
- Condition: Status is "submitted"
- Action: Send email to admin team

---

### Enhancement 2: Auto-Assignment

**Create workflow:**
- Trigger: When Form_Submission is created
- Condition: form_type is "volunteer_apply"
- Action: Assign to User based on round-robin or workload

---

### Enhancement 3: Export to CSV

**Add button:** "Export to CSV"

**Workflow:**
- Use CSV plugin
- Export RG_Recent_Submissions data
- Download file

---

### Enhancement 4: Slack Notifications

**Install Slack plugin**

**Create workflow:**
- Trigger: When Form_Submission is created
- Action: Send to Slack channel
- Message: "New {form_type} from {applicant_name}"

---

## Troubleshooting

### Webhook Not Receiving Data

**Check:**
1. Workflow API is enabled in Settings → API
2. Backend workflow is set to "public"
3. Webhook URL in tenant config is correct (production vs test)
4. Lambda logs show "Sent to Bubble"
5. Bubble server logs show POST request received

**Debug:**
```bash
# Test webhook manually
curl -X POST https://your-app.bubbleapps.io/api/1.1/wf/form_submission \
  -H "Content-Type: application/json" \
  -d '{
    "submission_id": "test_123",
    "tenant_id": "FOS402334",
    "form_type": "test",
    "responses": "{\"email\":\"test@example.com\"}",
    "timestamp": "2025-01-15T10:00:00Z"
  }'
```

---

### Analytics API Not Loading

**Check:**
1. API Connector initialized successfully
2. Analytics_Function Lambda is deployed
3. JWT token is valid (if required)
4. Date range is valid (YYYY-MM-DD format)
5. include_forms parameter is true

**Debug:**
```bash
# Test API call manually
curl -X POST https://[analytics-url].lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_hash": "your_hash",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31",
    "include_forms": true
  }'
```

---

### Form Data Not Displaying

**Check:**
1. Form_Submission records exist in Data tab
2. Privacy rules allow Current User to view
3. Repeating group constraints are not too restrictive
4. Date range includes submission dates
5. tenant_id matches Current User's tenant_id

---

## Security Checklist

- [ ] Workflow API uses API token authentication
- [ ] Privacy rules prevent cross-tenant data access
- [ ] Admin pages require authentication
- [ ] HTTPS only for all webhooks
- [ ] API keys stored securely (not in client-side code)
- [ ] Rate limiting enabled on Bubble API
- [ ] Webhook validates tenant_id before creating records
- [ ] Sensitive PII fields have restricted access

---

## Summary

This playbook provides complete integration of form submission analytics into Bubble:

✅ **Real-time updates** via webhook (instant visibility)
✅ **Historical analytics** via API (charts and reporting)
✅ **Complete UI** with filters, tables, and visualizations
✅ **Production-ready** with testing and monitoring

**Estimated Setup Time:** 4-6 hours

**Prerequisites:**
- Bubble account with Workflow API enabled
- AWS Lambda functions deployed (form_handler, Analytics_Function)
- Tenant config access (S3)

**Next Steps:**
1. Start with Phase 1 (Data Structure)
2. Set up webhook (Phase 2)
3. Build UI (Phase 5)
4. Test thoroughly (Phase 6)
5. Deploy to production (Phase 7)
