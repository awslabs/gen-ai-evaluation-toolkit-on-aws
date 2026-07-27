$version: "2.0"

namespace com.amzn.aws.pse.genaietk.common

@documentation(
    """
    Shared core fields of a test case / test result. Composed by both the datastore
    TestCaseData and the evaluator ResultData so the two surfaces stay in lockstep:
    a test result is a test case that has been run, so it carries the same core
    fields plus the execution artifacts (output, appMetrics, error). Add fields here
    only when they belong on BOTH a test case and a test result — this coupling is
    deliberate and keeps datastore and evaluator integrating without field mapping.
    """
)
@mixin
structure TestDataMixin {
    @documentation("The input to the Gen AI Application. Can be any structured data including prompts, context, and parameters.")
    input: Document

    @documentation("Expected output of the Gen AI Application for the given input. Can be any structured data including simple text responses, expected tool calls, expected topics, or any combination of expected behaviors.")
    expected: Document

    @documentation("Additional context for the test case. Can contain metadata such as flags indicating human review needed, artifacts providing evidence for agent-as-judge evaluation, or any other structured data needed for evaluation.")
    context: Document

    @documentation("Optional free-form metadata set by the caller. Carried through verbatim to results and ignored by the pipeline — use it to tag test cases (source, split, tenant, run label, etc.) for grouping and debugging.")
    metadata: Document
}
