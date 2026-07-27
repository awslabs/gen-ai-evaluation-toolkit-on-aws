$version: "2.0"

namespace com.amzn.aws.pse.genaietk

use aws.api#service
use aws.auth#sigv4
use aws.protocols#restJson1
use com.amzn.aws.pse.genaietk.datastore.operation#ArchiveAnnotationSchema
use com.amzn.aws.pse.genaietk.datastore.operation#CreateAnnotationSchema
use com.amzn.aws.pse.genaietk.datastore.operation#CreateDataset
use com.amzn.aws.pse.genaietk.datastore.operation#CreateDatasetVersion
use com.amzn.aws.pse.genaietk.datastore.operation#CreateTestCase
use com.amzn.aws.pse.genaietk.datastore.operation#DeleteDataset
use com.amzn.aws.pse.genaietk.datastore.operation#DeleteDatasetVersionAnnotation
use com.amzn.aws.pse.genaietk.datastore.operation#DeleteTestCase
use com.amzn.aws.pse.genaietk.datastore.operation#DeleteTestCaseAnnotation
use com.amzn.aws.pse.genaietk.datastore.operation#GetAnnotationSchema
use com.amzn.aws.pse.genaietk.datastore.operation#GetDataset
use com.amzn.aws.pse.genaietk.datastore.operation#GetDatasetVersion
use com.amzn.aws.pse.genaietk.datastore.operation#GetTestCase
use com.amzn.aws.pse.genaietk.datastore.operation#ListAnnotationSchemas
use com.amzn.aws.pse.genaietk.datastore.operation#ListDatasetVersions
use com.amzn.aws.pse.genaietk.datastore.operation#ListDatasets
use com.amzn.aws.pse.genaietk.datastore.operation#ListTestCases
use com.amzn.aws.pse.genaietk.datastore.operation#PutDatasetVersionAnnotation
use com.amzn.aws.pse.genaietk.datastore.operation#PutTestCaseAnnotation
use com.amzn.aws.pse.genaietk.datastore.operation#RestoreDataset
use com.amzn.aws.pse.genaietk.evaluation.operation#CreateJobScheduler
use com.amzn.aws.pse.genaietk.evaluation.operation#DeleteJobScheduler
use com.amzn.aws.pse.genaietk.evaluation.operation#GetJobScheduler
use com.amzn.aws.pse.genaietk.evaluation.operation#ListJobSchedulers
use com.amzn.aws.pse.genaietk.evaluation.operation#UpdateJobScheduler
use com.amzn.aws.pse.genaietk.evaluator.operation#BatchCreateResults
use com.amzn.aws.pse.genaietk.evaluator.operation#BatchDeleteResults
use com.amzn.aws.pse.genaietk.evaluator.operation#BatchUpdateScores
use com.amzn.aws.pse.genaietk.evaluator.operation#CreateReport
use com.amzn.aws.pse.genaietk.evaluator.operation#DeleteReport
use com.amzn.aws.pse.genaietk.evaluator.operation#GetEvaluatorJob
use com.amzn.aws.pse.genaietk.evaluator.operation#GetReport
use com.amzn.aws.pse.genaietk.evaluator.operation#GetTestResult
use com.amzn.aws.pse.genaietk.evaluator.operation#ListJobs
use com.amzn.aws.pse.genaietk.evaluator.operation#ListReports
use com.amzn.aws.pse.genaietk.evaluator.operation#ListTestResults
use com.amzn.aws.pse.genaietk.evaluator.operation#SubmitAppInvocationJob
use com.amzn.aws.pse.genaietk.evaluator.operation#SubmitEvaluationJob
use com.amzn.aws.pse.genaietk.evaluator.operation#SubmitScoringJob
use com.amzn.aws.pse.genaietk.evaluator.operation#UpdateEvaluatorJobStatus
use com.amzn.aws.pse.genaietk.experiment.operation#CreateExperiment
use com.amzn.aws.pse.genaietk.experiment.operation#DeleteExperiment
use com.amzn.aws.pse.genaietk.experiment.operation#GetExperiment
use com.amzn.aws.pse.genaietk.experiment.operation#ListExperimentOutputs
use com.amzn.aws.pse.genaietk.experiment.operation#ListExperiments
use com.amzn.aws.pse.genaietk.experiment.operation#UpdateExperiment
use com.amzn.aws.pse.genaietk.experimentation.operation#CreateConfiguration
use com.amzn.aws.pse.genaietk.experimentation.operation#GetConfiguration
use com.amzn.aws.pse.genaietk.experimentation.operation#ListConfigurations
use com.amzn.aws.pse.genaietk.experimentation.operation#UpdateConfiguration
use com.amzn.aws.pse.genaietk.generation.operation#GetGeneration
use com.amzn.aws.pse.genaietk.generation.operation#ListGenerations
use com.amzn.aws.pse.genaietk.generation.operation#StartGeneration
use com.amzn.aws.pse.genaietk.generation.operation#StopGeneration

@title("Gen AI Evaluation Toolkit Service")
@service(sdkId: "GenAiEvaluationToolkit")
// Defines the generated SDK class names
@sigv4(name: "execute-api")
// Required for API GW IAM auth
@restJson1
service GenAiEtk {
    version: "2.0.0"
    operations: [
        // Datastore
        ListDatasets
        CreateDataset
        GetDataset
        CreateDatasetVersion
        ListDatasetVersions
        GetDatasetVersion
        ListTestCases
        CreateTestCase
        DeleteTestCase
        GetTestCase
        RestoreDataset
        DeleteDataset
        CreateAnnotationSchema
        ListAnnotationSchemas
        GetAnnotationSchema
        ArchiveAnnotationSchema
        PutDatasetVersionAnnotation
        DeleteDatasetVersionAnnotation
        PutTestCaseAnnotation
        DeleteTestCaseAnnotation
        // Evaluation
        ListJobSchedulers
        CreateJobScheduler
        DeleteJobScheduler
        GetJobScheduler
        UpdateJobScheduler
        // Evaluator Jobs
        SubmitEvaluationJob
        SubmitScoringJob
        SubmitAppInvocationJob
        GetEvaluatorJob
        ListJobs
        UpdateEvaluatorJobStatus
        // Reports (SDK v2)
        CreateReport
        GetReport
        ListReports
        DeleteReport
        // Test Results (SDK v2)
        GetTestResult
        ListTestResults
        BatchCreateResults
        BatchUpdateScores
        BatchDeleteResults
        // Experiment
        CreateExperiment
        GetExperiment
        ListExperiments
        ListExperimentOutputs
        UpdateExperiment
        DeleteExperiment
        // ExperimentationConfiguration
        CreateConfiguration
        GetConfiguration
        UpdateConfiguration
        ListConfigurations
        ListGenerations
        StartGeneration
        GetGeneration
        StopGeneration
    ]
}
