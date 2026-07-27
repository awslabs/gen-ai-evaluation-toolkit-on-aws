"""Data Access Object for reports (single-table design)."""

import base64
import json
from datetime import datetime, timezone
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from mypy_boto3_dynamodb.service_resource import Table

from evaluator_api.ddb.common import LoggedTable, floats_to_decimal, log_dao
from evaluator_api.ddb.models import ReportItem, ReportStatus

_PK = "REPORT"
_SK_PREFIX = "REPORT#"


class ReportDao:
    """Data Access Object for report records in the single evaluator table.

    Key schema: pk="REPORT", sk="REPORT#<report_id>"
    """

    def __init__(self, table: Table) -> None:
        self._table = LoggedTable(table)

    @log_dao
    def get(self, report_id: str) -> Optional[ReportItem]:
        """Get a report by ID."""
        resp = self._table.get_item(Key={"pk": _PK, "sk": f"{_SK_PREFIX}{report_id}"})
        if "Item" not in resp:
            return None
        return ReportItem.model_validate(resp["Item"])

    @log_dao
    def put(self, item: ReportItem) -> None:
        """Put a report item into the table."""
        data = item.model_dump(exclude_none=True)
        data["pk"] = _PK
        data["sk"] = f"{_SK_PREFIX}{item.report_id}"
        self._table.put_item(Item=data)

    @log_dao
    def list_all(
        self,
        max_results: Optional[int] = None,
        next_token: Optional[str] = None,
    ) -> tuple[list[ReportItem], Optional[str]]:
        """List all reports with pagination."""
        query_params: dict[str, Any] = {
            "KeyConditionExpression": Key("pk").eq(_PK),
            # Strongly consistent so a report is listable immediately after creation
            # (read-your-writes); avoids the eventual-consistency race on list-after-create.
            "ConsistentRead": True,
        }

        if max_results:
            query_params["Limit"] = max_results
        if next_token:
            decoded = base64.b64decode(next_token).decode("utf-8")
            query_params["ExclusiveStartKey"] = json.loads(decoded)

        resp = self._table.query(**query_params)

        items = [ReportItem.model_validate(item) for item in resp.get("Items", [])]

        result_next_token: Optional[str] = None
        if "LastEvaluatedKey" in resp:
            result_next_token = base64.b64encode(json.dumps(resp["LastEvaluatedKey"]).encode()).decode()

        return items, result_next_token

    @log_dao
    def update_status(self, report_id: str, status: ReportStatus) -> None:
        """Update a report's status."""
        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{report_id}"},
            UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": status.value},
            ConditionExpression="attribute_exists(pk)",
        )

    @log_dao
    def append_job_id(self, report_id: str, job_id: str) -> None:
        """Atomically append a job ID to the report's job_ids list."""
        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{report_id}"},
            UpdateExpression="SET job_ids = list_append(if_not_exists(job_ids, :empty), :new_id)",
            ExpressionAttributeValues={
                ":empty": [],
                ":new_id": [job_id],
            },
            ConditionExpression="attribute_exists(pk)",
        )

    @log_dao
    def delete(self, report_id: str) -> None:
        """Delete a report by ID."""
        self._table.delete_item(Key={"pk": _PK, "sk": f"{_SK_PREFIX}{report_id}"})

    @log_dao
    def update_aggregated_metrics(self, report_id: str, aggregated_metrics: dict[str, Any]) -> None:
        """Store aggregated score metrics on a report."""
        now = datetime.now(timezone.utc)
        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{report_id}"},
            UpdateExpression="SET aggregated_metrics = :metrics, updated_at = :updated_at",
            ExpressionAttributeValues={
                ":metrics": floats_to_decimal(aggregated_metrics),
                ":updated_at": now.isoformat(),
            },
            ConditionExpression="attribute_exists(pk)",
        )

    def exists(self, report_id: str) -> bool:
        """Check if a report exists."""
        return self.get(report_id) is not None
