/**
 * Minimal AgentCore evaluation test cases with OTEL spans.
 *
 * Each test case contains the invoked format the agentcore plugin expects:
 * input/expected/output with trace_id and session_spans (OpenTelemetry spans + events).
 *
 * The AgentCore Evaluate API requires:
 * - Spans with supported scope names (strands.telemetry.tracer)
 * - Corresponding events with input/output message bodies for each span
 * - session.id attribute on all items
 *
 * See: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/understanding-input-spans.html
 */

const SCOPE_STRANDS = 'strands.telemetry.tracer';
const SCOPE_BEDROCK = 'opentelemetry.instrumentation.botocore.bedrock-runtime';
const MODEL_ID = 'us.amazon.nova-micro-v1:0';

const resource = {
  attributes: {
    'service.name': 'agent.DEFAULT',
    'cloud.region': 'us-east-2',
    'cloud.provider': 'aws',
    'cloud.platform': 'aws_bedrock_agentcore',
  },
};

// --- Helpers ---

function span(
  traceId: string,
  spanId: string,
  name: string,
  kind: string,
  scopeName: string,
  attributes: Record<string, unknown>,
  parentSpanId?: string,
): Record<string, unknown> {
  const sessionId = `session-${traceId}`;
  return {
    resource,
    scope: { name: scopeName, version: '' },
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    flags: 256,
    name,
    kind,
    startTimeUnixNano: 1717000000000000000,
    endTimeUnixNano: 1717000001000000000,
    durationNano: 1000000000,
    attributes: { 'session.id': sessionId, ...attributes },
    status: { code: 'OK' },
  };
}

function spanEvent(
  traceId: string,
  spanId: string,
  scopeName: string,
  eventName: string,
  body: unknown,
): Record<string, unknown> {
  const sessionId = `session-${traceId}`;
  return {
    resource,
    scope: { name: scopeName },
    traceId,
    spanId,
    timeUnixNano: 1717000000500000000,
    observedTimeUnixNano: 1717000000500000000,
    severityNumber: 0,
    body,
    attributes: { 'event.name': eventName, 'session.id': sessionId },
  };
}

// --- Test Case 1: Single-turn with tool call ---

const t1 = 'aabbccdd11223344aabbccdd11223344';

const tc1Spans = [
  // invoke_agent span
  span(t1, 'a100000000000001', 'invoke_agent TestAgent', 'INTERNAL', SCOPE_STRANDS, {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'TestAgent',
    'gen_ai.request.model': MODEL_ID,
    'gen_ai.agent.tools': '["get_product_info"]',
    'gen_ai.usage.prompt_tokens': 870,
    'gen_ai.usage.completion_tokens': 65,
    'gen_ai.usage.total_tokens': 935,
    'gen_ai.system': 'strands-agents',
  }),
  // invoke_agent event (conversation summary)
  spanEvent(t1, 'a100000000000001', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: 'Tablets have 10-12 inch displays, all-day battery life, and stylus support.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: 'What are the specs for tablets?' }, role: 'user' }],
    },
  }),

  // event_loop span
  span(
    t1,
    'a100000000000002',
    'execute_event_loop_cycle',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.event.start_time': '2026-01-01T00:00:00+00:00',
      'gen_ai.event.end_time': '2026-01-01T00:00:01+00:00',
    },
    'a100000000000001',
  ),
  // event_loop event
  spanEvent(t1, 'a100000000000002', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text": "Tablets have 10-12 inch displays, all-day battery life, and stylus support."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [
        {
          content: {
            message: '[{"text": "What are the specs for tablets?"}]',
          },
          role: 'user',
        },
      ],
    },
  }),

  // chat CLIENT span (bedrock-runtime)
  span(
    t1,
    'a100000000000003',
    `chat ${MODEL_ID}`,
    'CLIENT',
    SCOPE_BEDROCK,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'aws.bedrock',
      'gen_ai.usage.input_tokens': 720,
      'gen_ai.usage.output_tokens': 65,
      'rpc.service': 'Bedrock Runtime',
      'rpc.method': 'ConverseStream',
      'gen_ai.response.finish_reasons': ['tool_use'],
    },
    'a100000000000002',
  ),
  // chat CLIENT events (user prompt + model response)
  spanEvent(t1, 'a100000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    content: [{ text: 'What are the specs for tablets?' }],
  }),
  spanEvent(t1, 'a100000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    message: {
      tool_calls: [
        {
          type: 'function',
          id: 'toolcall_001',
          function: { name: 'get_product_info', arguments: '{"product_type":"tablets"}' },
        },
      ],
      role: 'assistant',
    },
    index: 0,
    finish_reason: 'tool_use',
  }),

  // chat INTERNAL span (strands tracer)
  span(
    t1,
    'a100000000000004',
    'chat',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'strands-agents',
      'gen_ai.usage.prompt_tokens': 720,
      'gen_ai.usage.output_tokens': 65,
      'gen_ai.usage.completion_tokens': 65,
      'gen_ai.usage.total_tokens': 785,
      'gen_ai.usage.input_tokens': 720,
    },
    'a100000000000002',
  ),
  // chat INTERNAL event
  spanEvent(t1, 'a100000000000004', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message:
              '[{"toolUse":{"name":"get_product_info","input":{"product_type":"tablets"},"toolUseId":"toolcall_001"}}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [
        {
          content: { message: '[{"text":"What are the specs for tablets?"}]' },
          role: 'user',
        },
      ],
    },
  }),

  // execute_tool span
  span(
    t1,
    'a100000000000005',
    'execute_tool get_product_info',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'get_product_info',
      'gen_ai.tool.status': 'success',
      'gen_ai.tool.call.id': 'toolcall_001',
      'gen_ai.system': 'strands-agents',
    },
    'a100000000000002',
  ),
  // execute_tool event
  spanEvent(t1, 'a100000000000005', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '10-12 inch displays, all-day battery life, and stylus support.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [
        {
          content: { content: '{"product_type":"tablets"}' },
          role: 'user',
        },
      ],
    },
  }),
];

