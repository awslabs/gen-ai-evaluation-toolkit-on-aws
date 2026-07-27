from logging import getLogger

from experiment_lambda.api.utils.api_models import EvaluatorConfiguration
from experiment_lambda.eventbridge.utils.eventbridge_lambda_handler import (
    create_eventbridge_lambda_handler,
)
from experiment_lambda.eventbridge.utils.eventbridge_models import (
    Config,
    ConfigurationReportingDetail,
    EmptyResponse,
    ResourceNotFoundException,
)
from experiment_lambda.protocols import MlflowTagIds
from experiment_lambda.utils.mlflow_client import get_mlflow_client
from experiment_lambda.utils.storage_models import (
    MlflowLogStorageModel,
    PluginConfiguration,
)

logger = getLogger(__name__)


def report_configuration(detail: ConfigurationReportingDetail) -> EmptyResponse:
    """
    Lambda handler to report parameters for an MLflow experiment run.

    Args:
        detail: Details of the configuration reporting event
        context: Lambda context

    Returns:
        Response with status code and run details
    """
    logger.info(f"Param Reporting for experimentName {detail.experimentName} and runId {detail.runId}")

    client = get_mlflow_client()

    experiment = client.get_experiment_by_name(detail.experimentName)
    if not experiment:
        raise ResourceNotFoundException(f"Experiment '{detail.experimentName}' not found")

    # Create a new run
    run = client.create_run(experiment_id=experiment.experiment_id, run_name=detail.runId)

    params = MlflowLogStorageModel(
        testDataUrl=f"{detail.config.testData.bucketName}/{detail.config.testData.prefix}",
        appId=detail.config.appId,
        plugins=collect_plugin_configuratons(detail.config),
    )

    for key, value in params.model_dump_for_storage().items():
        client.log_param(run.info.run_id, key, value)

    # Log config version as a metric
    client.log_metric(
        run_id=run.info.run_id,
        key=MlflowTagIds.configuration_version,
        value=detail.config.version,
    )

    logger.info(
        f"Param Reporting for experimentName {detail.experimentName} and runId {detail.runId} completed successfully"
    )

    return EmptyResponse()


def collect_plugin_configuratons(src: Config) -> list[PluginConfiguration]:
    """
    Extract all plugins with their evaluators.

    Returns:
        List of plugin configurations
    """
    if not src.plugins:
        return []

    return [
        PluginConfiguration(
            plugin=plugin.plugin,
            evaluators=[
                EvaluatorConfiguration(
                    name=evaluator.name if evaluator.name else evaluator.builtIn,
                    params=evaluator.params
                )
                for evaluator in plugin.configuration.evaluators
            ],
        )
        for plugin in src.plugins
    ]


handler = create_eventbridge_lambda_handler(
    input_model=ConfigurationReportingDetail,
    output_model=EmptyResponse,
    operation=report_configuration,
)
