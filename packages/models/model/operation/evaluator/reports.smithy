$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluator.operation

use com.amzn.aws.pse.genaietk.common#ResourceId
use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

// =============================================================================
// Report Entity
// =============================================================================
@documentation("Status of a report")
enum ReportStatus {
    @documentation("Report is active and accepting results")
    ACTIVE

    @documentation("Report is being deleted")
    DELETING
}

@documentation("Arbitrary metadata map for reports")
map ReportMetadata {
    key: String
    value: Document
}

@documentation("Container for test results from an evaluation")
structure Report {
    @required
    @documentation("Unique identifier for this report")
    reportId: ResourceId

    @required
    @documentation("Human-readable name for the report")
    name: String

    @documentation("Optional description of the report")
    description: String

    @documentation("Experiment name for grouping related reports")
    experimentName: String

    @required
    @documentation("Status of the report")
    status: ReportStatus

    @documentation("IDs of jobs associated with this report")
    jobIds: JobIdList

    @documentation("Arbitrary metadata")
    metadata: ReportMetadata

    @documentation("Timestamp when report was created")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Timestamp when report was last updated")
    @timestampFormat("date-time")
    updatedAt: Timestamp
}

// =============================================================================
// CreateReport
// =============================================================================
@documentation("Create a new report to store test results")
@http(method: "POST", uri: "/v2/reports")
operation CreateReport {
    input: CreateReportInput
    output: CreateReportOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure CreateReportInput {
    @required
    @documentation("Human-readable name for the report")
    name: String

    @documentation("Optional description of the report")
    description: String

    @documentation("Experiment name for grouping related reports")
    experimentName: String

    @documentation("Arbitrary metadata")
    metadata: ReportMetadata
}

@output
structure CreateReportOutput {
    @required
    @documentation("The created report")
    report: Report
}

// =============================================================================
// GetReport
// =============================================================================
@documentation("Get a report by ID")
@readonly
@http(method: "GET", uri: "/v2/reports/{reportId}")
operation GetReport {
    input: GetReportInput
    output: GetReportOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure GetReportInput {
    @required
    @httpLabel
    @documentation("ID of the report to retrieve")
    reportId: ResourceId
}

@output
structure GetReportOutput {
    @required
    @documentation("The requested report")
    report: Report
}

// =============================================================================
// ListReports
// =============================================================================
@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "reports")
@documentation("List all reports. Default maxResults is 50 if not specified.")
@readonly
@http(method: "GET", uri: "/v2/reports")
operation ListReports {
    input: ListReportsInput
    output: ListReportsOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure ListReportsInput with [PaginatedInput] {}

@output
structure ListReportsOutput with [PaginatedOutput] {
    @required
    @documentation("List of reports")
    reports: ReportList
}

list ReportList {
    member: Report
}

// =============================================================================
// DeleteReport
// =============================================================================
@documentation("Delete a report and all its results")
@idempotent
@http(method: "DELETE", uri: "/v2/reports/{reportId}")
operation DeleteReport {
    input: DeleteReportInput
    output: DeleteReportOutput
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
    ]
}

@input
structure DeleteReportInput {
    @required
    @httpLabel
    @documentation("ID of the report to delete")
    reportId: ResourceId
}

@output
structure DeleteReportOutput {}

// Uncapped list for job IDs on reports (unlike ResourceIdList which has @length max: 25)
list JobIdList {
    member: ResourceId
}
