/** Generic version of the typescript-native AsyncDisposable
 * Prefixed with an I to avoid name collisions with the native type
 * to better guide IDEs and readers
 * Resources marked with this interface can be auto-disposed when going out of scope:
 *
 *  {
 *      await using resource = {
 *          ...someData,
 *          async [Symbol.asyncDispose]() {
 *              await someCleanup();
 *          }
 *      };
 *
 *  // do stuff with the resource
 *
 * } // leaving block scope calls the async dispose method `await someCleanUp();`
 * See more details e.g. in
 *  - https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html
 *  - https://v8.dev/features/explicit-resource-management
 */
export type IAsyncDisposable<T = object> = T & AsyncDisposable;
