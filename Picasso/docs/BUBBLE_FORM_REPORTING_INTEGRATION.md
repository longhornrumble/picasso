# Bubble Integration Plan for Form Submission Reporting

## Current Analytics Architecture Analysis

### How It Works Today

The system has a sophisticated 3-tier analytics pipeline for **conversation metrics** but **does NOT currently track form submissions**:

#### 1. Aggregator_Function (Daily ETL Job)
- **Schedule**: Runs daily (EventBridge cron)
- **Purpose**: Aggregates CloudWatch logs → DynamoDB
- **Tracks**: QA_COMPLETE logs (conversation completions)
- **Storage**: `picasso-analytics-daily` DynamoDB table
- **Per-Tenant**: Processes all tenant mappings from S3
- **Retention**: 90-day TTL on DynamoDB records

#### 2. Analytics_Function (Reporting API)
- **Trigger**: API call from Bubble admin dashboard
- **Purpose**: Hybrid query across 3 data sources
- **Data Sources**:
  - **CloudWatch**: Recent data (< 7 days)
  - **DynamoDB**: Historical data (7-90 days)
  - **S3 Archive**: Very old data (> 90 days)
- **Returns**: Conversation metrics, top questions, heat maps, full conversations

#### 3. Current Data Flow
```
Master_Function/Bedrock_Handler
    ↓ (logs QA_COMPLETE)
CloudWatch Logs
    ↓ (daily aggregation)
Aggregator_Function
    ↓ (stores metrics)
DynamoDB (picasso-analytics-daily)
    ↓ (API query)
Analytics_Function
    ↓ (returns JSON)
Bubble Admin Dashboard
```

### What's Missing: Form Submission Tracking

**Key Finding**: Form submissions are stored in `picasso_form_submissions` DynamoDB table (by form_handler.py) but are **NOT** aggregated or exposed via Analytics_Function.

## Recommendation: Add Form Submission Reporting

### Option 1: Extend Existing Analytics Pipeline (Recommended)

**Why This Approach:**
- Leverages existing 3-tier architecture
- Consistent with current patterns
- Reuses Aggregator scheduling
- Same Bubble integration point

**Implementation:**

#### Step 1: Update Aggregator_Function
Add form submission aggregation alongside QA_COMPLETE processing:

```python
# In lambda_function.py (Aggregator_Function)

# Add to process_date workflow
def lambda_handler(event, context):
    # ... existing conversation processing ...

    # NEW: Process form submissions for the day
    for tenant_mapping in tenants:
        tenant_id = tenant_mapping.get('tenant_id')
        tenant_hash = tenant_mapping.get('tenant_hash')

        # Aggregate form submissions
        form_metrics = aggregate_form_submissions(tenant_id, process_date)

        # Store alongside conversation metrics
        if form_metrics['total_submissions'] > 0:
            store_form_metrics(tenant_id, tenant_hash, process_date, form_metrics)

def aggregate_form_submissions(tenant_id: str, process_date: str) -> Dict[str, Any]:
    """Aggregate form submissions from DynamoDB for a specific day"""
    submissions_table = dynamodb.Table('picasso_form_submissions')

    # Parse date range
    start_time = datetime.strptime(process_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    end_time = start_time + timedelta(days=1)

    # Query all submissions for this tenant on this day
    response = submissions_table.query(
        IndexName='tenant-timestamp-index',  # Needs GSI
        KeyConditionExpression='tenant_id = :tid AND #ts BETWEEN :start AND :end',
        ExpressionAttributeNames={'#ts': 'timestamp'},
        ExpressionAttributeValues={
            ':tid': tenant_id,
            ':start': start_time.isoformat(),
            ':end': end_time.isoformat()
        }
    )

    submissions = response['Items']

    # Aggregate by form type
    form_counts = defaultdict(int)
    form_details = defaultdict(list)

    for sub in submissions:
        form_type = sub.get('form_type', 'unknown')
        form_counts[form_type] += 1
        form_details[form_type].append({
            'submission_id': sub['submission_id'],
            'timestamp': sub['timestamp'],
            'responses': sub['responses'],  # Full form data
            'status': sub.get('status', 'submitted')
        })

    return {
        'total_submissions': len(submissions),
        'form_counts': dict(form_counts),
        'form_details': dict(form_details),
        'submissions': submissions[:100]  # Store up to 100 for review
    }

def store_form_metrics(tenant_id: str, tenant_hash: str, process_date: str, form_metrics: Dict):
    """Store form metrics in DynamoDB"""
    table = dynamodb.Table(ANALYTICS_TABLE)

    item = {
        'pk': f"TENANT#{tenant_id}",
        'sk': f"FORMS#{process_date}",  # Different sort key for forms
        'tenant_id': tenant_id,
        'tenant_hash': tenant_hash,
        'date': process_date,
        'metric_type': 'form_submissions',  # Distinguish from conversations
        'total_submissions': form_metrics['total_submissions'],
        'form_counts': form_metrics['form_counts'],
        'form_details': convert_floats_to_decimal(form_metrics['form_details']),
        'submissions': convert_floats_to_decimal(form_metrics['submissions']),
        'ttl': int((datetime.now(timezone.utc) + timedelta(days=90)).timestamp()),
        'created_at': datetime.now(timezone.utc).isoformat()
    }

    table.put_item(Item=item)
    logger.info(f"Stored form metrics for {tenant_id} on {process_date}: {form_metrics['total_submissions']} submissions")
```

