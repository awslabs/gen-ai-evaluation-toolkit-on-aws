import os
import tempfile
from unittest.mock import MagicMock, call, patch

from evaluator_agent_as_judge.helpers import download_artifacts, download_requirements, download_s3_prefix
from evaluator_agent_as_judge.models import Evaluator, S3Ref

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_evaluator(name: str = "e", requirement_docs: list | None = None) -> Evaluator:
    return Evaluator(name=name, description="d", requirement_docs=requirement_docs)


# ---------------------------------------------------------------------------
# download_requirements
# ---------------------------------------------------------------------------


class TestDownloadRequirements:
    def test_returns_empty_dict_when_no_evaluators_have_requirement_docs(self) -> None:
        result = download_requirements(make_evaluator(requirement_docs=None))
        assert result is None

    def test_returns_empty_dict_when_evaluator_has_empty_requirement_docs(self) -> None:
        result = download_requirements(make_evaluator(requirement_docs=[]))
        assert result is None

    @patch("evaluator_agent_as_judge.helpers.download_s3_prefix")
    def test_creates_temp_dir_and_downloads_refs_for_evaluator_with_docs(self, mock_download: MagicMock) -> None:
        refs = [
            S3Ref(bucket_name="bucket-a", prefix="prefix/a"),
            S3Ref(bucket_name="bucket-b", prefix="prefix/b"),
        ]

        req_dir = download_requirements(make_evaluator(requirement_docs=refs))

        assert req_dir is not None
        assert os.path.isdir(req_dir)
        assert req_dir.startswith(tempfile.gettempdir())

        assert mock_download.call_count == 2
        mock_download.assert_any_call(refs[0], req_dir)
        mock_download.assert_any_call(refs[1], req_dir)

    @patch("evaluator_agent_as_judge.helpers.download_s3_prefix")
    def test_each_evaluator_gets_separate_temp_dir(self, mock_download: MagicMock) -> None:
        refs = [S3Ref(bucket_name="b", prefix="p")]
        evaluators = [
            make_evaluator(name="e0", requirement_docs=refs),
            make_evaluator(name="e1", requirement_docs=refs),
        ]

        results = [download_requirements(evaluator) for evaluator in evaluators]

        assert len(results) == 2
        assert results[0] != results[1]


# ---------------------------------------------------------------------------
# download_artifacts
# ---------------------------------------------------------------------------


class TestDownloadArtifacts:
    def test_returns_empty_list_when_empty_artifacts(self) -> None:
        result = download_artifacts([])
        assert result == []

    @patch("evaluator_agent_as_judge.helpers.download_s3_prefix")
    def test_creates_one_dir_per_artifact_ref(self, mock_download: MagicMock) -> None:
        refs = [
            S3Ref(bucket_name="bucket-a", prefix="prefix/a"),
            S3Ref(bucket_name="bucket-b", prefix="prefix/b"),
        ]

        result = download_artifacts(refs)

        assert len(result) == 2
        for d in result:
            assert os.path.isdir(d)

        assert mock_download.call_count == 2
        mock_download.assert_any_call(refs[0], result[0])
        mock_download.assert_any_call(refs[1], result[1])


# ---------------------------------------------------------------------------
# download_s3_prefix
# ---------------------------------------------------------------------------


class TestDownloadS3Prefix:
    def _make_s3_client(self, pages: list[dict]) -> MagicMock:
        """Return a mock boto3 S3 client whose paginator yields the given pages."""
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = pages

        mock_s3 = MagicMock()
        mock_s3.get_paginator.return_value = mock_paginator
        return mock_s3

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_downloads_files_preserving_relative_paths(self, mock_boto3: MagicMock) -> None:
        pages = [
            {
                "Contents": [
                    {"Key": "docs/file1.txt"},
                    {"Key": "docs/sub/file2.txt"},
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            expected_calls = [
                call("my-bucket", "docs/file1.txt", os.path.join(local_dir, "file1.txt")),
                call("my-bucket", "docs/sub/file2.txt", os.path.join(local_dir, "sub/file2.txt")),
            ]
            mock_s3.download_file.assert_has_calls(expected_calls)

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_skips_directory_markers(self, mock_boto3: MagicMock) -> None:
        pages = [
            {
                "Contents": [
                    {"Key": "docs/"},  # directory marker — must be skipped
                    {"Key": "docs/file.txt"},
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_called_once_with(
                "my-bucket", "docs/file.txt", os.path.join(local_dir, "file.txt")
            )

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_skips_key_that_matches_prefix_exactly(self, mock_boto3: MagicMock) -> None:
        """A key identical to the prefix yields an empty relative path and must be skipped."""
        pages = [{"Contents": [{"Key": "docs/prefix"}]}]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/prefix")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_not_called()

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_handles_empty_contents_page(self, mock_boto3: MagicMock) -> None:
        pages: list[dict] = [{}]  # page with no Contents key
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_not_called()

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_strips_leading_slash_from_prefix(self, mock_boto3: MagicMock) -> None:
        """Prefix with a leading slash must be stripped before use."""
        pages = [{"Contents": [{"Key": "docs/file.txt"}]}]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="/docs/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.get_paginator.return_value.paginate.assert_called_once_with(Bucket="my-bucket", Prefix="docs/")

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_skips_key_with_path_traversal_segment(self, mock_boto3: MagicMock) -> None:
        """A key whose relative path contains a '..' segment must be skipped."""
        pages = [
            {
                "Contents": [
                    {"Key": "docs/../etc/passwd"},
                    {"Key": "docs/safe.txt"},
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            # Only the safe file should be downloaded
            mock_s3.download_file.assert_called_once_with(
                "my-bucket", "docs/safe.txt", os.path.join(local_dir, "safe.txt")
            )

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_skips_key_where_relative_path_starts_with_traversal(self, mock_boto3: MagicMock) -> None:
        """A relative path that begins with '..' must be skipped."""
        pages = [
            {
                "Contents": [
                    {"Key": "prefix/../secret.txt"},
                    {"Key": "prefix/ok.txt"},
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="prefix/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_called_once_with(
                "my-bucket", "prefix/ok.txt", os.path.join(local_dir, "ok.txt")
            )

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_all_keys_skipped_when_all_contain_traversal(self, mock_boto3: MagicMock) -> None:
        """When every key contains a traversal segment, no downloads should occur."""
        pages = [
            {
                "Contents": [
                    {"Key": "docs/../a.txt"},
                    {"Key": "docs/../../b.txt"},
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_not_called()

    @patch("evaluator_agent_as_judge.helpers.boto3")
    def test_dotdot_as_filename_component_is_allowed(self, mock_boto3: MagicMock) -> None:
        """A filename that merely contains '..' as a substring (not a full segment) must NOT be skipped."""
        pages = [
            {
                "Contents": [
                    {"Key": "docs/file..txt"},  # '..' inside a name, not a standalone segment
                ]
            }
        ]
        mock_s3 = self._make_s3_client(pages)
        mock_boto3.client.return_value = mock_s3

        with tempfile.TemporaryDirectory() as local_dir:
            s3_ref = S3Ref(bucket_name="my-bucket", prefix="docs/")
            download_s3_prefix(s3_ref, local_dir)

            mock_s3.download_file.assert_called_once_with(
                "my-bucket", "docs/file..txt", os.path.join(local_dir, "file..txt")
            )
