import Ajv, { ValidateFunction } from 'ajv';
import { ToolDefinition, ToolCall } from '../models';

const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

function getValidator(toolName: string, schema: Record<string, unknown>): ValidateFunction {
  if (!validatorCache.has(toolName)) {
    validatorCache.set(toolName, ajv.compile(schema));
  }
  return validatorCache.get(toolName)!;
}

export function validateToolCalls(toolCalls: ToolCall[], toolDefinitions: ToolDefinition[]): string[] {
  const errors: string[] = [];
  const toolMap = new Map(toolDefinitions.map((t) => [t.name, t]));

  for (const toolCall of toolCalls) {
    const toolDef = toolMap.get(toolCall.name);

    if (!toolDef) {
      errors.push(`Unknown tool: ${toolCall.name}`);
      continue;
    }

    if (toolDef.parameters) {
      const validate = getValidator(toolDef.name, toolDef.parameters);
      const valid = validate(toolCall.args);

      if (!valid && validate.errors) {
        const errorMessages = validate.errors.map((e) => {
          const path = e.instancePath || 'root';
          return `${toolCall.name}${path}: ${e.message}`;
        });
        errors.push(...errorMessages);
      }
    }
  }

  return errors;
}

export function validateToolName(toolName: string, toolDefinitions: ToolDefinition[]): boolean {
  return toolDefinitions.some((t) => t.name === toolName);
}
