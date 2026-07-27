/**
 * Lambda Pre-bundling Build Script
 *
 * This script discovers and bundles all Lambda handlers in the project using esbuild.
 *
 * Usage: tsx scripts/build-lambdas.ts
 */

import * as esbuild from 'esbuild';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';

// Note: sourcemap is disabled for pre-built bundles to reduce package size
// Native modules that need special handling (similar to CDK NodejsFunction nodeModules)
const NODE_MODULES = ['re2-wasm'];

const ESBUILD_CONFIG: esbuild.BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  sourcemap: false,
  treeShaking: true,
  mainFields: ['module', 'main'],
  // External: AWS SDK is provided by Lambda runtime, native modules handled separately
  external: ['@aws-sdk/*', 'aws-sdk', ...NODE_MODULES],
  loader: {
    '.wasm': 'file',
  },
};

const SRC_DIR = path.join(__dirname, '..', 'src');
const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'lambda-handlers');

/**
 * Discovers all Lambda handler files and creates a single entry point file
 */
async function discoverHandlers(): Promise<{ entryFile: string; count: number }> {
  const patterns = [path.join(SRC_DIR, '**/*Lambda.ts'), path.join(SRC_DIR, '**/*Handler.ts')];

  const filePaths = await glob(patterns, { absolute: true });

  const entryFileContent = filePaths
    .map((filePath, index) => {
      const handlerName = path.basename(filePath, '.ts');
      const relativePath = path.relative(SRC_DIR, filePath).replace(/\.ts$/, '');
      return `import * as handler${index} from './${relativePath}';\nexport const ${handlerName} = handler${index};`;
    })
    .join('\n');

  // Create temporary entry file for esbuild with unique name to avoid race conditions
  // This is auto-generated to avoid manually maintaining 50+ handler imports
  const entryFile = path.join(SRC_DIR, `lambda-handlers-entry.${Date.now()}.ts`);
  fs.writeFileSync(entryFile, entryFileContent);

  return { entryFile, count: filePaths.length };
}

/**
 * Copies re2-wasm module to node_modules for Lambda runtime
 */
async function copyRe2WasmModule(modulePath: string, outputDir: string): Promise<void> {
  if (!fs.existsSync(modulePath)) return;

  const targetNodeModules = path.join(outputDir, 'node_modules', 're2-wasm');
  fs.mkdirSync(targetNodeModules, { recursive: true });

  // Copy the entire re2-wasm module
  const copyRecursive = (src: string, dest: string) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src);
      for (const entry of entries) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(modulePath, targetNodeModules);
}

/**
 * Bundles all handlers into a single JavaScript file
 */
async function bundleAllHandlers(entryFile: string): Promise<void> {
  const outputDir = path.join(ASSETS_DIR, 'nodejs-handlers');
  fs.mkdirSync(outputDir, { recursive: true });

  await esbuild.build({
    ...ESBUILD_CONFIG,
    entryPoints: [entryFile],
    outfile: path.join(outputDir, 'index.js'),
  });

  // Copy re2-wasm module to node_modules
  const re2WasmModulePath = path.dirname(require.resolve('re2-wasm/package.json'));
  if (fs.existsSync(re2WasmModulePath)) {
    await copyRe2WasmModule(re2WasmModulePath, outputDir);
  }

  // Clean up temporary entry file
  fs.rmSync(entryFile);
}

/**
 * Main build function
 */
async function build(): Promise<void> {
  const startTime = Date.now();

  try {
    const { entryFile, count } = await discoverHandlers();

    if (count === 0) {
      console.log('Warning: No Lambda handlers found');
      return;
    }

    await bundleAllHandlers(entryFile);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Bundled ${count} Lambda handlers in ${duration}s`);
  } catch (error) {
    console.error('Build failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run the build
build();
