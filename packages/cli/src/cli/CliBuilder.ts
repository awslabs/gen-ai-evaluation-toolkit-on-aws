import { setConfig, supportedOutputFormats } from '@src/config';
import { addCommandGroupFromApi } from '@src/cli/commandBuilder';
import { Command, Option } from 'commander';
import { launchExperimentUI } from '@src/mlflow';
import { getExperimentOutput } from '@src/experiment';
import { createOrUpdateConfiguration } from '@src/evaluation';
import { resolveConfig } from '@src/evaluation/configResolver';

type CliProps = { name: string; description: string; version: string };

export class CliBuilder {
  private readonly program: Command;

  constructor({ name, description, version }: CliProps) {
    this.program = new Command()
      .name(name)
      .description(description)
      .version(version, '-v')
      .addOption(
        new Option('--output [output]', 'Output Format')
          .choices(supportedOutputFormats)
          .default(supportedOutputFormats[0]),
      )
      .hook('preAction', (thisCommand) => setConfig(thisCommand.opts()))
      .showHelpAfterError();
  }

  public addGenerationCommand(): CliBuilder {
    const generationCommand = this.program.command('generation').description('Ground truth generation commands');

    const jobCommand = generationCommand.command('job').description('Job management commands');

    addCommandGroupFromApi(jobCommand, {
      start: (c) => c.StartGenerationCommand,
      stop: (c) => c.StopGenerationCommand,
      get: (c) => c.GetGenerationCommand,
      list: (c) => c.ListGenerationsCommand,
    });
    return this;
  }

  public addDatastoreCommand(): CliBuilder {
    const dsCommand = this.program.command('dataset').description('Dataset and test-case management commands');

    addCommandGroupFromApi(dsCommand, {
      create: (c) => c.CreateDatasetCommand,
      get: (c) => c.GetDatasetCommand,
      list: (c) => c.ListDatasetsCommand,
      'get-version': (c) => c.GetDatasetVersionCommand,
      delete: (c) => c.DeleteDatasetCommand,
      'list-versions': (c) => c.ListDatasetVersionsCommand,
      'create-version': (c) => c.CreateDatasetVersionCommand,
      'create-test-case': (c) => c.CreateTestCaseCommand,
      'list-test-cases': (c) => c.ListTestCasesCommand,
      'delete-test-case': (c) => c.DeleteTestCaseCommand,
      'get-test-case': (c) => c.GetTestCaseCommand,
      restore: (c) => c.RestoreDatasetCommand,
      'create-annotation-schema': (c) => c.CreateAnnotationSchemaCommand,
      'get-annotation-schema': (c) => c.GetAnnotationSchemaCommand,
      'list-annotation-schemas': (c) => c.ListAnnotationSchemasCommand,
      'archive-annotation-schema': (c) => c.ArchiveAnnotationSchemaCommand,
      'put-version-annotation': (c) => c.PutDatasetVersionAnnotationCommand,
      'delete-version-annotation': (c) => c.DeleteDatasetVersionAnnotationCommand,
      'put-testcase-annotation': (c) => c.PutTestCaseAnnotationCommand,
      'delete-testcase-annotation': (c) => c.DeleteTestCaseAnnotationCommand,
    });

    return this;
  }

