import { ServiceInputTypes, ServiceOutputTypes } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { renderTemplate } from '../../../src/templates/render';
import { getConfig } from '@src/config';
import { testCases } from './testCases';
import { createMockValue } from './autoMockFactories';
import { AvailableCommands, GenAiEtkCommandAccessor } from '@src/cli';

jest.mock('@src/config');

export type TestCaseMapping = Record<string, (ns: AvailableCommands) => unknown>;

export function createSnapshotTests(commandGroup: keyof typeof testCases) {
  const getConfigMock = jest.mocked(getConfig);
  const logs: string[] = [];
  jest.spyOn(console, 'log').mockImplementation((msg) => logs.push(msg));
  beforeEach(() => {
    getConfigMock.mockReturnValue({ output: 'text' });
  });

  const originalArgv = process.argv;
  afterEach(() => {
    process.argv = originalArgv;
    logs.length = 0;
  });

  Object.entries(testCases[commandGroup]).forEach(([view, command]) => {
    const modelData = createMockValue(command as GenAiEtkCommandAccessor<ServiceInputTypes, ServiceOutputTypes>);
    const commandPath = view.split('/');

    test(`"genai-etk ${commandPath.join(' ')}" rendered by /views/${view}.hbs `, async () => {
      process.argv = ['node', 'genai-etk', ...commandPath];

      await renderTemplate(`views/${view}`, modelData);
      expect(logs).toHaveLength(1);

      // Standardise timestamps which are in local time format
      const template = logs[0].replace(
        /^\s*((Created)|(Updated)|(Last updated)|(Stopped)|(Annotated)) At: .*$/gim,
        '$1 At: <timestamp>',
      );

      expect(template).toMatchSnapshot('Populated');
    });
  });
}
