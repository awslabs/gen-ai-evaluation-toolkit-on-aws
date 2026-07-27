$version: "2"

namespace com.amzn.aws.pse.genaietk.experiment.operation

use com.amzn.aws.pse.genaietk.error#InternalServerException
use com.amzn.aws.pse.genaietk.error#ResourceNotFoundException
use com.amzn.aws.pse.genaietk.error#ThrottlingException
use com.amzn.aws.pse.genaietk.error#UnauthorizedException
use com.amzn.aws.pse.genaietk.experimentation.entity#ExperimentList
use com.amzn.aws.pse.genaietk.experimentation.entity#OrderByList
use com.amzn.aws.pse.genaietk.experimentation.entity#ViewType
use com.amzn.aws.pse.genaietk.mixin#PaginatedInput
use com.amzn.aws.pse.genaietk.mixin#PaginatedOutput
use smithy.framework#ValidationException

@paginated(inputToken: "nextToken", outputToken: "nextToken", pageSize: "maxResults", items: "experiments")
@documentation("Lists experiments")
@http(method: "POST", uri: "/experiments/list")
operation ListExperiments {
    input: ListExperimentsRequest
    output: ListExperimentsResponse
    errors: [
        ValidationException
        UnauthorizedException
        ThrottlingException
        InternalServerException
        ResourceNotFoundException
    ]
}

@input
structure ListExperimentsRequest with [PaginatedInput] {
    @documentation("A filter expression over experiment attributes and tags that allows returning a subset of experiments. The syntax is a subset of SQL that supports ANDing together binary operations between an attribute or tag, and a constant. See: https://mlflow.org/docs/latest/ml/search/search-runs/#search-runs-syntax")
    @length(max: 1024)
    filter: String

    @documentation("List of columns for ordering search results, which can include experiment name and id with an optional 'DESC' or 'ASC' annotation, where 'ASC' is the default. Tiebreaks are done by experiment id DESC.")
    orderBy: OrderByList

    @documentation("Qualifier for type of experiments to be returned. If unspecified, return only active experiments.")
    viewType: ViewType
}

@output
structure ListExperimentsResponse with [PaginatedOutput] {
    @required
    @documentation("Experiments that match the search criteria")
    experiments: ExperimentList
}
