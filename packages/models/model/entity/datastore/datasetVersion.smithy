$version: "2"

namespace com.amzn.aws.pse.genaietk.datastore.entity

use com.amzn.aws.pse.genaietk.common#S3Path
use com.amzn.aws.pse.genaietk.common#Uuid

@documentation("Immutable snapshot of a dataset at a specific point in time")
structure DatasetVersion {
    @documentation("Unique identifier of the parent dataset")
    @required
    datasetId: Uuid

    @documentation("Sequential version number")
    @required
    version: Integer

    @documentation("Timestamp when this version was created")
    @required
    @timestampFormat("date-time")
    createdAt: Timestamp

    @documentation("Username or identifier of who created this version")
    @required
    createdBy: String

    @documentation("S3 location where the immutable dataset snapshot is stored")
    s3Location: S3Path

    @documentation("Annotations attached to this version for metadata and categorization")
    annotations: Annotations
}

@documentation("A list of dataset Versions")
list Versions {
    member: DatasetVersion
}
