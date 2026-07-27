import os
from functools import wraps

from invoke import task

PIPX_HOME = os.path.join(os.getcwd(), ".pipx", "local")
PIPX_ENV = os.path.join(PIPX_HOME, "venvs", "pipx")

PIPX_TOOLS = {
    "black": "latest",
    "isort": "latest",
    "mypy": "latest",
    "flake8": "latest",
}


def install_pipx_tool(context, tool_name):
    if tool_name not in PIPX_TOOLS:
        raise ValueError(f"Tool {tool_name} not found in PIPX_TOOLS")

    version = PIPX_TOOLS[tool_name]
    version_spec = f"=={version}" if version != "latest" else ""
    context.run(
        f"PIPX_HOME={PIPX_HOME} {PIPX_ENV}/bin/pipx install {tool_name}{version_spec}"
    )


def trace(func):
    @wraps(func)
    def wrapper(context, *args, **kwargs):
        func_name = func.__name__
        print(f"Starting task: {func_name}")
        try:
            result = func(context, *args, **kwargs)
            print(f"Succeeded task: {func_name}")
            return result
        except Exception as e:
            print(f"Failed task: {func_name} - {type(e).__name__}: {str(e)}")
            raise
        finally:
            print(f"Exiting task: {func_name}")

    return wrapper


@task
@trace
def pipx(context):
    if not os.path.exists(PIPX_HOME):
        os.makedirs(PIPX_HOME)
        context.run(f"python -m venv {PIPX_ENV}")
        context.run(f"{PIPX_ENV}/bin/pip install pipx")


@task(pre=[pipx])
@trace
def format(context):
    install_pipx_tool(context, "black")
    install_pipx_tool(context, "isort")
    context.run(f"{PIPX_HOME}/venvs/black/bin/black src")
    context.run(f"{PIPX_HOME}/venvs/isort/bin/isort src")


@task(pre=[format])
@trace
def fix(context):
    pass


@task(pre=[pipx])
@trace
def check_mypy(context):
    install_pipx_tool(context, "mypy")
    mypy_required_dependencies = [
        "typing-extensions",
        "pytest",
        "requests-aws4auth",
        "tenacity==9.1.2",
        "boto3",
        "deepdiff==8.5.0",
        "boto3-stubs-lite",
        "boto3-stubs[full]",
        "types-requests",
    ]
    context.run(
        f"{PIPX_HOME}/venvs/mypy/bin/python -m pip install {' '.join(mypy_required_dependencies)}"
    )
    context.run(f"{PIPX_HOME}/venvs/mypy/bin/mypy src")


@task(pre=[pipx])
@trace
def check_flake8(context):
    install_pipx_tool(context, "flake8")
    context.run(f"{PIPX_HOME}/venvs/flake8/bin/flake8 src")


@task(pre=[pipx])
@trace
def check_black(context):
    install_pipx_tool(context, "black")
    context.run(f"{PIPX_HOME}/venvs/black/bin/black --check --diff src")


@task(pre=[pipx])
@trace
def check_isort(context):
    install_pipx_tool(context, "isort")
    context.run(f"{PIPX_HOME}/venvs/isort/bin/isort --check --diff src")


@task(pre=[pipx, check_mypy, check_flake8, check_black, check_isort])
@trace
def check(context):
    pass


@task
@trace
def test(context):
    context.run("pip install -e .")
    context.run("pytest")


@task
@trace
def clean_build(context):
    context.run("rm -rf build")


@task(pre=[clean_build, test, check])
@trace
def release(context):
    pass


@task
@trace
def clean(context):
    context.run("rm -rf build", warn=True)
    context.run("rm -rf .pytest_cache", warn=True)
    context.run("rm -rf .mypy_cache", warn=True)
    context.run("rm -rf .pipx", warn=True)
    context.run("rm -rf .venv", warn=True)
