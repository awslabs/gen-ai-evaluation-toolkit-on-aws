import dataclasses
import json
import sys
from typing import Any, Dict, List, Optional

import yaml
from evaluator_sdk import TestResult

from evaluator_agent_as_judge.models import AgentAsJudgeParams, Evaluator

_JUDGE_SYSTEM_PROMPT = (
    "You are an impartial evaluator. Your role is to assess the given input "
    "and produce a structured verdict using the write_verdict tool.\n\n"
    ""
    "Prefer the built-in read-only tools (read, list, grep, glob) to inspect files and search content. "
    "A small set of read-only bash commands is also permitted for convenience: "
    "ls, tree, cat, head, tail, grep, rg, wc, file, stat, diff. "
    "All other bash commands — including find, git, and any file-modifying or network commands — "
    "are blocked by the permission config and will fail if attempted.\n\n"
    ""
    "## Empty Test Case Guard\n\n"
    ""
    "Before doing anything else, check whether the test case contains any meaningful data. "
    "If all of `input`, `output`, and `context` are absent or empty, AND no artifacts are provided, "
    "call `write_error` immediately with the message: "
    "'No test case data found: input, output, context, and artifacts are all absent or empty.' "
    "Then stop. Do not attempt an evaluation.\n\n"
    ""
    "## Evaluation Workflow\n\n"
    ""
    "Follow these steps in order:\n\n"
    ""
    "1. **Initial exploration** — list artifacts and scan file names to understand what is available. "
    "Collect all requirements based on the provided metrics, configurations, and requirements documents. "
    "Do not read artifacts contents in depth yet.\n\n"
    ""
    "2. **Write a plan** — after the initial exploration, write a concise plan that covers:\n"
    "   - Which files you intend to read and why\n"
    "   - What metrics or requirements you have identified so far\n"
    "   - What you intend to verify for each metric or requirement\n\n"
    "   The plan is a living document. Update it freely as you collect more evidence and discover "
    "new information — it is expected and encouraged to course-correct as you go. "
    "The primary goal is to identify all requested metrics and evaluate every one of them "
    "to the fullest extent possible.\n\n"
    ""
    "3. **Evaluate** — read the files you planned to read, gather evidence, and assess each metric "
    "or requirement. Update your plan if needed.\n\n"
    ""
    "4. **Write verdict** — once all metrics are assessed, call write_verdict.\n\n"
    ""
    "Automatically course-correct and retry when tools fail — do not give up silently. "
    "If a tool call fails, fix your approach and retry with corrected input up to 5 times.\n\n"
    ""
    "If you reach a dead-end or reach the 5 times retry threshold and keep failing, "
    "then call write_error with a clear description of the failure and then stop immediately. \n\n"
    ""
    "One and only one of (verdict, error) MUST be written (using the corresponding tools) before you terminate."
)

LoggedKeys = {"input", "output", "expected", "context"}


def build_prompt(
    evaluator: Evaluator,
    test_case: TestResult,
    artifact_dirs: List[str],
    requirement_doc_dir: Optional[str],
) -> str:
    """Assemble the full agent prompt from all parts."""
    parts: List[str] = []

    # 1. Evaluator instructions
    parts.append("## Evaluation Task\n\n")
    parts.append(evaluator.description)
    if evaluator.config:
        parts.append("\n\n### Evaluator Parameters\n\n")
        # Yaml is closer to natural language than most other formats
        parts.append(yaml.safe_dump(evaluator.config))

    # 2. Test case content — include input, output, and context (artifacts already
    # stripped from context by the scorer before we get here)
    parts.append("\n\n## Test Case\n\n<test-case>\n")
    test_case_data = {
        key: value for key, value in dataclasses.asdict(test_case).items() if key in LoggedKeys and value is not None
    }
    parts.append(yaml.safe_dump(test_case_data))
    parts.append("\n</test-case>")

    # 3. Artifact paths
    if artifact_dirs:
        parts.append("\n\n## Artifacts\n\n")
        parts.append(
            "The following local directories contain downloaded artifacts for this test case. "
            "Explore them freely using the built-in read-only tools (read, list, grep, glob) "
            "or the permitted bash commands (ls, cat, grep, tree, etc.):\n\n"
        )
        parts.append(yaml.safe_dump(artifact_dirs))

    # 4. Requirement doc paths
    if requirement_doc_dir:
        parts.append("\n\n## Reference Documents\n\n")
        parts.append(
            f"Reference documents are available at: `{requirement_doc_dir}`\n\n"
            "Explore this directory to find relevant documents. Read them as needed to inform your evaluation."
        )

    # 5. Output schema instructions
    parts.append(
        "\n\n## Output Instructions\n\n"
        "When you have completed your evaluation, call the `write_verdict` tool with a JSON object containing:\n"
        "- `scores` (list, required): the per-metric breakdown. Break your evaluation into named metrics "
        "and report each one as an object with:\n"
        "    - `name` (string): a unique label for the metric.\n"
        "    - `score` (float, 0.0–1.0): that metric's score. 1.0 = fully passing, 0.0 = fully failing.\n"
        "    - `weight` (float, optional, default 1.0, must be >= 0): the metric's relative importance. "
        "Use a larger weight for metrics that matter more; use 0 to record a metric without letting it "
        "affect the overall score.\n"
        "  The overall score is computed automatically as the weighted average of these metrics — "
        "do NOT compute an overall score yourself.\n"
        "- `summary` (string): A concise summary of your findings.\n"
        "- `issues` (list of strings): Specific issues found along with references to their locations. "
        "Use an empty list if none.\n"
        "- `context` (any): Additional structured context for the score.\n"
    )

    if evaluator.output_schema:
        parts.append(
            "\nThe `context` field **MUST** be present and **MUST** conform to the following JSON Schema:\n"
            f"```json\n{json.dumps(evaluator.output_schema, indent=2)}\n```\n"
        )

    parts.append(
        "\n**Important:** You MUST call `write_verdict` before terminating. "
        "If `write_verdict` fails, retry with corrected input up to 5 times. "
        "If it still fails after 5 attempts, call `write_error` with a description of what went wrong, "
        "then stop immediately. Never silently give up — either a verdict or an error MUST be written."
    )

    return "".join(parts)


