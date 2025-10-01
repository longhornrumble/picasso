# Form Downstream Integrations Guide

## Overview

This guide explains how to integrate form submissions from the Picasso chat widget with downstream systems like Google Sheets, CRM platforms, and custom APIs.

## Current Integration Capabilities

The Master Function's `form_handler.py` already includes comprehensive downstream integration capabilities:

### 1. Email Notifications ✅
- **AWS SES** integration with HTML templates
- Multiple recipients per form
- Priority-based template selection
- Template variables with form data substitution
- Confirmation emails to form submitters

### 2. Webhook Integration ✅
- **HTTP POST** to custom webhook URLs
- Custom headers support (authentication, content-type)
- JSON payload with complete form data
- 10-second timeout with error handling
- Perfect for: Zapier, Make.com, n8n, custom APIs, CRM systems

### 3. Lambda Fulfillment ✅
- Invoke another Lambda function for custom processing
- Async invocation (fire-and-forget)
- Pass complete form data + tenant context
- Can be used to trigger complex workflows

### 4. DynamoDB Storage ✅
- All submissions stored in `picasso_form_submissions` table
- Full audit trail with timestamps
- Queryable by tenant, form type, date
- Can be exported or synced to other systems

### 5. S3 Storage ✅
- Optional JSON export to S3 bucket
- Organized by tenant and form type
- Can trigger S3 events for downstream processing

## What's Missing

### Google Sheets Integration
Previous implementation existed in legacy `AustinAngels_CoreFunction` but needs to be ported to the new multi-tenant architecture.

### Direct CRM APIs
- Salesforce API
- HubSpot API
- Pipedrive API
- Custom CRM integrations

## Recommended Approach: Webhook-First Strategy

### Why Webhooks Are Best

1. **Universal Compatibility**: Works with ANY system
2. **No-Code Solutions**: Use Zapier/Make.com/n8n to connect to 5000+ apps
3. **Flexibility**: Easy to add new integrations without Lambda changes
4. **Tenant-Specific**: Each tenant can have different downstream systems
5. **Low Maintenance**: No API version management

### Architecture Flow

```
Form Submission → Master Function → Webhook POST
                                        ↓
                                   Zapier/Make.com/n8n
                                        ↓
                      ┌─────────────────┼─────────────────┐
                      ↓                 ↓                 ↓
               Google Sheets      Salesforce CRM    HubSpot CRM
```

## Implementation Options

### Option 1: Webhook → Zapier/Make.com (Recommended)

**Pros:**
- Zero code required
- Connect to Google Sheets, Salesforce, HubSpot, 5000+ apps
- Per-tenant configuration (different Zaps per client)
- Visual workflow builder
- Built-in error handling and retries
- Free tier available

**Setup:**
1. Configure webhook URL in tenant config
2. Create Zap/Make scenario to receive webhook
3. Map form fields to destination (Sheets/CRM)
4. Deploy - takes 15 minutes per tenant

**Tenant Configuration Example:**

```json
{
  "conversational_forms": {
    "volunteer_apply": {
      "fields": [...],
      "notifications": {
        "webhook": {
          "enabled": true,
          "url": "https://hooks.zapier.com/hooks/catch/12345/abcdef/",
          "headers": {
            "Content-Type": "application/json",
            "X-API-Key": "tenant-specific-key"
          }
        }
      },
      "fulfillment": {
        "type": "email",
        "template": "volunteer_welcome"
      }
    }
  }
}
```

**Webhook Payload Format:**

```json
{
  "event": "form_submission",
  "tenant_id": "tenant_123",
  "submission_id": "form_volunteer_1642248600_abc123de",
  "form_type": "volunteer_signup",
  "timestamp": "2024-01-15T15:30:00Z",
  "data": {
    "responses": {
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "+15551234567",
      "availability": "Weekends"
    },
    "metadata": {
      "session_id": "session_abc123",
      "conversation_id": "conv_xyz789",
      "source": "picasso_chat"
    }
  }
}
```

### Option 2: Direct Google Sheets API (Code Required)

**Pros:**
- No third-party service
- Real-time updates
- Full control

**Cons:**
- Requires OAuth2 implementation
- Service account management per tenant
- API quota limits
- More maintenance

**Implementation Steps:**

1. **Update Lambda Dependencies** (`requirements.txt`):
```
google-api-python-client==2.100.0
google-auth==2.23.0
```

2. **Store Credentials in AWS Secrets Manager:**
```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "your-service-account@project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

3. **Add to `form_handler.py`:**

```python
def _process_fulfillment(self, form_config: Dict[str, Any], form_type: str,
                       responses: Dict[str, Any], submission_id: str) -> Dict[str, Any]:
    """Process form fulfillment actions"""
    fulfillment = form_config.get('fulfillment', {})
    fulfillment_type = fulfillment.get('type')

    # ... existing code ...

    elif fulfillment_type == 'google_sheets':
        sheet_id = fulfillment.get('sheet_id')
        tab_name = fulfillment.get('tab_name', 'Sheet1')

        try:
            result = self._append_to_google_sheet(sheet_id, tab_name, responses)
            return {
                'type': 'google_sheets',
                'status': 'appended',
                'sheet_id': sheet_id,
                'row_count': result.get('updates', {}).get('updatedRows', 0)
            }
        except Exception as e:
            logger.error(f"Google Sheets error: {str(e)}")
            return {'type': 'google_sheets', 'status': 'error', 'error': str(e)}

    return {'type': fulfillment_type, 'status': 'unsupported'}

