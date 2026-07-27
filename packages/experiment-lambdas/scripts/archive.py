#!/usr/bin/env python
"""
Create a Lambda deployment zip file.

This script packages the Lambda function and its dependencies into a zip file
ready for deployment. It replaces the invoke-based implementation to align with
the hatch build process.
"""

import os
import platform
import subprocess
import tempfile
from typing import List, Optional


def run_command(cmd: List[str], cwd: Optional[str] = None) -> None:
    """Run a command and raise an exception if it fails."""
    try:
        subprocess.run(cmd, cwd=cwd, check=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Command failed with exit code {e.returncode}: {cmd}") from e


def main() -> None:
    """Create the Lambda zip file."""
    print("Creating Lambda deployment package...")

    # Create a temporary directory to install dependencies
    with tempfile.TemporaryDirectory() as archive_dir:
        print(f"Installing package to temporary directory: {archive_dir}")

        # Use Python 3.12 to match the mise.toml configuration
        interpreter = "python3.12"
        system = platform.system()

        # First install setuptools to ensure pkg_resources is available
        run_command([interpreter, "-mpip", "install", "setuptools", "--target", archive_dir])

        # Install the package and its dependencies to the temporary directory
        command = [interpreter, "-mpip", "install", ".", "--target", archive_dir]

        # Use pre-built x86_64 binaries unless the build host is already x86_64 Linux
        if not (system == "Linux" and platform.machine() in ("x86_64", "AMD64")):
            # manylinux2014_x86_64 for maximum compatibility with AL2023
            command.extend(["--platform", "manylinux2014_x86_64", "--only-binary=:all:"])

        run_command(command)

        # Define the output location
        output_location = os.path.abspath(os.path.join("build", "experiment-lambdas.zip"))
        print(f"Creating zip file: {output_location}")

        # Remove any existing zip file
        if os.path.exists(output_location):
            os.unlink(output_location)

        # Make sure the output directory exists
        os.makedirs(os.path.dirname(output_location), exist_ok=True)

        # Create a zip file from the contents of the temporary directory
        current_dir = os.getcwd()
        try:
            os.chdir(archive_dir)
            run_command(["zip", "-q", "-r", output_location, "."])
        finally:
            os.chdir(current_dir)

    print(f"Lambda deployment package created: {output_location}")


if __name__ == "__main__":
    main()
