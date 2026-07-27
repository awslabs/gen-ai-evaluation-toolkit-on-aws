# Gen AI Evaluation Toolkit on AWS

The Gen AI Evaluation Toolkit on AWS provides a framework for comprehensive evaluation of generative AI applications through test case generation, metrics-based assessment, and test data management.

Key capabilities include:
- **LLM-as-Judge**: LLM-based scoring with custom criteria and prompts
- **Agent-as-Judge**: Agentic evaluation with active artifact exploration and evidence collection
- **RAGAS**: Purpose-built RAG evaluation metrics
- **AgentCore**: OpenTelemetry-integrated evaluation for agentic systems
- **DeepEval**: Comprehensive LLM evaluation metrics for single-turn and multi-turn conversations
- **PyRIT**: Automated adversarial red-teaming for LLM security testing
- **fmeval**: AWS Foundation Model Evaluation metrics

## Core guides

- [Solution Guide](solution_guide/Gen-AI-ETK-SolutionGuide.md) — Architecture, design, and deployment details (CDK and Terraform options)
- [User Guide](user_guide/Gen-AI-ETK-UserGuide.md) — Getting started, configuration, and usage instructions

## SDK references

- [Evaluator SDK](sdk/evaluator-sdk.md) — Build custom evaluators (scorers, app_invoke)
- [Evaluator PyRIT](sdk/evaluator-pyrit.md) — Adversarial red-teaming with PyRIT
- [Python client reference](sdk/python-client.md) — Python client API reference
- [TypeScript client reference](sdk/typescript-client.md) — TypeScript client API reference
