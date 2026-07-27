$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

use com.amzn.aws.pse.genaietk.common#Uuid

@documentation("Status of the dataset indicating whether it can be modified")
enum DatasetStatus {
    @documentation("Dataset is active and can be modified")
    ACTIVE

    @documentation("Dataset is frozen and cannot be modified")
    FROZEN
}

@mixin
structure DatasetRequest {
    @documentation("Name of the dataset")
    @required
    name: String

    @documentation("Description of the dataset")
    description: String
}

@documentation("Represents a dataset containing test cases for AI model evaluation")
structure Dataset with [DatasetRequest] {
    @documentation("Unique identifier for the dataset")
    @required
    datasetId: Uuid

    @documentation("Latest version of the dataset")
    currentVersion: Integer

    @documentation("Timestamp indicating when the dataset was created")
    @required
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Context about the creation of this dataset (e.g. identity or execution id)")
    @required
    source: String

    @documentation("Status of the dataset")
    @required
    status: DatasetStatus
}

@documentation("A list of datasets")
list Datasets {
    member: Dataset
}
