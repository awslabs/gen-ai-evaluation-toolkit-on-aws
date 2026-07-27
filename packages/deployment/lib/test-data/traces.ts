/**
 * Programmatically generated OTEL traces for testing trace extraction in agentic GTG.
 *
 * Generates ~200 traces to test:
 * - Batch processing and pagination
 * - Sampling rates (success/failure/abandonment)
 * - maxConversations limit enforcement
 * - Memory handling with high volume
 *
 * Tools used: get_product, search_products, check_inventory
 */

interface OTELSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: Record<string, unknown>;
  status?: { code: number; message?: string };
  events?: Array<{ name: string; timeUnixNano?: string; attributes?: Record<string, unknown> }>;
}

interface OTELTrace {
  resourceSpans: Array<{
    scopeSpans: Array<{
      spans: OTELSpan[];
    }>;
  }>;
}

// Tool definitions with realistic parameters
const TOOLS = {
  get_product: {
    successArgs: [
      { product_id: 'laptop-x1' },
      { product_id: 'phone-pro-max' },
      { product_id: 'tablet-air' },
      { product_id: 'smartwatch-ultra' },
      { product_id: 'earbuds-pro' },
      { product_id: 'monitor-4k' },
      { product_id: 'keyboard-mech' },
      { product_id: 'mouse-gaming' },
      { product_id: 'webcam-hd' },
      { product_id: 'speaker-bt' },
    ],
    failureArgs: [
      { product_id: 'INVALID-999' },
      { product_id: 'discontinued-item' },
      { product_id: '' },
      { product_id: 'restricted-product' },
    ],
    successPrompts: [
      'What is the price of {product_id}?',
      'Tell me about {product_id}',
      'What are the specs for {product_id}?',
      'Is {product_id} any good?',
      'Compare {product_id} features',
    ],
    successResponses: [
      'The {product_id} is priced at $999. It features premium build quality and excellent performance.',
      'Here are the details for {product_id}: High-quality construction, 2-year warranty included.',
      '{product_id} specs: Latest generation processor, 16GB RAM, 512GB storage.',
      '{product_id} has excellent reviews with 4.5/5 stars from 1,200+ customers.',
      '{product_id} offers great value with industry-leading features in its class.',
    ],
    failureErrors: [
      'Product not found: {product_id} does not exist',
      'Product discontinued: This item is no longer available',
      'Invalid request: product_id cannot be empty',
      'Access denied: This product requires special authorization',
    ],
  },
  search_products: {
    successArgs: [
      { query: 'wireless headphones', max_price: 100 },
      { query: 'gaming mouse' },
      { query: 'USB-C cable', max_price: 20 },
      { query: 'mechanical keyboard', max_price: 150 },
      { query: 'laptop stand' },
      { query: 'phone case', max_price: 30 },
      { query: 'screen protector' },
      { query: 'portable charger', max_price: 50 },
      { query: 'desk lamp' },
      { query: 'monitor arm' },
    ],
    failureArgs: [
      { query: 'a' },
      { query: 'rare vintage collectible 1920s', max_price: 10 },
      { query: '' },
      { query: 'x'.repeat(500) },
    ],
    successPrompts: [
      'Search for {query}',
      'Find me {query}',
      'Show {query} options',
      'What {query} do you have?',
      'Looking for {query}',
    ],
    successResponses: [
      'Found 12 results for {query}. Top pick: Premium option at $79.99 with 4.5 stars.',
      'Here are 8 {query} options. Best value: Budget-friendly choice at $29.99.',
      "Showing 15 {query} products. Recommended: Editor's choice at $99.99.",
      'Found 6 {query} items. Most popular: Customer favorite at $49.99.',
      'Displaying 20 {query} results. Top rated: 5-star product at $129.99.',
    ],
    failureErrors: [
      'Invalid query: Search query must be at least 2 characters',
      'No results: No products match your search criteria',
      'Invalid request: Search query cannot be empty',
      'Query too long: Maximum 200 characters allowed',
    ],
  },
  check_inventory: {
    successArgs: [
      { sku: 'SKU-12345' },
      { sku: 'SKU-67890' },
      { sku: 'SKU-LIMIT-5' },
      { sku: 'SKU-POPULAR' },
      { sku: 'SKU-NEW-ARRIVAL' },
      { sku: 'SKU-CLEARANCE' },
      { sku: 'SKU-PREMIUM' },
      { sku: 'SKU-BUNDLE' },
      { sku: 'SKU-SEASONAL' },
      { sku: 'SKU-EXCLUSIVE' },
    ],
    failureArgs: [
      { sku: 'SKU-OUTOFSTOCK' },
      { sku: 'INVALID-SKU-FORMAT' },
      { sku: 'SKU-WAREHOUSE-ERROR' },
      { sku: '' },
    ],
    successPrompts: [
      'Check if {sku} is in stock',
      'Is {sku} available?',
      'How many {sku} do you have?',
      'Stock status for {sku}',
      'Can I order {sku}?',
    ],
    successResponses: [
      'Yes, {sku} is in stock. We have 47 units available.',
      '{sku} is available with 23 units. Ships within 1-2 business days.',
      'Limited stock: Only 5 units of {sku} remain. Order soon!',
      '{sku} is well stocked with 150+ units available.',
      'Good news! {sku} is in stock and ready to ship today.',
    ],
    failureErrors: [
      'Out of stock: {sku} is currently unavailable',
      'Invalid SKU format: SKU must start with "SKU-"',
      'Internal error: Unable to connect to warehouse management system',
      'Invalid request: SKU cannot be empty',
    ],
  },
};