#### Step 2: Update Analytics_Function
Add form submission query capability:

```python
# In lambda_function.py (Analytics_Function)

def process_tenant(self, tenant_hash: str, start_date: Optional[str] = None,
                   end_date: Optional[str] = None,
                   include_forms: bool = True) -> Dict[str, Any]:
    """Process analytics including form submissions"""

    # ... existing conversation metrics logic ...

    # NEW: Include form submission metrics if requested
    if include_forms:
        form_metrics = self.query_form_submissions(tenant_id, start_time, end_time)
        result['form_submissions'] = form_metrics

    return result

def query_form_submissions(self, tenant_id: str, start_date: datetime, end_date: datetime) -> Dict:
    """Query aggregated form submissions from DynamoDB"""
    combined_forms = {
        'total_submissions': 0,
        'form_counts': defaultdict(int),
        'submissions_by_date': {},
        'recent_submissions': []
    }

    # Query DynamoDB for each day in range
    current_date = start_date.date()
    end_date_only = end_date.date()

    while current_date <= end_date_only:
        date_str = current_date.strftime('%Y-%m-%d')

        try:
            response = self.analytics_table.get_item(
                Key={
                    'pk': f"TENANT#{tenant_id}",
                    'sk': f"FORMS#{date_str}"
                }
            )

            if 'Item' in response:
                item = response['Item']
                combined_forms['total_submissions'] += item.get('total_submissions', 0)

                # Merge form counts
                for form_type, count in item.get('form_counts', {}).items():
                    combined_forms['form_counts'][form_type] += count

                # Store by date
                combined_forms['submissions_by_date'][date_str] = {
                    'count': item.get('total_submissions', 0),
                    'forms': item.get('form_counts', {})
                }

                # Add recent submissions
                combined_forms['recent_submissions'].extend(
                    item.get('submissions', [])[:10]
                )

        except Exception as e:
            logger.error(f"Error querying forms for {date_str}: {str(e)}")

        current_date += timedelta(days=1)

    # Limit recent submissions
    combined_forms['recent_submissions'] = combined_forms['recent_submissions'][:50]
    combined_forms['form_counts'] = dict(combined_forms['form_counts'])

    return combined_forms
```

#### Step 3: Update DynamoDB Schema
Add Global Secondary Index to `picasso_form_submissions` table:

