import { program } from './cli';

// Add global error handlers to catch all unhandled errors
process.on('uncaughtException', (error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error(`Error: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});

program.parse();