def _append_to_google_sheet(self, sheet_id: str, tab_name: str,
                           data: Dict[str, Any]) -> Dict[str, Any]:
    """Append form data to Google Sheet"""
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    import json
    import os

    # Load credentials from Secrets Manager or environment
    credentials_json = self._get_secret('google_sheets_credentials')
    credentials_dict = json.loads(credentials_json)

    # Create credentials
    creds = service_account.Credentials.from_service_account_info(
        credentials_dict,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )

    # Build service
    service = build('sheets', 'v4', credentials=creds)

    # Get field order from fulfillment config
    field_order = self.tenant_config.get('conversational_forms', {}).get(
        'volunteer_apply', {}
    ).get('fulfillment', {}).get('field_order', [])

    # Convert data to row format
    if field_order:
        row = [data.get(field, '') for field in field_order]
    else:
        # Default: alphabetical order
        row = [data.get(key, '') for key in sorted(data.keys())]

    # Add timestamp
    from datetime import datetime
    row.insert(0, datetime.now().isoformat())

    # Append to sheet
    result = service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=f'{tab_name}!A:Z',
        valueInputOption='RAW',
        insertDataOption='INSERT_ROWS',
        body={'values': [row]}
    ).execute()

    logger.info(f"Appended {result.get('updates', {}).get('updatedRows', 0)} rows to sheet")
    return result

def _get_secret(self, secret_name: str) -> str:
    """Retrieve secret from AWS Secrets Manager"""
    import boto3
    import json

    client = boto3.client('secretsmanager')

    try:
        response = client.get_secret_value(SecretId=secret_name)
        return response['SecretString']
    except Exception as e:
        logger.error(f"Error retrieving secret {secret_name}: {str(e)}")
        raise
```

4. **Update Tenant Config:**

```json
{
  "conversational_forms": {
    "volunteer_apply": {
      "fulfillment": {
        "type": "google_sheets",
        "sheet_id": "1ABC...XYZ",
        "tab_name": "Volunteer Applications",
        "field_order": [
          "first_name",
          "last_name",
          "email",
          "phone",
          "availability",
          "program_interest"
        ]
      }
    }
  }
}
```

### Option 3: Direct CRM API Integration (Code Required)

**Pros:**
- Native CRM features (lead scoring, automation)
- No intermediate service

**Cons:**
- Different API per CRM (Salesforce ≠ HubSpot)
- Complex authentication (OAuth2)
- Rate limiting
- High maintenance

**Implementation for Salesforce:**

1. **Update Dependencies:**
```
simple-salesforce==1.12.4
```

2. **Add to `form_handler.py`:**

```python
elif fulfillment_type == 'salesforce':
    try:
        result = self._create_salesforce_lead(responses)
        return {
            'type': 'salesforce',
            'status': 'created',
            'lead_id': result.get('id')
        }
    except Exception as e:
        logger.error(f"Salesforce error: {str(e)}")
        return {'type': 'salesforce', 'status': 'error', 'error': str(e)}

def _create_salesforce_lead(self, data: Dict[str, Any]) -> Dict[str, Any]:
    """Create lead in Salesforce"""
    from simple_salesforce import Salesforce

    # Get credentials from Secrets Manager
    sf_credentials = json.loads(self._get_secret('salesforce_credentials'))

    # Connect to Salesforce
    sf = Salesforce(
        username=sf_credentials['username'],
        password=sf_credentials['password'],
        security_token=sf_credentials['security_token'],
        domain='login'  # or 'test' for sandbox
    )

    # Map form data to Salesforce Lead object
    lead_data = {
        'FirstName': data.get('first_name'),
        'LastName': data.get('last_name'),
        'Email': data.get('email'),
        'Phone': data.get('phone'),
        'Company': data.get('organization', 'Individual'),
        'LeadSource': 'Picasso Chat Widget',
        'Description': data.get('message', '')
    }

    # Create lead
    result = sf.Lead.create(lead_data)
    logger.info(f"Created Salesforce lead: {result['id']}")

    return result
```

3. **Store Credentials in Secrets Manager:**
```json
{
  "username": "admin@organization.org",
  "password": "your_password",
  "security_token": "your_security_token"
}
```

## Testing Webhook Integration

### 1. Test Endpoint Setup

Use a webhook testing service:
- **Webhook.site**: https://webhook.site (generates test URL)
- **RequestBin**: https://requestbin.com
- **Pipedream**: https://pipedream.com

### 2. Configure Test Tenant

Update tenant config with test webhook URL:

```json
{
  "conversational_forms": {
    "test_form": {
      "notifications": {
        "webhook": {
          "enabled": true,
          "url": "https://webhook.site/your-unique-id",
          "headers": {
            "Content-Type": "application/json"
          }
        }
      }
    }
  }
}
```

### 3. Submit Test Form

Submit a test form through the Picasso widget and verify:
- Webhook receives POST request
- Payload contains all form fields
- Headers are correct
- Response time is acceptable

### 4. Check Lambda Logs

```bash
aws logs tail /aws/lambda/Master_Function_Staging \
  --since 10m \
  --filter-pattern "webhook" \
  --profile chris-admin
