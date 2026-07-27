"""PyRIT attack loop as an ETK app_invoke function.

Provides a factory function (``pyrit_red_team_app_invoke``) that returns an
ETK-compatible ``AppInvokeFn``. The returned callable runs a PyRIT attack
executor against a user-provided Python function, one objective at a time.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Any, Callable

from pyrit.executor.attack import PromptSendingAttack, RedTeamingAttack
from pyrit.executor.attack.core import AttackAdversarialConfig, AttackConverterConfig, AttackScoringConfig
from pyrit.memory import CentralMemory, SQLiteMemory
from pyrit.models import Message
from pyrit.prompt_converter import PromptConverter
from pyrit.prompt_normalizer.prompt_converter_configuration import PromptConverterConfiguration
from pyrit.prompt_target import PromptTarget
from pyrit.score import Scorer, TrueFalseScorer

logger = logging.getLogger(__name__)


def _ensure_memory() -> None:
    """Ensure PyRIT's central memory is initialized (ephemeral SQLite)."""
    try:
        CentralMemory.get_memory_instance()
    except ValueError:
        CentralMemory.set_memory_instance(SQLiteMemory())


class FunctionTarget(PromptTarget):
    """Wrap a Python function as a PyRIT PromptTarget.

    The function signature is ``(prompt: str) -> str``. This allows customers
    to reuse their existing ETK app logic directly as a PyRIT target without
    re-describing it as an HTTP endpoint.

    For use as an adversarial chat target, the function can optionally accept
    a system_prompt parameter: ``(prompt: str, system_prompt: str | None) -> str``.

    Captures all prompts and responses in ``history`` for conversation tracking.
    """

    def __init__(self, fn: Callable[..., str], **kwargs: Any) -> None:
        _ensure_memory()
        super().__init__(**kwargs)
        self._fn = fn
        self._system_prompt: str | None = None
        self.history: list[dict[str, str]] = []

    def set_system_prompt(
        self, *, system_prompt: str, conversation_id: Any = None, **kwargs: Any
    ) -> None:
        """Set system prompt (called by RedTeamingAttack for adversarial chat)."""
        self._system_prompt = system_prompt

    def clear_history(self) -> None:
        """Clear conversation history and state (call before each new objective).

        If the wrapped function has a ``reset()`` method (e.g. a stateful chatbot),
        it will be called to clear application-level conversation state.
        """
        self.history = []
        self._system_prompt = None
        if hasattr(self._fn, "reset"):
            self._fn.reset()

    async def _send_prompt_to_target_async(self, *, normalized_conversation: list[Message]) -> list[Message]:
        # PyRIT's base class validates/normalizes the conversation and then calls
        # this hook with the full history. The current user turn is the last message.
        message = normalized_conversation[-1]
        prompt_text = message.get_value()
        sig = inspect.signature(self._fn)
        if "system_prompt" in sig.parameters:
            response_text = self._fn(prompt_text, system_prompt=self._system_prompt)
        else:
            response_text = self._fn(prompt_text)
        self.history.append({"role": "user", "content": prompt_text})
        self.history.append({"role": "assistant", "content": response_text})
        return [Message.from_prompt(prompt=response_text, role="assistant")]