**Using AWS CLI:**
```bash
aws dynamodb update-table \
  --table-name picasso_form_submissions \
  --attribute-definitions \
      AttributeName=tenant_id,AttributeType=S \
      AttributeName=timestamp,AttributeType=S \
  --global-secondary-index-updates \
      "[{\"Create\":{\"IndexName\":\"tenant-timestamp-index\",\"KeySchema\":[{\"AttributeName\":\"tenant_id\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"timestamp\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}}]"
```

**Or via CloudFormation:**
```yaml
GlobalSecondaryIndexes:
  - IndexName: tenant-timestamp-index
    KeySchema:
      - AttributeName: tenant_id
        KeyType: HASH
      - AttributeName: timestamp
        KeyType: RANGE
    Projection:
      ProjectionType: ALL
    ProvisionedThroughput:
      ReadCapacityUnits: 5
      WriteCapacityUnits: 5
```

#### Step 4: Update Bubble Integration
Bubble admin dashboard already calls Analytics_Function. Just need to:

1. **Update API Call** - Pass `include_forms=true` parameter:
```json
{
  "tenant_hash": "abc123",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "include_forms": true
}
```

2. **Parse Response** - Form submissions will be in response:
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
      "2024-01-15": {"count": 5, "forms": {"volunteer_apply": 3, "contact_us": 2}},
      "2024-01-16": {"count": 8, "forms": {"volunteer_apply": 5, "support_request": 3}}
    },
    "recent_submissions": [
      {
        "submission_id": "form_123",
        "timestamp": "2024-01-15T10:30:00Z",
        "form_type": "volunteer_apply",
        "responses": {...}
      }
    ]
  }
}
```

3. **Display in Bubble** - Add form-specific visualizations:
   - Total form submissions chart
   - Submissions by form type (pie chart)
   - Submissions over time (line chart)
   - Recent submissions table (with applicant details)
   - Conversion rate (forms/conversations)

### Option 2: Direct Bubble API Integration (Alternative)

**Why This Approach:**
- Real-time data (no daily aggregation delay)
- Simpler implementation (no Aggregator changes)
- Direct query to source table

**Implementation:**

Create new Lambda function `Form_Analytics_Function`:

```python
import json
import boto3
from datetime import datetime, timedelta, timezone
from boto3.dynamodb.conditions import Key
from collections import defaultdict

dynamodb = boto3.resource('dynamodb')
submissions_table = dynamodb.Table('picasso_form_submissions')

def lambda_handler(event, context):
    """
    API endpoint for Bubble to query form submissions

    Parameters:
    - tenant_id: Tenant identifier
    - start_date: Start date (YYYY-MM-DD)
    - end_date: End date (YYYY-MM-DD)
    - form_type: Optional filter by form type
    """

    tenant_id = event.get('tenant_id')
    start_date = event.get('start_date')
    end_date = event.get('end_date')
    form_type = event.get('form_type')  # Optional filter

    # Parse dates
    start_time = datetime.strptime(start_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    end_time = datetime.strptime(end_date, '%Y-%m-%d').replace(tzinfo=timezone.utc) + timedelta(days=1)

    # Query DynamoDB
    response = submissions_table.query(
        IndexName='tenant-timestamp-index',
        KeyConditionExpression='tenant_id = :tid AND #ts BETWEEN :start AND :end',
        ExpressionAttributeNames={'#ts': 'timestamp'},
        ExpressionAttributeValues={
            ':tid': tenant_id,
            ':start': start_time.isoformat(),
            ':end': end_time.isoformat()
        }
    )

    submissions = response['Items']

    # Filter by form type if provided
    if form_type:
        submissions = [s for s in submissions if s.get('form_type') == form_type]

    # Aggregate metrics
    form_counts = defaultdict(int)
    submissions_by_date = defaultdict(lambda: {'count': 0, 'forms': defaultdict(int)})

    for sub in submissions:
        ft = sub.get('form_type', 'unknown')
        form_counts[ft] += 1

        # Parse date
        sub_date = datetime.fromisoformat(sub['timestamp'].replace('Z', '+00:00')).date().isoformat()
        submissions_by_date[sub_date]['count'] += 1
        submissions_by_date[sub_date]['forms'][ft] += 1

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({
            'total_submissions': len(submissions),
            'form_counts': dict(form_counts),
            'submissions_by_date': {k: {'count': v['count'], 'forms': dict(v['forms'])}
                                   for k, v in submissions_by_date.items()},
            'submissions': submissions,
            'date_range': {
                'start': start_date,
                'end': end_date
            }
        }, default=str)
    }
