"""Tests for MockStepFunctions — verify it correctly interprets our ASL.

Runs the real ASL from scripts/sf-prototype/asl.json with stub handlers
that call send_task_success/failure. Tests the state machine logic, not
the evaluator SDK or API — just: does the pipeline orchestrate correctly?
"""

import json
from pathlib import Path
from typing import Any

import pytest

from .mock_step_functions import MockEventRouter, MockStepFunctions

_REPO = Path(__file__).resolve().parent.parent.parent.parent.parent
ASL_PATH = _REPO / "packages" / "cdk" / "src" / "evaluator" / "orchestration-asl.json"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def asl() -> dict:
    with open(ASL_PATH) as f:
        return json.load(f)


@pytest.fixture
def router() -> MockEventRouter:
    return MockEventRouter()


# ---------------------------------------------------------------------------
# Helpers — reusable stub handlers + input builder
# ---------------------------------------------------------------------------

def _make_input(
    *,
    job_id: str = "j1",
    report_id: str = "r1",
    primary_task_key: str = "full",
    primary_job_type: str = "FULL",
    primary_evaluator: str = "builtin",
    source_report_id: str | None = None,
    score_tasks: list[dict[str, Any]] | None = None,
    skip_to_post_process: bool = False,
    test_data: Any = None,
    scorers: Any = None,
    experiment_name: str | None = None,
) -> str:
    """Build SFN execution input JSON. Defaults to a single-evaluator FULL job."""
    return json.dumps({
        "jobId": job_id,
        "reportId": report_id,
        "primaryTask": {
            "taskKey": primary_task_key,
            "jobType": primary_job_type,
            "evaluatorName": primary_evaluator,
            "sourceReportId": source_report_id,
        } if not skip_to_post_process else None,
        "scoreTasks": score_tasks or [],
        "postProcessTask": {"taskKey": "post_process", "jobType": "POST_PROCESS"},
        "postProcessCheckpoint": None,
        "testCases": test_data,
        "scorers": scorers,
        "experimentName": experiment_name,
        "checkpoint": None,
        "skipToPostProcess": skip_to_post_process,
        "continueBufferMs": None,
    })


def _stub_success(sfn: MockStepFunctions):
    """Handler that immediately calls send_task_success(COMPLETED)."""
    def handler(detail: dict) -> None:
        token = detail.get("taskToken")
        if token:
            sfn.send_task_success(
                taskToken=token,
                output=json.dumps({"status": "COMPLETED", "taskKey": detail.get("taskKey")}),
            )
    return handler


def _stub_failure(sfn: MockStepFunctions):
    """Handler that immediately calls send_task_failure."""
    def handler(detail: dict) -> None:
        token = detail.get("taskToken")
        if token:
            sfn.send_task_failure(taskToken=token, error="TestFailure", cause="stub")
    return handler


def _stub_continue_then_complete(sfn: MockStepFunctions, continue_count: int = 1):
    """Handler that sends CONTINUE n times, then COMPLETED."""
    state = {"count": 0}

    def handler(detail: dict) -> None:
        token = detail.get("taskToken")
        if not token:
            return
        state["count"] += 1
        if state["count"] <= continue_count:
            sfn.send_task_success(
                taskToken=token,
                output=json.dumps({
                    "status": "CONTINUE",
                    "taskKey": detail.get("taskKey"),
                    "checkpoint": {"inline_testcase_index": state["count"] * 100},
                }),
            )
        else:
            sfn.send_task_success(
                taskToken=token,
                output=json.dumps({"status": "COMPLETED", "taskKey": detail.get("taskKey")}),
            )
    return handler


def _tracking_success(sfn: MockStepFunctions, events: list[dict]):
    """Handler that captures the event AND calls send_task_success(COMPLETED)."""
    def handler(detail: dict) -> None:
        events.append(detail)
        token = detail.get("taskToken")
        if token:
            sfn.send_task_success(
                taskToken=token,
                output=json.dumps({"status": "COMPLETED", "taskKey": detail.get("taskKey")}),
            )
    return handler


