import Handlebars from 'handlebars';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '@src/config';
import { formatDate, emitSameCommandWith } from './helpers';

// Register helpers
Handlebars.registerHelper('formatDate', formatDate);
Handlebars.registerHelper('emitSameCommandWith', emitSameCommandWith);
Handlebars.registerHelper('or', function (...args) {
  // Remove the last argument (Handlebars options object)
  const params = args.slice(0, -1);
  return params.some(Boolean);
});
Handlebars.registerHelper('and', function (...args) {
  // Remove the last argument (Handlebars options object)
  const params = args.slice(0, -1);
  return params.every(Boolean);
});
Handlebars.registerHelper('hasKeys', function (obj) {
  return typeof obj === 'object' && Object.keys(obj).length > 0;
});
Handlebars.registerHelper('isObject', function (value) {
  return typeof value === 'object' && !Array.isArray(value);
});
Handlebars.registerHelper('isArray', function (value) {
    return Array.isArray(value);
});
Handlebars.registerHelper('isKeyValuePair', function (value) {
  return value != null && typeof value === 'object' && 'key' in value && 'value' in value && Object.keys(value).length === 2;
});
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('neq', (a, b) => a !== b);

// Cache for templates
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

// Track if partials have been loaded
let partialsLoaded = false;

/**
 * Find all partial (.hbs) files recursively in the partials directory
 */
async function findPartialFiles(): Promise<Array<{ name: string; path: string }>> {
  const baseDir = path.join(__dirname, 'partials');
  const files = await fs.readdir(baseDir, { recursive: true });

  return files
    .filter((file) => typeof file === 'string' && file.endsWith('.hbs'))
    .map((file) => ({
      name: (file as string).replace(/\.hbs$/, ''),
      path: path.join(baseDir, file as string),
    }));
}

/**
 * Load all partials from the partials directory
 */
async function loadAllPartials(): Promise<void> {
  if (partialsLoaded) return;

  const partialFiles = await findPartialFiles();

  for (const partial of partialFiles) {
    const content = await fs.readFile(partial.path, 'utf-8');
    Handlebars.registerPartial(partial.name, content);
  }

  partialsLoaded = true;
}

/**
 * Load a template from file or cache
 */
async function getTemplateDelegate(templatePath: string): Promise<HandlebarsTemplateDelegate> {
  // Ensure all partials are loaded first
  await loadAllPartials();

  // Return cached template if available
  if (templateCache.has(templatePath)) {
    return templateCache.get(templatePath)!;
  }

  // Read the template content
  const templateContent = await fs.readFile(templatePath, 'utf-8');

  // Compile the template
  const compiledTemplate = Handlebars.compile(templateContent);

  // Cache the compiled template
  templateCache.set(templatePath, compiledTemplate);

  return compiledTemplate;
}

/**
 * Render a template with the given data
 */
export async function renderTemplate<T extends object>(templatePath: string, data: T): Promise<void> {
  const cliConfig = getConfig();
  if (cliConfig.output === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Get the full path to the template
  const fullPath = path.join(__dirname, `${templatePath}.hbs`);

  // Load and render the template
  const template = await getTemplateDelegate(fullPath);

  // Prepending a whiteline to improve readability and trim excessive whitespace
  const renderedOutput = `\n${template(data).trim()}`;
  console.log(renderedOutput);
}
