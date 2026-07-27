FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.12

WORKDIR ${LAMBDA_TASK_ROOT}

# === Install mise + opencode ===
RUN dnf install -y git tar && dnf clean all

# Install mise to /opt so it's accessible by the Lambda sandbox user (not root)
ENV MISE_DATA_DIR=/opt/mise
ENV MISE_CONFIG_DIR=/opt/mise/config
ENV PATH="/opt/mise/bin:/opt/mise/shims:$PATH"

# Mise runtime dirs redirected to /tmp — only writable location in Lambda
ENV MISE_STATE_DIR=/tmp/mise/state
ENV MISE_CACHE_DIR=/tmp/mise/cache
ENV MISE_YES=1

# Only writable location in Lambda
# Used by OpenCode to store default config and session info
ENV HOME=/tmp

# Pin mise itself: latest (2026.7.12) defaults to the aube npm backend, which
# cannot resolve the tool dependency tree. Keep in lockstep with MISE_VERSION in
# .gitlab/pipeline.yml. Bump deliberately once aube is fixed upstream.
ARG MISE_VERSION=v2026.7.11
RUN MISE_VERSION="${MISE_VERSION}" curl https://mise.run | MISE_INSTALL_PATH=/opt/mise/bin/mise sh

# Install mise-managed tools (opencode)
COPY mise.toml .
RUN mise install

# === Install internal wheels (evaluator-sdk + python-client) ===
COPY .wheels .wheels
RUN pip install --no-deps .wheels/*.whl

# === Install external dependencies ===
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN pip cache purge

# === Copy source ===
COPY src/ .

# === Environment ===
ENV PYTHONPATH=${LAMBDA_TASK_ROOT}
ENV GIT_PYTHON_REFRESH=quiet

CMD ["evaluator_agent_as_judge.handler.lambda_handler"]