// --- Test Case 2: Single-turn without tool call ---

const t2 = 'eeff0011223344556677889900aabbcc';

const tc2Spans = [
  span(t2, 'b200000000000001', 'invoke_agent TestAgent', 'INTERNAL', SCOPE_STRANDS, {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'TestAgent',
    'gen_ai.request.model': MODEL_ID,
    'gen_ai.agent.tools': '["get_product_info"]',
    'gen_ai.usage.prompt_tokens': 400,
    'gen_ai.usage.completion_tokens': 60,
    'gen_ai.usage.total_tokens': 460,
    'gen_ai.system': 'strands-agents',
  }),
  spanEvent(t2, 'b200000000000001', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: 'You can return items within 30 days in their original condition for a full refund.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: 'What is your return policy?' }, role: 'user' }],
    },
  }),

  span(
    t2,
    'b200000000000002',
    'execute_event_loop_cycle',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.event.start_time': '2026-01-01T00:00:00+00:00',
      'gen_ai.event.end_time': '2026-01-01T00:00:01+00:00',
    },
    'b200000000000001',
  ),
  spanEvent(t2, 'b200000000000002', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text":"You can return items within 30 days in their original condition for a full refund."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [
        {
          content: { message: '[{"text":"What is your return policy?"}]' },
          role: 'user',
        },
      ],
    },
  }),

  span(
    t2,
    'b200000000000003',
    `chat ${MODEL_ID}`,
    'CLIENT',
    SCOPE_BEDROCK,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'aws.bedrock',
      'gen_ai.usage.input_tokens': 200,
      'gen_ai.usage.output_tokens': 60,
      'rpc.service': 'Bedrock Runtime',
      'rpc.method': 'ConverseStream',
      'gen_ai.response.finish_reasons': ['end_turn'],
    },
    'b200000000000002',
  ),
  spanEvent(t2, 'b200000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    content: [{ text: 'What is your return policy?' }],
  }),
  spanEvent(t2, 'b200000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    message: {
      content: [
        {
          text: 'You can return items within 30 days in their original condition for a full refund.',
        },
      ],
      role: 'assistant',
    },
    index: 0,
    finish_reason: 'end_turn',
  }),

  span(
    t2,
    'b200000000000004',
    'chat',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'strands-agents',
      'gen_ai.usage.prompt_tokens': 200,
      'gen_ai.usage.output_tokens': 60,
      'gen_ai.usage.completion_tokens': 60,
      'gen_ai.usage.total_tokens': 260,
      'gen_ai.usage.input_tokens': 200,
    },
    'b200000000000002',
  ),
  spanEvent(t2, 'b200000000000004', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text":"You can return items within 30 days in their original condition for a full refund."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [
        {
          content: { message: '[{"text":"What is your return policy?"}]' },
          role: 'user',
        },
      ],
    },
  }),
];

// --- Test Case 3: Multi-turn (2 turns, 2 trace IDs) ---

const t3a = '11112222333344445555666677778888';
const t3b = '99990000aaaabbbbccccddddeeeeffff';
const session3 = `session-${t3a}`;

function tc3Span(
  traceId: string,
  spanId: string,
  name: string,
  kind: string,
  scopeName: string,
  attributes: Record<string, unknown>,
  parentSpanId?: string,
) {
  return {
    resource,
    scope: { name: scopeName, version: '' },
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    flags: 256,
    name,
    kind,
    startTimeUnixNano: 1717000000000000000,
    endTimeUnixNano: 1717000001000000000,
    durationNano: 1000000000,
    attributes: { 'session.id': session3, ...attributes },
    status: { code: 'OK' },
  };
}

