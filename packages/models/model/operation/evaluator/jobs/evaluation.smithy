$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use smithy.framework#ValidationException

@documentation("Submit a full evaluation job: fetch test data, invoke app, and score results")
@http(method: "POST", uri: "/v2/evaluators/{evaluatorName}/jobs/evaluate")
operation SubmitEvaluationJob {
    input: SubmitEvaluationJobInput
    output: SubmitEvaluationJobOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure SubmitEvaluationJobInput with [SubmitJobInputMixin] {
    @required
    @httpLabel
    @documentation("Name of the evaluator")
    evaluatorName: String

    @required
    @documentation("Source of test cases for evaluation")
    testCases: TestDataSource

    @documentation("Report ID to store results in (auto-created if not provided)")
    reportId: ResourceId

    @documentation("Scorer configurations keyed by scorer name")
    scorers: ScorerMap

    @documentation("App invocation configuration — function selection, runtime parameters, and evaluator override")
    app: AppConfig
}

@output
structure SubmitEvaluationJobOutput with [SubmitJobOutputMixin] {}
