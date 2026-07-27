"""Mock Step Functions — synchronous ASL executor for onebox testing.

Interprets the subset of ASL used by the multi-evaluator orchestration:
Pass, Choice, Task (events:putEvents.waitForTaskToken and events:putEvents), Map.

Usage:
    router = MockEventRouter()
    router.add_rule({"evaluatorName": "builtin"}, my_handler)

    sfn = MockStepFunctions(asl=ASL_DICT, router=router)
    set_sfn_client(sfn)  # inject into API

    client.submit_evaluation_job(...)  # API calls sfn.start_execution()
    sfn.run()                          # execute the pipeline

    job = client.get_evaluator_job(...)
    assert job.status.value == "SUCCESS"
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Callable


class MockEventRouter:
    """Routes events to handlers by pattern matching on detail fields."""

    def __init__(self) -> None:
        self._rules: list[tuple[dict[str, list[str]], Callable[[dict[str, Any]], None]]] = []

    def add_rule(
        self, pattern: dict[str, list[str]], handler: Callable[[dict[str, Any]], None],
    ) -> None:
        """Register a routing rule. Pattern: {"evaluatorName": ["builtin"]} or {"jobType": ["POST_PROCESS"]}."""
        self._rules.append((pattern, handler))

    def route(self, event_detail: dict[str, Any]) -> bool:
        """Route an event to the first matching handler. Returns True if matched."""
        for pattern, handler in self._rules:
            if self._matches(pattern, event_detail):
                handler(event_detail)
                return True
        return False

    @staticmethod
    def _matches(pattern: dict[str, list[str]], detail: dict[str, Any]) -> bool:
        for key, allowed in pattern.items():
            val = detail.get(key)
            if val not in allowed:
                return False
        return True


@dataclass
class _Execution:
    """A queued SFN execution."""
    arn: str
    name: str
    input: dict[str, Any]
    status: str = "QUEUED"
    output: str | None = None


class StepFunctionsTimeout(Exception):
    """Raised when a waitForTaskToken state gets no callback."""


class MockStepFunctions:
    """Synchronous ASL executor.

    Handles: Pass, Choice, Task (waitForTaskToken + putEvents), Map.
    """

    def __init__(
        self, asl: dict[str, Any], router: MockEventRouter, auto_run: bool = False,
    ) -> None:
        self._asl = asl
        self._router = router
        self._auto_run = auto_run
        self._pending: _Execution | None = None
        self._executions: dict[str, _Execution] = {}
        self._callbacks: dict[str, dict[str, Any]] = {}  # token → output
        self._failures: dict[str, dict[str, Any]] = {}   # token → {error, cause}

    # --- Public API (matches boto3 stepfunctions client interface) ---

    def start_execution(
        self, stateMachineArn: str = "", name: str = "", input: str = "", **kwargs: Any,
    ) -> dict[str, Any]:
        """Queue an execution. Does NOT run it — call run() to execute."""
        if self._pending is not None:
            raise Exception(f"Execution already queued: {self._pending.name}")

        arn = f"arn:aws:states:mock:123456789:execution:mock:{name}"
        execution = _Execution(arn=arn, name=name, input=json.loads(input))
        self._pending = execution
        self._executions[arn] = execution
        # auto_run mode drives the pipeline synchronously inside start_execution,
        # so a caller that submits-and-then-polls (the SDK remote path) sees a
        # terminal job without a separate run() call.
        if self._auto_run:
            self.run()
        return {"executionArn": arn}

    def describe_execution(self, executionArn: str = "", **kwargs: Any) -> dict[str, Any]:
        """Get execution status."""
        exe = self._executions.get(executionArn)
        if not exe:
            raise Exception(f"Execution not found: {executionArn}")
        result: dict[str, Any] = {"status": exe.status}
        if exe.output:
            result["output"] = exe.output
        return result

    def send_task_success(self, taskToken: str = "", output: str = "", **kwargs: Any) -> None:
        """Callback from a worker — task completed successfully."""
        self._callbacks[taskToken] = json.loads(output)

    def send_task_failure(
        self, taskToken: str = "", error: str = "", cause: str = "", **kwargs: Any,
    ) -> None:
        """Callback from a worker — task failed."""
        self._failures[taskToken] = {"error": error, "cause": cause}

    def send_task_heartbeat(self, taskToken: str = "", **kwargs: Any) -> None:
        """Heartbeat from a worker — ignored in mock (no timeout simulation)."""
        pass

    # --- Execution ---

    def run(self) -> dict[str, Any]:
        """Run the queued execution end-to-end. Returns the execution output."""
        if self._pending is None:
            raise Exception("No execution queued — call start_execution first")

        exe = self._pending
        self._pending = None
        exe.status = "RUNNING"

        try:
            state_data = exe.input
            current = self._asl["StartAt"]

            while current:
                state_def = self._asl["States"][current]
                current, state_data = self._run_state(current, state_def, state_data)

            exe.status = "SUCCEEDED"
            exe.output = json.dumps(state_data)
            return state_data

        except Exception:
            exe.status = "FAILED"
            raise

    # --- State handlers ---

    def _run_pass(
        self, state_def: dict[str, Any], data: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        if "Parameters" in state_def:
            data = self._resolve_params(state_def["Parameters"], data)
        if "ResultPath" in state_def and state_def["ResultPath"] is not None:
            result = state_def.get("Result")
            if result is not None:
                data = self._set_path(data, state_def["ResultPath"], result)
        next_state = state_def.get("Next")
        if state_def.get("End"):
            return None, data
        return next_state, data

    def _run_choice(
        self, state_def: dict[str, Any], data: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        for choice in state_def.get("Choices", []):
            if self._evaluate_choice(choice, data):
                return choice["Next"], data
        default = state_def.get("Default")
        if default:
            return default, data
        raise ValueError("No choice matched and no Default")

    def _run_wait_for_token(
        self, name: str, state_def: dict[str, Any], data: dict[str, Any],
        params: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        # Extract the event detail and route it
        entries = params.get("Entries", [])
        if not entries:
            raise ValueError(f"Task {name}: no Entries in Parameters")

        entry = entries[0]
        detail = entry.get("Detail", {})
        token = detail.get("taskToken")

        if not token:
            raise ValueError(f"Task {name}: no taskToken in event Detail")

        # Route the event — handler processes synchronously and calls
        # send_task_success/failure which populates self._callbacks/failures
        try:
            self._router.route(detail)
        except Exception:
            pass  # handler failure — check callbacks

        # Check for callback
        if token in self._callbacks:
            output = self._callbacks.pop(token)
            result_path = state_def.get("ResultPath", "$.taskOutput")
            data = self._set_path(data, result_path, output)
            next_state = state_def.get("Next")
            if state_def.get("End"):
                return None, data
            return next_state, data

        if token in self._failures:
            failure = self._failures.pop(token)
            # Worker called send_task_failure → States.TaskFailed in SFN
            failure["error"] = "States.TaskFailed"
            return self._handle_catch(state_def, data, failure)

        # No callback — simulate HeartbeatTimeout
        return self._handle_catch(
            state_def, data,
            {"error": "States.HeartbeatTimeout", "cause": "No callback received"},
        )

    def _run_map(
        self, name: str, state_def: dict[str, Any], data: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        items_path = state_def.get("ItemsPath", "$.items")
        items = self._resolve_path(data, items_path)
        if not isinstance(items, list):
            items = []

        iterator = state_def["Iterator"]
        item_selector = state_def.get("ItemSelector", {})
        results = []

        for idx, item in enumerate(items):
            # Build item input — keys with ".$" suffix are JSONPath references
            item_data = {}
            for key, val in item_selector.items():
                if isinstance(key, str) and key.endswith(".$"):
                    clean_key = key[:-2]  # strip ".$"
                    if val == "$$.Map.Item.Value":
                        item_data[clean_key] = item
                    elif val == "$$.Map.Item.Index":
                        item_data[clean_key] = idx
                    else:
                        item_data[clean_key] = self._resolve_path(data, val)
                else:
                    item_data[key] = val

            # Run iterator states
            try:
                current = iterator["StartAt"]
                iter_data = item_data
                while current:
                    iter_state_def = iterator["States"][current]
                    current, iter_data = self._run_state(current, iter_state_def, iter_data)
                results.append(iter_data)
            except Exception as e:
                results.append({"_error": str(e)})

        result_path = state_def.get("ResultPath", "$.mapResults")
        data = self._set_path(data, result_path, results)

        # Check for Map-level Catch
        has_errors = any(isinstance(r, dict) and "_error" in r for r in results)
        if has_errors and "Catch" in state_def:
            for catch in state_def["Catch"]:
                if "States.ALL" in catch.get("ErrorEquals", []):
                    error_path = catch.get("ResultPath", "$.mapError")
                    data = self._set_path(data, error_path, {"error": "MapItemFailed"})
                    return catch["Next"], data

        next_state = state_def.get("Next")
        if state_def.get("End"):
            return None, data
        return next_state, data

    # --- Helpers ---

    def _emit_event(self, params: dict[str, Any]) -> None:
        """Emit a fire-and-forget event via the router."""
        entries = params.get("Entries", [])
        for entry in entries:
            detail = entry.get("Detail", {})
            self._router.route(detail)

    def _handle_catch(
        self, state_def: dict[str, Any], data: dict[str, Any],
        failure: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        """Route through Catch blocks."""
        error_type = failure.get("error", "States.TaskFailed")
        for catch in state_def.get("Catch", []):
            error_equals = catch.get("ErrorEquals", [])
            if error_type in error_equals or "States.ALL" in error_equals:
                result_path = catch.get("ResultPath", "$.error")
                data = self._set_path(data, result_path, failure)
                return catch["Next"], data
        raise StepFunctionsTimeout(f"Unhandled error: {failure}")

    def _resolve_params(
        self, params: dict[str, Any], data: dict[str, Any],
        task_token: str | None = None,
    ) -> dict[str, Any]:
        """Resolve JSONPath references in Parameters."""
        resolved: dict[str, Any] = {}
        for key, val in params.items():
            if isinstance(key, str) and key.endswith(".$"):
                clean_key = key[:-2]
                if isinstance(val, str):
                    if val == "$$.Task.Token":
                        resolved[clean_key] = task_token or str(uuid.uuid4())
                    elif val == "$$.Execution.Id":
                        resolved[clean_key] = "arn:aws:states:mock:execution"
                    elif val == "$$.State.EnteredTime":
                        resolved[clean_key] = "2026-01-01T00:00:00Z"
                    else:
                        resolved[clean_key] = self._resolve_path(data, val)
                else:
                    resolved[clean_key] = val
            elif isinstance(val, dict):
                resolved[key] = self._resolve_params(val, data, task_token)
            elif isinstance(val, list):
                resolved[key] = [
                    self._resolve_params(item, data, task_token) if isinstance(item, dict) else item
                    for item in val
                ]
            else:
                resolved[key] = val
        return resolved

    def _resolve_path(self, data: dict[str, Any], path: str) -> Any:
        """Resolve a JSONPath like $.foo.bar or $.foo[0]."""
        if not path.startswith("$"):
            return path
        parts = path[2:].split(".")  # strip "$."
        current: Any = data
        for part in parts:
            if not part:
                continue
            # Handle array index: foo[0]
            if "[" in part:
                key, idx_str = part.split("[")
                idx = int(idx_str.rstrip("]"))
                current = current.get(key, []) if isinstance(current, dict) else current
                if isinstance(current, list) and idx < len(current):
                    current = current[idx]
                else:
                    return None
            elif isinstance(current, dict):
                current = current.get(part)
            else:
                return None
            if current is None:
                return None
        return current

    def _set_path(self, data: dict[str, Any], path: str, value: Any) -> dict[str, Any]:
        """Set a value at a JSONPath like $.foo.bar."""
        if path == "$":
            return value if isinstance(value, dict) else data
        parts = path[2:].split(".")  # strip "$."
        result = dict(data)  # shallow copy
        current = result
        for part in parts[:-1]:
            if part not in current or not isinstance(current[part], dict):
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
        return result

    def _evaluate_choice(self, choice: dict[str, Any], data: dict[str, Any]) -> bool:
        """Evaluate a single Choice rule."""
        variable = choice.get("Variable", "")
        value = self._resolve_path(data, variable)

        if "StringEquals" in choice:
            return value == choice["StringEquals"]
        if "BooleanEquals" in choice:
            return value == choice["BooleanEquals"]
        if "IsPresent" in choice:
            return (value is not None) == choice["IsPresent"]
        if "NumericEquals" in choice:
            return value == choice["NumericEquals"]
        return False

    # --- Token generation for waitForTaskToken ---

    def _run_state(
        self, name: str, state_def: dict[str, Any], data: dict[str, Any],
    ) -> tuple[str | None, dict[str, Any]]:
        """Override to inject task tokens into waitForTaskToken Parameters."""
        state_type = state_def["Type"]

        if state_type == "Task" and "waitForTaskToken" in state_def.get("Resource", ""):
            # Generate a token and resolve params with it
            token = str(uuid.uuid4())
            params = self._resolve_params(state_def.get("Parameters", {}), data, task_token=token)
            return self._run_wait_for_token(name, state_def, data, params)
        elif state_type == "Task":
            # Fire-and-forget putEvents (no waitForTaskToken)
            params = self._resolve_params(state_def.get("Parameters", {}), data)
            self._emit_event(params)
            if state_def.get("End"):
                return None, data
            return state_def.get("Next"), data
        elif state_type == "Pass":
            return self._run_pass(state_def, data)
        elif state_type == "Choice":
            return self._run_choice(state_def, data)
        elif state_type == "Map":
            return self._run_map(name, state_def, data)
        else:
            raise ValueError(f"Unsupported state type: {state_type}")
