$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.operation

use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.evaluation.entity#JobSchedulerSummaryList
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@documentation("Lists all evaluation job schedules.")
@readonly
@http(method: "GET", uri: "/evaluation-schedulers")
operation ListJobSchedulers {
    input: ListJobSchedulersInput
    output: ListJobSchedulersOutput
    errors: [
        ValidationException
        ThrottlingException
    ]
}

@input
structure ListJobSchedulersInput with [PaginatedInput] {}

@output
structure ListJobSchedulersOutput with [PaginatedOutput] {
    @required
    jobSchedulers: JobSchedulerSummaryList
}
