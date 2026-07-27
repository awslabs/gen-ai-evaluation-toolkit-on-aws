$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use smithy.framework#ValidationException

@documentation("Submit a scoring-only job: score existing results in a report")
@http(method: "POST", uri: "/v2/evaluators/{evaluatorName}/jobs/score")
operation SubmitScoringJob {
    input: SubmitScoringJobInput
    output: SubmitScoringJobOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure SubmitScoringJobInput with [SubmitJobInputMixin] {
    @required
    @httpLabel
    @documentation("Name of the evaluator")
    evaluatorName: String

    @documentation("Report ID to store results in (can be combined with testResults; mutually exclusive with sourceReportId)")
    reportId: ResourceId

    @documentation("Source report ID to copy results from for re-scoring into a new report (mutually exclusive with reportId and testResults)")
    sourceReportId: ResourceId

    @documentation("Inline test results with pre-existing outputs for scoring (mutually exclusive with sourceReportId)")
    testResults: InlineTestResultList

    @documentation("Scorer configurations keyed by scorer name")
    scorers: ScorerMap
}

@output
structure SubmitScoringJobOutput with [SubmitJobOutputMixin] {}
