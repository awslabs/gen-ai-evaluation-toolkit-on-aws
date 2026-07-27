$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.entity

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.evaluator.operation#AppConfig
use com.amzn.aws.pse.genaietk.evaluator.operation#InlineTestResultList
use com.amzn.aws.pse.genaietk.evaluator.operation#JobType
use com.amzn.aws.pse.genaietk.evaluator.operation#ScorerMap
use com.amzn.aws.pse.genaietk.evaluator.operation#TestDataSource

@mixin
@documentation("Identifier for a job scheduler")
structure JobSchedulerId {
    @documentation("Unique name of the job scheduler")
    @required
    name: String
}

@mixin
@documentation("Job scheduler configuration for recurring evaluations")
structure JobScheduler with [JobSchedulerId, JobSchedulerRequest] {
    @documentation("Timestamp when the scheduler was created")
    @required
    @timestampFormat("date-time")
    createdAt: Timestamp
}

@mixin
@documentation("Request parameters for creating or updating a job scheduler. Fields required depend on jobType: FULL requires testCases + scorers, SCORE requires scorers + (sourceReportId or testResults), APP_INVOKE requires testCases.")
structure JobSchedulerRequest {
    @documentation("Cron expression defining when jobs should run (e.g., '0 0 * * *' for daily)")
    @required
    cron: String

    @documentation("Type of job to submit on each schedule trigger")
    @required
    jobType: JobType

    @documentation("Name of the evaluator to run")
    @required
    evaluatorName: String

    @documentation("Source of test cases (required for FULL and APP_INVOKE)")
    testCases: TestDataSource

    @documentation("Scorer configurations keyed by scorer name (required for FULL and SCORE)")
    scorers: ScorerMap

    @documentation("App invocation configuration (optional, for FULL and APP_INVOKE)")
    app: AppConfig

    @documentation("Source report ID to re-score (for SCORE jobs, mutually exclusive with testResults)")
    sourceReportId: ResourceId

    @documentation("Inline test results for scoring (for SCORE jobs, mutually exclusive with sourceReportId)")
    testResults: InlineTestResultList

    @documentation("Experiment name for grouping scheduled runs")
    experimentName: String
}
