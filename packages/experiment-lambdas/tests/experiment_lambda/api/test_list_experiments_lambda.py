import unittest
from typing import Any, Generic, TypeVar
from unittest.mock import MagicMock, patch

from experiment_lambda.api.list_experiments_lambda import (
    _validate_filter_expr,
    _validate_order_by,
    list_experiments,
)
from experiment_lambda.api.utils.api_models import (
    Experiment,
    ListExperimentsRequest,
    ListExperimentsResponse,
    ValidationException,
    ViewType,
)

T = TypeVar("T")


class TestListExperimentsLambda(unittest.TestCase):
    """Tests for list_experiments_lambda.py"""

    @patch("experiment_lambda.api.list_experiments_lambda.map_experiment")
    @patch("experiment_lambda.api.list_experiments_lambda.map_view_type")
    @patch("experiment_lambda.api.list_experiments_lambda.get_mlflow_client")
    def test_list_experiments_success(
        self,
        mock_get_mlflow_client: MagicMock,
        mock_map_view_type: MagicMock,
        mock_map_experiment: MagicMock,
    ) -> None:
        """Test successful listing of experiments"""
        # Arrange
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        mlflow_view_type = 1  # ACTIVE_ONLY
        mock_map_view_type.return_value = mlflow_view_type

        # Create mock experiments
        mock_mlflow_experiment1 = MagicMock()
        mock_mlflow_experiment2 = MagicMock()

        # Create a MlflowPagedList with mocked experiments
        class MockPagedList(list[Any], Generic[T]):
            token = "next-token-value"

        mock_search_result = MockPagedList[Any]([mock_mlflow_experiment1, mock_mlflow_experiment2])
        mock_client.search_experiments.return_value = mock_search_result

        # Create mocked Experiment objects to return from map_experiment
        mock_experiment1 = MagicMock(spec=Experiment)
        mock_experiment2 = MagicMock(spec=Experiment)
        mock_map_experiment.side_effect = [mock_experiment1, mock_experiment2]

        # Create request
        request = ListExperimentsRequest(
            filter="name LIKE '%test%'",
            orderBy=["name"],
            viewType=ViewType.ACTIVE_ONLY,
            maxResults=10,
            nextToken=None,
        )

        # Act
        result = list_experiments(request)

        # Assert
        mock_map_view_type.assert_called_once_with(ViewType.ACTIVE_ONLY)
        mock_client.search_experiments.assert_called_once_with(
            filter_string="name LIKE '%test%'",
            order_by=["name"],
            view_type=mlflow_view_type,
            page_token=None,
            max_results=10,
        )

        self.assertEqual(mock_map_experiment.call_count, 2)
        mock_map_experiment.assert_any_call(mock_mlflow_experiment1)
        mock_map_experiment.assert_any_call(mock_mlflow_experiment2)

        self.assertIsInstance(result, ListExperimentsResponse)
        self.assertEqual(len(result.experiments), 2)
        self.assertEqual(result.experiments[0], mock_experiment1)
        self.assertEqual(result.experiments[1], mock_experiment2)
        self.assertEqual(result.nextToken, "next-token-value")

    @patch("experiment_lambda.api.list_experiments_lambda.map_view_type")
    @patch("experiment_lambda.api.list_experiments_lambda.get_mlflow_client")
    def test_list_experiments_empty_result(
        self,
        mock_get_mlflow_client: MagicMock,
        mock_map_view_type: MagicMock,
    ) -> None:
        """Test listing experiments with empty result"""
        # Arrange
        mock_client = MagicMock()
        mock_get_mlflow_client.return_value = mock_client

        mlflow_view_type = 1  # ACTIVE_ONLY
        mock_map_view_type.return_value = mlflow_view_type

        # Create empty MlflowPagedList
        class MockPagedList(list[Any], Generic[T]):
            token = None

        mock_search_result = MockPagedList[Any]([])
        mock_client.search_experiments.return_value = mock_search_result

        # Create request with defaults
        request = ListExperimentsRequest()

        # Act
        result = list_experiments(request)

        # Assert
        mock_map_view_type.assert_called_once_with(ViewType.ACTIVE_ONLY)
        mock_client.search_experiments.assert_called_once_with(
            filter_string=None,
            order_by=None,
            view_type=mlflow_view_type,
            page_token=None,
            max_results=1000,
        )

        self.assertIsInstance(result, ListExperimentsResponse)
        self.assertEqual(len(result.experiments), 0)
        self.assertIsNone(result.nextToken)


class TestValidateFilterExpr(unittest.TestCase):
    """Length-cap and normalisation coverage for _validate_filter_expr."""

    def test_none_returns_none(self) -> None:
        self.assertIsNone(_validate_filter_expr(None))

    def test_empty_string_returns_none(self) -> None:
        self.assertIsNone(_validate_filter_expr(""))

    def test_whitespace_only_returns_none(self) -> None:
        self.assertIsNone(_validate_filter_expr("   \t \n  "))

    def test_non_string_rejected(self) -> None:
        with self.assertRaises(ValidationException):
            _validate_filter_expr(123)  # type: ignore[arg-type]

    def test_within_length_cap_passes_through_unchanged(self) -> None:
        # Validation is delegated to MLflow; we only length-cap.
        expr = "anything goes here as far as we are concerned"
        self.assertEqual(_validate_filter_expr(expr), expr)

    def test_oversize_input_rejected(self) -> None:
        oversized = "name = 'x'" + ("AND name = 'x'" * 200)
        with self.assertRaises(ValidationException):
            _validate_filter_expr(oversized)


class TestValidateOrderBy(unittest.TestCase):
    """Length-cap and shape coverage for _validate_order_by."""

    def test_none_returns_none(self) -> None:
        self.assertIsNone(_validate_order_by(None))

    def test_non_list_rejected(self) -> None:
        with self.assertRaises(ValidationException):
            _validate_order_by("name ASC")  # type: ignore[arg-type]

    def test_non_string_entry_rejected(self) -> None:
        with self.assertRaises(ValidationException):
            _validate_order_by([123])  # type: ignore[list-item]

    def test_within_caps_passes_through_unchanged(self) -> None:
        order_by = ["name ASC", "creation_time DESC"]
        self.assertEqual(_validate_order_by(order_by), order_by)

    def test_too_many_entries_rejected(self) -> None:
        with self.assertRaises(ValidationException):
            _validate_order_by(["name ASC" for _ in range(20)])

    def test_oversize_entry_rejected(self) -> None:
        with self.assertRaises(ValidationException):
            _validate_order_by(["a" * 1024])


if __name__ == "__main__":
    unittest.main()