def build_opencode_config(config: AgentAsJudgeParams) -> Dict[str, Any]:
    return {
        "mcp": {
            "judge-tools": {
                "type": "local",
                "command": [sys.executable, "-m", "evaluator_agent_as_judge.tools.server"],
                "enabled": True,
                "timeout": 30000,  # 30s — python cold start can be slow in Lambda
            }
        },
        "agent": {
            "judge": {
                "description": "Evaluates outputs and returns structured verdicts",
                "mode": "primary",
                "model": f"amazon-bedrock/{config.agent_model}",
                "temperature": config.agent_temperature,
                "prompt": _JUDGE_SYSTEM_PROMPT,
                "permission": {
                    # ── Deny-by-default posture ────────────────────────────────────────────────
                    # The agent is invoked with --dangerously-skip-permissions (non-interactive
                    # Lambda, no TTY to answer "ask" prompts). That flag auto-approves anything
                    # not explicitly denied, so we deny EVERYTHING first and then allow only the
                    # specific read-only capabilities the judge needs. This way any tool we did
                    # not anticipate — including ones opencode adds in future versions — is
                    # denied by default rather than silently enabled.
                    #
                    # Keys are matched as wildcard patterns against the underlying tool name and
                    # resolved by LAST match, so the catch-all "*" must come first.
                    "*": "deny",
                    # Read-only inspection tools — preferred over bash.
                    "read": "allow",
                    "list": "allow",
                    "grep": "allow",
                    "glob": "allow",
                    # Our MCP tools (write_verdict / write_error / calculator). REQUIRED:
                    # opencode registers MCP tools as "<server>_<tool>", so the "*": "deny"
                    # above would otherwise block them and the agent could never write a
                    # verdict. The judge-tools server is bundled and fully under our control.
                    "judge-tools_*": "allow",
                    # Note: edit/write/apply_patch, webfetch, websearch, task, skill, todowrite,
                    # question, lsp, external_directory, etc. are all covered by "*": "deny"
                    # above — no need to enumerate them.
                    "bash": {
                        # Deny everything by default; only allow a small set of read-only
                        # commands for convenience. The agent should prefer the built-in
                        # read/list/grep/glob tools above. Permissions are resolved by last
                        # match, so this creates an allow-list of bash commands.
                        # NOTE: this allow-list is convenience/defence-in-depth, not the
                        # security boundary — prefix-glob matches can be escaped by argument
                        # syntax. Containment rests on network isolation + read-only S3 IAM.
                        "*": "deny",
                        # ── Directory / file listing ──────────────────────────────────────────────
                        "ls *": "allow",
                        "ls": "allow",
                        "tree *": "allow",
                        "tree": "allow",
                        # ── File reading ──────────────────────────────────────────────────────────
                        "cat *": "allow",
                        "head *": "allow",
                        "tail *": "allow",
                        # ── Search ────────────────────────────────────────────────────────────────
                        "grep *": "allow",
                        "rg *": "allow",
                        "wc *": "allow",
                        # ── File metadata ─────────────────────────────────────────────────────────
                        "file *": "allow",
                        "stat *": "allow",
                        "diff *": "allow",
                    },
                },
            }
        },
    }
