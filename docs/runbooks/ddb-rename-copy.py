#!/usr/bin/env python3
"""
ddb-rename-copy.py — account-guarded DynamoDB table copy for the naming-alignment
program's PROD (614) Phase B. Scans a source table and batch-writes every item
verbatim into a destination table (items are copied as-is, including any
KMS-encrypted attribute blobs — no decryption, so channel-mappings page tokens
transfer untouched).

SAFETY MODEL (this script is OPERATOR-run against prod 614; never by an agent):
  * Hard account guard: refuses to run unless sts:GetCallerIdentity == --expected-account.
  * Dry-run by DEFAULT: prints what WOULD be copied; writes nothing. Pass --apply to write.
  * Refuses to write into a non-empty destination unless --allow-nonempty-dest.
  * Read-only on the source (Scan only). Never deletes anything.

USAGE:
  # dry-run (default) — see counts, write nothing
  ./ddb-rename-copy.py --source picasso-channel-mappings-staging --dest picasso-channel-mappings

  # real copy
  ./ddb-rename-copy.py --source picasso-channel-mappings-staging --dest picasso-channel-mappings --apply

  # override the profile / account if needed
  ./ddb-rename-copy.py --source A --dest B --apply --profile myrecruiter-prod --expected-account 614056832592

Requires: python3 + boto3 (the operator's local env). No third-party deps beyond boto3.
"""
import argparse
import sys
import time

import boto3
from botocore.exceptions import ClientError


def die(msg: str) -> None:
    print(f"ABORT: {msg}", file=sys.stderr)
    sys.exit(1)


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def main() -> None:
    ap = argparse.ArgumentParser(description="Account-guarded DynamoDB table copy (naming-alignment Phase B).")
    ap.add_argument("--source", required=True, help="Source table name (copied FROM, read-only).")
    ap.add_argument("--dest", required=True, help="Destination table name (copied INTO).")
    ap.add_argument("--profile", default="myrecruiter-prod", help="AWS profile (default: myrecruiter-prod).")
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--expected-account", default="614056832592",
                    help="Hard guard: refuse unless caller account matches (default: prod 614).")
    ap.add_argument("--apply", action="store_true", help="Actually write. Without it, dry-run only.")
    ap.add_argument("--allow-nonempty-dest", action="store_true",
                    help="Permit writing into a destination that already has items (default: refuse).")
    args = ap.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)

    # --- Hard account guard -------------------------------------------------
    ident = session.client("sts").get_caller_identity()
    acct = ident["Account"]
    if acct != args.expected_account:
        die(f"caller account {acct} != expected {args.expected_account}. "
            f"Refusing (wrong profile/account). No data touched.")
    print(f"[guard] account {acct} OK (arn={ident['Arn']})")

    ddb = session.client("dynamodb")

    # --- Confirm both tables exist + dest is empty (unless overridden) -------
    try:
        src_desc = ddb.describe_table(TableName=args.source)["Table"]
    except ClientError as e:
        die(f"source {args.source} describe failed: {e}")
    try:
        dst_desc = ddb.describe_table(TableName=args.dest)["Table"]
    except ClientError as e:
        die(f"destination {args.dest} describe failed (create it first): {e}")

    dst_count = dst_desc.get("ItemCount", 0)
    if dst_count and not args.allow_nonempty_dest:
        die(f"destination {args.dest} reports ~{dst_count} items. "
            f"Refusing to write into a non-empty table (pass --allow-nonempty-dest to override).")

    # --- Scan source (paginated) -------------------------------------------
    print(f"[scan] reading {args.source} ...")
    items = []
    paginator = ddb.get_paginator("scan")
    for page in paginator.paginate(TableName=args.source, ConsistentRead=True):
        items.extend(page["Items"])
    print(f"[scan] {args.source}: {len(items)} items")

    if not args.apply:
        print(f"[dry-run] would copy {len(items)} items {args.source} -> {args.dest}. "
              f"No write performed. Re-run with --apply to execute.")
        return

    # --- Batch write (25/req, retry UnprocessedItems) -----------------------
    written = 0
    for batch in chunked(items, 25):
        request = {args.dest: [{"PutRequest": {"Item": it}} for it in batch]}
        backoff = 0.2
        while request:
            resp = ddb.batch_write_item(RequestItems=request)
            written += sum(len(v) for v in request.values()) - \
                sum(len(v) for v in resp.get("UnprocessedItems", {}).values())
            request = resp.get("UnprocessedItems") or {}
            if request:
                time.sleep(backoff)
                backoff = min(backoff * 2, 5.0)
    print(f"[write] wrote {written} items into {args.dest}")

    # --- Verify -------------------------------------------------------------
    verify = 0
    for page in ddb.get_paginator("scan").paginate(TableName=args.dest, Select="COUNT"):
        verify += page["Count"]
    print(f"[verify] {args.dest} now scans {verify} items (source had {len(items)}).")
    if verify != len(items):
        die(f"COUNT MISMATCH: dest={verify} source={len(items)}. Investigate before deleting the source.")
    print("[ok] counts match. Safe to repoint consumers, then delete the source after verification.")


if __name__ == "__main__":
    main()
