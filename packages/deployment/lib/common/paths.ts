import fs from 'fs';
import path from 'path';
import { lazy } from './helpers';

// The root of the CDK package
export const packageRoot = lazy(() => {
  let currentDir = path.resolve(__dirname);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');

    // Look for a directory that has package.json and is not the workspace root (no nx.json)
    if (fs.existsSync(packageJsonPath) && !fs.existsSync(path.join(currentDir, 'nx.json'))) return currentDir;

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Could not find package root (with package.json) starting from ${currentDir}`);
});

// The root of the nx monorepo
export const workspaceRoot = lazy(() => {
  let currentDir = path.resolve(__dirname);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const nxJsonPath = path.join(currentDir, 'nx.json');

    // Look for a directory that has nx.json
    if (fs.existsSync(nxJsonPath)) return currentDir;

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Could not find workspace root (with nx.json) starting from ${currentDir}`);
});

/**
 * Return image path from assets directory
 */
export function imagePath(pluginName: string): string {
  return path.join(packageRoot(), 'assets/images', `${pluginName}.zip`);
}
