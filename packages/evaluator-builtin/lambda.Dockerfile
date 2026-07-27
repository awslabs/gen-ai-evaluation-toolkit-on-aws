FROM --platform=linux/amd64 public.ecr.aws/lambda/python:3.12

WORKDIR ${LAMBDA_TASK_ROOT}

# === Install internal wheels (order matters: python-client → evaluator-sdk) ===
COPY .wheels .wheels
RUN pip install --no-deps .wheels/*.whl

# === Install external dependencies ===
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN pip cache purge

# === Copy source code ===
COPY src/ .

# === Environment ===
ENV PYTHONPATH=${LAMBDA_TASK_ROOT}
ENV GIT_PYTHON_REFRESH=quiet

CMD ["evaluator_builtin.handler.lambda_handler"]
