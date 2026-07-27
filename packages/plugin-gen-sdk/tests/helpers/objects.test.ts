import { lazy } from '../../src/helpers/objects';

describe('lazy', () => {
  it('should create instance only on first call', () => {
    const factory = jest.fn().mockReturnValue({ value: 42 });
    const getInstance = lazy(factory);

    expect(factory).not.toHaveBeenCalled();

    const instance1 = getInstance();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(instance1).toEqual({ value: 42 });
  });

  it('should return the same instance on subsequent calls', () => {
    const factory = jest.fn().mockReturnValue({ value: 42 });
    const getInstance = lazy(factory);

    const instance1 = getInstance();
    const instance2 = getInstance();
    const instance3 = getInstance();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(instance1).toBe(instance2);
    expect(instance2).toBe(instance3);
  });

  it('should work with different return types', () => {
    const stringFactory = lazy(() => 'hello');
    const numberFactory = lazy(() => 123);
    const arrayFactory = lazy(() => [1, 2, 3]);

    expect(stringFactory()).toBe('hello');
    expect(numberFactory()).toBe(123);
    expect(arrayFactory()).toEqual([1, 2, 3]);
  });
});
