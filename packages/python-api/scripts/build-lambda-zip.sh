#!/bin/bash
set -e

# Clean and create build directory
rm -rf build
mkdir -p build/packaging

# Export production-only requirements (no dev deps)
uv export --frozen --no-dev --no-editable -o build/requirements-full.txt

# Split: PyPI deps (with --python-platform for Linux binaries) vs local packages
# Local source refs (. and ../) cause uv to build locally, overriding platform binaries
grep -v '^\.' build/requirements-full.txt > build/requirements.txt

# Install PyPI dependencies with target platform for correct native binaries
uv pip install \
   --no-installer-metadata \
   --no-compile-bytecode \
   --no-cache \
   --python-platform x86_64-manylinux_2_28 \
   --python 3.12 \
   --target build/packaging \
   -r build/requirements.txt

# Install local packages (pure Python) without platform override
grep '^\.\|^\.\.' build/requirements-full.txt | grep -v '^#' | uv pip install \
   --no-installer-metadata \
   --no-compile-bytecode \
   --no-deps \
   --target build/packaging \
   -r -

# Remove the installed evaluator_api package to avoid conflicts
rm -rf build/packaging/evaluator_api

# Copy our source code to the packaging directory
cp -r src/evaluator_api build/packaging/

# Remove __pycache__ directories
find build/packaging -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Create zip in build directory
cd build/packaging
zip -q -r ../python-api.zip .
cd ../..

echo "Lambda deployment package created: build/python-api.zip"
