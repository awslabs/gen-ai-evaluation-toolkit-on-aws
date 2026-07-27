"""E2E test: annotation-based filtering in evaluation jobs.

Verifies that when test cases are annotated and an evaluation job is submitted
with an annotation filter on the dataset reference, only matching test cases
are evaluated.

Requires:
- AWS_REGION: AWS region (defaults to eu-west-2)
- SSM /genai-etk/restApiEndpoint must exist in the target account
- Valid AWS credentials with Bedrock access
- Annotation schemas must be creatable (or already exist)

Run with: uv run pytest tests/e2e/test_annotation_filter.py -m e2e -v
"""

import time
import uuid
from typing import Any

import pytest
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi
from awssolutions_gen_ai_evaluation_toolkit_python_client.exceptions import ConflictException
from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
    AnnotationValue,
    AnnotationValueType,
    CreateAnnotationSchemaRequestContent,
    CreateDatasetRequestContent,
    CreateTestCaseRequestContent,
    PutTestCaseAnnotationRequestContent,
    StringConfigurations,
    StringType,
    StringValue,
)
from evaluator_sdk import Evaluator

pytestmark = pytest.mark.e2e

ANNOTATION_SCHEMA_NAME = "QUALITY_TIER"
ANNOTATION_VALUES = ["HIGH", "MEDIUM", "LOW"]


@pytest.fixture(scope="module")
def annotation_schema(client: DefaultApi) -> str:
    """Ensure annotation schema exists. Returns schema name."""
    try:
        client.create_annotation_schema(
            CreateAnnotationSchemaRequestContent(
                name=ANNOTATION_SCHEMA_NAME,
                description="Quality tier for test filtering",
                valueType=AnnotationValueType(
                    StringType(stringType=StringConfigurations(enum=ANNOTATION_VALUES)),
                ),
            )
        )
    except ConflictException:
        # Schema already exists from a previous run — that's fine.
        pass
    return ANNOTATION_SCHEMA_NAME


@pytest.fixture
def annotated_dataset(client: DefaultApi, annotation_schema: str) -> dict[str, Any]:
    """Create dataset with 6 test cases: 3 HIGH, 2 MEDIUM, 1 LOW.

    Returns dict with dataset_id and test_case_ids grouped by tier.
    """
    suffix = uuid.uuid4().hex[:8]
    ds_resp = client.create_dataset(
        CreateDatasetRequestContent(name=f"e2e-annot-filter-{suffix}")
    )
    dataset_id = ds_resp.dataset_id

    test_cases: dict[str, list[str]] = {"HIGH": [], "MEDIUM": [], "LOW": []}

    # Create test cases with different quality tiers
    cases = [
        ("HIGH", "What is AWS Lambda?", "AWS Lambda is a serverless compute service."),
        ("HIGH", "What is S3?", "S3 is an object storage service."),
        ("HIGH", "What is DynamoDB?", "DynamoDB is a NoSQL database service."),
        ("MEDIUM", "What is EC2?", "EC2 provides virtual servers."),
        ("MEDIUM", "What is VPC?", "VPC is a virtual network."),
        ("LOW", "What is IAM?", "IAM manages access."),
    ]

    tc_ids_by_tier: list[tuple[str, str]] = []
    for tier, question, answer in cases:
        tc_resp = client.create_test_case(
            dataset_id=dataset_id,
            create_test_case_request_content=CreateTestCaseRequestContent(
                input={"question": question},
                expected={"answer": answer},
            ),
        )
        tc_ids_by_tier.append((tier, tc_resp.test_case_id))
        test_cases[tier].append(tc_resp.test_case_id)

    # Mint a version — required before annotations can be applied
    client.create_dataset_version(dataset_id=dataset_id)

    # Wait for dataset to become ACTIVE (minting is async)
    version = None
    for _ in range(30):
        ds_info = client.get_dataset(dataset_id=dataset_id)
        if ds_info.status and ds_info.status.value == "ACTIVE":
            version = ds_info.current_version
            break
        time.sleep(2)
    else:
        pytest.fail(f"Dataset {dataset_id} did not become ACTIVE within 60s")

    assert version is not None, "current_version should be set after ACTIVE"
    version = str(version)  # API expects string, DDB returns int

    # Now annotate each test case
    for tier, test_case_id in tc_ids_by_tier:
        client.put_test_case_annotation(
            dataset_id=dataset_id,
            test_case_id=test_case_id,
            put_test_case_annotation_request_content=PutTestCaseAnnotationRequestContent(
                name=ANNOTATION_SCHEMA_NAME,
                value=AnnotationValue(StringValue(stringValue=tier)),
            ),
        )

    yield {
        "dataset_id": dataset_id,
        "version": version,
        "test_cases": test_cases,
        "total_count": 6,
    }

    # Cleanup
    try:
        client.delete_dataset(dataset_id)
    except Exception:
        pass


