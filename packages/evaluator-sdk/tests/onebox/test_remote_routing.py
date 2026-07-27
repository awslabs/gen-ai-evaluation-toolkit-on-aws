"""Onebox tests for remote task routing via evaluatorName.

The SDK's evaluate()/score()/invoke() run remotely when a task's config carries
an evaluatorName. The SDK submits with processLocally=false, does no in-process
scoring/app-invoke, waits for the job to reach a terminal status, and returns a
populated EvaluationResponse.

A "remote worker" is modelled as a second Evaluator whose evaluator_handler is
registered on the MockEventRouter, running the real orchestration ASL. The mock
SFN runs in auto_run mode so the SDK's submit-then-poll path sees a terminal job
without a separate run() call.
"""

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Generator

import pytest
from evaluator_api.sfn import reset_sfn_client, set_sfn_client
from evaluator_api.task_lifecycle import complete_task

from evaluator_sdk import Evaluator, EvaluatorError

from ..helpers import exact_match_scorer, simple_app
from .mock_step_functions import MockEventRouter, MockStepFunctions

_REPO = Path(__file__).resolve().parent.parent.parent.parent.parent
ASL_PATH = _REPO / "packages" / "cdk" / "src" / "evaluator" / "orchestration-asl.json"

SAMPLE_TESTCASES = [
    {"input": {"question": "What is 2+2?"}, "output": {"answer": "4"}, "expected": {"answer": "4"}},
    {"input": {"question": "What is 3+3?"}, "output": {"answer": "5"}, "expected": {"answer": "6"}},
]


def _load_asl() -> dict[str, Any]:
    with open(ASL_PATH) as f:
        return json.load(f)


@contextmanager
def auto_orchestration(router: MockEventRouter) -> Generator[MockStepFunctions, None, None]:
    """MockSF in auto_run mode: start_execution drives the pipeline synchronously,
    so the SDK's submit-then-poll remote path sees a terminal job."""
    sfn = MockStepFunctions(asl=_load_asl(), router=router, auto_run=True)
    set_sfn_client(sfn)
    try:
        yield sfn
    finally:
        reset_sfn_client()


def _handler(evaluator: Evaluator) -> Callable[[dict[str, Any]], None]:
    def fn(detail: dict[str, Any]) -> None:
        evaluator.evaluator_handler({"detail": detail}, None)
    return fn


def _post_process(detail: dict[str, Any]) -> None:
    from evaluator_api.experiment import run_post_processing
    from evaluator_api.routes import get_job_dao, get_report_dao, get_result_dao

    job_id = detail["jobId"]
    run_post_processing(
        job_dao=get_job_dao(), result_dao=get_result_dao(),
        report_dao=get_report_dao(), job_id=job_id,
    )
    complete_task(job_id, detail.get("taskKey", "post_process"), "COMPLETED", detail.get("taskToken"))


# ---------------------------------------------------------------------------
# score() — remote scorer, score-in-place (the agent-as-judge path)
# ---------------------------------------------------------------------------


def test_score_remote_scorer_scores_in_place(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """score(testcases=...) with a remote-routed scorer dispatches to the worker,
    which scores the pre-written results in place. Results come back scored."""
    # The remote worker owns the scorer implementation.
    worker = evaluator_factory(scorers=[exact_match_scorer], name="remote-judge")
    # The path evaluator (client-side) has no local scorer — routes remotely.
    driver = evaluator_factory(scorers=[], name="driver")

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["remote-judge"]}, _handler(worker))
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.score(
            testcases=SAMPLE_TESTCASES,
            scorers={"exact_match_scorer": {"evaluatorName": "remote-judge"}},
        )

    assert resp.total_results == 2
    scores = sorted(r.scores["exact_match_scorer"].value for r in resp.results)
    assert scores == [0.0, 1.0]  # one output matches expected, one doesn't


def test_score_two_scorers_one_remote_evaluator(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """Two scorers both routed to the SAME remote evaluator. This is the case the
    server's single_score_evaluator guard is written for: one scorer_group -> no
    split -> one SCORE primary that must run BOTH scorers in place (not drop the
    second, and not build a spurious APP_INVOKE primary)."""

    def length_scorer(*, input: Any, expected: Any, output: Any) -> float:
        return min(len(str((output or {}).get("answer", ""))) / 10.0, 1.0)

    # The worker owns both scorer implementations.
    worker = evaluator_factory(
        scorers=[exact_match_scorer, length_scorer], name="remote-judge",
    )
    driver = evaluator_factory(scorers=[], name="driver")

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["remote-judge"]}, _handler(worker))
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.score(
            testcases=SAMPLE_TESTCASES,
            scorers={
                "exact_match_scorer": {"evaluatorName": "remote-judge"},
                "length_scorer": {"evaluatorName": "remote-judge"},
            },
        )

    assert resp.total_results == 2
    # Both scorers ran on every result — the second was not dropped.
    for r in resp.results:
        assert "exact_match_scorer" in r.scores
        assert "length_scorer" in r.scores


