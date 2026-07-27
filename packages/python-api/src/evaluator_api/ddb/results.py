"""Data Access Object for results (single-table design)."""

import base64
import json
from datetime import datetime, timezone
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from mypy_boto3_dynamodb.service_resource import Table

from evaluator_api.ddb.common import (
    LoggedTable,
    encode_score_placeholder,
    floats_to_decimal,
    log_dao,
)
from evaluator_api.ddb.models import ResultItem, ScoreItemModel

_PK_PREFIX = "RESULT#"
_SK_PREFIX = "RESULT#"


class ResultDao:
    """Data Access Object for result records in the single evaluator table.

    Key schema: pk="RESULT#<report_id>", sk="RESULT#<result_id>"
    """

    def __init__(self, table: Table) -> None:
        self._table = LoggedTable(table)

    def _key(self, report_id: str, result_id: str) -> dict[str, str]:
        return {"pk": f"{_PK_PREFIX}{report_id}", "sk": f"{_SK_PREFIX}{result_id}"}

    @log_dao
    def get(self, report_id: str, result_id: str) -> Optional[ResultItem]:
        """Get a result by report ID and result ID."""
        resp = self._table.get_item(Key=self._key(report_id, result_id))
        if "Item" not in resp:
            return None
        return ResultItem.model_validate(resp["Item"])

    @log_dao
    def put(self, item: ResultItem) -> None:
        """Put a result item into the table."""
        data = item.model_dump(exclude_none=True, mode="json")
        data["pk"] = f"{_PK_PREFIX}{item.report_id}"
        data["sk"] = f"{_SK_PREFIX}{item.result_id}"
        self._table.put_item(Item=data)

    @log_dao
    def query_by_report(
        self,
        report_id: str,
        max_results: Optional[int] = None,
        next_token: Optional[str] = None,
    ) -> tuple[list[ResultItem], Optional[str]]:
        """Query results by report ID with pagination."""
        query_params: dict[str, Any] = {
            "KeyConditionExpression": Key("pk").eq(f"{_PK_PREFIX}{report_id}"),
        }

        if max_results:
            query_params["Limit"] = max_results
        if next_token:
            decoded = base64.b64decode(next_token).decode("utf-8")
            query_params["ExclusiveStartKey"] = json.loads(decoded)

        resp = self._table.query(**query_params)

        items = [ResultItem.model_validate(item) for item in resp.get("Items", [])]

        result_next_token: Optional[str] = None
        if "LastEvaluatedKey" in resp:
            result_next_token = base64.b64encode(json.dumps(resp["LastEvaluatedKey"]).encode()).decode()

        return items, result_next_token

    @log_dao
    def update(
        self,
        report_id: str,
        result_id: str,
        scores: Optional[dict[str, ScoreItemModel]] = None,
        output: Optional[Any] = None,
        app_metrics: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> ResultItem:
        """Update a result with scores and optional fields.

        Uses additive updates for scores - each score is set individually,
        allowing concurrent workers to add different scores without overwriting.
        """
        now = datetime.now(timezone.utc)
        update_expr = "SET updated_at = :updated_at"
        expr_names: dict[str, str] = {}
        expr_values: dict[str, Any] = {":updated_at": now.isoformat()}

        if scores is not None:
            expr_names["#scores"] = "scores"

            for name, score in scores.items():
                safe = encode_score_placeholder(name)
                expr_names[f"#score_{safe}"] = name

                score_data = score.model_dump(by_alias=True, exclude_none=True)
                # Convert every float (top-level value and any nested floats in
                # context, e.g. per-requirement scores) to Decimal for DynamoDB.
                score_data = floats_to_decimal(score_data)
                expr_values[f":score_{safe}"] = score_data

                update_expr += f", #scores.#score_{safe} = :score_{safe}"

        if output is not None:
            update_expr += ", #output = :output"
            expr_names["#output"] = "output"
            expr_values[":output"] = output

        if app_metrics is not None:
            update_expr += ", app_metrics = :app_metrics"
            expr_values[":app_metrics"] = app_metrics

        if error is not None:
            update_expr += ", #error = :error"
            expr_names["#error"] = "error"
            expr_values[":error"] = error

        update_params: dict[str, Any] = {
            "Key": self._key(report_id, result_id),
            "UpdateExpression": update_expr,
            "ExpressionAttributeValues": expr_values,
            "ConditionExpression": "attribute_exists(pk)",
            "ReturnValues": "ALL_NEW",
        }
        if expr_names:
            update_params["ExpressionAttributeNames"] = expr_names

        update_resp = self._table.update_item(**update_params)
        return ResultItem.model_validate(update_resp.get("Attributes", {}))

    @log_dao
    def delete(self, report_id: str, result_id: str) -> None:
        """Delete a result by report ID and result ID. Idempotent — no error if missing."""
        self._table.delete_item(Key=self._key(report_id, result_id))

    @log_dao
    def delete_all_by_report(self, report_id: str) -> int:
        """Delete all results for a report.

        Paginates through all results and batch-deletes them.
        """
        deleted = 0
        with self._table.batch_writer() as batch:
            next_token: Optional[str] = None
            while True:
                items, next_token = self.query_by_report(report_id, next_token=next_token)
                for item in items:
                    batch.delete_item(Key=self._key(report_id, item.result_id))
                    deleted += 1
                if not next_token:
                    break
        return deleted

    def exists(self, report_id: str, result_id: str) -> bool:
        """Check if a result exists."""
        return self.get(report_id, result_id) is not None
