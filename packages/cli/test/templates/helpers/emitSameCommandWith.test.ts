import { emitSameCommandWith } from '../../../src/templates/helpers/emitSameCommandWith';

describe('emitSameCommandWith helper', () => {
  // Save original process.argv
  const originalProcessArgv = process.argv;

  // Restore process.argv after each test
  afterEach(() => {
    process.argv = originalProcessArgv;
  });

  it('should keep command parts in order while updating flags', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list', '--max-results', '1'];

    // Mock handlebars context with nextToken parameter
    const context = {
      hash: { nextToken: '002f9ca6-b4c6-445b-9521-a81701307f78' },
    };

    const result = emitSameCommandWith(context);

    // Verify command parts are preserved at the beginning
    expect(result).toMatch(/^dataset list/);

    // Verify the nextToken parameter is added
    expect(result).toContain('--next-token 002f9ca6-b4c6-445b-9521-a81701307f78');

    // Verify existing flags are kept
    expect(result).toContain('--max-results 1');

    // Make sure there's proper spacing between components
    expect(result).not.toContain('  '); // No double spaces
  });

  it('should update existing flag with new value', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list', '--max-results', '1'];

    // Mock handlebars context with parameter that should replace an existing one
    const context = {
      hash: { maxResults: '5' },
    };

    const result = emitSameCommandWith(context);

    // Verify command parts are preserved
    expect(result).toMatch(/^dataset list/);

    // Verify the maxResults parameter is updated
    expect(result).toContain('--max-results 5');

    // Verify the old value is not present
    expect(result).not.toMatch(/--max-results 1\b/);
  });

  it('should add multiple new flags', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list'];

    // Mock handlebars context with multiple parameters
    const context = {
      hash: {
        nextToken: '002f9ca6-b4c6-445b-9521-a81701307f78',
        maxResults: '10',
        filter: 'active',
      },
    };

    const result = emitSameCommandWith(context);

    // Verify all parameters are included
    expect(result).toMatch(/^dataset list/);
    expect(result).toContain('--next-token 002f9ca6-b4c6-445b-9521-a81701307f78');
    expect(result).toContain('--max-results 10');
    expect(result).toContain('--filter active');
  });

  it('should handle commands with numbers as arguments correctly', () => {
    // Setup mock for process.argv with a numerical argument
    process.argv = ['node', './dist/genai-etk', 'dataset', 'get', '123', '--detailed'];

    // Mock handlebars context with a new parameter
    const context = {
      hash: { format: 'json' },
    };

    const result = emitSameCommandWith(context);

    // Verify numerical argument is preserved in correct position
    expect(result).toMatch(/^dataset get 123/);
    expect(result).toContain('--detailed');
    expect(result).toContain('--format json');
  });

  it('should handle commands with complex flags correctly', () => {
    // Setup mock for process.argv with complex flags
    process.argv = [
      'node',
      './dist/genai-etk',
      'dataset',
      'create',
      '--name',
      'test-dataset',
      '--description',
      'A test dataset with spaces',
    ];

    // Mock handlebars context with new parameters
    const context = {
      hash: {
        region: 'us-west-2',
        tags: 'env=test,project=genai-etk',
      },
    };

    const result = emitSameCommandWith(context);

    // Verify original parameters are preserved
    expect(result).toMatch(/^dataset create/);
    expect(result).toContain('--name test-dataset');
    expect(result).toContain('--description A test dataset with spaces');

    // Verify new parameters are added
    expect(result).toContain('--region us-west-2');
    expect(result).toContain('--tags env=test,project=genai-etk');
  });

  it('should convert camelCase parameters to kebab-case flags', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list'];

    // Mock handlebars context with camelCase parameters
    const context = {
      hash: {
        maxResults: '10',
        sortOrder: 'desc',
        includeDeleted: 'true',
      },
    };

    const result = emitSameCommandWith(context);

    // Verify camelCase is converted to kebab-case
    expect(result).toContain('--max-results 10');
    expect(result).toContain('--sort-order desc');
    expect(result).toContain('--include-deleted true');
  });

  it('should handle empty process.argv gracefully', () => {
    // Setup empty process.argv
    process.argv = [];

    // Mock handlebars context
    const context = {
      hash: { nextToken: 'abc123' },
    };

    const result = emitSameCommandWith(context);

    // Result should just include the new parameter
    expect(result).toBe('--next-token abc123');
  });

  it('should handle no updates gracefully', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list'];

    // Mock handlebars context with empty hash
    const context = { hash: {} };

    const result = emitSameCommandWith(context);

    // Result should just be the original command
    expect(result).toBe('dataset list');
  });

  it('should filter out undefined values from hash', () => {
    // Setup mock for process.argv
    process.argv = ['node', './dist/genai-etk', 'dataset', 'list'];

    // Mock handlebars context with some undefined values
    const context = {
      hash: {
        nextToken: '002f9ca6-b4c6-445b-9521-a81701307f78',
        maxResults: undefined,
        filter: 'active',
      },
    };

    const result = emitSameCommandWith(context);

    // Verify defined parameters are included
    expect(result).toContain('--next-token 002f9ca6-b4c6-445b-9521-a81701307f78');
    expect(result).toContain('--filter active');

    // Verify undefined parameters are not included
    expect(result).not.toContain('--max-results');
  });
});
