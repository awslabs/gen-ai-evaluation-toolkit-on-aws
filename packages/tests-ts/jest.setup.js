// Polyfills for Symbol.dispose and Symbol.asyncDispose
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html
Symbol.dispose ??= Symbol('Symbol.dispose');
Symbol.asyncDispose ??= Symbol('Symbol.asyncDispose');

// Set default DynamoDB table name for tests
process.env.DATASTORE_TABLE_NAME ??= 'GenAiEtkDatastoreDdbTable';