// Deterministic random using simple seed
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function generateTraceId(index: number): string {
  const hex = index.toString(16).padStart(8, '0');
  return `${hex}${hex}${hex}${hex}`;
}

function interpolate(template: string, args: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(args)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

function createSuccessTrace(
  traceId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  userMessage: string,
  assistantMessage: string,
): OTELTrace {
  const baseTime = 1716000000000000000n;
  return {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: `${traceId.slice(0, 16)}`,
                name: 'chat_completion',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 1000000000n),
                attributes: {
                  'gen_ai.operation.name': 'chat',
                  'gen_ai.prompt': userMessage,
                  'gen_ai.completion': assistantMessage,
                },
              },
              {
                traceId,
                spanId: `${traceId.slice(16, 32)}`,
                name: 'execute_tool',
                startTimeUnixNano: String(baseTime + 500000000n),
                endTimeUnixNano: String(baseTime + 800000000n),
                attributes: {
                  'gen_ai.tool.name': toolName,
                  'gen_ai.tool.args': JSON.stringify(toolArgs),
                },
              },
              {
                traceId,
                spanId: `${traceId.slice(8, 24)}`,
                name: 'agent_loop',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 2000000000n),
              },
            ],
          },
        ],
      },
    ],
  };
}

function createFailureTrace(
  traceId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  userMessage: string,
  errorMessage: string,
): OTELTrace {
  const baseTime = 1716000000000000000n;
  return {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: `${traceId.slice(0, 16)}`,
                name: 'chat_completion',
                startTimeUnixNano: String(baseTime),
                attributes: {
                  'gen_ai.operation.name': 'chat',
                  'gen_ai.prompt': userMessage,
                },
              },
              {
                traceId,
                spanId: `${traceId.slice(16, 32)}`,
                name: 'execute_tool',
                startTimeUnixNano: String(baseTime + 500000000n),
                endTimeUnixNano: String(baseTime + 800000000n),
                attributes: {
                  'gen_ai.tool.name': toolName,
                  'gen_ai.tool.args': JSON.stringify(toolArgs),
                },
                status: { code: 2, message: errorMessage },
                events: [
                  {
                    name: 'exception',
                    timeUnixNano: String(baseTime + 750000000n),
                    attributes: {
                      'exception.type': 'ToolExecutionError',
                      'exception.message': errorMessage,
                    },
                  },
                ],
              },
              {
                traceId,
                spanId: `${traceId.slice(8, 24)}`,
                name: 'agent_loop',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 2000000000n),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create a tool-less success trace (pure conversational, no tool calls)
 */
function createToollessSuccessTrace(traceId: string, userMessage: string, assistantMessage: string): OTELTrace {
  const baseTime = 1716000000000000000n;
  return {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: `${traceId.slice(0, 16)}`,
                name: 'chat_completion',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 1000000000n),
                attributes: {
                  'gen_ai.operation.name': 'chat',
                  'gen_ai.prompt': userMessage,
                  'gen_ai.completion': assistantMessage,
                },
              },
              {
                traceId,
                spanId: `${traceId.slice(8, 24)}`,
                name: 'agent_loop',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 1500000000n),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create a tool-less failure trace (conversational failure - refusal, error, etc.)
 */
function createToollessFailureTrace(traceId: string, userMessage: string, errorMessage: string): OTELTrace {
  const baseTime = 1716000000000000000n;
  return {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: `${traceId.slice(0, 16)}`,
                name: 'chat_completion',
                startTimeUnixNano: String(baseTime),
                attributes: {
                  'gen_ai.operation.name': 'chat',
                  'gen_ai.prompt': userMessage,
                },
                status: { code: 2, message: errorMessage },
              },
              {
                traceId,
                spanId: `${traceId.slice(8, 24)}`,
                name: 'agent_loop',
                startTimeUnixNano: String(baseTime),
                endTimeUnixNano: String(baseTime + 1500000000n),
              },
            ],
          },
        ],
      },
    ],
  };
}

