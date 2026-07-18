#!/usr/bin/env bash
# Re-run each dashboard's reader query against the seeded BrightPath tenant and
# print the counts. Read-only. Requires AWS_PROFILE (e.g. myrecruiter-staging).
set -euo pipefail
: "${AWS_PROFILE:=myrecruiter-staging}"
export AWS_PROFILE
TID=BRI071351
HASH=8b464847ae0ede
S30=$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)-timedelta(days=30)).strftime('%Y-%m-%d'))")
S90=$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)-timedelta(days=90)).strftime('%Y-%m-%d'))")
LO=$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)-timedelta(days=90)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
HI=$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)+timedelta(days=90)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
MONTH=$(python3 -c "from datetime import datetime,timezone;print(datetime.now(timezone.utc).strftime('%Y-%m'))")
q(){ aws dynamodb "$@"; }

echo "== 1. Conversations (session-summaries) =="
q query --table-name picasso-session-summaries --select COUNT \
  --key-condition-expression "pk = :pk AND begins_with(sk, :p)" --filter-expression "started_at >= :s" \
  --expression-attribute-values "{\":pk\":{\"S\":\"TENANT#$HASH\"},\":p\":{\"S\":\"SESSION#\"},\":s\":{\"S\":\"$S30\"}}" \
  --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  last-30d conversations: /'

echo "== 2. Forms list + Lead queue =="
q query --table-name picasso-form-submissions --index-name tenant-timestamp-index --select COUNT \
  --key-condition-expression "tenant_id = :t" --expression-attribute-values "{\":t\":{\"S\":\"$TID\"}}" \
  --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  total submissions: /'
for st in new reviewing contacted archived; do
  printf "  queue %-9s " "$st:"
  q query --table-name picasso-form-submissions --index-name tenant-pipeline-index --select COUNT \
    --key-condition-expression "tenant_pipeline_key = :k" --expression-attribute-values "{\":k\":{\"S\":\"$TID#$st\"}}" \
    --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}'
done

echo "== 3. Forms-summary funnel (session-events FORM_*) =="
q query --table-name picasso-session-events --index-name tenant-date-index \
  --key-condition-expression "tenant_hash = :th AND #ts >= :s" --filter-expression "begins_with(event_type, :f)" \
  --expression-attribute-names '{"#ts":"timestamp"}' \
  --expression-attribute-values "{\":th\":{\"S\":\"$HASH\"},\":s\":{\"S\":\"$S90\"},\":f\":{\"S\":\"FORM_\"}}" \
  --select COUNT --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  FORM_* events (90d): /'

echo "== 4. Attribution summary#$MONTH (must be non-zero top-level) =="
q get-item --table-name picasso-attribution-aggregates \
  --key "{\"pk\":{\"S\":\"TENANT#$TID\"},\"sk\":{\"S\":\"METRIC#attribution_summary#$MONTH\"}}" --output json \
  | python3 -c 'import sys,json;i=json.load(sys.stdin).get("Item",{});print("  conversations=",i.get("conversations",{}).get("N"),"leads=",i.get("leads",{}).get("N"))'

echo "== 5. Scheduling (now +/- 90d) =="
q query --table-name picasso-booking --index-name tenantId-start_at-index --select COUNT \
  --key-condition-expression "tenantId = :t AND start_at BETWEEN :lo AND :hi" \
  --expression-attribute-values "{\":t\":{\"S\":\"$TID\"},\":lo\":{\"S\":\"$LO\"},\":hi\":{\"S\":\"$HI\"}}" \
  --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  bookings in window: /'

echo "== 6. Notifications =="
q query --table-name picasso-notification-events --select COUNT \
  --key-condition-expression "pk = :pk" --expression-attribute-values "{\":pk\":{\"S\":\"TENANT#$TID\"}}" \
  --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  events: /'

echo "== 7. Entry-points registry =="
q query --table-name picasso-entry-points --select COUNT \
  --key-condition-expression "tenant_id = :t" --expression-attribute-values "{\":t\":{\"S\":\"$TID\"}}" \
  --query Count --output text | awk '{for(i=1;i<=NF;i++)x+=$i} END{print x}' | sed 's/^/  entry points: /'