def pyrit_red_team_app_invoke(
    app_invoke: Callable[[str], str],
    *,
    attack_strategy: str = "red_teaming",
    max_turns: int = 5,
    adversarial_chat: PromptTarget | None = None,
    objective_scorer: TrueFalseScorer | None = None,
    auxiliary_scorers: list[Scorer] | None = None,
    converters: list[PromptConverter] | None = None,
    max_attempts_on_failure: int = 0,
) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """Wrap an app_invoke function with PyRIT red-teaming.

    Takes a simple ``(prompt: str) -> str`` function and wraps it with PyRIT's
    attack orchestration. The returned function is an ETK-compatible ``AppInvokeFn``
    that accepts test cases with ``{"objective": str}`` and runs adversarial attacks.

    Args:
        app_invoke: The application under test. Takes a prompt string, returns a
            response string.
        attack_strategy: ``"red_teaming"`` (multi-turn adaptive) or ``"single_turn"``.
        max_turns: Maximum turns for multi-turn attacks.
        adversarial_chat: PyRIT target for the adversarial LLM (required for
            red_teaming strategy).
        objective_scorer: PyRIT scorer for determining attack success (required
            for red_teaming strategy).
        auxiliary_scorers: Additional PyRIT scorers to run post-hoc.
        converters: Prompt converters for obfuscation (Base64, leetspeak, etc.).
        max_attempts_on_failure: Retry count for single-turn attacks.

    Returns:
        An ETK-compatible ``AppInvokeFn`` that accepts
        ``{"objective": str}`` and returns a dict with attack results.

    Raises:
        ValueError: If input_data lacks an ``objective`` field.
        ValueError: If ``attack_strategy`` is not ``"red_teaming"`` or ``"single_turn"``.
        ValueError: If ``red_teaming`` strategy is missing ``adversarial_chat`` or ``objective_scorer``.

    Example::

        from evaluator_pyrit import pyrit_red_team_app_invoke

        app_invoke = pyrit_red_team_app_invoke(my_app)
        evaluator = Evaluator(name="pyrit", app_invoke=app_invoke)
    """
    _ensure_memory()
    target = FunctionTarget(app_invoke)

    def _app_invoke(input_data: dict[str, Any]) -> dict[str, Any]:
        objective = input_data.get("objective")
        if not objective:
            raise ValueError("input_data must contain an 'objective' field")

        target.clear_history()
        result = asyncio.run(_run_attack(objective))
        return result

    async def _run_attack(objective: str) -> dict[str, Any]:
        if attack_strategy == "single_turn":
            return await _run_single_turn(objective)
        elif attack_strategy == "red_teaming":
            return await _run_red_teaming(objective)
        else:
            raise ValueError(f"Unknown attack_strategy: {attack_strategy}. Use 'single_turn' or 'red_teaming'.")

    def _build_scoring_config() -> AttackScoringConfig | None:
        """Build scoring config from provided or default scorers."""
        if objective_scorer is None and auxiliary_scorers is None:
            return None

        return AttackScoringConfig(
            objective_scorer=objective_scorer,
            auxiliary_scorers=auxiliary_scorers or [],
        )

    def _build_converter_config() -> AttackConverterConfig | None:
        """Build converter config if converters provided."""
        if not converters:
            return None
        return AttackConverterConfig(
            request_converters=PromptConverterConfiguration.from_converters(converters=converters),
        )

    async def _run_single_turn(objective: str) -> dict[str, Any]:
        attack = PromptSendingAttack(
            objective_target=target,
            attack_scoring_config=_build_scoring_config(),
            attack_converter_config=_build_converter_config(),
            max_attempts_on_failure=max_attempts_on_failure,
        )
        result = await attack.execute_async(objective=objective)
        return _format_result(result)

    async def _run_red_teaming(objective: str) -> dict[str, Any]:
        if adversarial_chat is None:
            raise ValueError(
                "red_teaming strategy requires adversarial_chat"
            )

        scoring_config = _build_scoring_config()
        if scoring_config is None or scoring_config.objective_scorer is None:
            raise ValueError(
                "red_teaming strategy requires an objective_scorer"
            )

        attack = RedTeamingAttack(
            objective_target=target,
            max_turns=max_turns,
            attack_adversarial_config=AttackAdversarialConfig(target=adversarial_chat),
            attack_scoring_config=scoring_config,
            attack_converter_config=_build_converter_config(),
        )
        result = await attack.execute_async(objective=objective)
        return _format_result(result)

    def _format_result(result: Any) -> dict[str, Any]:
        """Convert a PyRIT AttackResult to a plain output dict."""
        attack_succeeded = result.outcome.value == "success" if result.outcome else False

        output: dict[str, Any] = {
            "attack_succeeded": attack_succeeded,
            "attack_reason": result.last_score.score_rationale if result.last_score else None,
            "turns_used": result.executed_turns,
            "objective": result.objective,
            "conversation": list(target.history),
        }

        if result.last_response:
            output["final_response"] = result.last_response.converted_value

        return output

    return _app_invoke