function tc3Event(traceId: string, spanId: string, scopeName: string, eventName: string, body: unknown) {
  return {
    resource,
    scope: { name: scopeName },
    traceId,
    spanId,
    timeUnixNano: 1717000000500000000,
    observedTimeUnixNano: 1717000000500000000,
    severityNumber: 0,
    body,
    attributes: { 'event.name': eventName, 'session.id': session3 },
  };
}

const tc3Spans = [
  // --- Turn 1 ---
  tc3Span(t3a, 'c300000000000001', 'invoke_agent TestAgent', 'INTERNAL', SCOPE_STRANDS, {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'TestAgent',
    'gen_ai.request.model': MODEL_ID,
    'gen_ai.agent.tools': '["get_product_info"]',
    'gen_ai.usage.prompt_tokens': 600,
    'gen_ai.usage.completion_tokens': 80,
    'gen_ai.usage.total_tokens': 680,
    'gen_ai.system': 'strands-agents',
  }),
  tc3Event(t3a, 'c300000000000001', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: 'Our laptops feature Intel/AMD processors with 8-32GB RAM and 1-year warranty.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: 'Tell me about your laptops' }, role: 'user' }],
    },
  }),

  tc3Span(
    t3a,
    'c300000000000002',
    'execute_event_loop_cycle',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.event.start_time': '2026-01-01T00:00:00+00:00',
      'gen_ai.event.end_time': '2026-01-01T00:00:01+00:00',
    },
    'c300000000000001',
  ),
  tc3Event(t3a, 'c300000000000002', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text":"Our laptops feature Intel/AMD processors with 8-32GB RAM and 1-year warranty."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: '[{"text":"Tell me about your laptops"}]' }, role: 'user' }],
    },
  }),

  tc3Span(
    t3a,
    'c300000000000003',
    `chat ${MODEL_ID}`,
    'CLIENT',
    SCOPE_BEDROCK,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'aws.bedrock',
      'gen_ai.usage.input_tokens': 400,
      'gen_ai.usage.output_tokens': 50,
      'rpc.service': 'Bedrock Runtime',
      'rpc.method': 'ConverseStream',
      'gen_ai.response.finish_reasons': ['tool_use'],
    },
    'c300000000000002',
  ),
  tc3Event(t3a, 'c300000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    content: [{ text: 'Tell me about your laptops' }],
  }),
  tc3Event(t3a, 'c300000000000003', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    message: {
      tool_calls: [
        {
          type: 'function',
          id: 'toolcall_002',
          function: { name: 'get_product_info', arguments: '{"product_type":"laptops"}' },
        },
      ],
      role: 'assistant',
    },
    index: 0,
    finish_reason: 'tool_use',
  }),

  tc3Span(
    t3a,
    'c300000000000004',
    'chat',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'strands-agents',
      'gen_ai.usage.prompt_tokens': 400,
      'gen_ai.usage.output_tokens': 50,
      'gen_ai.usage.completion_tokens': 50,
      'gen_ai.usage.total_tokens': 450,
      'gen_ai.usage.input_tokens': 400,
    },
    'c300000000000002',
  ),
  tc3Event(t3a, 'c300000000000004', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message:
              '[{"toolUse":{"name":"get_product_info","input":{"product_type":"laptops"},"toolUseId":"toolcall_002"}}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: '[{"text":"Tell me about your laptops"}]' }, role: 'user' }],
    },
  }),

  tc3Span(
    t3a,
    'c300000000000005',
    'execute_tool get_product_info',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'get_product_info',
      'gen_ai.tool.status': 'success',
      'gen_ai.tool.call.id': 'toolcall_002',
      'gen_ai.system': 'strands-agents',
    },
    'c300000000000002',
  ),
  tc3Event(t3a, 'c300000000000005', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: 'Intel/AMD processors, 8-32GB RAM, 1-year warranty.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { content: '{"product_type":"laptops"}' }, role: 'user' }],
    },
  }),

  // --- Turn 2 ---
  tc3Span(t3b, 'c300000000000006', 'invoke_agent TestAgent', 'INTERNAL', SCOPE_STRANDS, {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'TestAgent',
    'gen_ai.request.model': MODEL_ID,
    'gen_ai.agent.tools': '["get_product_info", "get_return_policy"]',
    'gen_ai.usage.prompt_tokens': 500,
    'gen_ai.usage.completion_tokens': 50,
    'gen_ai.usage.total_tokens': 550,
    'gen_ai.system': 'strands-agents',
  }),
  tc3Event(t3b, 'c300000000000006', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: 'Yes, you can return within 30 days in original condition.',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: 'Can I return one?' }, role: 'user' }],
    },
  }),

  tc3Span(
    t3b,
    'c300000000000007',
    'execute_event_loop_cycle',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.event.start_time': '2026-01-01T00:00:02+00:00',
      'gen_ai.event.end_time': '2026-01-01T00:00:03+00:00',
    },
    'c300000000000006',
  ),
  tc3Event(t3b, 'c300000000000007', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text":"Yes, you can return within 30 days in original condition."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: '[{"text":"Can I return one?"}]' }, role: 'user' }],
    },
  }),

  tc3Span(
    t3b,
    'c300000000000008',
    `chat ${MODEL_ID}`,
    'CLIENT',
    SCOPE_BEDROCK,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'aws.bedrock',
      'gen_ai.usage.input_tokens': 300,
      'gen_ai.usage.output_tokens': 50,
      'rpc.service': 'Bedrock Runtime',
      'rpc.method': 'ConverseStream',
      'gen_ai.response.finish_reasons': ['end_turn'],
    },
    'c300000000000007',
  ),
  tc3Event(t3b, 'c300000000000008', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    content: [{ text: 'Can I return one?' }],
  }),
  tc3Event(t3b, 'c300000000000008', SCOPE_BEDROCK, SCOPE_BEDROCK, {
    message: {
      content: [{ text: 'Yes, you can return within 30 days in original condition.' }],
      role: 'assistant',
    },
    index: 0,
    finish_reason: 'end_turn',
  }),

  tc3Span(
    t3b,
    'c300000000000009',
    'chat',
    'INTERNAL',
    SCOPE_STRANDS,
    {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': MODEL_ID,
      'gen_ai.system': 'strands-agents',
      'gen_ai.usage.prompt_tokens': 300,
      'gen_ai.usage.output_tokens': 50,
      'gen_ai.usage.completion_tokens': 50,
      'gen_ai.usage.total_tokens': 350,
      'gen_ai.usage.input_tokens': 300,
    },
    'c300000000000007',
  ),
  tc3Event(t3b, 'c300000000000009', SCOPE_STRANDS, SCOPE_STRANDS, {
    output: {
      messages: [
        {
          content: {
            message: '[{"text":"Yes, you can return within 30 days in original condition."}]',
          },
          role: 'assistant',
        },
      ],
    },
    input: {
      messages: [{ content: { message: '[{"text":"Can I return one?"}]' }, role: 'user' }],
    },
  }),
];