```

**Deploy Lambda:**
```bash
cd /path/to/Form_Analytics_Function
zip -r deployment.zip lambda_function.py
aws lambda create-function \
  --function-name Form_Analytics_Function \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler lambda_function.lambda_handler \
  --zip-file fileb://deployment.zip
```

**Create Lambda Function URL:**
```bash
aws lambda create-function-url-config \
  --function-name Form_Analytics_Function \
  --auth-type NONE \
  --cors AllowOrigins=*,AllowMethods=POST,AllowHeaders=*
```

**Call from Bubble:**
```
Endpoint: https://[function-url].lambda-url.us-east-1.on.aws/
Method: POST
Body: {
  "tenant_id": "FOS402334",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31"
}
```

### Option 3: Bubble Workflow API (Webhook Push)

**Why This Approach:**
- Real-time push notifications to Bubble
- No polling required
- Bubble database automatically updated
- Immediate visibility of new submissions

**Implementation:**

#### Step 1: Add Bubble Webhook to form_handler.py

```python
# In Master_Function_Staging/form_handler.py

def handle_form_submission(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for processing form submissions
    """
    try:
        # ... existing storage and notification code ...

        # NEW: Send to Bubble if configured
        self._send_bubble_webhook(form_data, submission_id)

        return {
            'success': True,
            'submission_id': submission_id,
            'notifications_sent': notification_results,
            'fulfillment': fulfillment_result,
            'next_steps': self._get_next_steps(form_type, form_config)
        }
    except Exception as e:
        logger.error(f"Form submission error: {str(e)}")
        return {'success': False, 'error': str(e)}

def _send_bubble_webhook(self, form_data: Dict[str, Any], submission_id: str):
    """Send form submission to Bubble via Workflow API"""
    import requests

    # Get Bubble webhook URL from tenant config
    bubble_config = self.tenant_config.get('bubble_integration', {})
    webhook_url = bubble_config.get('webhook_url')
    api_key = bubble_config.get('api_key')

    if not webhook_url:
        logger.debug("No Bubble webhook configured, skipping")
        return

    payload = {
        'submission_id': submission_id,
        'tenant_id': self.tenant_id,
        'tenant_hash': self.tenant_hash,
        'form_type': form_data.get('form_type'),
        'responses': form_data.get('responses'),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'session_id': form_data.get('session_id'),
        'conversation_id': form_data.get('conversation_id'),
        'metadata': form_data.get('metadata', {})
    }

    headers = {
        'Content-Type': 'application/json',
    }

    # Add API key if configured
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    try:
        response = requests.post(
            webhook_url,
            json=payload,
            headers=headers,
            timeout=10
        )

        if response.status_code in [200, 201]:
            logger.info(f"Sent form submission to Bubble: {submission_id}")
        else:
            logger.error(f"Bubble webhook error: {response.status_code} - {response.text}")

    except Exception as e:
        logger.error(f"Error sending to Bubble: {str(e)}")
        # Don't fail the form submission if Bubble webhook fails
```

#### Step 2: Configure Tenant for Bubble Integration

Update tenant config in S3 (`tenants/{tenant_id}/{tenant_id}-config.json`):

```json
{
  "tenant_id": "FOS402334",
  "tenant_hash": "abc123",
  "bubble_integration": {
    "enabled": true,
    "webhook_url": "https://your-app.bubbleapps.io/api/1.1/wf/form_submission",
    "api_key": "your-bubble-api-key"
  },
  "conversational_forms": {
    "volunteer_apply": {
      "fields": [...],
      "notifications": {...}
    }
  }
}
```

#### Step 3: Create Bubble Workflow API Endpoint

In Bubble:

1. **Go to Settings → API**
2. **Enable Workflow API**
3. **Create New Workflow**:
   - Name: `form_submission`
   - Type: Backend Workflow
   - Parameter type: JSON

4. **Add Actions**:
   - Create new Thing: `Form_Submission`
   - Set fields from JSON:
     - `submission_id` = Request data's submission_id
     - `tenant_id` = Request data's tenant_id
     - `form_type` = Request data's form_type
     - `submitted_at` = Request data's timestamp
     - `applicant_email` = Request data's responses's email
     - `applicant_name` = Request data's responses's first_name + " " + last_name
     - `program` = Request data's responses's program_interest
     - `status` = "submitted"
     - `responses_json` = Request data's responses (as text)

5. **Get Workflow URL**:
   - Format: `https://your-app.bubbleapps.io/api/1.1/wf/form_submission`
   - Add to tenant config

#### Step 4: Display in Bubble Dashboard

Create Bubble page to display form submissions:

1. **Create Data Type**: `Form_Submission`
   - submission_id (text)
   - tenant_id (text)
   - form_type (text)
   - submitted_at (date)
   - applicant_email (text)
   - applicant_name (text)
   - program (text)
   - status (text)
   - responses_json (text)

2. **Create Repeating Group**:
   - Data source: Search for Form_Submissions
   - Constraints: tenant_id = Current User's tenant_id
   - Sort by: submitted_at (descending)

3. **Display Fields**:
   - Applicant name
   - Email
   - Form type
   - Program
   - Submitted date
   - Status

4. **Add Filters/Charts**:
   - Filter by form type
   - Filter by date range
   - Chart: Submissions over time
   - Chart: Submissions by form type

## Recommended Approach

**Use Option 1 (Extend Existing Analytics Pipeline) + Option 3 (Bubble Webhook)** for these reasons:

### For Historical Reporting: Option 1
1. **Consistency**: Matches current architecture patterns
2. **Efficiency**: Reuses daily aggregation infrastructure
3. **Performance**: Pre-aggregated metrics load faster in Bubble
4. **Cost**: No additional Lambda invocations per query
5. **Scalability**: Handles high submission volumes
6. **Historical**: Works with S3 archive strategy

### For Real-Time Updates: Option 3
1. **Immediate Visibility**: New submissions appear instantly in Bubble
2. **No Polling**: Push-based, not pull-based
3. **Simple Integration**: Standard Bubble Workflow API
4. **Reliable**: Webhook failures don't affect form submission
5. **Flexible**: Can trigger Bubble workflows (emails, notifications, etc.)

### Combined Architecture
```
Form Submission
    ↓
form_handler.py
    ↓
    ├─→ Store in DynamoDB (picasso_form_submissions)
    ├─→ Send Notifications (Email, SMS)
    └─→ Push to Bubble (Webhook) ← REAL-TIME

Daily Aggregation:
    ↓
Aggregator_Function
    ↓
Query DynamoDB (picasso_form_submissions)
    ↓
Aggregate Metrics
    ↓
Store in DynamoDB (picasso-analytics-daily)

Bubble Dashboard Query:
    ↓
Analytics_Function
    ↓
Query DynamoDB (picasso-analytics-daily)
    ↓
Return Aggregated Metrics ← HISTORICAL CHARTS
```

## Data Structure in Bubble

### Form Submission Record (Real-Time)
```
Data Type: Form_Submission
Fields:
  - submission_id (text, unique)
  - tenant_id (text)
  - form_type (text)
  - submitted_at (date)
  - applicant_email (text)
  - applicant_name (text)
  - program (text)
  - status (option set: submitted, reviewed, approved, rejected)
  - responses_json (text - full JSON)
  - created_at (date, auto-filled)
  - modified_at (date, auto-filled)
```

### Analytics Summary (Aggregated)
Returned by Analytics_Function API:
```json
{
  "date_range": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "conversations": {
    "conversation_count": 150,
    "total_messages": 450,
    "avg_response_time_ms": 1250
  },
  "form_submissions": {
    "total_submissions": 25,
    "form_counts": {
      "volunteer_apply": 15,
      "contact_us": 7,
      "support_request": 3
    },
    "submissions_by_date": {
      "2024-01-15": {
        "count": 5,
        "forms": {
          "volunteer_apply": 3,
          "contact_us": 2
        }
      }
    },
    "recent_submissions": [...]
  }
}
```

## Implementation Timeline

### Phase 1: DynamoDB Schema Update (Week 1)
- **Day 1**: Add GSI to picasso_form_submissions table
- **Day 2**: Test GSI with sample queries
- **Day 3**: Verify performance and costs

### Phase 2: Aggregator Update (Week 2)
- **Day 1-2**: Update Aggregator_Function code
- **Day 3**: Deploy to staging environment
- **Day 4**: Test daily aggregation
- **Day 5**: Deploy to production

### Phase 3: Analytics API Update (Week 3)
- **Day 1-2**: Update Analytics_Function code
- **Day 3**: Test with sample tenant data
- **Day 4**: Update API documentation
- **Day 5**: Deploy to production

### Phase 4: Bubble Integration (Week 4)
- **Day 1**: Create Bubble Workflow API endpoint
- **Day 2**: Update tenant configs with webhook URLs
- **Day 3**: Update form_handler.py with Bubble webhook
- **Day 4**: Deploy and test end-to-end
- **Day 5**: Create Bubble dashboard visualizations

### Phase 5: Testing & Rollout (Week 5)
- **Day 1-2**: Test with pilot tenant
- **Day 3**: Fix any issues
- **Day 4**: Rollout to all tenants
- **Day 5**: Monitor and optimize

## Testing Checklist

### DynamoDB GSI Testing
- [ ] GSI created successfully
- [ ] Queries return correct results
- [ ] Performance meets requirements (< 100ms)
- [ ] Costs are acceptable

### Aggregator_Function Testing
- [ ] Daily aggregation runs successfully
- [ ] Form metrics stored in DynamoDB
- [ ] Multiple form types aggregated correctly
- [ ] Edge cases handled (zero submissions, etc.)

### Analytics_Function Testing
- [ ] API returns form submission data
- [ ] Date range filtering works
- [ ] Form type filtering works
- [ ] Performance acceptable (< 2s)

### Bubble Integration Testing
- [ ] Webhook receives POST requests
- [ ] Form data parsed correctly
- [ ] Bubble database updated
- [ ] Dashboard displays submissions
- [ ] Charts render correctly
- [ ] Real-time updates work

### End-to-End Testing
- [ ] Submit form in Picasso widget
- [ ] Verify stored in DynamoDB
- [ ] Verify pushed to Bubble (real-time)
- [ ] Wait 24 hours for aggregation
- [ ] Query Analytics_Function API
- [ ] Verify aggregated metrics in Bubble dashboard

## Cost Estimates

### Additional AWS Costs (Monthly)

**DynamoDB GSI:**
- Read capacity: 5 RCU = $0.65
- Write capacity: 5 WCU = $0.65
- Storage: ~1GB = $0.25
- **Total**: ~$1.55/month

**Aggregator_Function:**
- Additional processing time: +5s per day
- Memory: 512MB
- Cost: 150ms × 30 days = $0.00001
- **Total**: Negligible

**Analytics_Function:**
- Additional queries: +0.1s per API call
- Frequency: ~100 calls/day
- Cost: 10ms × 100 × 30 = $0.0001
- **Total**: Negligible

**Lambda Webhook (Option 3):**
- POST per submission: ~10 submissions/day
- Cost: 10ms × 10 × 30 = $0.00001
- **Total**: Negligible

**Total Additional Monthly Cost: ~$2/month**

## Security Considerations

### DynamoDB GSI
- Same IAM policies as main table
- No additional security configuration needed

### Bubble Webhook
1. **Use HTTPS only** for webhook URLs
2. **Implement API key authentication** in tenant config
3. **Rate limit** webhook calls (max 100/min per tenant)
4. **Validate payload** before sending
5. **Log webhook failures** for monitoring

### Analytics API
1. **Require JWT authentication** (existing)
2. **Tenant isolation** enforced at query level
3. **Rate limiting** (existing: 100 req/hour per tenant)
4. **Data sanitization** before returning to Bubble

## Monitoring & Alerts

### CloudWatch Metrics

#### Aggregator_Function
- `FormSubmissionsProcessed` (per tenant, per day)
- `FormAggregationErrors` (count, alarm threshold: > 5)
- `FormStorageLatency` (milliseconds)

#### Analytics_Function
- `FormQueryLatency` (milliseconds, alarm threshold: > 2000ms)
- `FormQueryErrors` (count, alarm threshold: > 10)

#### Bubble Webhook
- `BubbleWebhookSuccess` (count)
- `BubbleWebhookFailure` (count, alarm threshold: > 10)
- `BubbleWebhookLatency` (milliseconds)

### CloudWatch Alarms

```python
# In Aggregator_Function
cloudwatch = boto3.client('cloudwatch')

cloudwatch.put_metric_data(
    Namespace='Picasso/Forms',
    MetricData=[
        {
            'MetricName': 'FormSubmissionsProcessed',
            'Value': form_metrics['total_submissions'],
            'Unit': 'Count',
            'Dimensions': [
                {'Name': 'TenantId', 'Value': tenant_id},
                {'Name': 'Date', 'Value': process_date}
            ]
        }
    ]
)
```

### Alarm Configuration

```yaml
FormAggregationErrorsAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: Picasso-Form-Aggregation-Errors
    MetricName: FormAggregationErrors
    Namespace: Picasso/Forms
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref AlertSNSTopic
```

## Rollback Plan

If issues arise during deployment:

### Phase 1 Rollback (GSI)
- Delete GSI if causing performance issues
- Fall back to table scans (slower but functional)

### Phase 2 Rollback (Aggregator)
- Revert Aggregator_Function to previous version
- Delete form metrics from DynamoDB

### Phase 3 Rollback (Analytics)
- Revert Analytics_Function to previous version
- Bubble will continue working (just no form data)

### Phase 4 Rollback (Bubble)
- Remove webhook URL from tenant configs
- Form submissions continue working (just no Bubble push)

## Future Enhancements

1. **Form Submission Search**: Add Elasticsearch for full-text search of form responses
2. **Duplicate Detection**: Identify duplicate submissions (same email, similar responses)
3. **Status Tracking**: Track form submission workflow (submitted → reviewed → approved)
4. **Automated Workflows**: Trigger actions based on form type (auto-reply emails, Slack notifications)
5. **Export Functionality**: Export form submissions to CSV/Excel for reporting
6. **Form Analytics**: Conversion rates, field completion rates, abandonment tracking

## Related Documentation

- [Form Downstream Integrations Guide](/docs/FORM_DOWNSTREAM_INTEGRATIONS.md)
- [Form Processing API Reference](/docs/Form_Processing_API_Reference.md)
- [Backend Form Processing Guide](/docs/Backend_Form_Processing_Guide.md)
- [Analytics Function Documentation](https://github.com/longhornrumble/lambda/tree/main/Analytics_Function)
- [Aggregator Function Documentation](https://github.com/longhornrumble/lambda/tree/main/Aggregator_Function)
