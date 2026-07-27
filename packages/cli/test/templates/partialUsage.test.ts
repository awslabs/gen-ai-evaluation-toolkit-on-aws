import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const partialsFolder = '../../src/templates/partials';
const viewsFolder = '../../src/templates/views';

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('Partial Reference Analysis', () => {
  const partials = getFileContent(partialsFolder);
  const views = getFileContent(viewsFolder);

  const reachablePartials = new Set<string>();
  const processed = new Set<string>();
  const referenceCount = new Map<string, number>();

  function findPartialReferences(content: string) {
    Object.keys(partials).forEach((partial) => {
      const name = partial.replace('.hbs', '');
      const regexNamePattern = escapeRegExp(name).replace('/', '[/\\s\n]*');

      const directMatches = (content.match(new RegExp(`{{~?>\\s*${regexNamePattern}\\b`, 'g')) || []).length;
      const indirectMatches = (content.match(new RegExp(`itemPartial=["']${regexNamePattern}["']`, 'g')) || []).length;

      if (directMatches + indirectMatches > 0) {
        referenceCount.set(name, (referenceCount.get(name) || 0) + directMatches + indirectMatches);

        if (!processed.has(name)) {
          reachablePartials.add(name);
          processed.add(name);
          const partialContent = partials[partial];
          if (partialContent) findPartialReferences(partialContent);
        }
      }
    });
  }

  Object.values(views).forEach((viewContent) => {
    findPartialReferences(viewContent);
  });

  console.log('Reference count:', Object.fromEntries(referenceCount));

  Object.keys(partials).forEach((partial) => {
    const name = partial.replace('.hbs', '');
    test(`partial should be reachable from views [${name}]`, () => {
      expect(reachablePartials.has(name)).toBeTruthy();
    });
  });
});

function getFileContent(relativeFolderPath: string): Record<string, string> {
  const basePath = join(__dirname, relativeFolderPath);
  return Object.fromEntries(
    readdirSync(basePath, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.hbs'))
      .map((f) => {
        const content = readFileSync(join(basePath, f), 'utf-8');
        return [f, content];
      }),
  );
}
