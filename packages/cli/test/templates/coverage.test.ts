import * as fs from 'fs';
import * as path from 'path';
import { testCases } from './shared/testCases';

describe('Template Coverage Tests', () => {
  const VIEWS_DIR = path.join(__dirname, '../../src/templates/views');

  const testedViews = Object.values(testCases)
    .map((mapping) => Object.keys(mapping))
    .flat();

  const allTemplates = fs
    .readdirSync(VIEWS_DIR, { encoding: 'utf8', recursive: true })
    .filter((file) => file.endsWith('.hbs'))
    .map((file) => file.replace(/\.hbs$/, ''));

  test('Should have no untested views', () => {
    const untestedTemplates = allTemplates.filter((template) => !testedViews.includes(template));

    expect(untestedTemplates).toEqual([]);
  });

  test('Should have no tests against unknown views', () => {
    const orphanedTests = testedViews.filter((view) => !allTemplates.includes(view));

    expect(orphanedTests).toEqual([]);
  });
});
