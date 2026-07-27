import { getConfig, setConfig } from '../src/config';

describe('config', () => {
  // Save original console.warn function
  const originalConsoleWarn = console.warn;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset config before each test by directly using setConfig
    setConfig({ output: 'text' });

    // Mock console.warn to avoid output during tests
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    // Restore console.warn
    consoleWarnSpy.mockRestore();
    console.warn = originalConsoleWarn;
  });

  describe('getConfig', () => {
    it('should return the default configuration', () => {
      const config = getConfig();
      expect(config).toEqual({
        output: 'text',
      });
    });
  });

  describe('setConfig', () => {
    it('should update the output format when given a valid format', () => {
      setConfig({ output: 'json' });
      const config = getConfig();
      expect(config).toEqual({
        output: 'json',
      });
    });

    it('should revert to default output format when given an invalid format', () => {
      // Cast to allow invalid format in test
      setConfig({ output: 'invalid' as 'text' });

      const config = getConfig();
      expect(config).toEqual({
        output: 'text',
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid output format: invalid. Using default format.');
    });

    it('should preserve existing config values not provided in update', () => {
      // First set to a non-default value
      setConfig({ output: 'json' });
      expect(getConfig().output).toBe('json');

      // Then call setConfig with an empty object
      setConfig({});

      // Config should preserve previous values
      expect(getConfig().output).toBe('json');
    });

    it('should handle partial config updates', () => {
      // Set initial state
      setConfig({ output: 'text' });

      // Update with partial config (in this case, the same value)
      setConfig({ output: 'text' });

      // Config should have expected values
      const config = getConfig();
      expect(config).toEqual({
        output: 'text',
      });
    });
  });
});
