import { registeredModelBinder } from '@src/modelBinder/registry';

describe('AlternativeParams and descriptions snapshot tests', () => {
  Object.entries(registeredModelBinder).map(([type, modelBinders]) => {
    for (const modelBinder of modelBinders) {
      test(type, () => {
        expect({
          variable: modelBinder.alternativParamName?.('myVariable') ?? 'myVariable',
          description:
            modelBinder.descriptionGenerator?.('This is my favorite variable', '--my-var') ??
            'This is my favorite variable',
        }).toMatchSnapshot();
      });
    }
  });
});
