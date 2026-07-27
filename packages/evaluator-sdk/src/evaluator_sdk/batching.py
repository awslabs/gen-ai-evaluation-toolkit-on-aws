"""Internal batching machinery for result creation and score updates."""

import logging
import time
from collections.abc import Callable
from typing import Any

from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    BatchCreateResultsRequestContent,
    BatchResultInput,
    BatchScoreItem,
    BatchUpdateScoresRequestContent,
    ScoreInput,
)

from evaluator_sdk.models import EvaluationResult

logger = logging.getLogger(__name__)

_FLUSH_MAX_RETRIES = 3
_FLUSH_BACKOFF_BASE = 0.5  # seconds


def _flush_with_retry(
    operation_name: str,
    api_call: Callable[[], Any],
    items: list[Any],
) -> tuple[Any, int]:
    """Call a batch API with exponential-backoff retry on exceptions or item errors.

    Returns (response, error_count). If all retries are exhausted by an exception,
    returns (None, len(items)).
    """
    for attempt in range(_FLUSH_MAX_RETRIES):
        try:
            resp = api_call()
        except Exception:
            if attempt < _FLUSH_MAX_RETRIES - 1:
                delay = _FLUSH_BACKOFF_BASE * (2 ** attempt)
                logger.warning(
                    "%s failed (attempt %d/%d), retrying in %.1fs",
                    operation_name, attempt + 1, _FLUSH_MAX_RETRIES, delay,
                    exc_info=True,
                )
                time.sleep(delay)
                continue
            logger.error(
                "%s failed after %d attempts, %d items lost",
                operation_name, _FLUSH_MAX_RETRIES, len(items),
                exc_info=True,
            )
            return None, len(items)

        batch_errors = getattr(resp, "errors", None) or []
        if not batch_errors:
            return resp, 0

        if attempt < _FLUSH_MAX_RETRIES - 1:
            delay = _FLUSH_BACKOFF_BASE * (2 ** attempt)
            logger.warning(
                "%s had %d item errors (attempt %d/%d), retrying in %.1fs",
                operation_name, len(batch_errors),
                attempt + 1, _FLUSH_MAX_RETRIES, delay,
            )
            time.sleep(delay)
            continue

        # Final attempt — log remaining errors
        for err in batch_errors:
            err_id = getattr(err, "id", None) or getattr(err, "index", "?")
            msg = getattr(err, "message", str(err))
            logger.warning("%s item %s failed: %s", operation_name, err_id, msg)
        return resp, len(batch_errors)

    return None, len(items)  # pragma: no cover


class _BatchFlusher:
    """Coordinates batch creation of results and score updates.

    Guarantees ordering: all pending result creates are flushed before
    any score updates are sent. Both operations use exponential-backoff
    retry via ``_flush_with_retry``.
    """

    def __init__(self, client: Any, report_id: str, batch_size: int) -> None:
        self._client = client
        self._report_id = report_id
        self._batch_size = batch_size
        self._pending_creates: list[BatchResultInput] = []
        self._pending_scores: list[BatchScoreItem] = []
        self._error_count = 0
        self._score_count = 0

    @property
    def error_count(self) -> int:
        return self._error_count

    @property
    def score_count(self) -> int:
        return self._score_count

    def add_result(
        self,
        batch_input: BatchResultInput,
        score_inputs: dict[str, ScoreInput],
    ) -> None:
        self._pending_creates.append(batch_input)
        if score_inputs and batch_input.result_id:
            self._pending_scores.append(
                BatchScoreItem(  # type: ignore[call-arg]
                    result_id=batch_input.result_id, scores=score_inputs,
                ),
            )
            self._score_count += 1
        if len(self._pending_creates) >= self._batch_size:
            self.flush()

    def add_scores(self, items: list[BatchScoreItem]) -> None:
        """Add pre-built score items (used by score-from-source flow)."""
        self._pending_scores.extend(items)
        self._score_count += len(items)
        if len(self._pending_scores) >= self._batch_size:
            self.flush()

    def flush(self) -> None:
        """Flush all pending work: creates first, then scores."""
        self._flush_creates()
        self._flush_scores()

    def _flush_creates(self) -> None:
        if not self._pending_creates:
            return

        items = list(self._pending_creates)
        self._pending_creates.clear()
        logger.info("Flushing %d results to report=%s", len(items), self._report_id)

        def api_call() -> Any:
            return self._client.batch_create_results(
                report_id=self._report_id,
                batch_create_results_request_content=BatchCreateResultsRequestContent(
                    results=items,
                ),
            )

        _, errors = _flush_with_retry("batch_create_results", api_call, items)
        self._error_count += errors

    def _flush_scores(self) -> None:
        if not self._pending_scores:
            return
        logger.info("Flushing %d score updates to report=%s", len(self._pending_scores), self._report_id)

        # Flush in batch_size chunks
        while self._pending_scores:
            chunk = self._pending_scores[:self._batch_size]
            del self._pending_scores[:len(chunk)]

            def api_call(items: list[BatchScoreItem] = chunk) -> Any:
                return self._client.batch_update_scores(
                    report_id=self._report_id,
                    batch_update_scores_request_content=BatchUpdateScoresRequestContent(
                        items=items,
                    ),
                )

            _, errors = _flush_with_retry("batch_update_scores", api_call, chunk)
            self._error_count += errors


class _ResultCollector:
    """Buffers results, flushes to the API in batches, and optionally accumulates local results.

    Uses ``_BatchFlusher`` to coordinate result creation and score updates,
    guaranteeing that creates are always flushed before scores.
    """

    def __init__(
        self,
        api: Any,
        report_id: str,
        batch_size: int,
        return_results: bool = True,
        local_only: bool = False,
    ) -> None:
        self._local_only = local_only
        self._flusher = _BatchFlusher(api, report_id, batch_size)
        self._return_results = return_results
        self._results: list[EvaluationResult] | None = [] if return_results else None
        self._count = 0

    @property
    def results(self) -> list[EvaluationResult] | None:
        return self._results

    @property
    def count(self) -> int:
        return self._count

    @property
    def error_count(self) -> int:
        return self._flusher.error_count

    def add_result(
        self,
        result: EvaluationResult,
        batch_input: BatchResultInput,
        score_inputs: dict[str, ScoreInput],
    ) -> None:
        self._count += 1
        if self._results is not None:
            self._results.append(result)
        if not self._local_only:
            self._flusher.add_result(batch_input, score_inputs)

    def flush(self) -> None:
        if not self._local_only:
            self._flusher.flush()
