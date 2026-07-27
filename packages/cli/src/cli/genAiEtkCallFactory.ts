import { ServiceOutputTypes, ServiceInputTypes } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { getClient } from '@src/client';
import { renderTemplate } from '@src/templates/render';
import { SmithyResolvedConfiguration } from '@smithy/smithy-client';
import { Command, HttpHandlerOptions } from '@smithy/types';

export type GenAiEtkCommandConstructor<
  InputType extends ServiceInputTypes,
  OutputType extends ServiceOutputTypes,
> = new (input: InputType) => GenAiEtkCommand<InputType, OutputType>;

type GenAiEtkCommand<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes> = Command<
  ServiceInputTypes,
  InputType,
  ServiceOutputTypes,
  OutputType,
  SmithyResolvedConfiguration<HttpHandlerOptions>
>;

export function createGenAiEtkCall<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes>(
  Command: GenAiEtkCommandConstructor<InputType, OutputType>,
  template: string,
  defaultInput: object,
) {
  return async function invokeGenAiEtkApi(request: object): Promise<void> {
    const input = {
      ...defaultInput,
      ...(await awaitObjectValues(request)),
    } as InputType;

    const { $metadata: _discard, ...response } = await getClient().send(new Command(input));
    const output = response as OutputType;
    // Replace CLI shortnames with their fullnames to match the generated templates
    template = template
      .replace(/^eval\//, 'evaluation/')
      .replace(/config\//, '/configuration/')
      .replace(/job\//, '/job/')
      .replace(/schedule\//, '/schedule/');
    await renderTemplate(`views/${template}`, output);
  };
}

async function awaitObjectValues<T extends object>(
  obj: T,
): Promise<{
  [K in keyof T]: Awaited<T[K]>;
}> {
  const entries = Object.entries(obj);
  const resolvedEntries = await Promise.all(entries.map(async ([key, value]) => [key, await value]));
  return Object.fromEntries(resolvedEntries);
}
