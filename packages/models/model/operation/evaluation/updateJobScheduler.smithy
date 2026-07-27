$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.evaluation.entity#JobScheduler
use com.amzn.aws.pse.genaietk.evaluation.entity#JobSchedulerId
use com.amzn.aws.pse.genaietk.evaluator.operation#AppConfig
use com.amzn.aws.pse.genaietk.evaluator.operation#InlineTestResultList
use com.amzn.aws.pse.genaietk.evaluator.operation#JobType
use com.amzn.aws.pse.genaietk.evaluator.operation#ScorerMap
use com.amzn.aws.pse.genaietk.evaluator.operation#TestDataSource
use smithy.framework#ValidationException

@documentation("Updates evaluation job scheduler (changes take immediate effect)")
@http(method: "PATCH", uri: "/evaluation-schedulers/{name}")
operation UpdateJobScheduler {
    input: UpdateJobSchedulerInput
    output: UpdateJobSchedulerOutput
    errors: [
        ValidationException
        ResourceNotFoundException
        ThrottlingException
    ]
}

@input
structure UpdateJobSchedulerInput with [JobSchedulerId] {
    @httpLabel
    name: String

    @documentation("Cron expression for scheduled evaluation")
    cron: String

    @documentation("Type of job to submit on each schedule trigger")
    jobType: JobType

    @documentation("Name of the evaluator to run")
    evaluatorName: String

    @documentation("Source of test cases")
    testCases: TestDataSource

    @documentation("Scorer configurations keyed by scorer name")
    scorers: ScorerMap

    @documentation("App invocation configuration")
    app: AppConfig

    @documentation("Source report ID to re-score (for SCORE jobs)")
    sourceReportId: ResourceId

    @documentation("Inline test results for scoring (for SCORE jobs)")
    testResults: InlineTestResultList

    @documentation("Experiment name for grouping scheduled runs")
    experimentName: String
}

@output
structure UpdateJobSchedulerOutput with [JobScheduler] {}
