$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

use com.amzn.aws.pse.genaietk.common#TestDataMixin
use com.amzn.aws.pse.genaietk.common#Uuid

@documentation("Test case data without system-generated metadata")
structure TestCaseData with [TestDataMixin] {}

@documentation("A list of test-cases with only user provided data")
list TestCaseDataList {
    member: TestCaseData
}

@documentation("A complete test case including input, expected output, and system metadata")
structure TestCase with [TestDataMixin] {
    @documentation("Test case ID, also used as file name in S3")
    @required
    testCaseId: Uuid

    @documentation("The creator of the test case—either a username (for human creators) or an application identifier (for synthetic data generators)")
    createdBy: String

    @documentation("Timestamp indicating when the test-case was created.")
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Annotations associated with the dataset")
    annotations: Annotations
}

@documentation("A list of test-cases")
list TestCases {
    member: TestCase
}

@documentation("References a test case at S3")
structure TestCaseReference {
    @required
    id: String

    url: String
}

@documentation("A list of test case references")
list TestCaseReferences {
    member: TestCaseReference
}
