import { HelperDelegate } from 'handlebars';

export function emitSameCommandWith(context: Parameters<HelperDelegate>[0]) {
  // Convert hash to array of [flag, value] pairs, filtering out undefined values
  const updates: [string, unknown][] = Object.entries(context.hash)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]): [string, unknown] => {
      // Convert camelCase to kebab-case with -- prefix
      const flag = '--' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      return [flag, value];
    });

  return updateCommand(updates);
}

function updateCommand(newArgs: [string, unknown][]) {
  // Get current command arguments
  const currentArgs = process.argv.slice(2);
  if (!newArgs.length) return currentArgs.join(' ');

  // Extract non-flag arguments (commands) at the beginning
  const commandParts: string[] = [];
  let i = 0;
  while (i < currentArgs.length && !currentArgs[i]?.startsWith('-')) {
    commandParts.push(currentArgs[i]!);
    i++;
  }

  // Create a string from remaining arguments
  let remainingArgs = currentArgs.slice(i).join(' ');

  // Remove any flags we're updating and their values
  newArgs.forEach(([flag]) => {
    const flagPattern = new RegExp(`${flag}\\s+\\S+|${flag}\\b`, 'g');
    remainingArgs = remainingArgs.replace(flagPattern, '');
  });

  // Prepare the new flags to add
  const newFlags = newArgs.map(([flag, value]) => `${flag} ${value}`).join(' ');

  // Clean up any extra spaces
  const cleanedRemainingArgs = remainingArgs.replace(/\s+/g, ' ').trim();

  // Combine everything
  return [...commandParts, cleanedRemainingArgs, newFlags].filter(Boolean).join(' ').trim();
}
