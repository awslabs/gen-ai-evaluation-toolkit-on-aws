import { Command, Option } from 'commander';
import {
    CreateDatasetCommand,
    CreateDatasetCommandInput,
    CreateDatasetCommandOutput,
} from '@awssolutions/gen-ai-evaluation-toolkit-client';
import {
    addCommandFromApi,
    addCommandGroupFromApi,
    CommandGroup,
    GenAiEtkCommandAccessor,
} from '@src/cli/commandBuilder';
import { createGenAiEtkCall } from '@src/cli/genAiEtkCallFactory';
import { OperationLookup, ParameterDefinition, retrieveOperationLookup } from '@src/smithyGeneration/parser';
import { getModelBinder } from '@src/modelBinder/registry';
import { validate } from '@src/validator';
import { ModelBinder } from '@src/modelBinder/common';
import assert from 'assert';

jest.mock('@src/cli/genAiEtkCallFactory');
jest.mock('@src/smithyGeneration/parser');
jest.mock('@src/modelBinder/registry');
jest.mock('@src/validator');
jest.mock('@src/utils/lazy', () => ({
    lazy: <T>(factory: () => T) => factory,
})); // disable caching for tests

describe('commandBuilder', () => {
    const defaultParameter: ParameterDefinition = {
        name: 'testParam',
        type: 'String',
        description: 'Test parameter',
        isOptional: false,
        defaultValue: undefined,
    };

    const defaultLookup = {
        CreateDatasetCommand: {
            description: 'Test command description',
            parameters: [defaultParameter],
        },
    } as unknown as OperationLookup;

    const mockCommand = {
        name: jest.fn().mockReturnValue('test-command'),
        description: jest.fn().mockReturnThis(),
        addOption: jest.fn().mockReturnThis(),
        hook: jest.fn().mockReturnThis(),
        action: jest.fn().mockReturnThis(),
        allowExcessArguments: jest.fn().mockReturnThis(),
        parent: null,
    };
    const mockParentCommand = () =>
        ({
            command: jest.fn().mockReturnValue(mockCommand as unknown as jest.Mocked<Command>),
        }) as unknown as jest.Mocked<Command>;

    const createGenAiEtkCallMock = jest.mocked(createGenAiEtkCall);
    const getModelBinderMock = jest.mocked(getModelBinder);
    const validateMock = jest.mocked(validate);
    const retrieveOperationLookupMock = jest.mocked(retrieveOperationLookup);

    const modelBinderMock: Required<ModelBinder> = {
        descriptionGenerator: (e) => e,
        parseArg: (e) => e,
        alternativParamName: (e) => e,
        isBoolean: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        retrieveOperationLookupMock.mockReturnValue(defaultLookup);
        getModelBinderMock.mockImplementation(() => [modelBinderMock]);
        validateMock.mockReturnValue(jest.fn().mockReturnValue('validated-value'));
    });

    describe('const result = addCommandFromApi', () => {
        it('should successfully create a command from API', () => {
            const parent = mockParentCommand();
            const result = addCommandFromApi(parent, 'test-id', (c) => c.CreateDatasetCommand);

            expect(parent.command).toHaveBeenCalledWith('test-id');
            expect(result.description).toHaveBeenCalledWith('Test command description');
            expect(result.addOption).toHaveBeenCalled();
            expect(result.hook).toHaveBeenCalledWith('preAction', expect.any(Function));
            expect(result.action).toHaveBeenCalled();
        });

        it('should handle optional parameters correctly', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            isOptional: true,
                            defaultValue: 'default-value',
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            const option = jest.mocked(result.addOption).mock.calls[0]![0] as Option;
            expect(option.required).toBe(false);
            expect(option.defaultValue).toBe('default-value');
        });

        it('should handle required parameters correctly', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            isOptional: false,
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const mockModelBinder = {
                descriptionGenerator: jest.fn().mockReturnValue('Parameter description'),
                parseArg: jest.fn().mockReturnValue('parsed-value'),
                alternativParamName: jest.fn().mockReturnValue('required-param'),
                isBoolean: false,
            };

            getModelBinderMock.mockReturnValue([mockModelBinder]);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            const option = getOption(result);
            expect(option.required).toBe(true);
        });

        it('should handle boolean parameters correctly', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            type: 'Boolean' as const,
                            defaultValue: false,
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const mockModelBinder = {
                descriptionGenerator: jest.fn().mockReturnValue('Boolean parameter description'),
                parseArg: jest.fn().mockReturnValue(true),
                alternativParamName: jest.fn().mockReturnValue('boolean-param'),
                isBoolean: true,
            };

            getModelBinderMock.mockReturnValue([mockModelBinder]);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            const option = getOption(result);
            expect(option.flags).toBe('--boolean-param');
            expect(option.description).toBe('Boolean parameter description');
        });

        it('should throw assertion error for boolean parameters with positive default values', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            type: 'Boolean' as const,
                            defaultValue: true,
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const mockModelBinder = {
                descriptionGenerator: jest.fn().mockReturnValue('Boolean parameter description'),
                parseArg: jest.fn().mockReturnValue(true),
                alternativParamName: jest.fn().mockReturnValue('boolean-param'),
                isBoolean: true,
            };

            getModelBinderMock.mockReturnValue([mockModelBinder]);

            expect(() => {
                addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);
            }).toThrow(/Can not parse command CreateDatasetCommand/);
        });

        it('should handle multiple alternative parameters with conflicts', () => {
            const mockModelBinder1 = {
                descriptionGenerator: jest.fn().mockReturnValue('First alternative'),
                parseArg: jest.fn().mockReturnValue('parsed-value-1'),
                alternativParamName: jest.fn().mockReturnValue('param-alt1'),
                isBoolean: false,
            };

            const mockModelBinder2 = {
                descriptionGenerator: jest.fn().mockReturnValue('Second alternative'),
                parseArg: jest.fn().mockReturnValue('parsed-value-2'),
                alternativParamName: jest.fn().mockReturnValue('param-alt2'),
                isBoolean: false,
            };

            getModelBinderMock.mockReturnValue([mockModelBinder1, mockModelBinder2]);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            const option1 = getOption(result, 0);
            const option2 = getOption(result, 1);
            expect('conflictsWith' in option1 && option1.conflictsWith).toStrictEqual(['param-alt2']);
            expect('conflictsWith' in option2 && option2.conflictsWith).toStrictEqual(['param-alt1']);
            expect(option1.required).toBe(false); // Should be false when multiple alternatives exist
            expect(option2.required).toBe(false); // Should be false when multiple alternatives exist
        });

        it('should throw error when command lookup fails', () => {
            retrieveOperationLookupMock.mockReturnValue({} as unknown as OperationLookup); // Empty lookup

            expect(() => {
                addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);
            }).toThrow(/Can not parse command CreateDatasetCommand/);
        });

        it('should create correct template path from command hierarchy', () => {
            const mockRootCommand = {
                name: jest.fn().mockReturnValue('root'),
                parent: null,
            } as unknown as jest.Mocked<Command>;

            const mockSubCommand = {
                name: jest.fn().mockReturnValue('sub'),
                parent: mockRootCommand,
            } as unknown as jest.Mocked<Command>;

            const mockLeafCommand = {
                name: jest.fn().mockReturnValue('leaf'),
                parent: mockSubCommand,
                description: jest.fn().mockReturnThis(),
                addOption: jest.fn().mockReturnThis(),
                hook: jest.fn().mockReturnThis(),
                action: jest.fn().mockReturnThis(),
                allowExcessArguments: jest.fn().mockReturnThis(),
            } as unknown as jest.Mocked<Command>;

            const parent = mockParentCommand();
            parent.command.mockReturnValue(mockLeafCommand);

            const commandAcc: GenAiEtkCommandAccessor<CreateDatasetCommandInput, CreateDatasetCommandOutput> = (c) =>
                c.CreateDatasetCommand;
            addCommandFromApi(parent, 'test-id', commandAcc);

            expect(createGenAiEtkCallMock).toHaveBeenCalledWith(CreateDatasetCommand, 'sub/leaf', expect.any(Object));
        });

        it('should convert camelCase parameter names to kebab-case flags', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            name: 'testParameterName',
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            const option = getOption(result);
            expect(option.flags).toBe('--test-parameter-name [testParameterName]');
        });

        it('should integrate validation with parameter parsing', () => {
            const mockOperationLookup = {
                ...defaultLookup,
                CreateDatasetCommand: {
                    ...defaultLookup.CreateDatasetCommand,
                    parameters: [
                        {
                            ...defaultParameter,
                            name: 'validatedParam',
                            type: 'String' as const,
                        },
                    ],
                },
            };

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const mockParseArg = jest.fn().mockReturnValue('parsed-value');
            const mockValidatedParseArg = jest.fn().mockReturnValue('validated-value');

            const mockModelBinder = {
                descriptionGenerator: jest.fn().mockReturnValue('Parameter description'),
                parseArg: mockParseArg,
                alternativParamName: jest.fn().mockReturnValue('validated-param'),
                isBoolean: false,
            };

            getModelBinderMock.mockReturnValue([mockModelBinder]);
            validateMock.mockReturnValue(mockValidatedParseArg);

            const result = addCommandFromApi(mockParentCommand(), 'test-id', (c) => c.CreateDatasetCommand);

            expect(validateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'validatedParam',
                    type: 'String',
                }),
                mockParseArg,
            );

            // Test that some parseArg function was assigned to the option (validation integration works)
            const option = getOption(result);
            expect(option.parseArg).toBeDefined();
            expect(typeof option.parseArg).toBe('function');
        });
    });

    describe('addCommandGroupFromApi', () => {
        it('should add multiple commands from a command group', () => {
            const commandGroup: CommandGroup = {
                command1: (c) => c.CreateDatasetCommand,
                command2: (c) => c.ArchiveAnnotationSchemaCommand,
            };

            const mockOperationLookup = {
                CreateDatasetCommand: {
                    description: 'First test command',
                    parameters: [],
                },
                ArchiveAnnotationSchemaCommand: {
                    description: 'Second test command',
                    parameters: [],
                },
            } as unknown as OperationLookup;

            retrieveOperationLookupMock.mockReturnValue(mockOperationLookup);

            const parent = mockParentCommand();

            const result = addCommandGroupFromApi(parent, commandGroup);

            expect(parent.command).toHaveBeenCalledWith('command1');
            expect(parent.command).toHaveBeenCalledWith('command2');
            expect(result).toBe(parent);
        });
    });
});

function getOption(command: Command, invocation: number = 0): Option {
    const mockedAddOption = jest.mocked(command.addOption);
    assert(
        mockedAddOption.mock.calls.length > invocation,
        `Mocked command addOption was not invoked ${invocation} times.`,
    );
    const invocationInstance = mockedAddOption.mock.calls[invocation];
    assert(invocationInstance, 'Invocation is undefined');
    assert(invocationInstance.length > 0, 'Mocked command addOption was not invoked with args');
    assert(invocationInstance[0], 'First invocations first argument is undefined');
    return invocationInstance[0];
}
