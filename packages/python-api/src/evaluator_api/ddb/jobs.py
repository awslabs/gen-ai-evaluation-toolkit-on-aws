"""Data Access Object for jobs (single-table design)."""

import base64
import json
from datetime import datetime, timezone
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from mypy_boto3_dynamodb.service_resource import Table

from evaluator_api.ddb.common import LoggedTable, floats_to_decimal, log_dao
from evaluator_api.ddb.models import JobErrorItem, JobItem

_PK = "JOB"
_SK_PREFIX = "JOB#"


class JobDao:
    """Data Access Object for job records in the single evaluator table.

    Key schema: pk="JOB", sk="JOB#<job_id>"
    """

    def __init__(self, table: Table) -> None:
        self._table = LoggedTable(table)

    @log_dao
    def get(self, job_id: str) -> Optional[JobItem]:
        """Get a job by job ID."""
        resp = self._table.get_item(Key={"pk": _PK, "sk": f"{_SK_PREFIX}{job_id}"})
        if "Item" not in resp:
            return None
        return JobItem.model_validate(resp["Item"])

    @log_dao
    def put(self, item: JobItem) -> None:
        """Put a job item into the table."""
        data = item.model_dump(exclude_none=True)
        data["pk"] = _PK
        data["sk"] = f"{_SK_PREFIX}{item.job_id}"
        self._table.put_item(Item=data)

    @log_dao
    def update_status(
        self,
        job_id: str,
        status: str,
        stage: Optional[str] = None,
        result: Optional[dict[str, Any]] = None,
        error: Optional[JobErrorItem] = None,
    ) -> datetime:
        """Update job status and optional fields.

        Returns:
            The timestamp when the update occurred.
        """
        now = datetime.now(timezone.utc)
        update_expr = "SET #status = :status, updated_at = :updated_at"
        expr_names: dict[str, str] = {"#status": "status"}
        expr_values: dict[str, Any] = {":status": status, ":updated_at": now.isoformat()}

        if stage:
            update_expr += ", stage = :stage"
            expr_values[":stage"] = stage
        if result:
            update_expr += ", #result = :result"
            expr_names["#result"] = "result"
            expr_values[":result"] = floats_to_decimal(result)
        if error:
            update_expr += ", #error = :error"
            expr_names["#error"] = "error"
            expr_values[":error"] = error.model_dump(by_alias=True, exclude_none=True)

        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{job_id}"},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression="attribute_exists(pk)",
        )

        return now

    @log_dao
    def list_all(
        self,
        max_results: Optional[int] = None,
        next_token: Optional[str] = None,
    ) -> tuple[list[JobItem], Optional[str]]:
        """List all jobs with pagination."""
        query_params: dict[str, Any] = {
            "KeyConditionExpression": Key("pk").eq(_PK),
        }

        if max_results:
            query_params["Limit"] = max_results
        if next_token:
            decoded = base64.b64decode(next_token).decode("utf-8")
            query_params["ExclusiveStartKey"] = json.loads(decoded)

        resp = self._table.query(**query_params)

        items = [JobItem.model_validate(item) for item in resp.get("Items", [])]

        result_next_token: Optional[str] = None
        if "LastEvaluatedKey" in resp:
            result_next_token = base64.b64encode(json.dumps(resp["LastEvaluatedKey"]).encode()).decode()

        return items, result_next_token

    @log_dao
    def update_task_status(
        self,
        job_id: str,
        task_key: str,
        status: str,
        error: Optional[str] = None,
        only_if_non_terminal: bool = False,
    ) -> None:
        """Update a single task's status within the tasks map.

        When only_if_non_terminal=True, only overwrites PENDING/RUNNING —
        prevents timeout handlers from overwriting a completed task.
        """
        now = datetime.now(timezone.utc).isoformat()
        update_expr = "SET tasks.#tk.#s = :s, updated_at = :t"
        expr_names: dict[str, str] = {"#tk": task_key, "#s": "status"}
        expr_values: dict[str, Any] = {":s": status, ":t": now}

        if error:
            update_expr += ", tasks.#tk.#e = :e"
            expr_names["#e"] = "error"
            expr_values[":e"] = error

        condition = "attribute_exists(pk) AND attribute_exists(tasks.#tk)"
        if only_if_non_terminal:
            condition += " AND (tasks.#tk.#s = :pending OR tasks.#tk.#s = :running)"
            expr_values[":pending"] = "PENDING"
            expr_values[":running"] = "RUNNING"

        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{job_id}"},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ConditionExpression=condition,
        )

    @log_dao
    def update_task_checkpoint(
        self, job_id: str, task_key: str, checkpoint: dict[str, Any],
    ) -> None:
        """Store a checkpoint on a task within the tasks map."""
        now = datetime.now(timezone.utc).isoformat()
        self._table.update_item(
            Key={"pk": _PK, "sk": f"{_SK_PREFIX}{job_id}"},
            UpdateExpression="SET tasks.#tk.#cp = :cp, updated_at = :t",
            ExpressionAttributeNames={"#tk": task_key, "#cp": "checkpoint"},
            ExpressionAttributeValues={":cp": floats_to_decimal(checkpoint), ":t": now},
            ConditionExpression="attribute_exists(pk)",
        )

    def exists(self, job_id: str) -> bool:
        """Check if a job exists."""
        return self.get(job_id) is not None
