"""boto3 client factories that tag every request with the toolkit user-agent."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import Any

import boto3
from botocore.config import Config


def _resolve_version() -> str:
    try:
        return version("awssolutions-gen-ai-evaluation-toolkit-evaluator-builtin")
    except PackageNotFoundError:
        return "unknown"


USER_AGENT_EXTRA = f"gen-ai-evaluation-toolkit-on-aws/{_resolve_version()}"
_BASE_CONFIG = Config(user_agent_extra=USER_AGENT_EXTRA)


def boto3_config(**overrides: Any) -> Config:
    """Return a Config carrying the toolkit user-agent, plus any caller overrides."""
    return Config(**overrides).merge(_BASE_CONFIG) if overrides else _BASE_CONFIG


def boto3_client(service_name: str, **kwargs: Any) -> Any:
    config = kwargs.pop("config", None)
    kwargs["config"] = config.merge(_BASE_CONFIG) if config is not None else _BASE_CONFIG
    return boto3.client(service_name, **kwargs)


def boto3_resource(service_name: str, **kwargs: Any) -> Any:
    config = kwargs.pop("config", None)
    kwargs["config"] = config.merge(_BASE_CONFIG) if config is not None else _BASE_CONFIG
    return boto3.resource(service_name, **kwargs)
