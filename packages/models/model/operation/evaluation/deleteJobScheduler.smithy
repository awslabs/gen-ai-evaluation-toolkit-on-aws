$version: "2.0"

namespace com.amzn.aws.pse.genaietk.evaluation.operation

use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.evaluation.entity#JobScheduler
use com.amzn.aws.pse.genaietk.evaluation.entity#JobSchedulerId
use smithy.framework#ValidationException

@documentation("Deletes evaluation job scheduler (existing jobs unaffected)")
@idempotent
@http(method: "DELETE", uri: "/evaluation-schedulers/{name}")
operation DeleteJobScheduler {
    input: DeleteJobSchedulerInput
    output: DeleteJobSchedulerOutput
    errors: [
        ValidationException
        ResourceNotFoundException
        ThrottlingException
    ]
}

@input
structure DeleteJobSchedulerInput with [JobSchedulerId] {
    @httpLabel
    name: String
}

@output
structure DeleteJobSchedulerOutput with [JobScheduler] {}
