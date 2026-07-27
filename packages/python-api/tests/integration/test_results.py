"""Tests for test result operations (get, list, batch create/update/delete)."""

from typing import Any
from unittest.mock import patch

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import (
    BadRequestException,
    NotFoundException,
)
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    BatchCreateResultsRequestContent,
    BatchCreateResultsResponseContent,
    BatchDeleteResultsRequestContent,
    BatchDeleteResultsResponseContent,
    BatchResultInput,
    BatchScoreItem,
    BatchUpdateScoresRequestContent,
    CreateReportRequestContent,
    CreateReportResponseContent,
    GetTestResultResponseContent,
    ListTestResultsResponseContent,
    ScoreInput,
)
from botocore.exceptions import ClientError

from tests.util.etk_test_client import LambdaApiClient


class TestGetTestResult:
    def test_success(self, client: DefaultApi, test_result: dict[str, Any]) -> None:
        resp = client.get_test_result(test_result["reportId"], test_result["resultId"])
        assert isinstance(resp, GetTestResultResponseContent)
        assert resp.result.result_id == test_result["resultId"]

    def test_scores_round_trip(self, client: DefaultApi) -> None:
        """Scores written via batch_update_scores come back correctly on GET."""
        report_resp = client.create_report(CreateReportRequestContent(name="score-test"))
        report_id = report_resp.report.report_id
        create_resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "q1"}, output={"a": "a1"}),
            ]),
        )
        result_id = create_resp.results[0].result_id

        client.batch_update_scores(
            report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_id, scores={
                    "accuracy": ScoreInput(value=0.95, reason="Almost perfect"),
                    "failed_scorer": ScoreInput(value=None, error="Scorer crashed"),
                }),
            ]),
        )

        resp = client.get_test_result(report_id, result_id)
        scores = resp.result.scores
        assert scores is not None
        assert scores["accuracy"].value == 0.95
        assert scores["accuracy"].reason == "Almost perfect"
        assert scores["accuracy"].error is None
        assert scores["accuracy"].scored_at is not None
        assert scores["failed_scorer"].value is None
        assert scores["failed_scorer"].error == "Scorer crashed"

    def test_not_found(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        with pytest.raises(NotFoundException):
            client.get_test_result(report.report.report_id, "nonexistent")


class TestListTestResults:
    def test_lists_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "q1"}),
                BatchResultInput(input={"q": "q2"}),
                BatchResultInput(input={"q": "q3"}),
            ]),
        )
        resp = client.list_test_results(report.report.report_id)
        assert isinstance(resp, ListTestResultsResponseContent)
        assert len(resp.test_results) == 3

    def test_lists_empty(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        resp = client.list_test_results(report.report.report_id)
        assert len(resp.test_results) == 0

    def test_pagination(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(
                results=[BatchResultInput(input={"q": f"q{i}"}) for i in range(5)],
            ),
        )

        resp1 = client.list_test_results(report.report.report_id, max_results=2)
        assert len(resp1.test_results) == 2
        assert resp1.next_token is not None

        resp2 = client.list_test_results(report.report.report_id, max_results=2, next_token=resp1.next_token)
        assert len(resp2.test_results) == 2


class TestBatchCreateResults:
    def test_creates_multiple_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}, expected={"a": "1"}),
                BatchResultInput(input={"q": "2"}, expected={"a": "2"}),
                BatchResultInput(input={"q": "3"}, expected={"a": "3"}),
            ]),
        )
        assert isinstance(resp, BatchCreateResultsResponseContent)
        assert resp.count == 3
        assert len(resp.results) == 3
        assert len(resp.errors) == 0

    def test_index_correlates_to_request_item(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """Verify index maps each response item back to the correct request item."""
        report_id = report.report.report_id
        inputs = [
            BatchResultInput(input={"q": "first"}, testcase_id="tc-A"),
            BatchResultInput(input={"q": "second"}, testcase_id="tc-B"),
            BatchResultInput(input={"q": "third"}, testcase_id="tc-C"),
        ]
        resp = client.batch_create_results(
            report_id, BatchCreateResultsRequestContent(results=inputs),
        )

        # Every input item accounted for
        assert len(resp.results) + len(resp.errors) == len(inputs)
        assert len(resp.results) == 3

        seen_indexes = set()
        for r in resp.results:
            seen_indexes.add(r.index)
            # testcaseId in response matches the request item at this index
            assert r.testcase_id == inputs[r.index].testcase_id
            # Fetch the created result and verify its content matches request[index]
            get_resp = client.get_test_result(report_id, r.result_id)
            assert get_resp.result.input == inputs[r.index].input

        # All indexes present and unique
        assert seen_indexes == {0, 1, 2}

    def test_client_provided_result_id(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """Client can specify resultId; server uses it instead of generating one."""
        report_id = report.report.report_id
        resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}, result_id="custom-id-aaa"),
                BatchResultInput(input={"q": "2"}),  # server-generated
                BatchResultInput(input={"q": "3"}, result_id="custom-id-bbb"),
            ]),
        )
        assert resp.count == 3
        ids = {r.result_id for r in resp.results}
        assert "custom-id-aaa" in ids
        assert "custom-id-bbb" in ids

        # Verify the custom-id result is fetchable
        get_resp = client.get_test_result(report_id, "custom-id-aaa")
        assert get_resp.result.input == {"q": "1"}

    def test_report_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.batch_create_results(
                "nonexistent",
                BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
            )