```

## Zapier Integration Example

### Step 1: Create Zap

1. Go to https://zapier.com/app/zaps
2. Click "Create Zap"
3. **Trigger**: Webhooks by Zapier → Catch Hook
4. Copy webhook URL
5. **Action**: Google Sheets → Create Spreadsheet Row

### Step 2: Configure Tenant Webhook

Update tenant config with Zapier webhook URL:

```json
{
  "conversational_forms": {
    "volunteer_apply": {
      "notifications": {
        "webhook": {
          "enabled": true,
          "url": "https://hooks.zapier.com/hooks/catch/12345/abcdef/"
        }
      }
    }
  }
}
```

### Step 3: Map Fields in Zapier

In the Google Sheets action, map webhook payload fields:

```
Column A → {{data__responses__first_name}}
Column B → {{data__responses__last_name}}
Column C → {{data__responses__email}}
Column D → {{data__responses__phone}}
Column E → {{data__responses__availability}}
Column F → {{timestamp}}
```

### Step 4: Test & Deploy

1. Submit test form through Picasso
2. Verify row appears in Google Sheet
3. Enable Zap

## Make.com Integration Example

### Step 1: Create Scenario

1. Go to https://www.make.com/en/scenarios
2. Click "Create a new scenario"
3. Add **Webhooks → Custom webhook** module
4. Copy webhook URL

### Step 2: Add Google Sheets Module

1. Add **Google Sheets → Add a row** module
2. Connect to Google account
3. Select spreadsheet and worksheet

### Step 3: Map Fields

```
A: {{1.data.responses.first_name}}
B: {{1.data.responses.last_name}}
C: {{1.data.responses.email}}
D: {{1.data.responses.phone}}
E: {{1.data.responses.availability}}
F: {{1.timestamp}}
```

### Step 4: Activate Scenario

Click "Schedule settings" → Turn on

## Monitoring & Troubleshooting

### CloudWatch Metrics

Monitor webhook success/failure rates:

```python
# In form_handler.py
cloudwatch = boto3.client('cloudwatch')

cloudwatch.put_metric_data(
    Namespace='Picasso/Forms',
    MetricData=[
        {
            'MetricName': 'WebhookSuccess',
            'Value': 1 if success else 0,
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'TenantId', 'Value': self.tenant_id},
                {'Name': 'FormType', 'Value': form_type}
            ]
        }
    ]
)
```

### Common Issues

**Webhook Timeout (10s)**
- Increase timeout in code
- Use async webhook calls
- Check destination endpoint performance

**Authentication Failures**
- Verify API keys in headers
- Check credential expiration
- Review Secrets Manager permissions

**Data Mapping Errors**
- Validate field names match
- Check for null/empty values
- Test with sample data first

## Security Considerations

### Webhook Security

1. **Use HTTPS only** for webhook URLs
2. **Implement signature verification** (HMAC-SHA256)
3. **Rotate API keys** regularly
4. **Rate limit** webhook endpoints
5. **Validate payloads** before processing

### Credentials Management

1. **Never hardcode** API keys or passwords
2. **Use AWS Secrets Manager** for sensitive data
3. **Implement least privilege** IAM policies
4. **Audit secret access** via CloudTrail
5. **Rotate credentials** every 90 days

## Cost Considerations

### Webhook (Zapier/Make.com)
- **Free tier**: 100 tasks/month
- **Starter**: $19.99/month (750 tasks)
- **Professional**: $49/month (2,000 tasks)
- **Cost per submission**: ~$0.025

### Direct API Integration
- **Lambda execution**: $0.20 per 1M requests
- **Secrets Manager**: $0.40 per secret/month
- **API calls**: Varies by service (usually free tier available)

### Recommendation
Start with webhooks + Zapier/Make.com free tier. Migrate to direct API only if volume exceeds cost threshold.

## Next Steps

1. **Immediate**: Test webhook functionality with webhook.site
2. **Week 1**: Create Zapier/Make.com templates for Google Sheets
3. **Week 2**: Document per-tenant webhook setup process
4. **Week 3**: Implement Google Sheets API if webhook approach has limitations
5. **Week 4**: Add Salesforce/HubSpot direct integration if needed

## Additional Resources

- [Form Processing API Reference](/docs/Form_Processing_API_Reference.md)
- [Backend Form Processing Guide](/docs/Backend_Form_Processing_Guide.md)
- [Zapier Webhooks Documentation](https://zapier.com/help/create/code-webhooks/trigger-zaps-from-webhooks)
- [Make.com Webhooks Documentation](https://www.make.com/en/help/modules/webhooks)
- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Salesforce REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [HubSpot API](https://developers.hubspot.com/docs/api/overview)
