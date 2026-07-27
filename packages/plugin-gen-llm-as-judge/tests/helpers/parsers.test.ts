import { Readable } from 'stream';
import { parseJobResponseValidatedTestCases } from '../../src/helpers';
import { TestCase } from '../../src/models';

describe('parseJobResponseValidatedTestCases', () => {
  beforeAll(() => {
    console.warn = jest.fn();
  });

  it('should successfully parse valid job responses', async () => {
    const testCase = { input: 'Test Q?', expected: 'Test A', context: ['This is test context'] };

    const jobResponse = {
      modelInput: {
        max_tokens: 1000,
        anthropic_version: '1.0',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify(testCase),
              },
            ],
          },
        ],
      },
      modelOutput: {
        id: 'test-id',
        type: 'text',
        role: 'assistant',
        model: 'test-model',
        stop_reason: 'stop',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [
          {
            type: 'text',
            text: 'Here are the test cases: {"valid": "true"} End of test cases.',
          },
        ],
      },
      recordId: 'test-record',
    };

    const stream = new Readable();
    stream.push(JSON.stringify(jobResponse) + '\n');
    stream.push(null);

    const results: TestCase[] = [];
    for await (const testCase of parseJobResponseValidatedTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([
      {
        input: 'Test Q?',
        expected: 'Test A',
        context: ['This is test context'],
        valid: true,
      },
    ]);
  });

  it('should skip invalid job response lines', async () => {
    const stream = new Readable();
    stream.push('this is not json\n');
    stream.push(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const results: TestCase[] = [];

    for await (const testCase of parseJobResponseValidatedTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse line'));
    consoleSpy.mockRestore();
  });

  it('should skip responses with invalid test cases format', async () => {
    const modelInput = {
      max_tokens: 1000,
      anthropic_version: '1.0',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                input: 'some question',
                expected: 'some answer',
                context: ['some context'],
              }),
            },
          ],
        },
      ],
    };

    const modelOutput = {
      id: 'test-id',
      type: 'text',
      role: 'assistant',
      model: 'test-model',
      stop_reason: 'stop',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    };

    const responses = [
      {
        modelInput,
        modelOutput: {
          ...modelOutput,
          content: [
            {
              type: 'text',
              text: 'Here are invalid test cases: [{"invalid": "format"}] End.',
            },
          ],
        },
        recordId: 'record-1',
      },
      {
        modelInput,
        modelOutput: {
          ...modelOutput,
          content: [],
        },
        recordId: 'record-2',
      },
      {
        modelInput,
        modelOutput: {
          ...modelOutput,
          content: [{ type: 'text' }],
        },
        recordId: 'record-3',
      },
    ];

    const stream = new Readable();
    responses.forEach((res) => stream.push(JSON.stringify(res) + '\n'));
    stream.push(null);

    const results: TestCase[] = [];

    for await (const testCase of parseJobResponseValidatedTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([]);
  });

  it('should skip responses with invalid input format', async () => {
    const testCase: TestCase = { input: 'question?', expected: 'answer', context: ['context'] };

    const jobResponse = {
      modelInput: {
        max_tokens: 1000,
        anthropic_version: '1.0',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify(testCase),
              },
            ],
          },
        ],
      },
      modelOutput: {
        id: 'test-id',
        type: 'text',
        role: 'assistant',
        model: 'test-model',
        stop_reason: 'stop',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [
          {
            type: 'text',
            text: 'Here are the test cases: {"valid": "true"} End of test cases.',
          },
        ],
      },
      recordId: 'test-record',
    };

    const responses = [
      {
        ...jobResponse,
        modelInput: {
          ...jobResponse.modelInput,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Invalid JSON',
                },
              ],
            },
          ],
        },
      },
      {
        ...jobResponse,
        modelInput: {
          ...jobResponse.modelInput,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '{"mismatching": "schema"}',
                },
              ],
            },
          ],
        },
      },
      {
        ...jobResponse,
        modelInput: {
          ...jobResponse.modelInput,
          messages: [
            {
              role: 'user',
              content: [],
            },
          ],
        },
      },
      {
        ...jobResponse,
        modelInput: {
          ...jobResponse.modelInput,
          messages: [],
        },
      },
      jobResponse,
    ];

    const stream = new Readable();
    responses.forEach((res) => stream.push(JSON.stringify(res) + '\n'));
    stream.push(null);

    const results: TestCase[] = [];

    for await (const testCase of parseJobResponseValidatedTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([{ ...testCase, valid: true }]);
  });
});
