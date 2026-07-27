$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.entity

@documentation("Summary information for a job scheduler")
structure JobSchedulerSummary with [JobSchedulerId] {
    @documentation("Timestamp when the scheduler was created")
    @required
    @timestampFormat("date-time")
    createdAt: Timestamp
}

@documentation("List of job scheduler summaries")
list JobSchedulerSummaryList {
    member: JobSchedulerSummary
}
