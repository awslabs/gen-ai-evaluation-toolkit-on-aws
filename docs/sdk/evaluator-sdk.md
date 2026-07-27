<!-- Auto-generated API reference using mkdocstrings: https://mkdocstrings.github.io/python/ -->

# Evaluator SDK reference

The Evaluator SDK provides the framework for building custom evaluators that integrate with the Gen AI Evaluation Toolkit on AWS.

## Evaluator

::: evaluator_sdk.evaluator.Evaluator
    options:
      show_root_heading: true
      heading_level: 3
      show_signature_annotations: true
      members:
        - evaluate
        - score
        - invoke
        - evaluator_handler

## Models

::: evaluator_sdk.models
    options:
      show_root_heading: false
      heading_level: 3
      members_order: alphabetical
      show_signature_annotations: true
      show_if_no_docstring: true
      filters:
        - "!^_"
        - "!model_config"
        - "!model_post_init"
        - "!to_dict"

## Scorer

::: evaluator_sdk.scorer
    options:
      show_root_heading: false
      heading_level: 3
      show_signature_annotations: true
      members:
        - Scorer
        - scorer
