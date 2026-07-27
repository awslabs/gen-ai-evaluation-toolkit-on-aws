import * as fs from 'fs';
import * as path from 'path';

/**
 * Finds the package root directory by climbing up the directory tree
 * looking for the directory that contains both package.json and assets/
 *
 * This ensures we find the actual package root, not intermediate directories
 * that might also have package.json (like dist/)
 *
 * @returns Absolute path to the package root directory
 * @throws Error if package root is not found
 */
export function findPackageRoot(): string {
  let currentDir = path.resolve(__dirname);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const assetsPath = path.join(currentDir, 'assets');

    // Look for a directory that has both package.json and assets/
    // This ensures we find the actual package root, not dist/ or other subdirectories
    if (fs.existsSync(packageJsonPath) && fs.existsSync(assetsPath)) return currentDir;

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Could not find package root (with package.json and assets/) starting from ${currentDir}`);
}