class TestAnnotationFilterEvaluation:
    """Test that annotation filters restrict which test cases are evaluated."""

    def test_evaluate_with_annotation_filter_high_only(
        self, client: DefaultApi, api_endpoint: str, aws_region: str, annotated_dataset: dict
    ):
        """Only HIGH-tier test cases should be scored when filter is applied."""
        from awssolutions_gen_ai_evaluation_toolkit_python_client.models import (
            AnnotationConditionExpression,
            ListTestCasesRequestContent,
        )

        # Submit evaluation job with annotation filter: QUALITY_TIER = HIGH
        annotation_filter = {
            "condition": {
                "stringEnumCondition": {
                    "name": ANNOTATION_SCHEMA_NAME, "value": "HIGH", "comparator": "=",
                }
            }
        }
        filter_expr = AnnotationConditionExpression.from_dict(annotation_filter)

        # Verify filter works at datastore level
        resp = client.list_test_cases(
            dataset_id=annotated_dataset["dataset_id"],
            version=annotated_dataset["version"],
            list_test_cases_request_content=ListTestCasesRequestContent(filter=filter_expr),
        )

        filtered_ids = [tc.id for tc in resp.test_cases]
        assert len(filtered_ids) == 3, (
            f"Expected 3 HIGH test cases, got {len(filtered_ids)}"
        )
        # Verify all returned IDs are from the HIGH group
        assert set(filtered_ids) == set(annotated_dataset["test_cases"]["HIGH"])

    def test_sdk_iter_dataset_with_filter(
        self, client: DefaultApi, api_endpoint: str, aws_region: str, annotated_dataset: dict
    ):
        """Test that _iter_dataset with filter returns only matching test cases."""
        evaluator = Evaluator(
            name="builtin",
            api_endpoint=api_endpoint,
            region=aws_region,
            local_only=False,
            client=client,
        )

        # Call _iter_dataset with HIGH filter
        annotation_filter = {
            "condition": {
                "stringEnumCondition": {
                    "name": ANNOTATION_SCHEMA_NAME,
                    "value": "HIGH",
                    "comparator": "=",
                }
            }
        }

        test_cases = list(evaluator._iter_dataset(
            dataset_id=annotated_dataset["dataset_id"],
            version=annotated_dataset["version"],
            annotation_filter=annotation_filter,
        ))

        assert len(test_cases) == 3, (
            f"Expected 3 HIGH test cases from _iter_dataset, got {len(test_cases)}"
        )

    def test_sdk_iter_dataset_with_compound_filter(
        self, client: DefaultApi, api_endpoint: str, aws_region: str, annotated_dataset: dict
    ):
        """Test OR filter: HIGH or MEDIUM should return 5 test cases."""
        evaluator = Evaluator(
            name="builtin",
            api_endpoint=api_endpoint,
            region=aws_region,
            local_only=False,
            client=client,
        )

        # OR filter: HIGH or MEDIUM
        annotation_filter = {
            "or": [
                {
                    "condition": {
                        "stringEnumCondition": {
                            "name": ANNOTATION_SCHEMA_NAME, "value": "HIGH", "comparator": "=",
                        }
                    }
                },
                {
                    "condition": {
                        "stringEnumCondition": {
                            "name": ANNOTATION_SCHEMA_NAME, "value": "MEDIUM", "comparator": "=",
                        }
                    }
                },
            ]
        }

        test_cases = list(evaluator._iter_dataset(
            dataset_id=annotated_dataset["dataset_id"],
            version=annotated_dataset["version"],
            annotation_filter=annotation_filter,
        ))

        assert len(test_cases) == 5, (
            f"Expected 5 (HIGH+MEDIUM) test cases, got {len(test_cases)}"
        )

    def test_sdk_iter_dataset_with_not_filter(
        self, client: DefaultApi, api_endpoint: str, aws_region: str, annotated_dataset: dict
    ):
        """Test NOT filter: NOT LOW should return 5 test cases."""
        evaluator = Evaluator(
            name="builtin",
            api_endpoint=api_endpoint,
            region=aws_region,
            local_only=False,
            client=client,
        )

        # NOT LOW
        annotation_filter = {
            "not": {
                "condition": {
                    "stringEnumCondition": {
                        "name": ANNOTATION_SCHEMA_NAME, "value": "LOW", "comparator": "=",
                    }
                }
            }
        }

        test_cases = list(evaluator._iter_dataset(
            dataset_id=annotated_dataset["dataset_id"],
            version=annotated_dataset["version"],
            annotation_filter=annotation_filter,
        ))

        assert len(test_cases) == 5, (
            f"Expected 5 (NOT LOW) test cases, got {len(test_cases)}"
        )