# ---------------------------------------------------------------------------
# Single evaluator
# ---------------------------------------------------------------------------

class TestSingleEvaluator:
    def test_full_then_post_process(self, asl: dict, router: MockEventRouter) -> None:
        """FULL → POST_PROCESS → Finish."""
        sfn = MockStepFunctions(asl=asl, router=router)
        router.add_rule({}, _stub_success(sfn))

        sfn.start_execution(name="test-single", input=_make_input())
        result = sfn.run()

        assert result["jobId"] == "j1"
        assert sfn.describe_execution(
            executionArn="arn:aws:states:mock:123456789:execution:mock:test-single"
        )["status"] == "SUCCEEDED"


# ---------------------------------------------------------------------------
# Multi-evaluator
# ---------------------------------------------------------------------------

class TestMultiEvaluator:
    def test_app_invoke_then_parallel_scores(self, asl: dict, router: MockEventRouter) -> None:
        """APP_INVOKE → 2 parallel SCORE → POST_PROCESS."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        router.add_rule({}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-multi",
            input=_make_input(
                job_id="j2",
                primary_task_key="app_invoke",
                primary_job_type="APP_INVOKE",
                primary_evaluator="my-app",
                score_tasks=[
                    {"taskKey": "score:llm_judge", "evaluatorName": "builtin", "scorers": {}},
                    {"taskKey": "score:fmeval", "evaluatorName": "fmeval", "scorers": {}},
                ],
            ),
        )
        sfn.run()

        task_keys = [e.get("taskKey") for e in events if e.get("taskToken")]
        assert task_keys[0] == "app_invoke"
        assert set(task_keys[1:3]) == {"score:llm_judge", "score:fmeval"}
        assert task_keys[3] == "post_process"

    def test_three_scorers_fan_out(self, asl: dict, router: MockEventRouter) -> None:
        """Map fans out to 3 parallel scorers."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        router.add_rule({}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-3score",
            input=_make_input(
                primary_task_key="app_invoke",
                primary_job_type="APP_INVOKE",
                primary_evaluator="app",
                score_tasks=[
                    {"taskKey": "score:a", "evaluatorName": "e1", "scorers": {}},
                    {"taskKey": "score:b", "evaluatorName": "e2", "scorers": {}},
                    {"taskKey": "score:c", "evaluatorName": "e3", "scorers": {}},
                ],
            ),
        )
        sfn.run()

        score_events = [e for e in events if e.get("taskKey", "").startswith("score:")]
        assert len(score_events) == 3
        assert {e["taskKey"] for e in score_events} == {"score:a", "score:b", "score:c"}
        assert {e["evaluatorName"] for e in score_events} == {"e1", "e2", "e3"}


# ---------------------------------------------------------------------------
# skipToPostProcess (local evaluate)
# ---------------------------------------------------------------------------

