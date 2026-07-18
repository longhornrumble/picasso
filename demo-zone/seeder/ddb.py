"""DynamoDB IO for the BrightPath demo seeder.

Thin wrapper over boto3: marshalling (with float->Decimal), batched writes
with unprocessed-item retry, paginated queries, and batched deletes. Every
mutating call honours dry_run so a run can be previewed before it touches the
account. Region is pinned to us-east-1 (all picasso-* tables live there);
credentials come from the ambient AWS_PROFILE (operator SSO).
"""
import decimal
import time

import boto3
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer

_REGION = "us-east-1"
_serializer = TypeSerializer()
_deserializer = TypeDeserializer()


def client():
    return boto3.client("dynamodb", region_name=_REGION)


def _to_decimal(obj):
    """Recursively convert floats to Decimal (TypeSerializer rejects float)."""
    if isinstance(obj, float):
        # str() round-trip avoids binary-float noise in the stored Decimal.
        return decimal.Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_decimal(v) for v in obj]
    return obj


def marshal(item: dict) -> dict:
    """Python dict -> DynamoDB AttributeValue dict."""
    clean = _to_decimal(item)
    return {k: _serializer.serialize(v) for k, v in clean.items()}


def unmarshal(av: dict) -> dict:
    return {k: _deserializer.deserialize(v) for k, v in av.items()}


def batch_write(table: str, items: list, dry_run: bool, label: str = "") -> int:
    """PutItem `items` into `table` in batches of 25 with backoff on
    UnprocessedItems. Returns the number of rows written (0 in dry_run).
    """
    tag = label or table
    if dry_run:
        print(f"  [dry-run] would write {len(items)} rows -> {table} ({tag})")
        return 0
    if not items:
        return 0
    ddb = client()
    written = 0
    for i in range(0, len(items), 25):
        chunk = items[i : i + 25]
        request = {table: [{"PutRequest": {"Item": marshal(it)}} for it in chunk]}
        for attempt in range(6):
            resp = ddb.batch_write_item(RequestItems=request)
            unprocessed = resp.get("UnprocessedItems") or {}
            if not unprocessed:
                break
            request = unprocessed
            time.sleep(min(2 ** attempt * 0.1, 3.0))
        else:
            raise RuntimeError(f"{table}: unprocessed items remained after retries")
        written += len(chunk)
    print(f"  wrote {written} rows -> {table} ({tag})")
    return written


def query_all(table: str, key_condition: str, values: dict,
              index: str = None, projection: str = None,
              filter_expr: str = None, names: dict = None) -> list:
    """Query a table/index, following pagination, returning unmarshalled rows."""
    ddb = client()
    params = {
        "TableName": table,
        "KeyConditionExpression": key_condition,
        "ExpressionAttributeValues": {k: _serializer.serialize(v) for k, v in values.items()},
    }
    if index:
        params["IndexName"] = index
    if projection:
        params["ProjectionExpression"] = projection
    if filter_expr:
        params["FilterExpression"] = filter_expr
    if names:
        params["ExpressionAttributeNames"] = names
    out, start_key = [], None
    while True:
        if start_key:
            params["ExclusiveStartKey"] = start_key
        resp = ddb.query(**params)
        out.extend(unmarshal(it) for it in resp.get("Items", []))
        start_key = resp.get("LastEvaluatedKey")
        if not start_key:
            break
    return out


def batch_delete(table: str, keys: list, dry_run: bool, label: str = "") -> int:
    """DeleteItem for each key dict (already the raw key attributes, Python types)."""
    tag = label or table
    if dry_run:
        print(f"  [dry-run] would DELETE {len(keys)} rows <- {table} ({tag})")
        return 0
    if not keys:
        return 0
    ddb = client()
    deleted = 0
    for i in range(0, len(keys), 25):
        chunk = keys[i : i + 25]
        request = {table: [{"DeleteRequest": {"Key": marshal(k)}} for k in chunk]}
        for attempt in range(6):
            resp = ddb.batch_write_item(RequestItems=request)
            unprocessed = resp.get("UnprocessedItems") or {}
            if not unprocessed:
                break
            request = unprocessed
            time.sleep(min(2 ** attempt * 0.1, 3.0))
        else:
            raise RuntimeError(f"{table}: unprocessed deletes remained after retries")
        deleted += len(chunk)
    print(f"  deleted {deleted} rows <- {table} ({tag})")
    return deleted
