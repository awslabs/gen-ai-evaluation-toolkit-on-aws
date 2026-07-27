$version: "2.0"

namespace com.amzn.aws.pse.genaietk.mixin

use com.amzn.aws.pse.genaietk.common#JobId
use com.amzn.aws.pse.genaietk.common#PaginationToken
use com.amzn.aws.pse.genaietk.common#Uuid
use com.amzn.aws.pse.genaietk.common#VersionString
use com.amzn.aws.pse.genaietk.common.entity#ConditionExpression
use com.amzn.aws.pse.genaietk.common.entity#StepFunctionJobStatus
use com.amzn.aws.pse.genaietk.datastore.entity#AnnotationConditionExpression

@mixin
structure RequestWithDatasetIdLabel {
    @documentation("Unique identifier of the dataset")
    @required
    @httpLabel
    datasetId: Uuid
}

@mixin
structure RequestWithVersionStringLabel {
    @required
    @httpLabel
    @default("head")
    @documentation("Version number or tag")
    version: VersionString
}

@mixin
structure RequestWithVersionLabel {
    @range(min: 1)
    @required
    @httpLabel
    @documentation("Version number")
    version: Integer
}

@mixin
structure RequestWithTestCaseIdLabel {
    @required
    @httpLabel
    @documentation("Unique identifier of the testcase")
    testCaseId: Uuid
}

@mixin
structure RequestWithAnnotationNameLabel {
    @required
    @httpLabel
    @length(min: 1)
    @documentation("Name of the annotation schema")
    annotationName: String
}

@mixin
structure RequestWithExperimentName {
    @documentation("The unique identifier of the experiment")
    @required
    @httpLabel
    name: String
}

@mixin
structure PaginatedInput {
    @documentation("Maximum number of results to return")
    @httpQuery("maxResults")
    @default(50)
    @range(min: 1, max: 200)
    maxResults: Integer

    @documentation("Pagination token for next page of results")
    @httpQuery("nextToken")
    nextToken: PaginationToken
}

@mixin
structure PaginatedOutput {
    @documentation("Pagination token for next page of results")
    nextToken: PaginationToken
}

@mixin
structure RequestWithJobId {
    @documentation("Unique identifier of the job")
    @required
    @httpLabel
    id: JobId
}

@mixin
structure FilterByAnnotationValue {
    @documentation("Filter by matching annotation conditions")
    filter: AnnotationConditionExpression
}

@mixin
structure FilterByCondition {
    @documentation("Filter by matching conditions")
    filter: ConditionExpression
}

@mixin
structure FilterByJobStatus {
    @httpQuery("statusFilter")
    @documentation("Filter by matching job status")
    statusFilter: StepFunctionJobStatus
}

@mixin
structure FilterByScheduleName {
    @documentation("Filter by matching schedule name")
    @httpQuery("scheduleName")
    scheduleName: String
}

@mixin
structure FilterByNamePrefix {
    @documentation("Filter by matching name (prefix)")
    name: String
}

@mixin
structure JobMetadata with [ExperimentTracking] {
    @documentation("Schedule name that this job is associated with")
    scheduleName: String
}

@mixin
structure ExperimentTracking {
    @documentation("Experiment name for Experiment tracking")
    experimentName: String

    @documentation("Configuration version for Experiment tracking")
    configVersion: Integer
}
