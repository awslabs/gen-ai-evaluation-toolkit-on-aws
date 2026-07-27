import { Template } from 'aws-cdk-lib/assertions';
import 'jest-specific-snapshot';
import { app } from '../lib/app';

describe('App', () => {
  const stacks = app.synth().stacksRecursively;

  for (const stack of stacks) {
    it(`stack ${stack.id} should match snapshot`, () => {
      // Debug logging removed
      expect(withIgnoreAssets(stack.template)).toMatchSpecificSnapshot(`./__snapshots__/${stack.stackName}.snapshot`);
    });

    const outputs = stack.template.Outputs;
    if (outputs) {
      it(`${stack.stackName} exports`, () => {
        expect(
          /* eslint-disable @typescript-eslint/no-explicit-any */
          Object.entries(outputs)
            // Export (optional): The name of the resource output to be exported for a cross-stack reference.
            .filter(([_, value]: [string, any]) => value.Export)
            .map(([_, value]: [string, any]) => value.Export.Name),
        ).toMatchSpecificSnapshot(`./__snapshots__/_exports.snapshot`);
      });
    }
  }
});

// Ignore asset hashes and image references
function withIgnoreAssets(template: Template): any {
  skipDynamicKeyValues(template, ['Image', 'ImageUri', 'time']);
  return JSON.parse(
    JSON.stringify(template)
      .replace(/asset\.\w+\.zip/g, 'asset.DUMMY_STATIC_HASH.zip')
      .replace(/\w+\.zip/g, 'DUMMY_STATIC_HASH.zip')
      .replace(/RestApiApiDeployment\w+/g, 'RestApiApiDeployment_DUMMY_DEPLOYMENT_ID')
      .replace(/PublicRestApiPublicApiDeployment\w+/g, 'PublicRestApiPublicApiDeployment_DUMMY_DEPLOYMENT_ID')
      .replace(/:gen-ai-evaluation-toolkit-[a-zA-Z0-9_-]+/g, ':gen-ai-evaluation-toolkit-DUMMY_HASH')
      .replace(/:GenAi-ETK-[a-zA-Z0-9_-]+/g, ':GenAi-ETK-DUMMY_HASH'),
  );
}

const skipDynamicKeyValues = (value: Template | unknown, dynamicKeys: string[]) => {
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key in value) {
      if (dynamicKeys.includes(key)) {
        obj[key] = '<<skipped>>';
      } else {
        skipDynamicKeyValues(obj[key], dynamicKeys);
      }
    }
  }
};
