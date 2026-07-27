$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.operation

use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.evaluation.entity#JobScheduler
use com.amzn.aws.pse.genaietk.evaluation.entity#JobSchedulerId
use smithy.framework#ValidationException

@documentation("Gets evaluation job scheduler details")
@readonly
@http(method: "GET", uri: "/evaluation-schedulers/{name}")
operation GetJobScheduler {
    input: GetJobSchedulerInput
    output: GetJobSchedulerOutput
    errors: [
        ValidationException
        ResourceNotFoundException
        ThrottlingException
    ]
}

@input
structure GetJobSchedulerInput with [JobSchedulerId] {
    @httpLabel
    name: String
}

@output
structure GetJobSchedulerOutput with [JobScheduler] {}
