# ETK Kiro Agents

Local Kiro CLI agents for Gen AI Evaluation Toolkit debugging and development.

## Usage

When working in the genai-etk directory:

```bash
# Base ETK agent with documentation
kiro-cli chat --agent etk-default

# ETK debugging agent with specialized prompts  
kiro-cli chat --agent etk-local-debug
```

## Setting Default Agent

To set etk-default as your global default:
```bash
kiro-cli settings chat.defaultAgent etk-default
```

To remove the default:
```bash
kiro-cli settings chat.defaultAgent --delete
```

## Agents

- **etk-default**: General ETK questions, documentation lookup, architecture understanding
- **etk-local-debug**: Debugging failed evaluations, CloudWatch log analysis, request tracing

## Features

- Access to ETK documentation and README
- AWS profile protection  
- ETK debugging workflows and methodology
- CloudWatch log analysis tools
