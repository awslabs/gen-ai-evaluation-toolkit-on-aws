<!-- Auto-generated API reference using mkdocstrings: https://mkdocstrings.github.io/python/ -->

# Python client reference

## Usage examples

### Creating test cases with structured data

The `expected` and `context` fields support both simple strings (for backward compatibility) and structured data (for agentic applications).

```python
from awssolutions_gen_ai_evaluation_toolkit_python_client import ApiClient, Configuration
from awssolutions_gen_ai_evaluation_toolkit_python_client.api import DefaultApi

config = Configuration(host="https://your-api-endpoint")
client = DefaultApi(ApiClient(config))

# Simple string format (backward compatible)
client.create_test_case(
    dataset_name="my-dataset",
    test_case_data={
        "input": "What is Amazon S3?",
        "expected": "Amazon S3 is an object storage service.",
        "context": ["Amazon S3 is an object storage service that offers..."]
    }
)

# Structured data for agentic applications
client.create_test_case(
    dataset_name="my-dataset",
    test_case_data={
        "input": {"prompt": "Book a flight to Seattle for next Monday"},
        "expected": {
            "toolCalls": [
                {"name": "search_flights", "arguments": {"destination": "Seattle"}}
            ],
            "expectedTopics": ["flight booking", "travel"]
        },
        "context": {
            "requiresHumanReview": False,
            "evaluationHints": {"checkToolSequence": True}
        }
    }
)
```

## API client

::: awssolutions_gen_ai_evaluation_toolkit_python_client.api.default_api.DefaultApi
    options:
      show_root_heading: true
      heading_level: 3
      members_order: alphabetical
      docstring_style: google
      show_signature_annotations: false
      separate_signature: true
      filters:
        - "!_with_http_info"
        - "!_without_preload_content"
        - "!_serialize"
        - "!_deserialize"
        - "!^_"

## Models

::: awssolutions_gen_ai_evaluation_toolkit_python_client.models
    options:
      show_root_heading: false
      heading_level: 3
      members_order: alphabetical
      docstring_style: google
      show_signature_annotations: false
      separate_signature: true
      show_if_no_docstring: false
      filters:
        - "!^_"
        - "!model_config"
        - "!model_post_init"
        - "!to_dict"
        - "!to_json"
        - "!to_str"
        - "!from_dict"
        - "!from_json"