def test_score_remote_multiple_workers(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """A single score(testcases=...) call routing scorers to DIFFERENT remote
    evaluators fans out to each worker in parallel (no primary task — the ASL's
    skipPrimaryTask jumps straight to parallel scoring)."""

    def length_scorer(*, input: Any, expected: Any, output: Any) -> float:
        return min(len(str((output or {}).get("answer", ""))) / 10.0, 1.0)

    worker_a = evaluator_factory(scorers=[exact_match_scorer], name="worker-a")
    worker_b = evaluator_factory(scorers=[length_scorer], name="worker-b")
    driver = evaluator_factory(scorers=[], name="driver")

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["worker-a"]}, _handler(worker_a))
    router.add_rule({"evaluatorName": ["worker-b"]}, _handler(worker_b))
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.score(
            testcases=SAMPLE_TESTCASES,
            scorers={
                "exact_match_scorer": {"evaluatorName": "worker-a"},
                "length_scorer": {"evaluatorName": "worker-b"},
            },
        )

    assert resp.total_results == 2
    for r in resp.results:
        assert "exact_match_scorer" in r.scores  # from worker-a
        assert "length_scorer" in r.scores       # from worker-b


# ---------------------------------------------------------------------------
# invoke() — remote app invoke only
# ---------------------------------------------------------------------------


def test_invoke_remote_app(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """invoke() with a remote-routed app dispatches app_invoke to the worker;
    outputs are written to the report and returned."""
    worker = evaluator_factory(app_invoke=simple_app, scorers=[], name="app-worker")
    driver = evaluator_factory(scorers=[], name="driver")

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["app-worker"]}, _handler(worker))
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.invoke(
            testcases=[{"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}}],
            app={"evaluatorName": "app-worker"},
        )

    assert resp.total_results == 1
    assert resp.results[0].output == {"answer": "4"}


# ---------------------------------------------------------------------------
# evaluate() — remote app invoke AND remote scorer (homogeneous)
# ---------------------------------------------------------------------------


def test_evaluate_fully_remote(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """evaluate() with both app and scorer routed remotely runs entirely on the
    worker: one report, scores present, results returned."""
    worker = evaluator_factory(app_invoke=simple_app, scorers=[exact_match_scorer], name="full-worker")
    driver = evaluator_factory(scorers=[], name="driver")

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["full-worker"]}, _handler(worker))
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.evaluate(
            testcases=[{"input": {"question": "What is 2+2?"}, "expected": {"answer": "4"}}],
            app={"evaluatorName": "full-worker"},
            scorers={"exact_match_scorer": {"evaluatorName": "full-worker"}},
        )

    assert resp.total_results == 1
    assert resp.results[0].output == {"answer": "4"}
    assert resp.results[0].scores["exact_match_scorer"].value == 1.0


# ---------------------------------------------------------------------------
# Guard cases — mixed / unregistered / local_only
# ---------------------------------------------------------------------------


def test_mixed_local_and_remote_raises(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """A single call mixing a local scorer with a remote-routed scorer is rejected."""
    driver = evaluator_factory(scorers=[exact_match_scorer], name="driver")

    with pytest.raises(EvaluatorError, match="Cannot mix local and remote"):
        driver.score(
            testcases=SAMPLE_TESTCASES,
            scorers={
                "exact_match_scorer": None,  # local (registered)
                "remote_judge": {"evaluatorName": "agent-as-judge"},  # remote
            },
        )


def test_unregistered_scorer_without_evaluator_name_raises(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """An unregistered scorer with no evaluatorName raises the upgraded error."""
    driver = evaluator_factory(scorers=[], name="driver")

    with pytest.raises(EvaluatorError, match="not registered and has no evaluatorName"):
        driver.score(
            testcases=SAMPLE_TESTCASES,
            scorers={"mystery": None},
        )


def test_local_only_with_remote_task_raises() -> None:
    """A remote-routed task on a local_only Evaluator fails fast."""
    ev = Evaluator(name="offline", scorers=[exact_match_scorer], local_only=True)

    with pytest.raises(EvaluatorError, match="local_only mode cannot run remote tasks"):
        ev.score(
            testcases=SAMPLE_TESTCASES,
            scorers={"judge": {"evaluatorName": "agent-as-judge"}},
        )


def test_remote_job_failure_raises(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """A remote job that reaches terminal FAILURE raises EvaluatorError, mirroring
    the local path (rather than silently returning an empty response)."""
    driver = evaluator_factory(scorers=[], name="driver")

    def failing_worker(detail: dict[str, Any]) -> None:
        complete_task(
            detail["jobId"], detail["taskKey"], "FAILED",
            task_token=detail.get("taskToken"), error="Simulated worker failure",
        )

    router = MockEventRouter()
    router.add_rule({"evaluatorName": ["remote-judge"]}, failing_worker)
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        with pytest.raises(EvaluatorError, match="failed"):
            driver.score(
                testcases=SAMPLE_TESTCASES,
                scorers={"exact_match_scorer": {"evaluatorName": "remote-judge"}},
            )


# ---------------------------------------------------------------------------
# Local path still works (no evaluatorName → in-process)
# ---------------------------------------------------------------------------


def test_local_score_unchanged(
    evaluator_factory: Callable[..., Evaluator],
) -> None:
    """score() with a registered scorer and no evaluatorName runs in-process."""
    driver = evaluator_factory(scorers=[exact_match_scorer], name="driver")

    router = MockEventRouter()
    router.add_rule({"jobType": ["POST_PROCESS"]}, _post_process)

    with auto_orchestration(router):
        resp = driver.score(testcases=SAMPLE_TESTCASES)

    assert resp.total_results == 2
    scores = sorted(r.scores["exact_match_scorer"].value for r in resp.results)
    assert scores == [0.0, 1.0]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _named_scorer(name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Attach a stable scorer name to a plain function so the SDK registers it."""
    def deco(fn: Callable[..., Any]) -> Callable[..., Any]:
        fn.__name__ = name
        return fn
    return deco
