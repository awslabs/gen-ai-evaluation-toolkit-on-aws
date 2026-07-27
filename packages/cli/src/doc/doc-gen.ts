import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { program } from '@src/cli';
import pkg from '../../package.json';

export function getAllCommands(command: Command, path: string[] = []): Array<{ command: Command; path: string[] }> {
  const currentPath = [...path, command.name()].filter(Boolean);
  const commands: Array<{ command: Command; path: string[] }> = [];

  commands.push({ command, path: currentPath });

  command.commands.forEach((subcommand) => {
    commands.push(...getAllCommands(subcommand, currentPath));
  });

  return commands;
}

export function generateDocs(_version: string): string {
  const allCommands = getAllCommands(program);
  let markdown = `# Gen AI Evaluation Toolkit CLI Manual\nVersion ${_version}\n\n`;

  allCommands.forEach(({ command, path }) => {
    const pathString = path.length > 0 ? path.join(' ') : 'genai-etk';
    const helpText = command.configureHelp({ helpWidth: 100 }).helpInformation();

    markdown += `## ${pathString}\n\n\`\`\`\n${helpText}\`\`\`\n\n`;
  });

  return markdown;
}

if (require.main === module) {
  const markdown = generateDocs(pkg.version);
  const buildDocDir = join(__dirname, '../../build/documents');
  mkdirSync(buildDocDir, { recursive: true });
  writeFileSync(join(buildDocDir, `gen-ai-evaluation-toolkit-cli-manual-${pkg.version}.md`), markdown);
}
