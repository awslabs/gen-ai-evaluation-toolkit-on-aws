import pkg from '../../package.json';
import { CliBuilder } from './CliBuilder';

export const program = new CliBuilder({
  name: 'genai-etk',
  description: pkg.description,
  version: pkg.version,
})
  .addDatastoreCommand()
  .addEvaluationCommand()
  .addExperimentationCommand()
  .addGenerationCommand()
  .build();
