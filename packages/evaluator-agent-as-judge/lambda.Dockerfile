FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.12

WORKDIR ${LAMBDA_TASK_ROOT}

# The base image's OS trust store (Amazon Linux 2023 ca-certificates) still trusts the
# compromised emSign ECC Root CA - G3 (GHSA-6q48-6c7w-9gw2), and no fixed ca-certificates
# RPM is published yet. The mise and dnf downloads below use that store, so blocklist the
# root per AWS's documented procedure (AL2023 CVE-2026-113470) before the first download.
# Targets only the compromised root by object name; C1/C3/G1 stay trusted. Remove once the
# base image ships a fixed ca-certificates.
RUN mkdir -p /etc/pki/ca-trust/source/blocklist \
    && trust extract --overwrite --format=pem-bundle \
      --filter="pkcs11:object=emSign%20ECC%20Root%20CA%20-%20G3;type=cert" \
      /etc/pki/ca-trust/source/blocklist/emSign_ECC_Root_CA_-_G3.pem \
    && update-ca-trust \
    && anchors="$(trust list --filter=ca-anchors)" \
    && ! printf '%s' "$anchors" | grep -q 'label: emSign ECC Root CA - G3'

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

# The base image's pip vendors an old certifi that still trusts the compromised
# emSign roots (GHSA-6q48-6c7w-9gw2); upgrade pip from a hash-pinned wheel so pip's
# own package downloads use a clean trust store and the upgrade itself cannot be tampered with.
# (Earlier dnf/mise/curl downloads are already covered by the OS-store blocklist above.)
RUN python -m pip install --no-cache-dir "pip @ https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70"

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