// --- Exported test cases ---

export type AgentcoreTestCase = {
  input: { text: string };
  expected: { text: string; tool_calls?: { name: string; args: Record<string, unknown> }[] };
  output: {
    text: string;
    trace_id: string;
    trace_ids: string[] | null;
    session_id: string;
    span_ids: string[];
    session_spans: Record<string, unknown>[];
  };
  metadata: { topics: string[] };
};

export const agentcoreEvaluationTestCases: AgentcoreTestCase[] = [
  {
    input: { text: 'What are the specs for tablets?' },
    expected: {
      text: '10-12 inch displays, all-day battery life, stylus support',
      tool_calls: [{ name: 'get_product_info', args: { product_type: 'tablets' } }],
    },
    output: {
      text: 'Tablets have 10-12 inch displays, all-day battery life, and stylus support.',
      trace_id: t1,
      trace_ids: null,
      session_id: `session-${t1}`,
      span_ids: tc1Spans.filter((s) => 'spanId' in s).map((s) => s.spanId as string),
      session_spans: tc1Spans,
    },
    metadata: { topics: ['product info', 'tablets'] },
  },
  {
    input: { text: 'What is your return policy?' },
    expected: { text: '30 days return window, original condition required' },
    output: {
      text: 'You can return items within 30 days in their original condition for a full refund.',
      trace_id: t2,
      trace_ids: null,
      session_id: `session-${t2}`,
      span_ids: tc2Spans.filter((s) => 'spanId' in s).map((s) => s.spanId as string),
      session_spans: tc2Spans,
    },
    metadata: { topics: ['return policy'] },
  },
  {
    input: { text: '["Tell me about your laptops", "Can I return one?"]' },
    expected: {
      text: 'Laptops have Intel/AMD processors with 8-32GB RAM. You can return within 30 days.',
      tool_calls: [{ name: 'get_product_info', args: { product_type: 'laptops' } }],
    },
    output: {
      text: 'Our laptops feature Intel/AMD processors with 8-32GB RAM and 1-year warranty. Yes, you can return within 30 days in original condition.',
      trace_id: t3a,
      trace_ids: [t3a, t3b],
      session_id: session3,
      span_ids: tc3Spans.filter((s) => 'spanId' in s).map((s) => s.spanId as string),
      session_spans: tc3Spans,
    },
    metadata: { topics: ['laptops', 'return policy'] },
  },
];
