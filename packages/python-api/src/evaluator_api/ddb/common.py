"""Shared utilities for DynamoDB DAOs."""

import functools
import json
from decimal import Decimal
from typing import Any, Callable, TypeVar

from aws_lambda_powertools import Logger
from mypy_boto3_dynamodb.service_resource import Table

logger = Logger(child=True)

EVALUATOR_TABLE_NAME = "evaluatortable"

F = TypeVar("F", bound=Callable[..., Any])

_LOGGED_TABLE_OPS = frozenset({"get_item", "put_item", "update_item", "query", "delete_item", "scan"})


class LoggedTable:
    """Proxy around a DynamoDB Table that logs entry/exit for each operation."""

    def __init__(self, table: Table) -> None:
        self._table = table

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._table, name)
        if name not in _LOGGED_TABLE_OPS or not callable(attr):
            return attr

        @functools.wraps(attr)
        def wrapper(**kwargs: Any) -> Any:
            # Auto-convert floats to Decimal for put_item (update_item uses ExpressionAttributeValues, not Item)
            if name == "put_item" and "Item" in kwargs:
                kwargs["Item"] = floats_to_decimal(kwargs["Item"])
            logger.debug("DynamoDB %s", name)
            result = attr(**kwargs)
            logger.debug("DynamoDB %s completed", name)
            return result

        return wrapper

    def batch_writer(self) -> Any:
        """Passthrough to underlying table's batch_writer context manager."""
        return self._table.batch_writer()


def log_dao(func: F) -> F:
    """Decorator that logs entry/exit for DAO methods."""
    qualname = func.__qualname__

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        logger.debug(qualname)
        result = func(*args, **kwargs)
        logger.debug("%s completed", qualname)
        return result

    return wrapper  # type: ignore[return-value]


def decimals_to_float(obj: Any) -> Any:
    """Convert all Decimal values to float via JSON roundtrip.

    Use at serialization boundaries when returning DDB data to callers
    that expect plain Python floats (API responses, artifact logging, etc.).
    """
    return json.loads(json.dumps(obj, default=float))


def floats_to_decimal(obj: Any) -> Any:
    """Recursively convert float values to Decimal for DynamoDB storage."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [floats_to_decimal(i) for i in obj]
    return obj


def encode_score_placeholder(name: str) -> str:
    """Encode a score name into a collision-free DDB expression placeholder.

    DDB placeholders only allow ``[A-Za-z0-9_]``.  Score names may contain
    dots (e.g. ``QualityScorer.relevance``) and underscores. This encoding
    is collision-free so concurrent workers produce the same placeholder for
    the same score name.

    Encoding: ``_`` → ``_u``, ``.`` → ``_d``.  The escape prefix ``_`` is
    always followed by a type char, so no two distinct names can collide.
    """
    parts: list[str] = []
    for ch in name:
        if ch == "_":
            parts.append("_u")
        elif ch == ".":
            parts.append("_d")
        else:
            parts.append(ch)
    return "".join(parts)