  public addEvaluationCommand(): CliBuilder {
    const evaluationCommand = this.program.command('eval').description('Evaluation commands');
    const evalConfigureCommand = evaluationCommand.command('config').description('Maintain evaluation configurations');

    addCommandGroupFromApi(evalConfigureCommand, {
      get: (c) => c.GetConfigurationCommand,
      list: (c) => c.ListConfigurationsCommand,
    });

    evalConfigureCommand
      .command('create')
      .description('Creates a stored configuration for evaluation job')
      .requiredOption('-n, --name <name>', 'Config name')
      .requiredOption('-cf, --config-file <configFile>', 'Config file path')
      .action(createOrUpdateConfiguration('Evaluation', 'create'));
    evalConfigureCommand
      .command('update')
      .description('Updates a stored configuration for evaluation job')
      .requiredOption('-n, --name <name>', 'Config name')
      .requiredOption('-cf, --config-file <configFile>', 'Config file path')
      .action(createOrUpdateConfiguration('Evaluation', 'update'));

    const jobCommand = evaluationCommand.command('job').description('Job management commands');

    addCommandGroupFromApi(jobCommand, {
      submit: (c) => c.SubmitEvaluationJobCommand,
      'submit-scoring': (c) => c.SubmitScoringJobCommand,
      'submit-invoke': (c) => c.SubmitAppInvocationJobCommand,
      get: (c) => c.GetEvaluatorJobCommand,
      list: (c) => c.ListJobsCommand,
    });

    // Add --config (and optional --config-version) to all submit commands (fetches stored config)
    for (const name of ['submit', 'submit-scoring', 'submit-invoke']) {
      const cmd = jobCommand.commands.find((c) => c.name() === name);
      if (cmd) {
        cmd.addOption(
          new Option(
            '--config <configName>',
            'Name of a stored evaluation config (from eval config create). Populates scorers if not supplied inline.',
          ),
        );
        cmd.addOption(
          new Option(
            '--config-version <configVersion>',
            'Optional version of the stored config to pin to (default: latest). Requires --config. Mirrors `eval schedule create --config-version`.',
          ).argParser((v) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isFinite(n) || n < 1) {
              throw new Error(`--config-version must be a positive integer (got '${v}')`);
            }
            return n;
          }),
        );
        cmd.hook('preAction', async (thisCommand: Command) => {
          const opts = thisCommand.opts();
          if (opts.configVersion !== undefined && !opts.config) {
            throw new Error('--config-version requires --config');
          }
          if (opts.config && !opts.scorers && !opts.scorersFile) {
            const versionOpt = opts.configVersion as number | undefined;
            try {
              const evalConfig = await resolveConfig(opts.config as string, versionOpt);
              if (evalConfig.scorers) opts.scorers = evalConfig.scorers;
              if (evalConfig.app && !opts.app) opts.app = evalConfig.app;
            } catch (error) {
              const versionSuffix = versionOpt !== undefined ? ` version ${versionOpt}` : '';
              throw new Error(
                `Failed to resolve config '${opts.config}'${versionSuffix}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        });
      }
    }

    const scheduleCommand = evaluationCommand.command('schedule').description('Schedule management commands');

    addCommandGroupFromApi(scheduleCommand, {
      create: (c) => c.CreateJobSchedulerCommand,
      get: (c) => c.GetJobSchedulerCommand,
      list: (c) => c.ListJobSchedulersCommand,
      update: (c) => c.UpdateJobSchedulerCommand,
      delete: (c) => c.DeleteJobSchedulerCommand,
    });

    const reportCommand = evaluationCommand.command('report').description('Test report management commands');

    addCommandGroupFromApi(reportCommand, {
      create: (c) => c.CreateReportCommand,
      get: (c) => c.GetReportCommand,
      list: (c) => c.ListReportsCommand,
      delete: (c) => c.DeleteReportCommand,
    });

    const resultCommand = evaluationCommand.command('result').description('Test result management commands');

    addCommandGroupFromApi(resultCommand, {
      get: (c) => c.GetTestResultCommand,
      list: (c) => c.ListTestResultsCommand,
      'batch-create': (c) => c.BatchCreateResultsCommand,
      'batch-update-scores': (c) => c.BatchUpdateScoresCommand,
      'batch-delete': (c) => c.BatchDeleteResultsCommand,
    });

    return this;
  }

  public addExperimentationCommand(): CliBuilder {
    const experimentCommand = this.program.command('experiment').description('Experimentation commands');

    addCommandGroupFromApi(experimentCommand, {
      create: (c) => c.CreateExperimentCommand,
      update: (c) => c.UpdateExperimentCommand,
      get: (c) => c.GetExperimentCommand,
      list: (c) => c.ListExperimentsCommand,
      delete: (c) => c.DeleteExperimentCommand,
      'list-outputs': (c) => c.ListExperimentOutputsCommand,
    });

    experimentCommand
      .command('get-output')
      .description('retrieves output for the latest run in a given experiment for the specified version.')
      .requiredOption('-n, --name <name>', 'Name of the experiment')
      .requiredOption('--version <version>', 'Experiment version to fetch latest run.')
      .action(getExperimentOutput);

    experimentCommand
      .command('launch-ui')
      .description('Launches the MLFlow UI for experiment analysis')
      .action(launchExperimentUI);

    return this;
  }

  public build(): Command {
    this.program.configureOutput({
      outputError: (str, write) => write(`Error: ${str.split('\n')[0]}`),
    });

    return this.program;
  }
}
