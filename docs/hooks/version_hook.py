"""Inject the project version into the mkdocs build config.

Reads the version from the repository-root ``package.json`` (the single source
of truth for the package version) and exposes it to templates as
``config.extra.version`` and ``config.extra.is_prerelease``.

The repository root is anchored to the directory containing ``mkdocs.yml``
rather than a fixed relative path from this hook, so the hook keeps working
if the docs/ directory is restructured or the hook is moved.

Prerelease detection follows SemVer: any ``-`` after the version core marks a
prerelease (matches ``1.2.0-beta``, ``1.2.0-rc.1``, ``1.2.0-alpha.3`` etc.).
This keeps the print-cover banner and the prerelease notice in sync with the
package version, so future bumps don't need a docs change.
"""

from __future__ import annotations

import json
from pathlib import Path


def on_config(config, **_):
    # Anchor to mkdocs.yml's directory, which is the project root by convention.
    repo_root = Path(config["config_file_path"]).parent
    pkg_path = repo_root / "package.json"
    if not pkg_path.is_file():
        raise FileNotFoundError(
            f"version_hook: expected package.json at {pkg_path} "
            f"(derived from mkdocs config at {config['config_file_path']})"
        )
    try:
        version = json.loads(pkg_path.read_text())["version"]
    except (OSError, json.JSONDecodeError, KeyError) as exc:
        raise ValueError(
            f"version_hook: could not read a 'version' from {pkg_path}: {exc}"
        ) from exc
    if not isinstance(version, str) or not version:
        raise ValueError(
            f"version_hook: 'version' in {pkg_path} must be a non-empty string, "
            f"got {version!r}"
        )
    config.setdefault("extra", {})
    config["extra"]["version"] = version
    config["extra"]["is_prerelease"] = "-" in version
    return config
