import { fromPascalCaseToCamelCase } from '@common';

describe('fromPascalCaseToCamelCase', () => {
  test('should convert simple PascalCase to camelCase', () => {
    expect(fromPascalCaseToCamelCase('HelloWorld')).toBe('helloWorld');
  });

  test('should handle single word properly', () => {
    expect(fromPascalCaseToCamelCase('Hello')).toBe('hello');
  });

  test('should handle already camelCase input', () => {
    expect(fromPascalCaseToCamelCase('alreadyCamelCase')).toBe('alreadyCamelCase');
  });
});
