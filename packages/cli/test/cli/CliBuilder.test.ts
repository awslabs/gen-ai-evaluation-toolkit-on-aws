import { Command } from 'commander';
import { CliBuilder } from '@src/cli/CliBuilder';

describe('CliBuilder', () => {
    let cliBuilder: CliBuilder;

    beforeEach(() => {
        jest.clearAllMocks();
        cliBuilder = new CliBuilder({
            name: 'test-cli',
            description: 'Test CLI',
            version: '1.0.0',
        });
    });

    it('should create a CLI with basic properties', () => {
        const program = cliBuilder.build();
        expect(program).toBeInstanceOf(Command);
        expect(program.name()).toBe('test-cli');
        expect(program.description()).toBe('Test CLI');
        expect(program.version()).toBe('1.0.0');
    });

    it('should configure showHelpAfterError', () => {
        const program = cliBuilder.build();
        expect(program._showHelpAfterError).toBe(true);
    });

    it('should configure error output to only show the first line of error messages', () => {
        const program = cliBuilder.build();

        // Get the outputError function from the program's outputConfiguration
        const outputConfiguration = (
            program as unknown as {
                _outputConfiguration: {
                    outputError: (str: string, write: (str: string) => void) => void;
                };
            }
        )._outputConfiguration;
        expect(outputConfiguration).toBeDefined();
        expect(outputConfiguration.outputError).toBeDefined();

        // Mock the write function
        const mockWrite = jest.fn();

        // Test with a multi-line error message
        const multiLineError = 'First line of error\nSecond line with stack trace\nThird line with more details';
        outputConfiguration.outputError(multiLineError, mockWrite);

        // Verify that only the first line is written
        expect(mockWrite).toHaveBeenCalledWith('Error: First line of error');
    });
});
