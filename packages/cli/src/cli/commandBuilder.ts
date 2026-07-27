import { ServiceInputTypes, ServiceOutputTypes } from '@awssolutions/gen-ai-evaluation-toolkit-client';
import * as ClientSdk from '@awssolutions/gen-ai-evaluation-toolkit-client';
import { Command, Option } from 'commander';
import { GenAiEtkCommandConstructor, createGenAiEtkCall } from './genAiEtkCallFactory';
import { ParameterDefinition, retrieveOperationLookup, OperationLookup } from '@src/smithyGeneration/parser';
import { lazy } from '@src/utils/lazy';
import { getModelBinder } from '@src/modelBinder/registry';
import { validate } from '@src/validator';
import { remapAlternativeFlagKeys } from './remapAlternativeFlagKeys';
import assert from 'assert';
import { ModelBinder } from '@src/modelBinder/common';

const lookup = lazy(() => retrieveOperationLookup());

type FilterCommandKeys<T> = {
    [K in keyof T as K extends string ? (K extends `${string}Command` ? K : never) : never]: T[K];
};

export type AvailableCommands = Omit<FilterCommandKeys<typeof ClientSdk>, '$Command'>;

export type GenAiEtkCommandAccessor<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes> = (
    ns: AvailableCommands,
) => GenAiEtkCommandConstructor<InputType, OutputType>;

/**
 * Adds a CLI command from an API operation
 * @param parent Parent Commander command
 * @param id Command ID
 * @param Command Command class constructor
 * @param template Template for output formatting
 * @param options Additional options for command creation
 * @returns The created Commander command
 */
export function addCommandFromApi<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes>(
    parent: Command,
    id: string,
    CommandAcc: GenAiEtkCommandAccessor<InputType, OutputType>,
): Command {
    const Command = CommandAcc(ClientSdk);

    try {
        const command = parent.command(id).allowExcessArguments(false);
        const commandPath = getCommandPath(command);
        const templatePath = commandPath.slice(1).join('/');
        const operationSettings = lookup()[Command.name as keyof OperationLookup];

        const defaultInput = Object.fromEntries(
            operationSettings.parameters.map((parameter) => [parameter.name, parameter.defaultValue]),
        );
        command.description(operationSettings.description);

        const alternativeParamMapping: Record<string, { alternatives: string[]; defaultValue: unknown }> = {};
        for (const parameter of operationSettings.parameters) {
            assert(
                parameter.defaultValue !== true,
                `Parameter: ${JSON.stringify(parameter)}: The CLI can not automatically be generated with high quality if a boolean value has a positive default value.`,
            );

            const modelBinderSet = getModelBinder(parameter.type);
            const parameterMappings = {
                alternatives: modelBinderSet.map((binder) => binder.alternativParamName(parameter.name)),
                defaultValue: parameter.defaultValue,
            };
            alternativeParamMapping[parameter.name] = parameterMappings;
            const isRequired = !parameter.isOptional && parameterMappings.alternatives.length == 1;

            for (const modelBinder of modelBinderSet) {
                const option = createOption(parameter, modelBinder, parameterMappings, isRequired);
                command.addOption(option);
            }
        }
        command.hook('preAction', (thisCommand: Command) =>
            remapAlternativeFlagKeys(alternativeParamMapping)(thisCommand.opts()),
        );
        return command.action(createGenAiEtkCall(Command, templatePath, defaultInput));
    } catch (error) {
        throw Error(`Can not parse command ${Command.name}. Error: ${error}.`);
    }
}

/**
 * Creates a Commander Option from a parameter definition
 * @param parameter Parameter definition
 * @param modelBinder Model binder for the parameter
 * @param parameterMappings Alternative parameter names and default value
 * @param isRequired Whether the parameter is required
 * @returns The created Commander Option
 */
function createOption(
    parameter: ParameterDefinition,
    { alternativParamName, descriptionGenerator, parseArg, isBoolean }: Required<ModelBinder>,
    parameterMappings: { alternatives: string[]; defaultValue: unknown },
    isRequired: boolean,
) {
    const paramName = alternativParamName(parameter.name);
    const flag = `--${camelCaseToKebabCase(paramName)}`;
    const description = descriptionGenerator(parameter.description, flag);
    const validatedParseArg = validate(parameter, parseArg);
    const option = new Option(isBoolean ? flag : `${flag} [${paramName}]`, description);

    option.parseArg = <T>(value: string, previous: T) => validatedParseArg(value, previous) as T;
    option.defaultValue = parameter.defaultValue;
    option.conflicts(parameterMappings.alternatives.filter((alt) => alt !== paramName));
    option.required = isRequired;
    return option;
}

function getCommandPath(command: Command): string[] {
    if (command.parent !== null) return [...getCommandPath(command.parent), command.name()];
    return [command.name()];
}

export type CommandGroup = Record<string, (ns: AvailableCommands) => unknown>;

/**
 * Adds a CLI command group from an API
 * @param parent Parent Commander command
 * @param commands Command group
 * @returns The created Commander command
 */
export function addCommandGroupFromApi(parent: Command, commands: CommandGroup): Command {
    Object.entries(commands).map(([id, Command]) => {
        addCommandFromApi<ServiceInputTypes, ServiceOutputTypes>(
            parent,
            id,
            Command as GenAiEtkCommandAccessor<ServiceInputTypes, ServiceOutputTypes>,
        );
    });
    return parent;
}

/**
 * Convert camelCase to kebab-case
 * @param str string in camelCase
 * @returns string in kebab-case
 */
function camelCaseToKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
