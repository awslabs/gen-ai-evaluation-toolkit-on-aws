"""Delete all evaluator reports (cascading to results) from deployed environment.

Usage:
    uv run python scripts/cleanup_resources.py

Reads API endpoint from SSM (/genai-etk/restApiEndpoint). Requires valid AWS credentials.
"""

import os
import sys

from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.api_client import ApiClient


def main() -> None:
    region = os.environ.get("AWS_REGION", "eu-west-2")

    import boto3
    ssm = boto3.client("ssm", region_name=region)
    endpoint = ssm.get_parameter(Name="/genai-etk/restApiEndpoint")["Parameter"]["Value"]

    client = DefaultApi(ApiClient(etk_api_endpoint=endpoint, aws_region=region))

    # Collect all report IDs via pagination
    report_ids: list[str] = []
    next_token = None
    while True:
        kwargs: dict[str, str] = {}
        if next_token:
            kwargs["next_token"] = next_token
        resp = client.list_reports(**kwargs)
        for r in resp.reports:
            report_ids.append(r.report_id)
        if not resp.next_token:
            break
        next_token = resp.next_token

    if not report_ids:
        print("No reports found. Nothing to clean up.")
        return

    print(f"Found {len(report_ids)} report(s). Deleting...")

    deleted = 0
    errors = 0
    for rid in report_ids:
        try:
            client.delete_report(rid)
            deleted += 1
            print(f"  Deleted report {rid}")
        except Exception as e:
            errors += 1
            print(f"  FAILED to delete report {rid}: {e}", file=sys.stderr)

    print(f"\nDone. Deleted: {deleted}, Errors: {errors}")


if __name__ == "__main__":
    main()
