import logging
import os
import tempfile
from typing import List, Optional

import boto3

from evaluator_agent_as_judge.models import Evaluator, S3Ref

logger = logging.getLogger(__name__)


def download_requirements(evaluator: Evaluator) -> Optional[str]:
    """Download requirement docs for each evaluator that has them.

    Returns a dict mapping evaluator index → local temp directory path.
    Only evaluators that have requirement_docs set will have an entry.
    """

    if not evaluator.requirement_docs:
        return None

    requirement_docs_dir = tempfile.mkdtemp(prefix="requirement-docs-")
    logger.info(
        f"Downloading {len(evaluator.requirement_docs)} requirement doc prefix(es) "
        f"for evaluator {evaluator.name!r} to {requirement_docs_dir}"
    )

    for s3_ref in evaluator.requirement_docs:
        download_s3_prefix(s3_ref, requirement_docs_dir)

    logger.info(f"Requirement docs for evaluator {evaluator.name!r} ready at {requirement_docs_dir}")
    return requirement_docs_dir


def download_artifacts(artifacts: List[S3Ref]) -> List[str]:
    """Download all S3 artifact prefixes for a test case to local temp directories.

    Each artifact S3 reference is downloaded into its own temporary directory so
    that artifacts from different prefixes cannot overwrite each other.

    Args:
        test_case: The test case whose ``context.artifacts`` list is downloaded.

    Returns:
        A list of local directory paths containing the downloaded artifacts.
        Returns an empty list when the test case has no artifacts.
    """

    artifact_dirs: List[str] = []
    for s3_ref in artifacts:
        artifact_dir = tempfile.mkdtemp()
        download_s3_prefix(s3_ref, artifact_dir)
        artifact_dirs.append(artifact_dir)
        logger.info(f"Downloaded artifacts from s3://{s3_ref.bucket_name}/{s3_ref.prefix} to {artifact_dir}")

    return artifact_dirs


def download_s3_prefix(s3_ref: S3Ref, local_dir: str) -> None:
    """Download all objects under an S3 prefix to a local directory, preserving relative paths.

    Iterates over all objects under ``s3_ref.prefix`` using the S3 list paginator
    and downloads each to a matching relative path under ``local_dir``.

    Security: keys containing ``..`` path components are silently skipped to
    prevent path traversal attacks (CWE-22) where a malicious S3 key could
    otherwise write files outside of ``local_dir``.

    Args:
        s3_ref: S3 bucket and prefix to download from.
        local_dir: Local directory to download into. Created sub-directories are
            made automatically as needed.
    """
    prefix = s3_ref.prefix.lstrip("/")
    s3 = boto3.client("s3")

    paginator = s3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=s3_ref.bucket_name, Prefix=prefix)

    for page in pages:
        for obj in page.get("Contents", []):
            if "Key" not in obj:
                continue

            key = obj["Key"]

            # Skip directory markers
            if key.endswith("/"):
                continue

            # File path without the prefix
            relative_path = key[len(prefix) :].lstrip("/")
            if not relative_path:
                continue

            # Validate against path traversal attack
            if ".." in relative_path.split(os.sep):
                logger.warning(f"Skipping key with potential path traversal: {key}")
                continue

            dest_path = os.path.join(local_dir, relative_path)

            # Ensure directory exists
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)

            logger.debug(f"Downloading s3://{s3_ref.bucket_name}/{key} to {dest_path}")
            s3.download_file(s3_ref.bucket_name, key, dest_path)