class TestBatchUpdateScores:
    def test_updates_multiple_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
            ]),
        )
        result_ids = [r.result_id for r in create_resp.results]

        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_ids[0], scores={"accuracy": ScoreInput(value=0.9)}),
                BatchScoreItem(resultId=result_ids[1], scores={"accuracy": ScoreInput(value=0.8)}),
            ]),
        )
        assert resp.updated_count == 2

    def test_report_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.batch_update_scores(
                "nonexistent",
                BatchUpdateScoresRequestContent(items=[
                    BatchScoreItem(resultId="r1", scores={"s": ScoreInput(value=1.0)}),
                ]),
            )

    def test_partial_failure_reports_errors(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Verify that nonexistent results appear in errors with correct fields."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_id, scores={"s": ScoreInput(value=1.0)}),
                BatchScoreItem(resultId="nonexistent-1", scores={"s": ScoreInput(value=0.5)}),
                BatchScoreItem(resultId="nonexistent-2", scores={"s": ScoreInput(value=0.3)}),
            ]),
        )
        assert resp.updated_count == 1
        assert len(resp.errors) == 2
        error_ids = {e.id for e in resp.errors}
        assert error_ids == {"nonexistent-1", "nonexistent-2"}
        for e in resp.errors:
            assert e.code == "NOT_FOUND"
            assert e.message  # non-empty

    def test_all_nonexistent_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Verify that when all items fail, updated_count=0 and all errors reported."""
        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId="bad-1", scores={"s": ScoreInput(value=1.0)}),
                BatchScoreItem(resultId="bad-2", scores={"s": ScoreInput(value=0.5)}),
            ]),
        )
        assert resp.updated_count == 0
        assert len(resp.errors) == 2

    def test_all_succeed_no_errors(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Verify that when all items succeed, errors list is empty."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
            ]),
        )
        result_ids = [r.result_id for r in create_resp.results]

        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_ids[0], scores={"s": ScoreInput(value=1.0)}),
                BatchScoreItem(resultId=result_ids[1], scores={"s": ScoreInput(value=0.8)}),
            ]),
        )
        assert resp.updated_count == 2
        assert len(resp.errors) == 0

    def test_score_name_with_dot_allowed(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Score names with '.' are allowed — used for sub-score namespacing."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_id, scores={"parent.child": ScoreInput(value=0.9)}),
            ]),
        )
        assert resp.updated_count == 1

    def test_score_name_with_spaces_rejected(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Score names with spaces are rejected."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        with pytest.raises(BadRequestException):
            client.batch_update_scores(
                report.report.report_id,
                BatchUpdateScoresRequestContent(items=[
                    BatchScoreItem(resultId=result_id, scores={"my score": ScoreInput(value=0.9)}),
                ]),
            )

    def test_score_name_with_hyphen_rejected(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Score names with hyphens are rejected."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        with pytest.raises(BadRequestException):
            client.batch_update_scores(
                report.report.report_id,
                BatchUpdateScoresRequestContent(items=[
                    BatchScoreItem(resultId=result_id, scores={"my-score": ScoreInput(value=0.9)}),
                ]),
            )

    def test_score_name_with_underscore_allowed(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Score names with underscores are valid."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        resp = client.batch_update_scores(
            report.report.report_id,
            BatchUpdateScoresRequestContent(items=[
                BatchScoreItem(resultId=result_id, scores={"my_score": ScoreInput(value=0.9)}),
            ]),
        )
        assert resp.updated_count == 1


class TestBatchDeleteResults:
    def test_deletes_specific_results(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
                BatchResultInput(input={"q": "3"}),
            ]),
        )
        result_ids = [r.result_id for r in create_resp.results]

        resp = client.batch_delete_results(
            report.report.report_id,
            BatchDeleteResultsRequestContent(resultIds=[result_ids[0], result_ids[1]]),
        )
        assert isinstance(resp, BatchDeleteResultsResponseContent)
        assert resp.deleted_count == 2
        assert len(resp.errors) == 0

        # Verify only the third result remains
        list_resp = client.list_test_results(report.report.report_id)
        assert len(list_resp.test_results) == 1
        assert list_resp.test_results[0].result_id == result_ids[2]

    def test_report_not_found(self, client: DefaultApi) -> None:
        with pytest.raises(NotFoundException):
            client.batch_delete_results(
                "nonexistent",
                BatchDeleteResultsRequestContent(resultIds=["r1"]),
            )

    def test_nonexistent_result_ids_are_idempotent(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """Deleting nonexistent results is idempotent — no errors reported."""
        create_resp = client.batch_create_results(
            report.report.report_id,
            BatchCreateResultsRequestContent(results=[BatchResultInput(input={"q": "1"})]),
        )
        result_id = create_resp.results[0].result_id

        resp = client.batch_delete_results(
            report.report.report_id,
            BatchDeleteResultsRequestContent(resultIds=[result_id, "nonexistent-1", "nonexistent-2"]),
        )
        assert resp.deleted_count == 3
        assert len(resp.errors) == 0

    def test_all_nonexistent_is_idempotent(self, client: DefaultApi, report: CreateReportResponseContent) -> None:
        """Deleting all nonexistent results succeeds silently."""
        resp = client.batch_delete_results(
            report.report.report_id,
            BatchDeleteResultsRequestContent(resultIds=["bad-1", "bad-2"]),
        )
        assert resp.deleted_count == 2
        assert len(resp.errors) == 0


@pytest.mark.onebox_only
class TestBatchDdbFailures:
    """Test partial DDB failures in batch operations by mocking DAO methods."""

    @staticmethod
    def _client_error() -> ClientError:
        return ClientError(
            {"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "Rate exceeded"}},
            "DynamoDB",
        )

    def test_batch_create_partial_failure_middle(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """When put fails for item at index 1, it appears in errors with correct index."""
        from evaluator_api.routes import get_result_dao

        report_id = report.report.report_id
        dao = get_result_dao()
        original_put = dao.put
        call_count = 0

        def put_failing_on_second(item: Any) -> None:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise self._client_error()
            original_put(item)

        inputs = [
            BatchResultInput(input={"q": "first"}, testcase_id="tc-0"),
            BatchResultInput(input={"q": "second"}, testcase_id="tc-1"),
            BatchResultInput(input={"q": "third"}, testcase_id="tc-2"),
        ]

        with patch.object(dao, "put", side_effect=put_failing_on_second):
            resp = client.batch_create_results(
                report_id, BatchCreateResultsRequestContent(results=inputs),
            )

        # Every input accounted for
        assert len(resp.results) + len(resp.errors) == len(inputs)
        assert resp.count == 2
        assert len(resp.errors) == 1

        # Successful items have correct indexes and testcaseIds
        success_indexes = {r.index for r in resp.results}
        assert success_indexes == {0, 2}
        for r in resp.results:
            assert r.testcase_id == inputs[r.index].testcase_id

        # Failed item has correct index, id, and error code
        err = resp.errors[0]
        assert err.index == 1
        assert err.id == "1"  # string representation of the index
        assert err.code == "CREATE_FAILED"

        # Verify successful items are persisted with correct data
        for r in resp.results:
            get_resp = client.get_test_result(report_id, r.result_id)
            assert get_resp.result.input == inputs[r.index].input

        # Verify only 2 results exist in the report (failed item NOT persisted)
        list_resp = client.list_test_results(report_id)
        assert len(list_resp.test_results) == 2

    def test_batch_create_partial_failure_first(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """When the first item fails, indexes on successes start from 1 not 0."""
        from evaluator_api.routes import get_result_dao

        report_id = report.report.report_id
        dao = get_result_dao()
        original_put = dao.put
        call_count = 0

        def put_failing_on_first(item: Any) -> None:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise self._client_error()
            original_put(item)

        inputs = [
            BatchResultInput(input={"q": "first"}, testcase_id="tc-0"),
            BatchResultInput(input={"q": "second"}, testcase_id="tc-1"),
            BatchResultInput(input={"q": "third"}, testcase_id="tc-2"),
        ]

        with patch.object(dao, "put", side_effect=put_failing_on_first):
            resp = client.batch_create_results(
                report_id, BatchCreateResultsRequestContent(results=inputs),
            )

        assert len(resp.results) + len(resp.errors) == len(inputs)
        assert resp.count == 2
        assert len(resp.errors) == 1

        # Error is for index 0
        assert resp.errors[0].index == 0
        assert resp.errors[0].id == "0"

        # Successes are indexes 1 and 2
        success_indexes = {r.index for r in resp.results}
        assert success_indexes == {1, 2}
        for r in resp.results:
            assert r.testcase_id == inputs[r.index].testcase_id
            get_resp = client.get_test_result(report_id, r.result_id)
            assert get_resp.result.input == inputs[r.index].input

    def test_batch_update_scores_ddb_failure(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """When update raises ClientError, the item appears in errors as UPDATE_FAILED."""
        from evaluator_api.routes import get_result_dao

        report_id = report.report.report_id
        create_resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
            ]),
        )
        result_ids = [r.result_id for r in create_resp.results]

        dao = get_result_dao()
        original_update = dao.update
        call_count = 0

        def update_failing_on_first(**kwargs: Any) -> Any:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise self._client_error()
            return original_update(**kwargs)

        with patch.object(dao, "update", side_effect=update_failing_on_first):
            resp = client.batch_update_scores(
                report_id,
                BatchUpdateScoresRequestContent(items=[
                    BatchScoreItem(resultId=result_ids[0], scores={"s": ScoreInput(value=0.9)}),
                    BatchScoreItem(resultId=result_ids[1], scores={"s": ScoreInput(value=0.8)}),
                ]),
            )

        assert resp.updated_count == 1
        assert len(resp.errors) == 1
        assert resp.errors[0].id == result_ids[0]
        assert resp.errors[0].code == "UPDATE_FAILED"

    def test_batch_delete_ddb_failure(
        self, client: DefaultApi, report: CreateReportResponseContent,
    ) -> None:
        """When delete raises ClientError, the item appears in errors as DELETE_FAILED."""
        from evaluator_api.routes import get_result_dao

        report_id = report.report.report_id
        create_resp = client.batch_create_results(
            report_id,
            BatchCreateResultsRequestContent(results=[
                BatchResultInput(input={"q": "1"}),
                BatchResultInput(input={"q": "2"}),
            ]),
        )
        result_ids = [r.result_id for r in create_resp.results]

        dao = get_result_dao()
        original_delete = dao.delete
        call_count = 0

        def delete_failing_on_second(report_id: str, result_id: str) -> Any:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise self._client_error()
            return original_delete(report_id, result_id)

        with patch.object(dao, "delete", side_effect=delete_failing_on_second):
            resp = client.batch_delete_results(
                report_id,
                BatchDeleteResultsRequestContent(resultIds=result_ids),
            )

        assert resp.deleted_count == 1
        assert len(resp.errors) == 1
        assert resp.errors[0].id == result_ids[1]
        assert resp.errors[0].code == "DELETE_FAILED"


class TestBatchSizeLimits:
    """Verify Smithy @length constraints return 400 at the API level.

    These tests bypass the generated client's Pydantic validation by
    sending raw requests through LambdaApiClient.call_api().
    """

    @pytest.fixture()
    def raw_client(self) -> LambdaApiClient:
        return LambdaApiClient()

    @pytest.fixture()
    def report_id(self, client: DefaultApi) -> str:
        resp = client.create_report(CreateReportRequestContent(name="limits-test"))
        return resp.report.report_id

    def _raw_post(self, raw_client: LambdaApiClient, path: str, body: dict[str, Any]) -> int:
        """Send a raw POST and return the status code."""
        resp = raw_client.call_api("POST", f"http://localhost{path}", body=body)
        return resp.status

    def test_batch_create_empty_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/batch",
            {"results": []},
        )
        assert status == 400

    def test_batch_create_over_25_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        items = [{"input": {"q": str(i)}} for i in range(26)]
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/batch",
            {"results": items},
        )
        assert status == 400

    def test_batch_create_at_25_returns_200(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        items = [{"input": {"q": str(i)}} for i in range(25)]
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/batch",
            {"results": items},
        )
        assert status == 200

    def test_batch_update_scores_empty_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/scores/batch",
            {"items": []},
        )
        assert status == 400

    def test_batch_update_scores_over_25_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        items = [{"resultId": f"r-{i}", "scores": {"s": {"value": 0.5}}} for i in range(26)]
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/scores/batch",
            {"items": items},
        )
        assert status == 400

    def test_batch_delete_empty_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/delete/batch",
            {"resultIds": []},
        )
        assert status == 400

    def test_batch_delete_over_25_returns_400(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        ids = [f"r-{i}" for i in range(26)]
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/delete/batch",
            {"resultIds": ids},
        )
        assert status == 400

    def test_batch_create_at_1_returns_200(
        self, raw_client: LambdaApiClient, report_id: str,
    ) -> None:
        """Exactly 1 item (min boundary) is accepted."""
        status = self._raw_post(
            raw_client,
            f"/v2/reports/{report_id}/results/batch",
            {"results": [{"input": {"q": "1"}}]},
        )
        assert status == 200