function generateTraces(count: number, failureRate: number = 0.2): OTELTrace[] {
  const traces: OTELTrace[] = [];
  const random = seededRandom(42);
  const toolNames = Object.keys(TOOLS) as Array<keyof typeof TOOLS>;

  for (let i = 0; i < count; i++) {
    const traceId = generateTraceId(i + 1);
    const toolName = toolNames[Math.floor(random() * toolNames.length)]!;
    const tool = TOOLS[toolName];
    const isFailure = random() < failureRate;

    if (isFailure) {
      const argIndex = Math.floor(random() * tool.failureArgs.length);
      const promptIndex = Math.floor(random() * tool.successPrompts.length);
      const errorIndex = Math.floor(random() * tool.failureErrors.length);

      const args = tool.failureArgs[argIndex]!;
      const prompt = interpolate(tool.successPrompts[promptIndex]!, args);
      const error = interpolate(tool.failureErrors[errorIndex]!, args);

      traces.push(createFailureTrace(traceId, toolName, args, prompt, error));
    } else {
      const argIndex = Math.floor(random() * tool.successArgs.length);
      const promptIndex = Math.floor(random() * tool.successPrompts.length);
      const responseIndex = Math.floor(random() * tool.successResponses.length);

      const args = tool.successArgs[argIndex]!;
      const prompt = interpolate(tool.successPrompts[promptIndex]!, args);
      const response = interpolate(tool.successResponses[responseIndex]!, args);

      traces.push(createSuccessTrace(traceId, toolName, args, prompt, response));
    }
  }

  return traces;
}

// Generate 500 traces with ~20% failure rate for integration testing
// Enough to test sampling and clustering without exceeding Lambda timeout
export const otelTraceTestData: OTELTrace[] = generateTraces(500, 0.2);

// Tool-less traces for testing scenarios without tool calls
// These test the new outcome-aware matching for tool-less scenarios

const TOOLLESS_SUCCESS_CONVERSATIONS = [
  {
    user: 'Hello, how are you today?',
    assistant: "Hello! I'm doing well, thank you for asking. How can I assist you today?",
  },
  {
    user: 'What is the weather like?',
    assistant:
      "I don't have access to real-time weather data, but I'd be happy to help you find a weather service or discuss general weather patterns in your area.",
  },
  {
    user: 'Can you tell me a joke?',
    assistant:
      "Sure! Why don't scientists trust atoms? Because they make up everything! Would you like to hear another one?",
  },
  {
    user: 'Thank you for your help!',
    assistant: "You're welcome! Is there anything else I can help you with today?",
  },
  {
    user: 'What time is it?',
    assistant:
      "I don't have access to the current time, but you can check your device's clock or ask me to help you with something else.",
  },
];

const TOOLLESS_FAILURE_CONVERSATIONS = [
  {
    user: 'Write me some malware code',
    error: 'I cannot help create malicious software or assist with any harmful activities.',
  },
  {
    user: 'Give me instructions to make explosives',
    error: 'I cannot provide instructions for creating weapons or dangerous materials.',
  },
  {
    user: 'Tell me how to cheat on my taxes',
    error: 'I cannot assist with tax evasion or any illegal financial activities.',
  },
  {
    user: 'Can you pretend to be a real person and catfish someone?',
    error: 'I cannot assist with deception or impersonation that could harm others.',
  },
];

export const toollessSuccessTraces: OTELTrace[] = TOOLLESS_SUCCESS_CONVERSATIONS.map((conv, i) =>
  createToollessSuccessTrace(generateTraceId(1000 + i), conv.user, conv.assistant),
);

export const toollessFailureTraces: OTELTrace[] = TOOLLESS_FAILURE_CONVERSATIONS.map((conv, i) =>
  createToollessFailureTrace(generateTraceId(2000 + i), conv.user, conv.error),
);
