$version: "2.0"

namespace com.amzn.aws.pse.genaietk.error

@documentation("UnauthorizedException is thrown when request is missing or has bad auth")
@error("client")
@httpError(401)
structure UnauthorizedException {
    @required
    message: String
}

@documentation("ResourceNotFoundException is thrown when request references a resource which does not exist")
@error("client")
@httpError(404)
structure ResourceNotFoundException {
    @required
    message: String
}

@documentation("ConflictException is thrown when a request to update or delete a resource can cause an inconsistent state")
@error("client")
@httpError(409)
structure ConflictException {
    @required
    message: String
}

@documentation("ThrottlingException is thrown when request was denied due to request throttling")
@error("client")
@retryable
@httpError(429)
structure ThrottlingException {
    @required
    message: String

    @httpHeader("Retry-After")
    retryAfterSeconds: smithy.api#Integer
}

@documentation("Unprocessable entity exception is thrown when request violates business logic")
@error("client")
@httpError(422)
structure UnprocessableEntityException {
    @required
    message: String
}

@documentation("InternalServerException is thrown when unexpected error occurs during processing of request")
@error("server")
@retryable
@httpError(500)
structure InternalServerException {
    @required
    message: String

    @httpHeader("Retry-After")
    retryAfterSeconds: smithy.api#Integer
}

@documentation("InvalidTokenException is thrown when the user provided token is invalid")
@error("client")
structure InvalidToken {
    @required
    message: String
}

@documentation("ExecutionLimitExceededException is thrown when too many concurrent stepfunction executions are running")
@error("client")
structure ExecutionLimitExceeded {
    @required
    message: String
}