class TestSkipToPostProcess:
    def test_local_evaluate(self, asl: dict, router: MockEventRouter) -> None:
        """skipToPostProcess=True → only post_process event."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        router.add_rule({}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-local",
            input=_make_input(skip_to_post_process=True),
        )
        sfn.run()

        task_keys = [e.get("taskKey") for e in events if e.get("taskToken")]
        assert task_keys == ["post_process"]


# ---------------------------------------------------------------------------
# CONTINUE loop
# ---------------------------------------------------------------------------

class TestContinueLoop:
    def test_continue_twice_then_complete(self, asl: dict, router: MockEventRouter) -> None:
        """Worker returns CONTINUE twice, then COMPLETED."""
        sfn = MockStepFunctions(asl=asl, router=router)
        router.add_rule({"evaluatorName": ["builtin"]}, _stub_continue_then_complete(sfn, 2))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _stub_success(sfn))

        sfn.start_execution(name="test-continue", input=_make_input(job_id="j4"))
        result = sfn.run()
        assert result["jobId"] == "j4"

    def test_checkpoint_flows_through(self, asl: dict, router: MockEventRouter) -> None:
        """CONTINUE checkpoint from first invocation arrives in second event's detail."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        state = {"count": 0}

        def continue_with_checkpoint(detail: dict) -> None:
            events.append(detail)
            token = detail.get("taskToken")
            if not token:
                return
            state["count"] += 1
            if state["count"] == 1:
                sfn.send_task_success(taskToken=token, output=json.dumps({
                    "status": "CONTINUE", "taskKey": "full",
                    "checkpoint": {"inline_testcase_index": 42, "welford": {"score_a": {"count": 10}}},
                }))
            else:
                sfn.send_task_success(taskToken=token, output=json.dumps({
                    "status": "COMPLETED", "taskKey": detail.get("taskKey"),
                }))

        router.add_rule({"evaluatorName": ["builtin"]}, continue_with_checkpoint)
        router.add_rule({"jobType": ["POST_PROCESS"]}, _stub_success(sfn))

        sfn.start_execution(name="test-cp", input=_make_input())
        sfn.run()

        assert events[0].get("checkpoint") is None
        assert events[1].get("checkpoint") == {
            "inline_testcase_index": 42,
            "welford": {"score_a": {"count": 10}},
        }

    def test_post_process_continue_loops(self, asl: dict, router: MockEventRouter) -> None:
        """Post-processing CONTINUE: checkpoint flows, handler re-invoked, then completes."""
        sfn = MockStepFunctions(asl=asl, router=router)
        pp_events: list[dict] = []
        pp_state = {"count": 0}

        def pp_continue_then_complete(detail: dict) -> None:
            pp_events.append(detail)
            token = detail.get("taskToken")
            if not token:
                return
            pp_state["count"] += 1
            if pp_state["count"] == 1:
                sfn.send_task_success(taskToken=token, output=json.dumps({
                    "status": "CONTINUE", "taskKey": "post_process",
                    "checkpoint": {"last_evaluated_key": "page-2-token", "welford": {"acc": {"count": 50}}},
                }))
            else:
                sfn.send_task_success(taskToken=token, output=json.dumps({
                    "status": "COMPLETED", "taskKey": "post_process",
                }))

        router.add_rule({"evaluatorName": ["builtin"]}, _stub_success(sfn))
        router.add_rule({"jobType": ["POST_PROCESS"]}, pp_continue_then_complete)

        sfn.start_execution(name="test-pp-continue", input=_make_input())
        result = sfn.run()

        assert result["jobId"] == "j1"
        assert pp_state["count"] == 2  # invoked twice
        # First invocation: no checkpoint
        assert pp_events[0].get("checkpoint") is None
        # Second invocation: has checkpoint from CONTINUE
        assert pp_events[1].get("checkpoint") == {
            "last_evaluated_key": "page-2-token",
            "welford": {"acc": {"count": 50}},
        }


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    def test_primary_failure_still_post_processes(self, asl: dict, router: MockEventRouter) -> None:
        """Primary fails → post-process still runs."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        router.add_rule({"evaluatorName": ["builtin"]}, _stub_failure(sfn))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _tracking_success(sfn, events))

        sfn.start_execution(name="test-fail", input=_make_input(job_id="j5"))
        sfn.run()

        post_events = [e for e in events if e.get("taskKey") == "post_process"]
        assert len(post_events) == 1

    def test_task_failed_skips_timeout_event(self, asl: dict, router: MockEventRouter) -> None:
        """TaskFailed goes directly to post-process — NO timeout event emitted.

        The ASL has separate Catch blocks: States.HeartbeatTimeout → EmitPrimaryTimeout,
        States.TaskFailed → EmitPostProcessTask. When a worker calls send_task_failure,
        the mock maps it to States.TaskFailed which routes directly to post-process,
        bypassing the timeout emit state entirely.
        """
        sfn = MockStepFunctions(asl=asl, router=router)
        all_events: list[dict] = []
        router.add_rule({"evaluatorName": ["builtin"]}, _stub_failure(sfn))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _tracking_success(sfn, all_events))

        sfn.start_execution(name="test-taskfailed", input=_make_input())
        sfn.run()

        # Post-process ran
        assert any(e.get("taskKey") == "post_process" for e in all_events)
        # No fire-and-forget timeout events captured (TaskFailed skips EmitPrimaryTimeout)
        assert not any(e.get("taskKey") == "full" and not e.get("taskToken") for e in all_events)

    def test_one_scorer_fails_other_succeeds(self, asl: dict, router: MockEventRouter) -> None:
        """One scorer fails, other succeeds — post-process still runs."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []

        router.add_rule({"evaluatorName": ["app"]}, _stub_success(sfn))
        router.add_rule({"evaluatorName": ["good-scorer"]}, _stub_success(sfn))
        router.add_rule({"evaluatorName": ["bad-scorer"]}, _stub_failure(sfn))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-partial",
            input=_make_input(
                primary_task_key="app_invoke",
                primary_job_type="APP_INVOKE",
                primary_evaluator="app",
                score_tasks=[
                    {"taskKey": "score:good", "evaluatorName": "good-scorer", "scorers": {}},
                    {"taskKey": "score:bad", "evaluatorName": "bad-scorer", "scorers": {}},
                ],
            ),
        )
        sfn.run()

        assert any(e.get("taskKey") == "post_process" for e in events)

    def test_timeout_still_post_processes(self, asl: dict, router: MockEventRouter) -> None:
        """Primary times out (no callback) → post-process still runs."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        # No handler for the primary evaluator → no callback → HeartbeatTimeout
        router.add_rule({"jobType": ["POST_PROCESS"]}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-timeout",
            input=_make_input(primary_evaluator="dead-worker"),
        )
        sfn.run()

        assert any(e.get("taskKey") == "post_process" for e in events)

    def test_scorer_timeout_still_post_processes(self, asl: dict, router: MockEventRouter) -> None:
        """One scorer times out in parallel Map — post-process still runs."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []

        router.add_rule({"evaluatorName": ["app"]}, _stub_success(sfn))
        router.add_rule({"evaluatorName": ["good-scorer"]}, _stub_success(sfn))
        # No handler for dead-scorer → HeartbeatTimeout
        router.add_rule({"jobType": ["POST_PROCESS"]}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-score-timeout",
            input=_make_input(
                primary_task_key="app_invoke",
                primary_job_type="APP_INVOKE",
                primary_evaluator="app",
                score_tasks=[
                    {"taskKey": "score:good", "evaluatorName": "good-scorer", "scorers": {}},
                    {"taskKey": "score:dead", "evaluatorName": "dead-scorer", "scorers": {}},
                ],
            ),
        )
        sfn.run()

        assert any(e.get("taskKey") == "post_process" for e in events)

    def test_post_process_timeout_still_succeeds(self, asl: dict, router: MockEventRouter) -> None:
        """Post-process times out — SFN execution still SUCCEEDS."""
        sfn = MockStepFunctions(asl=asl, router=router)
        router.add_rule({"evaluatorName": ["builtin"]}, _stub_success(sfn))
        # No handler for POST_PROCESS → HeartbeatTimeout

        sfn.start_execution(name="test-pp-timeout", input=_make_input())
        sfn.run()

        assert sfn.describe_execution(
            executionArn="arn:aws:states:mock:123456789:execution:mock:test-pp-timeout"
        )["status"] == "SUCCEEDED"

    def test_post_process_failure_still_succeeds(self, asl: dict, router: MockEventRouter) -> None:
        """Post-process fails — SFN execution still SUCCEEDS (all errors caught)."""
        sfn = MockStepFunctions(asl=asl, router=router)
        router.add_rule({"evaluatorName": ["builtin"]}, _stub_success(sfn))
        router.add_rule({"jobType": ["POST_PROCESS"]}, _stub_failure(sfn))

        sfn.start_execution(name="test-pp-fail", input=_make_input())
        sfn.run()

        assert sfn.describe_execution(
            executionArn="arn:aws:states:mock:123456789:execution:mock:test-pp-fail"
        )["status"] == "SUCCEEDED"


