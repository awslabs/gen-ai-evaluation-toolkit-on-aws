"""E2E test for result pagination.

Creates 51 results and verifies pagination works with explicit max_results=10.
"""

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi  # type: ignore[attr-defined]
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (  # type: ignore[attr-defined]
    BatchCreateResultsRequestContent,
    BatchResultInput,
    CreateReportRequestContent,
)

pytestmark = pytest.mark.e2e

TOTAL_RESULTS = 51
PAGE_SIZE = 10


class TestPagination:

    def test_result_pagination(self, client: DefaultApi) -> None:
        """Create 51 results and paginate with max_results=10 — expect 6 pages."""
        report_resp = client.create_report(CreateReportRequestContent(name="e2e-pagination"))
        report_id = report_resp.report.report_id

        # Create 51 results in batches of 25
        for batch_start in range(0, TOTAL_RESULTS, 25):
            batch_end = min(batch_start + 25, TOTAL_RESULTS)
            client.batch_create_results(
                report_id,
                BatchCreateResultsRequestContent(results=[
                    BatchResultInput(input={"i": str(i)}, output={"o": str(i)})
                    for i in range(batch_start, batch_end)
                ]),
            )

        # Paginate with explicit page size
        all_results = []
        next_token = None
        pages = 0
        while True:
            kwargs = {"report_id": report_id, "max_results": PAGE_SIZE}
            if next_token:
                kwargs["next_token"] = next_token
            resp = client.list_test_results(**kwargs)
            all_results.extend(resp.test_results)
            pages += 1
            next_token = resp.next_token
            if not next_token:
                break

        assert len(all_results) == TOTAL_RESULTS, f"Expected {TOTAL_RESULTS}, got {len(all_results)}"
        expected_pages = (TOTAL_RESULTS + PAGE_SIZE - 1) // PAGE_SIZE  # ceil division
        assert pages == expected_pages, f"Expected {expected_pages} pages, got {pages}"
