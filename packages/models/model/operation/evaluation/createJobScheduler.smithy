$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.operation

use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.evaluation.entity#JobScheduler
use com.amzn.aws.pse.genaietk.evaluation.entity#JobSchedulerRequest
use smithy.framework#ValidationException

@documentation("Creates an evaluation job schedule using the supplied job template. The schedule will immediately become active and create new jobs on the supplied cron expression.")
@http(method: "POST", uri: "/evaluation-schedulers")
operation CreateJobScheduler {
    input: CreateJobSchedulerInput
    output: CreateJobSchedulerOutput
    errors: [
        ValidationException
        ThrottlingException
    ]
}

@input
structure CreateJobSchedulerInput with [JobSchedulerRequest] {}

@output
structure CreateJobSchedulerOutput with [JobScheduler] {}