# ---------------------------------------------------------------------------
# Event detail correctness
# ---------------------------------------------------------------------------

class TestEventDetailCorrectness:
    def test_primary_event_has_correct_fields(self, asl: dict, router: MockEventRouter) -> None:
        """Events carry the right fields through the ASL."""
        sfn = MockStepFunctions(asl=asl, router=router)
        captured: list[dict] = []
        router.add_rule({}, _tracking_success(sfn, captured))

        sfn.start_execution(
            name="test-detail",
            input=_make_input(
                job_id="jd",
                report_id="rd",
                primary_task_key="app_invoke",
                primary_job_type="APP_INVOKE",
                primary_evaluator="my-worker",
                score_tasks=[
                    {"taskKey": "score:my_scorer", "evaluatorName": "scorer-worker",
                     "scorers": {"my_scorer": {"params": {"threshold": 0.5}}}},
                ],
                test_data={"inline": [{"input": {"q": "test"}}]},
                scorers={"my_scorer": None},
                experiment_name="exp-1",
            ),
        )
        sfn.run()

        # Primary task event
        primary = captured[0]
        assert primary["taskKey"] == "app_invoke"
        assert primary["jobType"] == "APP_INVOKE"
        assert primary["evaluatorName"] == "my-worker"
        assert primary["jobId"] == "jd"
        assert primary["reportId"] == "rd"
        assert primary["testCases"] == {"inline": [{"input": {"q": "test"}}]}
        assert primary["checkpoint"] is None
        assert primary["taskToken"] is not None

        # Score task event
        score_evt = captured[1]
        assert score_evt["taskKey"] == "score:my_scorer"
        assert score_evt["jobType"] == "SCORE"
        assert score_evt["evaluatorName"] == "scorer-worker"
        assert score_evt["scorers"] == {"my_scorer": {"params": {"threshold": 0.5}}}

        # Post-process event — no evaluatorName (internal task)
        post_evt = captured[2]
        assert post_evt["taskKey"] == "post_process"
        assert post_evt["jobType"] == "POST_PROCESS"
        assert post_evt.get("evaluatorName") is None


# ---------------------------------------------------------------------------
# COPY_RESULTS pipeline (score-from-source)
# ---------------------------------------------------------------------------

class TestCopyResultsPipeline:
    def test_copy_results_then_score_then_post_process(self, asl: dict, router: MockEventRouter) -> None:
        """COPY_RESULTS → SCORE → POST_PROCESS."""
        sfn = MockStepFunctions(asl=asl, router=router)
        events: list[dict] = []
        router.add_rule({}, _tracking_success(sfn, events))

        sfn.start_execution(
            name="test-copy",
            input=_make_input(
                job_id="jcopy",
                primary_task_key="copy_results",
                primary_job_type="COPY_RESULTS",
                primary_evaluator=None,
                source_report_id="source-report-123",
                score_tasks=[
                    {"taskKey": "score:rescore", "evaluatorName": "scorer", "scorers": {"rescore": None}},
                ],
            ),
        )
        sfn.run()

        task_keys = [e.get("taskKey") for e in events if e.get("taskToken")]
        assert task_keys == ["copy_results", "score:rescore", "post_process"]

        copy_evt = events[0]
        assert copy_evt["sourceReportId"] == "source-report-123"
        assert copy_evt["evaluatorName"] is None
