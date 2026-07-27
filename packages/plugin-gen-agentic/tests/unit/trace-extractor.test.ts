import {
  extractConversations,
  classifySpan,
  extractToolCall,
  tagOutcome,
  computeTraceCoverage,
  findMatchingTraceExamples,
  conversationToSeedExample,
  clusterAndSelectDiverse,
  selectDiverseFailurePatterns,
  extractTracesInBatches,
  dedupeAndSample,
} from '../../src/stages/trace-extractor';
import { ExtractedConversation, TraceConfig } from '../../src/models';

// Mock AWS SDK S3 client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn((params) => ({ ...params, _type: 'ListObjectsV2Command' })),
  GetObjectCommand: jest.fn((params) => ({ ...params, _type: 'GetObjectCommand' })),
  PutObjectCommand: jest.fn((params) => ({ ...params, _type: 'PutObjectCommand' })),
}));

describe('trace-extractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('classifySpan', () => {
    it('should classify tool spans by name', () => {
      expect(classifySpan({ name: 'execute_tool' })).toBe('tool');
      expect(classifySpan({ name: 'tool_call' })).toBe('tool');
      expect(classifySpan({ name: 'run_tool_xyz' })).toBe('tool');
    });

    it('should classify tool spans by attribute', () => {
      expect(classifySpan({ name: 'some_span', attributes: { 'gen_ai.tool.name': 'get_weather' } })).toBe('tool');
    });

    it('should classify model spans by name', () => {
      expect(classifySpan({ name: 'chat_completion' })).toBe('model');
      expect(classifySpan({ name: 'llm_call' })).toBe('model');
    });

    it('should classify model spans by attribute', () => {
      expect(classifySpan({ name: 'invoke', attributes: { 'gen_ai.operation.name': 'chat' } })).toBe('model');
    });

    it('should classify agent spans', () => {
      expect(classifySpan({ name: 'invoke_agent' })).toBe('agent');
      expect(classifySpan({ name: 'agent_loop' })).toBe('agent');
    });

    it('should return unknown for unrecognized spans', () => {
      expect(classifySpan({ name: 'http_request' })).toBe('unknown');
      expect(classifySpan({ name: '' })).toBe('unknown');
      expect(classifySpan({})).toBe('unknown');
    });
  });

  describe('extractToolCall', () => {
    it('should extract tool call from gen_ai attributes', () => {
      const span = {
        attributes: {
          'gen_ai.tool.name': 'get_weather',
          'gen_ai.tool.args': JSON.stringify({ city: 'Seattle' }),
        },
      };
      const result = extractToolCall(span);
      expect(result).toEqual({ name: 'get_weather', args: { city: 'Seattle' } });
    });

    it('should extract tool call from tool.* attributes', () => {
      const span = {
        attributes: {
          'tool.name': 'search',
          'tool.args': { query: 'test' },
        },
      };
      const result = extractToolCall(span);
      expect(result).toEqual({ name: 'search', args: { query: 'test' } });
    });

    it('should return null if no tool name', () => {
      expect(extractToolCall({ attributes: {} })).toBeNull();
      expect(extractToolCall({})).toBeNull();
    });

    it('should handle malformed JSON args', () => {
      const span = {
        attributes: {
          'gen_ai.tool.name': 'test_tool',
          'gen_ai.tool.args': 'not-json',
        },
      };
      const result = extractToolCall(span);
      expect(result).toEqual({ name: 'test_tool', args: {} });
    });
  });

  describe('tagOutcome', () => {
    it('should tag as failure when error status present', () => {
      const spans = [{ status: { code: 2, message: 'error' } }];
      expect(tagOutcome(spans)).toBe('failure');
    });

    it('should tag as failure when error attribute present', () => {
      const spans = [{ attributes: { error: true } }];
      expect(tagOutcome(spans)).toBe('failure');
    });

    it('should tag as failure on HTTP 4xx/5xx', () => {
      expect(tagOutcome([{ attributes: { 'http.status_code': 400 } }])).toBe('failure');
      expect(tagOutcome([{ attributes: { 'http.status_code': 500 } }])).toBe('failure');
    });

    it('should tag as failure when exception event present', () => {
      const spans = [{ events: [{ name: 'exception' }] }];
      expect(tagOutcome(spans)).toBe('failure');
    });

    it('should tag as abandonment when no response', () => {
      const spans = [
        { name: 'chat', attributes: { 'gen_ai.operation.name': 'chat' } },
        { name: 'agent_loop', endTimeUnixNano: '123' },
      ];
      expect(tagOutcome(spans)).toBe('abandonment');
    });

    it('should tag as abandonment when agent does not complete', () => {
      const spans = [
        { name: 'chat', attributes: { 'gen_ai.completion': 'response' } },
        { name: 'other_span' },
      ];
      expect(tagOutcome(spans)).toBe('abandonment');
    });

    it('should tag as success when response and agent completion present', () => {
      const spans = [
        { name: 'chat', attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.completion': 'Hello!' } },
        { name: 'agent_loop', endTimeUnixNano: '123456789' },
      ];
      expect(tagOutcome(spans)).toBe('success');
    });
  });

  describe('extractConversations', () => {
    it('should extract single conversation from trace', () => {
      const traces = [
        {
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '1000',
                      name: 'chat',
                      attributes: {
                        'gen_ai.operation.name': 'chat',
                        'gen_ai.prompt': 'Hello',
                        'gen_ai.completion': 'Hi there!',
                      },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '2000',
                      name: 'agent',
                      endTimeUnixNano: '3000',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const conversations = extractConversations(traces);
      expect(conversations).toHaveLength(1);
      expect(conversations[0]!.traceId).toBe('trace-1');
      expect(conversations[0]!.turns).toHaveLength(1);
      expect(conversations[0]!.turns[0]!.userMessage).toBe('Hello');
      expect(conversations[0]!.turns[0]!.assistantMessage).toBe('Hi there!');
      expect(conversations[0]!.outcome).toBe('success');
    });

    it('should group spans by session ID', () => {
      const traces = [
        {
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'trace-1',
                      attributes: { 'session.id': 'session-A', 'gen_ai.prompt': 'Hello A' },
                      startTimeUnixNano: '1000',
                      name: 'chat',
                    },
                    {
                      traceId: 'trace-1',
                      attributes: { 'session.id': 'session-A' },
                      startTimeUnixNano: '2000',
                      name: 'agent',
                      endTimeUnixNano: '3000',
                    },
                    {
                      traceId: 'trace-2',
                      attributes: { 'session.id': 'session-B', 'gen_ai.prompt': 'Hello B' },
                      startTimeUnixNano: '1000',
                      name: 'chat',
                    },
                    {
                      traceId: 'trace-2',
                      attributes: { 'session.id': 'session-B' },
                      startTimeUnixNano: '2000',
                      name: 'agent',
                      endTimeUnixNano: '3000',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const conversations = extractConversations(traces);
      expect(conversations).toHaveLength(2);
      const sessionIds = conversations.map((c) => c.sessionId).sort();
      expect(sessionIds).toEqual(['session-A', 'session-B']);
    });

    it('should extract tool calls into turns', () => {
      const traces = [
        {
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '1000',
                      name: 'chat',
                      attributes: {
                        'gen_ai.operation.name': 'chat',
                        'gen_ai.prompt': 'What is the weather?',
                      },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '2000',
                      name: 'execute_tool',
                      attributes: {
                        'gen_ai.tool.name': 'get_weather',
                        'gen_ai.tool.args': '{"city":"Seattle"}',
                      },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '3000',
                      name: 'chat',
                      attributes: {
                        'gen_ai.completion': 'The weather in Seattle is sunny.',
                      },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '4000',
                      name: 'agent',
                      endTimeUnixNano: '5000',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const conversations = extractConversations(traces);
      expect(conversations).toHaveLength(1);
      expect(conversations[0]!.turns[0]!.toolCalls).toHaveLength(1);
      expect(conversations[0]!.turns[0]!.toolCalls![0]).toEqual({
        name: 'get_weather',
        args: { city: 'Seattle' },
      });
    });

    it('should skip conversations with no turns', () => {
      const traces = [
        {
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '1000',
                      name: 'http_request',
                      attributes: {},
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const conversations = extractConversations(traces);
      expect(conversations).toHaveLength(0);
    });

    it('should sort spans by timestamp', () => {
      const traces = [
        {
          resourceSpans: [
            {
              scopeSpans: [
                {
                  spans: [
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '3000',
                      name: 'chat',
                      attributes: { 'gen_ai.completion': 'Response' },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '1000',
                      name: 'chat',
                      attributes: { 'gen_ai.prompt': 'First message' },
                    },
                    {
                      traceId: 'trace-1',
                      startTimeUnixNano: '4000',
                      name: 'agent',
                      endTimeUnixNano: '5000',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const conversations = extractConversations(traces);
      expect(conversations[0]!.turns[0]!.userMessage).toBe('First message');
    });
  });

  describe('computeTraceCoverage', () => {
    it('should compute observed tools', () => {
      const conversations: ExtractedConversation[] = [
        {
          sessionId: '1',
          traceId: '1',
          turns: [{ userMessage: 'test', toolCalls: [{ name: 'tool_a', args: {} }] }],
          outcome: 'success',
        },
        {
          sessionId: '2',
          traceId: '2',
          turns: [{ userMessage: 'test', toolCalls: [{ name: 'tool_b', args: {} }] }],
          outcome: 'success',
        },
      ];

      const coverage = computeTraceCoverage(conversations);
      expect(coverage.observedTools.sort()).toEqual(['tool_a', 'tool_b']);
    });

    it('should compute observed tool combinations', () => {
      const conversations: ExtractedConversation[] = [
        {
          sessionId: '1',
          traceId: '1',
          turns: [
            {
              userMessage: 'test',
              toolCalls: [
                { name: 'tool_a', args: {} },
                { name: 'tool_b', args: {} },
              ],
            },
          ],
          outcome: 'success',
        },
      ];

      const coverage = computeTraceCoverage(conversations);
      expect(coverage.observedCombinations).toHaveLength(1);
      expect(coverage.observedCombinations[0]!.sort()).toEqual(['tool_a', 'tool_b']);
    });

    it('should compute outcome distribution', () => {
      const conversations: ExtractedConversation[] = [
        { sessionId: '1', traceId: '1', turns: [{ userMessage: 'test' }], outcome: 'success' },
        { sessionId: '2', traceId: '2', turns: [{ userMessage: 'test' }], outcome: 'success' },
        { sessionId: '3', traceId: '3', turns: [{ userMessage: 'test' }], outcome: 'failure' },
        { sessionId: '4', traceId: '4', turns: [{ userMessage: 'test' }], outcome: 'abandonment' },
      ];

      const coverage = computeTraceCoverage(conversations);
      expect(coverage.outcomeDistribution).toEqual({
        success: 2,
        failure: 1,
        abandonment: 1,
      });
    });

    it('should handle empty conversations', () => {
      const coverage = computeTraceCoverage([]);
      expect(coverage.observedTools).toEqual([]);
      expect(coverage.observedCombinations).toEqual([]);
      expect(coverage.outcomeDistribution).toEqual({ success: 0, failure: 0, abandonment: 0 });
    });
  });

  describe('findMatchingTraceExamples', () => {
    const createConv = (
      id: string,
      tools: string[],
      outcome: 'success' | 'failure' | 'abandonment',
    ): ExtractedConversation => ({
      sessionId: id,
      traceId: id,
      turns: [
        {
          userMessage: `Query for ${id}`,
          assistantMessage: `Response for ${id}`,
          toolCalls: tools.map((name) => ({ name, args: {} })),
        },
      ],
      outcome,
    });

    it('should find conversations with matching tools', () => {
      const conversations = [
        createConv('1', ['get_product', 'check_inventory'], 'success'),
        createConv('2', ['search_products'], 'success'),
        createConv('3', ['get_product'], 'success'),
      ];

      const matches = findMatchingTraceExamples(conversations, ['get_product', 'check_inventory'], 'success');

      expect(matches).toHaveLength(2);
      expect(matches[0]!.sessionId).toBe('1'); // Best match: both tools
      expect(matches[1]!.sessionId).toBe('3'); // Partial match: one tool
    });

    it('should prefer failure traces for failure scenarios', () => {
      const conversations = [
        createConv('success-1', ['get_product'], 'success'),
        createConv('failure-1', ['get_product'], 'failure'),
        createConv('failure-2', ['get_product'], 'failure'),
      ];

      const matches = findMatchingTraceExamples(conversations, ['get_product'], 'refusal');

      expect(matches.every((m) => m.outcome === 'failure')).toBe(true);
    });

    it('should prefer success traces for success scenarios', () => {
      const conversations = [
        createConv('success-1', ['get_product'], 'success'),
        createConv('failure-1', ['get_product'], 'failure'),
      ];

      const matches = findMatchingTraceExamples(conversations, ['get_product'], 'success');

      expect(matches.every((m) => m.outcome === 'success')).toBe(true);
    });

    it('should respect maxExamples limit', () => {
      const conversations = Array.from({ length: 10 }, (_, i) => createConv(`conv-${i}`, ['tool_a'], 'success'));

      const matches = findMatchingTraceExamples(conversations, ['tool_a'], 'success', 3);

      expect(matches).toHaveLength(3);
    });

    it('should return empty if no tools overlap', () => {
      const conversations = [createConv('1', ['tool_a', 'tool_b'], 'success')];

      const matches = findMatchingTraceExamples(conversations, ['tool_x', 'tool_y'], 'success');

      expect(matches).toHaveLength(0);
    });

    it('should penalize conversations with extra tools', () => {
      const conversations = [
        createConv('exact', ['tool_a'], 'success'),
        createConv('extra', ['tool_a', 'tool_b', 'tool_c'], 'success'),
      ];

      const matches = findMatchingTraceExamples(conversations, ['tool_a'], 'success');

      expect(matches[0]!.sessionId).toBe('exact'); // Exact match ranked higher
    });

    it('should match tool-less conversations for tool-less scenarios', () => {
      const toolLessConv: ExtractedConversation = {
        sessionId: 'no-tools',
        traceId: 'no-tools',
        turns: [{ userMessage: 'Hello', assistantMessage: 'Hi there!' }],
        outcome: 'success',
      };
      const withToolsConv = createConv('with-tools', ['tool_a'], 'success');

      const conversations = [toolLessConv, withToolsConv];
      const matches = findMatchingTraceExamples(conversations, [], 'success');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.sessionId).toBe('no-tools');
    });

    it('should match tool-less failure conversations for failure scenarios', () => {
      const successNoTools: ExtractedConversation = {
        sessionId: 'success-no-tools',
        traceId: 'success-no-tools',
        turns: [{ userMessage: 'Hello', assistantMessage: 'Hi!' }],
        outcome: 'success',
      };
      const failureNoTools: ExtractedConversation = {
        sessionId: 'failure-no-tools',
        traceId: 'failure-no-tools',
        turns: [{ userMessage: 'Do something bad', assistantMessage: 'I cannot do that.' }],
        outcome: 'failure',
      };

      const conversations = [successNoTools, failureNoTools];
      const matches = findMatchingTraceExamples(conversations, [], 'failure');

      expect(matches).toHaveLength(1);
      expect(matches[0]!.sessionId).toBe('failure-no-tools');
    });

    it('should prefer longer conversations for tool-less scenarios', () => {
      const shortConv: ExtractedConversation = {
        sessionId: 'short',
        traceId: 'short',
        turns: [{ userMessage: 'Hi', assistantMessage: 'Hello!' }],
        outcome: 'success',
      };
      const longConv: ExtractedConversation = {
        sessionId: 'long',
        traceId: 'long',
        turns: [
          { userMessage: 'Hi', assistantMessage: 'Hello!' },
          { userMessage: 'How are you?', assistantMessage: 'I am fine, thanks!' },
          { userMessage: 'Great!', assistantMessage: 'Glad to hear it!' },
        ],
        outcome: 'success',
      };

      const conversations = [shortConv, longConv];
      const matches = findMatchingTraceExamples(conversations, [], 'success');

      expect(matches[0]!.sessionId).toBe('long'); // Longer conversation ranked first
    });
  });

  describe('conversationToSeedExample', () => {
    it('should convert single-turn conversation', () => {
      const conv: ExtractedConversation = {
        sessionId: 'test',
        traceId: 'trace-1',
        turns: [
          {
            userMessage: 'What is the price?',
            assistantMessage: 'The price is $50',
            toolCalls: [{ name: 'get_price', args: { product_id: 'abc' } }],
          },
        ],
        outcome: 'success',
      };

      const example = conversationToSeedExample(conv);

      expect(example.input).toBe('What is the price?');
      expect(example.expected.response).toBe('The price is $50');
      expect(example.expected.toolCalls).toEqual([{ name: 'get_price', args: { product_id: 'abc' } }]);
      expect(example._traceId).toBe('trace-1');
      expect(example._outcome).toBe('success');
    });

    it('should convert multi-turn conversation preserving per-turn tool calls', () => {
      const conv: ExtractedConversation = {
        sessionId: 'test',
        traceId: 'trace-2',
        turns: [
          {
            userMessage: 'Search for laptops',
            assistantMessage: 'Found 5 laptops',
            toolCalls: [{ name: 'search', args: { query: 'laptops' } }],
          },
          {
            userMessage: 'Show me the first one',
            assistantMessage: 'Here are the details...',
            toolCalls: [{ name: 'get_details', args: { id: '1' } }],
          },
        ],
        outcome: 'success',
      };

      const example = conversationToSeedExample(conv);

      expect(example.input).toEqual(['Search for laptops', 'Show me the first one']);
      expect(example.expected.response).toBe('Here are the details...');
      // Tool calls preserve per-turn structure for multi-turn conversations
      expect(example.expected.toolCalls).toEqual([
        [{ name: 'search', args: { query: 'laptops' } }],
        [{ name: 'get_details', args: { id: '1' } }],
      ]);
    });

    it('should handle missing assistant message', () => {
      const conv: ExtractedConversation = {
        sessionId: 'test',
        traceId: 'trace-3',
        turns: [{ userMessage: 'Hello' }],
        outcome: 'abandonment',
      };

      const example = conversationToSeedExample(conv);

      expect(example.expected.response).toBe('');
    });

    it('should handle turns without tool calls', () => {
      const conv: ExtractedConversation = {
        sessionId: 'test',
        traceId: 'trace-4',
        turns: [
          { userMessage: 'Turn 1', assistantMessage: 'Response 1' },
          { userMessage: 'Turn 2', assistantMessage: 'Response 2', toolCalls: [{ name: 'tool', args: {} }] },
        ],
        outcome: 'success',
      };

      const example = conversationToSeedExample(conv);

      // Tool calls preserve per-turn structure (empty array for turns without tools)
      expect(example.expected.toolCalls).toEqual([[], [{ name: 'tool', args: {} }]]);
    });

    it('should not include toolCalls when no turns have tools', () => {
      const conv: ExtractedConversation = {
        sessionId: 'test',
        traceId: 'trace-5',
        turns: [
          { userMessage: 'Turn 1', assistantMessage: 'Response 1' },
          { userMessage: 'Turn 2', assistantMessage: 'Response 2' },
        ],
        outcome: 'success',
      };

      const example = conversationToSeedExample(conv);

      expect(example.expected.toolCalls).toBeUndefined();
    });
  });

  describe('clusterAndSelectDiverse', () => {
    const createConv = (id: string, tools: string[], outcome: 'success' | 'failure' | 'abandonment'): ExtractedConversation => ({
      sessionId: id,
      traceId: id,
      turns: [{ userMessage: `Query ${id}`, assistantMessage: 'Response', toolCalls: tools.map((name) => ({ name, args: {} })) }],
      outcome,
    });

    it('should cluster by tool sequence and outcome', () => {
      const conversations = [
        createConv('1', ['tool_a'], 'success'),
        createConv('2', ['tool_a'], 'success'),
        createConv('3', ['tool_b'], 'success'),
      ];

      const selected = clusterAndSelectDiverse(conversations, 2);

      // Should select from each cluster (tool_a and tool_b)
      expect(selected.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit per cluster', () => {
      const conversations = Array.from({ length: 10 }, (_, i) => createConv(`conv-${i}`, ['same_tool'], 'success'));

      const selected = clusterAndSelectDiverse(conversations, 3);

      // All same cluster, so max 3
      expect(selected.length).toBeLessThanOrEqual(3);
    });

    it('should prefer longer conversations within cluster', () => {
      // Both have same tool sequence 'tool_a→tool_a→tool_a' to be in same cluster
      const shortConv: ExtractedConversation = {
        sessionId: 'short',
        traceId: 'short',
        turns: [{ userMessage: 'Q1', toolCalls: [{ name: 'tool_a', args: {} }] }],
        outcome: 'success',
      };
      const longConv: ExtractedConversation = {
        sessionId: 'long',
        traceId: 'long',
        turns: [
          { userMessage: 'Q1 longer', toolCalls: [{ name: 'tool_a', args: {} }] },
          { userMessage: 'Q2 longer', toolCalls: [] },
          { userMessage: 'Q3 longer', toolCalls: [] },
        ],
        outcome: 'success',
      };

      // Both have same cluster key: 'success:tool_a'
      const selected = clusterAndSelectDiverse([shortConv, longConv], 1);

      // Should pick the longer conversation
      expect(selected[0]!.sessionId).toBe('long');
    });

    it('should handle empty input', () => {
      const selected = clusterAndSelectDiverse([], 3);
      expect(selected).toEqual([]);
    });
  });

  describe('selectDiverseFailurePatterns', () => {
    const createFailure = (id: string, tools: string[]): ExtractedConversation => ({
      sessionId: id,
      traceId: id,
      turns: [{ userMessage: `Error ${id}`, toolCalls: tools.map((name) => ({ name, args: {} })) }],
      outcome: 'failure',
    });

    it('should return all when under limit', () => {
      const failures = [createFailure('1', ['tool_a']), createFailure('2', ['tool_b'])];

      const selected = selectDiverseFailurePatterns(failures, 10);

      expect(selected).toHaveLength(2);
    });

    it('should limit to maxPatterns', () => {
      const failures = Array.from({ length: 20 }, (_, i) => createFailure(`f-${i}`, ['tool_a']));

      const selected = selectDiverseFailurePatterns(failures, 5);

      expect(selected).toHaveLength(5);
    });

    it('should round-robin across tool combinations', () => {
      const failures = [
        createFailure('a1', ['tool_a']),
        createFailure('a2', ['tool_a']),
        createFailure('a3', ['tool_a']),
        createFailure('b1', ['tool_b']),
        createFailure('b2', ['tool_b']),
        createFailure('c1', ['tool_c']),
      ];

      const selected = selectDiverseFailurePatterns(failures, 3);

      // Should pick from different tool combos
      const toolCombos = selected.map((f) => f.turns[0]?.toolCalls?.map((tc) => tc.name).join('+') ?? 'no-tools');
      const uniqueCombos = new Set(toolCombos);
      expect(uniqueCombos.size).toBe(3);
    });

    it('should handle conversations without tools', () => {
      const failures: ExtractedConversation[] = [
        { sessionId: 'no-tools', traceId: 'no-tools', turns: [{ userMessage: 'Error' }], outcome: 'failure' },
        createFailure('with-tools', ['tool_a']),
      ];

      const selected = selectDiverseFailurePatterns(failures, 10);

      expect(selected).toHaveLength(2);
    });
  });

  describe('extractTracesInBatches', () => {
    it('should process trace files in batches', async () => {
      const mockTrace = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace-1',
                    name: 'chat',
                    startTimeUnixNano: '1000',
                    attributes: { 'gen_ai.prompt': 'Hello', 'gen_ai.completion': 'Hi' },
                  },
                  { traceId: 'trace-1', name: 'agent', startTimeUnixNano: '2000', endTimeUnixNano: '3000' },
                ],
              },
            ],
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'traces/file1.json' }, { Key: 'traces/file2.json' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(mockTrace)) } })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(mockTrace)) } })
        .mockResolvedValueOnce(undefined); // PutObject

      const result = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123');

      expect(result.conversationsPrefix).toBe('extracted-conversations/run-123/');
      expect(result.totalConversations).toBeGreaterThan(0);
    });

    it('should handle empty bucket', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], NextContinuationToken: undefined });

      const result = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123');

      expect(result.totalConversations).toBe(0);
    });

    it('should filter non-JSON files', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'traces/file1.txt' }, { Key: 'traces/file2.csv' }],
        NextContinuationToken: undefined,
      });

      const result = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123');

      expect(result.totalConversations).toBe(0);
    });

    it('should call progress callback', async () => {
      const mockTrace = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  { traceId: 't1', name: 'chat', startTimeUnixNano: '1000', attributes: { 'gen_ai.prompt': 'Q' } },
                  { traceId: 't1', name: 'agent', startTimeUnixNano: '2000', endTimeUnixNano: '3000' },
                ],
              },
            ],
          },
        ],
      };

      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'traces/f.json' }], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(mockTrace)) } })
        .mockResolvedValueOnce(undefined);

      const onProgress = jest.fn();
      await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123', onProgress);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle malformed trace files gracefully', async () => {
      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'traces/bad.json' }], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve('not-valid-json') } });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123');

      expect(result.totalConversations).toBe(0);
      consoleSpy.mockRestore();
    });

    it('should handle S3 errors gracefully', async () => {
      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'traces/f.json' }], NextContinuationToken: undefined })
        .mockRejectedValueOnce(new Error('S3 access denied'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123');

      expect(result.totalConversations).toBe(0);
      consoleSpy.mockRestore();
    });

    it('throws a contextual error when ListObjectsV2 fails', async () => {
      const sdkError = new Error('AccessDenied');
      mockSend.mockRejectedValueOnce(sdkError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const err = await extractTracesInBatches('source-bucket', 'traces/', 'internal-bucket', 'run-123').catch(
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(Error);
      // Wrapper message names the S3 location; original SDK error is preserved
      // on .cause so error.name (AccessDenied/NoSuchKey) and $metadata survive.
      expect((err as Error).message).toContain('s3://source-bucket/traces/');
      expect((err as Error).cause).toBe(sdkError);
      // And it's logged before re-throw so CloudWatch keeps the SDK details.
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('s3://source-bucket/traces/'), sdkError);

      consoleSpy.mockRestore();
    });
  });

  describe('dedupeAndSample', () => {
    const baseConfig: TraceConfig = {
      source: 's3',
      location: 's3://bucket/prefix/',
      maxConversations: 100,
      errorSampleRate: 1.0,
      successSampleRate: 1.0,
      abandonmentSampleRate: 1.0,
    };

    it('should load and sample conversations from batch files', async () => {
      const batchData: ExtractedConversation[] = [
        { sessionId: '1', traceId: '1', turns: [{ userMessage: 'Q1', toolCalls: [{ name: 'tool_a', args: {} }] }], outcome: 'success' },
        { sessionId: '2', traceId: '2', turns: [{ userMessage: 'Q2', toolCalls: [{ name: 'tool_b', args: {} }] }], outcome: 'failure' },
      ];

      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'extracted/batch-00000.json' }], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(batchData)) } });

      const result = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty batch files gracefully', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], NextContinuationToken: undefined });

      const result = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig);

      expect(result).toEqual([]);
    });

    it('should apply sample rates', async () => {
      // Create many success conversations
      const batchData: ExtractedConversation[] = Array.from({ length: 100 }, (_, i) => ({
        sessionId: `s-${i}`,
        traceId: `s-${i}`,
        turns: [{ userMessage: `Q${i}`, toolCalls: [{ name: `tool_${i}`, args: {} }] }],
        outcome: 'success' as const,
      }));

      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'extracted/batch.json' }], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(batchData)) } });

      const lowSampleConfig: TraceConfig = { ...baseConfig, successSampleRate: 0.1, maxConversations: 100 };
      const result = await dedupeAndSample('internal-bucket', 'extracted/', lowSampleConfig);

      // With 10% sample rate, should get roughly 10 (with some variance)
      expect(result.length).toBeLessThan(50);
    });

    it('handles malformed batch files alongside good ones', async () => {
      // One bad batch is logged-and-skipped; a good batch in the same listing
      // means totalLoaded > 0 so fail-fast does not trip.
      const batchData: ExtractedConversation[] = [
        {
          sessionId: '1',
          traceId: '1',
          turns: [{ userMessage: 'Q', toolCalls: [{ name: 't', args: {} }] }],
          outcome: 'success',
        },
      ];

      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'extracted/bad.json' }, { Key: 'extracted/good.json' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve('invalid-json') } })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(batchData)) } });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig);

      expect(result.length).toBeGreaterThan(0);
      consoleSpy.mockRestore();
    });

    it('throws when every batch file fails to load', async () => {
      // Three batch keys listed, every GetObject rejects → totalLoaded stays 0.
      // Without fail-fast we'd silently return [] and the LLM pipeline would
      // proceed trace-ungrounded; instead surface the failure to the operator.
      mockSend
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'extracted/batch-0.json' },
            { Key: 'extracted/batch-1.json' },
            { Key: 'extracted/batch-2.json' },
          ],
          NextContinuationToken: undefined,
        })
        .mockRejectedValue(new Error('Access denied'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const err = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('s3://internal-bucket/extracted/');
      expect((err as Error).message).toContain('3 batch files');

      consoleSpy.mockRestore();
    });

    it('does not throw when some batch files load successfully', async () => {
      // Two batch keys listed; first read fails, second succeeds. totalLoaded > 0
      // so fail-fast must NOT trip — partial load is the expected best-effort path.
      const batchData: ExtractedConversation[] = [
        {
          sessionId: '1',
          traceId: '1',
          turns: [{ userMessage: 'Q', toolCalls: [{ name: 't', args: {} }] }],
          outcome: 'success',
        },
      ];

      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'extracted/batch-0.json' }, { Key: 'extracted/batch-1.json' }],
          NextContinuationToken: undefined,
        })
        .mockRejectedValueOnce(new Error('Access denied'))
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(batchData)) } });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig);

      expect(result.length).toBeGreaterThan(0);
      consoleSpy.mockRestore();
    });

    it('should prioritize failures over successes', async () => {
      const batchData: ExtractedConversation[] = [
        ...Array.from({ length: 50 }, (_, i) => ({
          sessionId: `s-${i}`,
          traceId: `s-${i}`,
          turns: [{ userMessage: `Success ${i}`, toolCalls: [{ name: `tool_s_${i}`, args: {} }] }],
          outcome: 'success' as const,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          sessionId: `f-${i}`,
          traceId: `f-${i}`,
          turns: [{ userMessage: `Failure ${i}`, toolCalls: [{ name: `tool_f_${i}`, args: {} }] }],
          outcome: 'failure' as const,
        })),
      ];

      mockSend
        .mockResolvedValueOnce({ Contents: [{ Key: 'extracted/batch.json' }], NextContinuationToken: undefined })
        .mockResolvedValueOnce({ Body: { transformToString: () => Promise.resolve(JSON.stringify(batchData)) } });

      const limitedConfig: TraceConfig = { ...baseConfig, maxConversations: 15 };
      const result = await dedupeAndSample('internal-bucket', 'extracted/', limitedConfig);

      const failures = result.filter((c) => c.outcome === 'failure');
      // All failures should be included (10), rest filled with successes
      expect(failures.length).toBe(10);
    });

    it('throws a contextual error when ListObjectsV2 fails', async () => {
      const sdkError = new Error('AccessDenied');
      mockSend.mockRejectedValueOnce(sdkError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const err = await dedupeAndSample('internal-bucket', 'extracted/', baseConfig).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('s3://internal-bucket/extracted/');
      expect((err as Error).cause).toBe(sdkError);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('s3://internal-bucket/extracted/'), sdkError);

      consoleSpy.mockRestore();
    });
  });
});
