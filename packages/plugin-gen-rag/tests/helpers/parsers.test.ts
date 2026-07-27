import { Readable } from 'stream';
import { parseJobResponseTestCases } from '../../src/helpers';
import { TestCase } from '../../src/models';

describe('parseJobResponseTestCases', () => {
  beforeAll(() => {
    console.warn = jest.fn();
  });

  it('should successfully parse valid job responses', async () => {
    const validJobResponse = {
      modelInput: {
        max_tokens: 1000,
        anthropic_version: '1.0',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<context>This is test context</context>',
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
            text: 'Here are the test cases: [{"question": "Test Q?", "answer": "Test A"}] End of test cases.',
          },
        ],
      },
      recordId: 'test-record',
    };

    const stream = new Readable();
    stream.push(JSON.stringify(validJobResponse) + '\n');
    stream.push(null);

    const results: TestCase[] = [];
    for await (const testCase of parseJobResponseTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([
      {
        input: 'Test Q?',
        expected: 'Test A',
        context: ['This is test context'],
      },
    ]);
  });

  it('should skip invalid job response lines', async () => {
    const stream = new Readable();
    stream.push('this is not json\n');
    stream.push(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const results: TestCase[] = [];

    for await (const testCase of parseJobResponseTestCases(stream)) {
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
              text: '<context>Test context</context>',
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

    for await (const testCase of parseJobResponseTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([]);
  });

  it('should adds context when possible', async () => {
    const modelInput = {
      max_tokens: 1000,
      anthropic_version: '1.0',
    };

    const modelOutput = {
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
          text: 'Here are invalid test cases: [{"question": "He alright?", "answer": "Not sure!"}] End.',
        },
      ],
    };

    const responses = [
      {
        modelInput: {
          ...modelInput,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '<context>The man was not sure if he was alright</context>',
                },
              ],
            },
          ],
        },
        modelOutput,
        recordId: 'record-1',
      },
      {
        modelInput: {
          ...modelInput,
          messages: [
            {
              role: 'user',
              content: [],
            },
          ],
        },
        modelOutput,
        recordId: 'record-1',
      },
      {
        modelInput: {
          ...modelInput,
          messages: [],
        },
        modelOutput,
        recordId: 'record-1',
      },
    ];

    const stream = new Readable();
    responses.forEach((res) => stream.push(JSON.stringify(res) + '\n'));
    stream.push(null);

    const results: TestCase[] = [];

    for await (const testCase of parseJobResponseTestCases(stream)) {
      results.push(testCase);
    }

    expect(results).toEqual([
      { input: 'He alright?', expected: 'Not sure!', context: ['The man was not sure if he was alright'] },
      { input: 'He alright?', expected: 'Not sure!', context: [] },
      { input: 'He alright?', expected: 'Not sure!', context: [] },
    ]);
  });
});
